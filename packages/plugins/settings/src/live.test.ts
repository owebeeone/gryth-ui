import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStoreEngine, type StoredOp, type StoreEngine } from '@owebeeone/glial-runtime';
import type { Grip } from '@owebeeone/grip-react';
import type { LayoutStore } from '@grythjs/desktop';

// Tabs of a desk (Glial appearance plan, Step 2.3). Each is a fresh load of the
// page's modules (vi.resetModules), as a page is: its own client-ts session,
// glial binder and grip graph, and its identity resolved first, as its loader
// resolves it. The node between them is in-process: an op one tab sends
// reaches every other tab and never its sender, as the node's router does.

type Glade = typeof import('@grythjs/glade');
type Desk = typeof import('@grythjs/desktop');

interface Tab {
  readonly glade: Glade;
  readonly desk: Desk;
  read<T>(grip: Grip<T>): T | undefined;
}

/** The site's IndexedDB as `IndexedDbStoreEngine` keeps it, which every tab of
 *  the site shares: a row per op, keyed (instance, origin, seq) and put as the
 *  op is appended, read in whole by each page's engine as it opens. */
class Site {
  private readonly rows = new Map<string, { readonly instanceKey: string; readonly op: StoredOp }>();

  /** A page's engine, over the rows as they stand as it opens. */
  readonly open = (): Promise<StoreEngine> => {
    const read = new MemoryStoreEngine();
    for (const { instanceKey, op } of this.rows.values()) {
      read.open(instanceKey).append(op);
    }
    return Promise.resolve({
      open: (instanceKey) => {
        const held = read.open(instanceKey);
        return {
          append: (op) => {
            const outcome = held.append(op);
            if (outcome === 'appended') {
              this.rows.set(JSON.stringify([instanceKey, op.origin, op.seq]), { instanceKey, op });
            }
            return outcome;
          },
          all: () => held.all(),
        };
      },
      drop: () => {},
    });
  };

  /** The seqs the rows hold, per origin. */
  chains(): Record<string, number[]> {
    const chains: Record<string, number[]> = {};
    for (const { op } of this.rows.values()) {
      chains[op.origin] = [...(chains[op.origin] ?? []), op.seq].sort((a, b) => a - b);
    }
    return chains;
  }
}

/** Open a tab whose URL names `named`, or none, behind a grazel that serves
 *  `served` (`owner`), or, given null, no principal at all, in a browser whose
 *  storage is `browser`, or one with no site data at all, and whose site's
 *  database `database` opens, by default a new one. */
async function openTab(
  origin: string,
  named?: string,
  served: string | null = 'owner',
  browser: LayoutStore | null = null,
  database: () => Promise<StoreEngine> = new Site().open,
): Promise<Tab> {
  vi.resetModules();
  const held = new Map([['glade-origin', origin]]);
  const { establishDeskIdentity } = await import('@grythjs/glade/identity');
  await establishDeskIdentity({
    search: named === undefined ? '' : `?principal=${named}`,
    tabStore: {
      getItem: (key) => held.get(key) ?? null,
      setItem: (key, value) => {
        held.set(key, value);
      },
    },
    bootstrap: Promise.resolve({ node_ws: 'ws://127.0.0.1:9106', principal: served ?? undefined }),
    schedule: () => () => {},
  });
  // and, beside it, the appearance instance's store
  const { establishAppearanceStore } = await import('./store');
  await establishAppearanceStore({ open: database, schedule: () => () => {} });
  const glade = await import('@grythjs/glade');
  const desk = await import('@grythjs/desktop');
  const { grok } = await import('@grythjs/plugin-api');
  const { registerAppearanceLive } = await import('./live');
  registerAppearanceLive('gyld', browser);
  return {
    glade,
    desk,
    read<T>(grip: Grip<T>): T | undefined {
      const drip = grok.query(grip, grok.mainContext);
      grok.flush();
      return drip.get();
    },
  };
}

