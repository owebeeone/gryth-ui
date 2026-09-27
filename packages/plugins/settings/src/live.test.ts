import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Grip } from '@owebeeone/grip-react';

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

/** Open a tab whose URL names `named`, or none, behind a grazel that serves
 *  `served` (`owner`), or, given null, no principal at all. */
async function openTab(origin: string, named?: string, served: string | null = 'owner'): Promise<Tab> {
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
  const glade = await import('@grythjs/glade');
  const desk = await import('@grythjs/desktop');
  const { grok } = await import('@grythjs/plugin-api');
  const { registerAppearanceLive } = await import('./live');
  registerAppearanceLive('gyld');
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

/** What a tab asks the node to replay when it connects, with the socket faked. */
async function replayed(tab: Tab): Promise<unknown[][]> {
  vi.spyOn(tab.glade.client, 'connect').mockResolvedValue(undefined);
  vi.spyOn(tab.glade.client, 'hello').mockResolvedValue(undefined);
  vi.spyOn(tab.glade.client, 'sendOps').mockImplementation(() => {});
  const subscribe = vi.spyOn(tab.glade.client, 'subscribe').mockResolvedValue(undefined);
  await tab.glade.startGlade();
  return subscribe.mock.calls;
}

describe('the node', () => {
  it('replays the user\'s own zone to a tab that names its user', async () => {
    const owner = await openTab('tab1');
    expect(await replayed(owner)).toContainEqual(
      ['ws-razel', 'gyld.appearance', new TextEncoder().encode('self:owner')],
    );
  });

  it('replays no appearance to a tab that is its tab alone', async () => {
    const alone = await openTab('tab9', undefined, null);
    expect(await replayed(alone)).toEqual([]);
  });
});
