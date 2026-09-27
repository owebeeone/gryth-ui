import { IndexedDbStoreEngine, MemoryStoreEngine, type StoreEngine } from '@owebeeone/glial-runtime';

// The appearance instance's local store (Glial appearance plan, Step 3.1). The
// Web Lock keeps a reloaded tab's origin, but its session starts empty, so a
// write before the node's replay lands would re-mint seq 0, which the node
// refuses. Kept in the site's IndexedDB, the instance's ops replay into the
// session as it attaches, and the tab's next write takes its origin's next
// seq; the desk paints the stored value before any node op, and a write made
// with no socket ships at the next boot.
//
// The database is the appearance instance's own, shared by every tab of the
// site: a row per op, keyed by instance, origin and seq, so pages with their
// own origins never write each other's rows. The Gyld entry's loader opens it
// beside the identity, and memory stands in when it fails or has not opened
// within a second (`APPEARANCE_STORE_BOUND_MS`): the second one-shot timer
// outside a tap the owner ruled, beside the identity's. This module imports
// glial alone, so the loader may import it before the page composes.

/** The appearance instance's own database, apart from any other glial store. */
export const APPEARANCE_DB = 'gryth.appearance';

/** How long the loader waits for the database before the page goes on with
 *  the store in memory. */
export const APPEARANCE_STORE_BOUND_MS = 1000;

/** Run `fn` after `ms`, and return the cancel. */
export type Schedule = (fn: () => void, ms: number) => () => void;

/** Everything the appearance store is opened from. */
export interface StoreSources {
  /** Open the site's database of the appearance instance. */
  readonly open: () => Promise<StoreEngine>;
  /** The clock the wait for it runs on. */
  readonly schedule: Schedule;
}

let opened: StoreEngine | undefined;

/** Open the appearance instance's store: the loader's call, beside the
 *  identity, before it composes. Memory if the database fails to open or has
 *  not opened within `boundMs`. */
export async function establishAppearanceStore(
  sources: StoreSources,
  boundMs: number = APPEARANCE_STORE_BOUND_MS,
): Promise<StoreEngine> {
  opened = await new Promise<StoreEngine>((resolve) => {
    const cancel = sources.schedule(() => {
      console.warn(`[settings] the appearance store did not open within ${boundMs} ms: this page keeps it in memory`);
      resolve(new MemoryStoreEngine());
    }, boundMs);
    sources.open().then(
      (engine) => {
        cancel();
        resolve(engine);
      },
      (e: unknown) => {
        cancel();
        console.warn('[settings] the appearance store did not open: this page keeps it in memory', e);
        resolve(new MemoryStoreEngine());
      },
    );
  });
  return opened;
}

/** The store the loader opened for the appearance instance, or memory on a
 *  page whose loader opened none. */
export function appearanceStore(): StoreEngine {
  opened ??= new MemoryStoreEngine();
  return opened;
}

/** The page's own sources: the site's IndexedDB and the page's clock. The one
 *  function here that reads the page; only a loader calls it. */
export function pageStoreSources(): StoreSources {
  return {
    open: () => IndexedDbStoreEngine.open(APPEARANCE_DB),
    schedule: (fn, ms) => {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    },
  };
}
