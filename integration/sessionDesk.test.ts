import { afterEach, expect, it, vi } from 'vitest';
import type { Grip } from '@owebeeone/grip-react';
import { MemoryStoreEngine } from '@owebeeone/glial-runtime';

const clients: Array<{ close(): void }> = [];
afterEach(() => { for (const client of clients.splice(0)) { client.close(); } });
function browser() {
  const rows = new Map<string, string>();
  return { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); } };
}
async function page(origin: string, session: string, node: string, engine = new MemoryStoreEngine()) {
  vi.resetModules();
  const identity = await import('@grythjs/glade/identity');
  await identity.establishDeskIdentity({
    search: '?principal=owner', tabStore: { getItem: () => origin, setItem: () => {} },
    bootstrap: Promise.resolve({ node_ws: node }), schedule: () => () => {},
  });
  const store = await import('../packages/plugins/settings/src/store');
  await store.establishAppearanceStore({ open: async () => engine, schedule: () => () => {} });
  const glade = await import('@grythjs/glade');
  clients.push(glade.client);
  const desk = await import('@grythjs/desktop');
  const api = await import('@grythjs/plugin-api');
  const live = await import('../packages/plugins/settings/src/live');
  const roots = await import('../packages/plugins/gyld/src/rootTaps');
  const gyld = await import('../packages/plugins/gyld/src/grips');
  const { gyldSessionFields } = await import('../packages/plugins/gyld/src/sessionState');
  const { browserTabTaps } = await import('../packages/plugins/gyld/src/browser/browserTabTaps');
  const { gyldLinkFields } = await import('../packages/plugins/gyld/src/sessionLinks');
  const { tabContextFor } = await import('../packages/desktop/src/tabContexts');
  api.grok.registerTap(roots.GyldSetTap); api.grok.registerTap(roots.GyldFocusTap);
  live.registerAppearanceLive('gyld', browser());
  desk.registerDesktopTaps(api.grok, live.sessionDesk({ entry: 'gyld', persistAppearance: false }, {
    search: `?session=${session}`, href: `http://desk.invalid/?session=${session}`, store: browser(),
    fields: gyldSessionFields(api.grok),
  }));
  return {
    glade, desk, roots, gyld,
    context(tabId: string) {
      return tabContextFor(api.grok, tabId, {
        label: 'Graph', defaultSize: { w: 900, h: 600 }, windowComponent: (() => null) as never,
        tabTaps: browserTabTaps, linkFields: gyldLinkFields('gyld.browser'),
      });
    },
    tabRead<T>(tabId: string, grip: Grip<T>): T | undefined {
      const drip = this.context(tabId).getGripConsumerContext().getOrCreateConsumer(grip);
      drip.subscribe(() => {}); api.grok.flush(); return drip.get();
    },
    read<T>(grip: Grip<T>): T | undefined {
      const drip = api.grok.query(grip, api.grok.mainContext); api.grok.flush(); return drip.get();
    },
  };
}

it('SS-01–08: two real nodes mirror session state, preserve page state and replay a late join', async () => {
  const nodeA = process.env.SESSION_NODE_A;
  const nodeB = process.env.SESSION_NODE_B;
  expect(nodeA, 'SESSION_NODE_A must name an isolated scratch node').toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/);
  expect(nodeB, 'SESSION_NODE_B must name an isolated scratch node').toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/);
  for (const url of [nodeA!, nodeB!]) {
    expect([5173, 8080, 9099]).not.toContain(Number(new URL(url).port));
  }
  const engine = new MemoryStoreEngine();
  const a = await page('session-proof-a', 'review', nodeA!, engine);
  await a.glade.startGlade();
  expect(a.read(a.glade.GLADE_STATUS)).toBe('live');
  const b = await page('session-proof-b', 'review', nodeB!);
  await b.glade.startGlade();
  expect(b.read(b.glade.GLADE_STATUS)).toBe('live');
  a.read(a.desk.SIDEBAR_WIDTH_TAP)!.set(337);
  await expect.poll(() => b.read(b.desk.SIDEBAR_WIDTH)).toBe(337);
  b.read(b.desk.DESKTOP_CURRENT_TAP)!.set(2);
  await expect.poll(() => a.read(a.desk.DESKTOP_CURRENT)).toBe(2);
  a.read(a.desk.DESKTOP_FOCUSED_TAP)!.set('page-a-only');
  expect(b.read(b.desk.DESKTOP_FOCUSED)).not.toBe('page-a-only');

  const opened = a.desk.openWindow([], 'gyld.browser', { w: 900, h: 600 }, 1, { stream: 'base', perspective: 'architecture' });
  const tab = opened.list[0].tabs[0];
  a.read(a.desk.DESKTOP_WINDOWS_TAP)!.set(opened.list);
  await expect.poll(() => b.read(b.desk.DESKTOP_WINDOWS)?.[0]?.tabs[0]?.id).toBe(tab.id);
  a.context(tab.id); b.context(tab.id);
  b.tabRead(tab.id, b.gyld.GYLD_TAB_SEARCH_TAP)!.set('local draft');
  a.tabRead(tab.id, a.gyld.GYLD_DEST_STREAM_TAP)!.set('next');
  await expect.poll(() => b.tabRead(tab.id, b.gyld.GYLD_DEST_STREAM)).toBe('next');
  expect(b.tabRead(tab.id, b.gyld.GYLD_TAB_SEARCH)).toBe('local draft');
  b.tabRead(tab.id, b.gyld.GYLD_DEST_REF_TAP)!.set('q1');
  await expect.poll(() => a.tabRead(tab.id, a.gyld.GYLD_DEST_REF)).toBe('q1');
  a.roots.GyldSetTap.set({ roots: [{ kind: 'share' }] });
  a.roots.GyldFocusTap.set({ stream: 'next', ref: 'q1' });
  await expect.poll(() => b.roots.GyldFocusTap.get()).toEqual({ stream: 'next', ref: 'q1' });
  expect(b.roots.GyldSetTap.get().roots).toEqual([{ kind: 'share' }]);

  const c = await page('session-proof-c', 'independent', nodeB!);
  await c.glade.startGlade();
  a.read(a.desk.DESKTOP_THEME_TAP)!.set('nord');
  await expect.poll(() => c.read(c.desk.DESKTOP_THEME)).toBe('nord');
  expect(c.read(c.desk.SIDEBAR_WIDTH)).toBe(200);
  b.read(b.desk.DESKTOP_RESET_LAYOUT)!();
  await expect.poll(() => a.read(a.desk.SIDEBAR_WIDTH)).toBe(200);
  expect(a.read(a.desk.DESKTOP_THEME)).toBe('nord');
  expect(a.roots.GyldFocusTap.get()).toEqual({ stream: 'next', ref: 'q1' });

  a.glade.client.close();
  const reloaded = await page('session-proof-a', 'review', nodeA!, engine);
  expect(reloaded.read(reloaded.desk.SIDEBAR_WIDTH)).toBe(200);
  await reloaded.glade.startGlade();
  const late = await page('session-proof-late', 'review', nodeB!);
  await late.glade.startGlade();
  await expect.poll(() => late.roots.GyldFocusTap.get()).toEqual({ stream: 'next', ref: 'q1' });
  reloaded.read(reloaded.desk.SIDEBAR_WIDTH_TAP)!.set(355);
  await expect.poll(() => late.read(late.desk.SIDEBAR_WIDTH)).toBe(355);
});
