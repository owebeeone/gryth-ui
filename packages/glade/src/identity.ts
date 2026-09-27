// The desk identity (Glial appearance plan, Step 1.3): who this page is — the
// principal it presents and stamps, and the tab origin its ops are minted
// under — resolved ONCE, before the page composes.
//
// Before, because the principal is captured as modules load: the glade runtime
// holds it in a `const` at import, and the plugins build their handles from it
// as they register (gyld's `Gyld.Ops`, gwz's request envelope, chat's lines). A
// principal that arrived with `startGlade()`'s fetch would miss them all. So
// each entry is a LOADER that awaits `establishDeskIdentity(pageSources())` and
// only then imports its composition, and the runtime reads the result with
// `deskIdentity()`, refusing to load without one.
//
// Where the principal comes from, first match wins:
//   1. `?principal=` (alias `?user=`), which the reader chose, so a second
//      participant is still one URL away;
//   2. the principal grazel serves in `/bootstrap.json`, which gyld-ui names
//      (`--principal`, default `owner`), so every tab of the desk is that user,
//      a tab opened by hand included (owner ruling 4 of 2026-09-25);
//   3. the tab's own id, as before: no grazel behind the page, an older one,
//      or one that did not answer within IDENTITY_BOUND_MS.
// The first two ROAM, naming the same user in every tab and session; the third
// does not. The origin is the tab's own whatever the principal: two tabs
// sharing one origin fork a chain, the half of the 2026-07-11 ruling that
// stands.
//
// DOM-free except `pageSources()`, the one function that reads the page, which
// only a loader calls. Everything else is driven by fakes in identity.test.ts.

import { pickPrincipal, type BootstrapJson } from './bootstrap-util';

/** How long a page waits for grazel's `/bootstrap.json` before it composes as
 *  its tab alone. The fetch is local; this bounds a grazel that hangs. */
export const IDENTITY_BOUND_MS = 1500;

/** Who this page is. */
export class DeskIdentity {
  constructor(
    /** The principal the page's Hello binds and everything it sends is stamped with. */
    readonly principal: string,
    /** The tab's own origin, which every op this page mints carries. */
    readonly origin: string,
    /** Whether the principal names a user rather than this tab alone: it came
     *  from the URL or from grazel, so another tab or session presents it too. */
    readonly roams: boolean,
  ) {}
}

/** Run `fn` after `ms`, and return the cancel: the desk's clock shape
 *  (`@grythjs/desktop`'s `Schedule`), so a suite fires it by hand. */
export type Schedule = (fn: () => void, ms: number) => () => void;

/** The slice of the tab's session storage the origin is kept in. */
export interface TabStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Everything the identity is resolved from. */
export interface IdentitySources {
  /** The page URL's query string. */
  readonly search: string;
  /** The tab's session storage. */
  readonly tabStore: TabStore;
  /** grazel's `/bootstrap.json`, fetched once for the whole page, or nothing. */
  readonly bootstrap: Promise<BootstrapJson | undefined>;
  /** The clock the wait for it runs on. */
  readonly schedule: Schedule;
}

const ORIGIN_KEY = 'glade-origin';

/** The tab's own id: minted on the tab's first load and kept in its session
 *  storage, so a reload resumes the same chain. */
export function tabOrigin(store: TabStore): string {
  let origin = store.getItem(ORIGIN_KEY);
  if (!origin) {
    origin = Math.random().toString(36).slice(2, 8);
    store.setItem(ORIGIN_KEY, origin);
  }
  return origin;
}

/** The part of `fetch` that `fetchBootstrap` uses. */
export type BootstrapFetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** grazel's `/bootstrap.json`, or nothing when nothing answers with one: the
 *  dev proxy with no grazel behind it, a server that answers with its page, or
 *  no server at all. */
export async function fetchBootstrap(fetchFn: BootstrapFetch): Promise<BootstrapJson | undefined> {
  try {
    const answer = await fetchFn('/bootstrap.json');
    if (answer.ok) {
      return (await answer.json()) as BootstrapJson;
    }
  } catch {
    // nothing serving us: the tab is on its own, and the dev node stands in
  }
  return undefined;
}

/** Who the page is, from `sources`, waiting for grazel's answer no longer than
 *  `boundMs`. A URL that names a principal waits for no answer. */
export async function resolveDeskIdentity(
  sources: IdentitySources,
  boundMs: number = IDENTITY_BOUND_MS,
): Promise<DeskIdentity> {
  const origin = tabOrigin(sources.tabStore);
  const named =
    pickPrincipal(sources.search, undefined) ??
    pickPrincipal(sources.search, await within(sources.bootstrap, boundMs, sources.schedule));
  return new DeskIdentity(named ?? origin, origin, named !== undefined);
}

/** `answer`, or nothing if it has not settled within `ms`. */
function within(
  answer: Promise<BootstrapJson | undefined>,
  ms: number,
  schedule: Schedule,
): Promise<BootstrapJson | undefined> {
  return new Promise((resolve) => {
    const cancel = schedule(() => {
      console.warn(`[glade] /bootstrap.json did not answer within ${ms} ms: this page is its tab alone`);
      resolve(undefined);
    }, ms);
    answer.then(
      (body) => {
        cancel();
        resolve(body);
      },
      () => {
        cancel();
        resolve(undefined);
      },
    );
  });
}

// --- the page's one identity ----------------------------------------------------

let resolving: Promise<DeskIdentity> | undefined;
let resolved: DeskIdentity | undefined;
let bootstrap: Promise<BootstrapJson | undefined> = Promise.resolve(undefined);

/** Resolve this page's identity: the loader's call, before it composes. It is
 *  resolved once, and a second call answers with the first. */
export function establishDeskIdentity(
  sources: IdentitySources,
  boundMs: number = IDENTITY_BOUND_MS,
): Promise<DeskIdentity> {
  if (resolving === undefined) {
    bootstrap = sources.bootstrap;
    resolving = resolveDeskIdentity(sources, boundMs).then((identity) => {
      resolved = identity;
      return identity;
    });
  }
  return resolving;
}

/** The identity the loader resolved, read by the glade runtime as it loads.
 *  Before then it throws: a composition imported that early would capture a
 *  principal that could still change. */
export function deskIdentity(): DeskIdentity {
  if (resolved === undefined) {
    throw new Error(
      'glade: the desk identity was read before the loader resolved it; an entry awaits ' +
        'establishDeskIdentity() before it imports its composition',
    );
  }
  return resolved;
}

/** grazel's `/bootstrap.json` as the loader fetched it: the page's one fetch,
 *  which `startGlade()` takes its node from rather than asking again. */
export function deskBootstrap(): Promise<BootstrapJson | undefined> {
  return bootstrap;
}

/** The page's own sources, and the page's one fetch of `/bootstrap.json`. The
 *  one function here that reads the page; only a loader calls it. */
export function pageSources(): IdentitySources {
  return {
    search: location.search,
    tabStore: sessionStorage,
    bootstrap: fetchBootstrap((url) => fetch(url)),
    schedule: (fn, ms) => {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    },
  };
}
