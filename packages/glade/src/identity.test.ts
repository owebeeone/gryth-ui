import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BootstrapJson } from './bootstrap-util';
import {
  DeskIdentity,
  IDENTITY_BOUND_MS,
  fetchBootstrap,
  resolveDeskIdentity,
  tabOrigin,
  type IdentitySources,
  type Schedule,
  type TabStore,
} from './identity';

// Who a page is, resolved once before it composes (Glial appearance plan, Step
// 1.3). Every source is faked: the URL, the tab's session storage, grazel's
// `/bootstrap.json` and the clock the wait for it runs on.

/** A tab's session storage, holding `origin` if the tab has run before. */
function tab(origin?: string): TabStore {
  const held = new Map<string, string>();
  if (origin !== undefined) {
    held.set('glade-origin', origin);
  }
  return {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => {
      held.set(key, value);
    },
  };
}

/** A clock that runs only when told to. */
class Clock {
  readonly asked: number[] = [];
  private due: Array<() => void> = [];

  readonly schedule: Schedule = (fn, ms) => {
    this.asked.push(ms);
    this.due.push(fn);
    return () => {
      this.due = this.due.filter((queued) => queued !== fn);
    };
  };

  get pending(): number {
    return this.due.length;
  }

  run(): void {
    const due = this.due;
    this.due = [];
    for (const fn of due) {
      fn();
    }
  }
}

const GRAZEL: BootstrapJson = {
  node_ws: 'ws://127.0.0.1:9106',
  mode: 'both',
  name: 'grazel',
  principal: 'owner',
};
/** What a grazel given no `--principal` serves, as every grazel did before. */
const NAMELESS: BootstrapJson = { node_ws: 'ws://127.0.0.1:9106', mode: 'both', name: 'grazel' };
const HUNG = new Promise<BootstrapJson | undefined>(() => {});

function sources(given: Partial<IdentitySources> = {}): IdentitySources {
  return {
    search: '',
    tabStore: tab('tab7'),
    bootstrap: Promise.resolve(GRAZEL),
    schedule: new Clock().schedule,
    ...given,
  };
}

const PENDING = Symbol('pending');
/** The promise's value once the work already queued has run, else PENDING. */
function settled<T>(promise: Promise<T>): Promise<T | typeof PENDING> {
  return Promise.race([
    promise,
    new Promise<typeof PENDING>((resolve) => {
      setTimeout(() => resolve(PENDING), 0);
    }),
  ]);
}

describe('the desk identity — who this page is, resolved before it composes', () => {
  it('takes the principal grazel serves, and it roams', async () => {
    expect(await resolveDeskIdentity(sources())).toEqual(new DeskIdentity('owner', 'tab7', true));
  });

  it('lets the URL name another, which beats grazel and waits for no bootstrap', async () => {
    const clock = new Clock();
    const named = await resolveDeskIdentity(
      sources({ search: '?principal=alice', bootstrap: HUNG, schedule: clock.schedule }),
    );
    expect(named).toEqual(new DeskIdentity('alice', 'tab7', true));
    expect(clock.asked).toEqual([]);
    expect((await resolveDeskIdentity(sources({ search: '?user=bob' }))).principal).toBe('bob');
  });

  it('is the tab alone, not roaming, when grazel names no principal', async () => {
    const identity = await resolveDeskIdentity(sources({ bootstrap: Promise.resolve(NAMELESS) }));
    expect(identity).toEqual(new DeskIdentity('tab7', 'tab7', false));
  });

  it('is the tab alone, not roaming, when the fetch fails', async () => {
    const failed = fetchBootstrap(() => Promise.reject(new TypeError('Failed to fetch')));
    const identity = await resolveDeskIdentity(sources({ bootstrap: failed }));
    expect(identity).toEqual(new DeskIdentity('tab7', 'tab7', false));
  });

  it('waits for a hung fetch no longer than the bound, then is the tab alone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const clock = new Clock();
    const pending = resolveDeskIdentity(sources({ bootstrap: HUNG, schedule: clock.schedule }));
    expect(await settled(pending)).toBe(PENDING);
    expect(clock.asked).toEqual([IDENTITY_BOUND_MS]);
    expect(IDENTITY_BOUND_MS).toBe(1500);
    clock.run();
    expect(await settled(pending)).toEqual(new DeskIdentity('tab7', 'tab7', false));
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('cancels the bound once grazel answers inside it', async () => {
    const clock = new Clock();
    await resolveDeskIdentity(sources({ schedule: clock.schedule }));
    expect(clock.asked).toEqual([IDENTITY_BOUND_MS]);
    expect(clock.pending).toBe(0);
  });

  it('gives two tabs of one principal two origins: the op origin stays per tab', async () => {
    const first = await resolveDeskIdentity(sources({ tabStore: tab('tabA') }));
    const second = await resolveDeskIdentity(sources({ tabStore: tab('tabB') }));
    expect([first.principal, second.principal]).toEqual(['owner', 'owner']);
    expect([first.origin, second.origin]).toEqual(['tabA', 'tabB']);
  });

  it("keeps a tab's origin across a reload, and mints one for a new tab", () => {
    const store = tab();
    const minted = tabOrigin(store);
    expect(minted).toMatch(/^[0-9a-z]+$/);
    expect(tabOrigin(store)).toBe(minted);
    expect(tabOrigin(tab('tab7'))).toBe('tab7');
  });
});

describe("fetchBootstrap — grazel's /bootstrap.json, or nothing", () => {
  it('asks for /bootstrap.json and returns the body grazel serves', async () => {
    const asked: string[] = [];
    const body = await fetchBootstrap(async (url) => {
      asked.push(url);
      return { ok: true, json: async () => GRAZEL };
    });
    expect(asked).toEqual(['/bootstrap.json']);
    expect(body).toEqual(GRAZEL);
  });

  it('is nothing when nothing answers with one', async () => {
    // the dev proxy with no grazel behind it
    expect(await fetchBootstrap(async () => ({ ok: false, json: async () => ({}) }))).toBeUndefined();
    // a server that answers with its page, as one with no proxy does
    const page = async () => {
      throw new SyntaxError("Unexpected token '<'");
    };
    expect(await fetchBootstrap(async () => ({ ok: true, json: page }))).toBeUndefined();
    // no server at all
    expect(await fetchBootstrap(() => Promise.reject(new TypeError('Failed to fetch')))).toBeUndefined();
  });
});

describe('the one identity a page has', () => {
  // Module state: each test takes a fresh copy of the module, as a page does.
  beforeEach(() => {
    vi.resetModules();
  });

  it('refuses a read before a loader has resolved it', async () => {
    const fresh = await import('./identity');
    expect(() => fresh.deskIdentity()).toThrow(/before .*loader/);
  });

  it('is resolved once: a second establish answers with the first', async () => {
    const fresh = await import('./identity');
    const first = await fresh.establishDeskIdentity(sources());
    const second = await fresh.establishDeskIdentity(sources({ search: '?principal=alice' }));
    expect(second).toBe(first);
    expect(fresh.deskIdentity()).toBe(first);
  });

  it("hands startGlade the loader's one fetch rather than asking again", async () => {
    const fresh = await import('./identity');
    const answer = Promise.resolve(GRAZEL);
    await fresh.establishDeskIdentity(sources({ bootstrap: answer }));
    expect(fresh.deskBootstrap()).toBe(answer);
  });
});