/** The node: every op a tab sends reaches every other tab. */
function link(tabs: Tab[]): void {
  for (const tab of tabs) {
    vi.spyOn(tab.glade.client, 'sendOps').mockImplementation((ops) => {
      for (const other of tabs) {
        if (other !== tab) {
          other.glade.bus.deliver(ops);
        }
      }
    });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('two tabs of one user', () => {
  it('show a theme set in either one', async () => {
    const first = await openTab('tab1');
    const second = await openTab('tab2');
    link([first, second]);
    first.read(first.desk.DESKTOP_THEME_TAP)?.set('nord');
    expect(second.read(second.desk.DESKTOP_THEME)).toBe('nord');
    second.read(second.desk.DESKTOP_THEME_TAP)?.set('solar');
    expect(first.read(first.desk.DESKTOP_THEME)).toBe('solar');
  });

  it('update from the other tab\'s last write', async () => {
    const first = await openTab('tab1');
    const second = await openTab('tab2');
    link([first, second]);
    first.read(first.desk.DESKTOP_FONT_SCALE_TAP)?.set(12);
    second.read(second.desk.DESKTOP_FONT_SCALE_TAP)?.update((scale) => scale + 1);
    expect(first.read(first.desk.DESKTOP_FONT_SCALE)).toBe(13);
    // and the whole value moved: the theme the first tab left is the second's too
    first.read(first.desk.DESKTOP_THEME_TAP)?.set('dark');
    second.read(second.desk.DESKTOP_ZOOM_TAP)?.set(1.2);
    expect([first.read(first.desk.DESKTOP_THEME), first.read(first.desk.DESKTOP_ZOOM)])
      .toEqual(['dark', 1.2]);
  });
});

describe('a tab of another user', () => {
  it('keeps its own value, and leaves the first user\'s alone', async () => {
    const owner = await openTab('tab1');
    const alice = await openTab('tab3', 'alice');
    link([owner, alice]);
    owner.read(owner.desk.DESKTOP_THEME_TAP)?.set('dark');
    expect(alice.read(alice.desk.DESKTOP_THEME)).toBe('light');
    alice.read(alice.desk.DESKTOP_THEME_TAP)?.set('solar');
    expect(owner.read(owner.desk.DESKTOP_THEME)).toBe('dark');
    expect(alice.read(alice.desk.DESKTOP_THEME)).toBe('solar');
  });
});

interface SentOp {
  readonly glade_id: string;
  readonly origin: string;
  readonly seq: number;
  readonly payload: Uint8Array;
}

/** Connect a tab to a faked node, which answers each subscribe after
 *  delivering its replay (`replay` for the user's zone, nothing for any other),
 *  accepted or, with `accepted` false, refused. */
async function connect(tab: Tab, replay: SentOp[] = [], accepted = true) {
  const sent: SentOp[] = [];
  vi.spyOn(tab.glade.client, 'connect').mockResolvedValue(undefined);
  vi.spyOn(tab.glade.client, 'hello').mockResolvedValue(undefined);
  vi.spyOn(tab.glade.client, 'sendOps').mockImplementation((ops) => {
    sent.push(...(ops as unknown as SentOp[]));
  });
  const subscribe = vi.spyOn(tab.glade.client, 'subscribeOutcome').mockImplementation(
    async (_share, gladeId) => {
      if (gladeId === 'gyld.appearance' && accepted) {
        tab.glade.bus.deliver(replay as never);
      }
      return { ok: accepted, heads: [], code: accepted ? 'ok' : 'unauthorized', message: '' };
    },
  );
  await tab.glade.startGlade();
  // the migration runs once the zone's replay is in
  await new Promise((resolve) => setTimeout(resolve, 0));
  /** The appearance ops this tab itself wrote, once each. */
  const ops = () => {
    const own = sent.filter((op) => op.glade_id === 'gyld.appearance' && op.origin === tab.glade.origin);
    return own.filter((op, at) => own.findIndex((other) => other.seq === op.seq) === at);
  };
  return {
    subscribed: subscribe.mock.calls,
    ops,
    written: () => ops().map((op) => JSON.parse(new TextDecoder().decode(op.payload)) as unknown),
  };
}

describe('the node', () => {
  it('replays the user\'s own zone to a tab that names its user', async () => {
    const owner = await openTab('tab1');
    expect((await connect(owner)).subscribed).toContainEqual(
      ['ws-razel', 'gyld.appearance', new TextEncoder().encode('self:owner')],
    );
  });

  it('replays no appearance to a tab that is its tab alone', async () => {
    const alone = await openTab('tab9', undefined, null);
    expect((await connect(alone)).subscribed).toEqual([]);
  });
});

/** A browser's storage, holding the stored desk a build from before Step 2.3
 *  wrote, with `appearance`, or one that held none. */
function browserWith(appearance?: Record<string, unknown>) {
  const items = new Map<string, string>();
  const browser = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
    /** What a build from before Step 2.3 stores for its desk. */
    storeDesk(held: Record<string, unknown>): void {
      items.set('gryth.desk.layout.v1.gyld', JSON.stringify({
        version: 1, entry: 'gyld', desks: { current: 1, windows: [] },
        sidebar: { open: true, width: 200 }, appearance: held,
      }));
    },
  };
  if (appearance !== undefined) {
    browser.storeDesk(appearance);
  }
  return browser;
}

const OLD = { theme: 'nord', zoom: 1.2, fontScale: 12, wallpaper: '/w.jpeg', wallpaperThemed: false };

describe('a browser\'s stored appearance (Step 2.4)', () => {
  it('moves to the user\'s empty zone once its replay is in, and the stored desk is not read again', async () => {
    const browser = browserWith(OLD);
    const tab = await openTab('tab1', undefined, 'owner', browser);
    // from the first paint, before the node answers
    expect(tab.read(tab.desk.DESKTOP_THEME)).toBe('nord');
    expect((await connect(tab)).written()).toEqual([{ v: 1, ...OLD }]);
    expect(tab.read(tab.desk.DESKTOP_ZOOM)).toBe(1.2);
    // an older build writes the stored desk again; the next boot does not use it
    browser.storeDesk({ ...OLD, theme: 'solar' });
    const again = await openTab('tab2', undefined, 'owner', browser);
    expect(again.read(again.desk.DESKTOP_THEME)).toBe('nord');
    expect((await connect(again)).written()).toEqual([]);
  });

  it('leaves a zone that holds a value as it is, whatever another browser held', async () => {
    const first = await openTab('tab1', undefined, 'owner', browserWith(OLD));
    const seeded = (await connect(first)).ops();
    const second = await openTab('tab2', undefined, 'owner', browserWith({ ...OLD, theme: 'solar' }));
    expect(second.read(second.desk.DESKTOP_THEME)).toBe('solar');
    expect((await connect(second, seeded)).written()).toEqual([]);
    expect(second.read(second.desk.DESKTOP_THEME)).toBe('nord');
  });

  it('leaves the zone empty for a browser that held none, and the desk shows the defaults', async () => {
    const tab = await openTab('tab1', undefined, 'owner', browserWith());
    expect((await connect(tab)).written()).toEqual([]);
    expect(tab.read(tab.desk.DESKTOP_THEME)).toBe('light');
  });

  it('writes nothing to a zone the node would not replay', async () => {
    const tab = await openTab('tab1', undefined, 'owner', browserWith(OLD));
    expect((await connect(tab, [], false)).written()).toEqual([]);
  });
});

describe('the appearance instance\'s store, which every tab of the site shares (Step 3.1)', () => {
  beforeEach(() => {
    // a write with no socket, and a database that will not open, each say so
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('shows a second page the stored value before any node op', async () => {
    const site = new Site();
    const first = await openTab('tab1', undefined, 'owner', null, site.open);
    first.read(first.desk.DESKTOP_THEME_TAP)?.set('nord');
    const second = await openTab('tab2', undefined, 'owner', null, site.open);
    expect(second.read(second.desk.DESKTOP_THEME)).toBe('nord');
  });

  it('gives a reloaded tab\'s first write its origin\'s next seq, not 0', async () => {
    const site = new Site();
    const first = await openTab('tab1', undefined, 'owner', null, site.open);
    first.read(first.desk.DESKTOP_THEME_TAP)?.set('nord');
    const reloaded = await openTab('tab1', undefined, 'owner', null, site.open);
    // before its replay lands
    reloaded.read(reloaded.desk.DESKTOP_THEME_TAP)?.set('solar');
    const node = await connect(reloaded);
    expect(node.ops().map((op) => op.seq)).toEqual([0, 1]);
    expect(node.written().at(-1)).toMatchObject({ theme: 'solar' });
  });

  it('keeps a write made with no socket, and ships it at the next boot', async () => {
    const site = new Site();
    const first = await openTab('tab1', undefined, 'owner', null, site.open);
    first.read(first.desk.DESKTOP_THEME_TAP)?.set('nord');
    expect(site.chains()).toEqual({ tab1: [0] });
    const reloaded = await openTab('tab1', undefined, 'owner', null, site.open);
    expect((await connect(reloaded)).written()).toEqual([expect.objectContaining({ theme: 'nord' })]);
  });

  it('keeps the rows of two pages over one database, each on its own origin\'s chain', async () => {
    const site = new Site();
    const first = await openTab('tab1', undefined, 'owner', null, site.open);
    const second = await openTab('tab2', undefined, 'owner', null, site.open);
    first.read(first.desk.DESKTOP_THEME_TAP)?.set('nord');
    second.read(second.desk.DESKTOP_THEME_TAP)?.set('solar');
    first.read(first.desk.DESKTOP_THEME_TAP)?.set('dark');
    // and the second, reloaded, writes on after its own row
    const reloaded = await openTab('tab2', undefined, 'owner', null, site.open);
    reloaded.read(reloaded.desk.DESKTOP_ZOOM_TAP)?.set(1.2);
    expect(site.chains()).toEqual({ tab1: [0, 1], tab2: [0, 1] });
  });

  it('falls back to memory and the per-user key when the database will not open', async () => {
    const browser = browserWith();
    const blocked = () => Promise.reject(new Error('blocked'));
    const first = await openTab('tab1', undefined, 'owner', browser, blocked);
    first.read(first.desk.DESKTOP_THEME_TAP)?.set('nord');
    expect(first.read(first.desk.DESKTOP_THEME)).toBe('nord');
    const reloaded = await openTab('tab1', undefined, 'owner', browser, blocked);
    expect(reloaded.read(reloaded.desk.DESKTOP_THEME)).toBe('nord');
  });
});
