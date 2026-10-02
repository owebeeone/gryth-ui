import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Grip } from '@owebeeone/grip-react';
import { MemoryStoreEngine } from '@owebeeone/glial-runtime';

afterEach(() => { vi.restoreAllMocks(); });
function browser() {
  const rows = new Map<string, string>();
  return { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); }, removeItem: (key: string) => { rows.delete(key); } };
}
async function page(origin: string, session: string, principal = 'owner', engine = new MemoryStoreEngine()) {
  vi.resetModules();
  const identity = await import('@grythjs/glade/identity');
  await identity.establishDeskIdentity({
    search: `?principal=${principal}`, tabStore: { getItem: () => origin, setItem: () => {} },
    bootstrap: Promise.resolve({ node_ws: 'ws://127.0.0.1:9106' }), schedule: () => () => {},
  });
  const store = await import('./store');
  await store.establishAppearanceStore({ open: async () => engine, schedule: () => () => {} });
  const glade = await import('@grythjs/glade');
  const desk = await import('@grythjs/desktop');
  const api = await import('@grythjs/plugin-api');
  const live = await import('./live');
  const roots = await import('../../gyld/src/rootTaps');
  const gyld = await import('../../gyld/src/grips');
  const { gyldSessionFields } = await import('../../gyld/src/sessionState');
  const { browserTabTaps } = await import('../../gyld/src/browser/browserTabTaps');
  const { gyldLinkFields } = await import('../../gyld/src/sessionLinks');
  const { tabContextFor } = await import('../../../desktop/src/tabContexts');
  api.grok.registerTap(roots.GyldSetTap); api.grok.registerTap(roots.GyldFocusTap);
  live.registerAppearanceLive('gyld', browser());
  const clock: Array<() => void> = [];
  const setup = live.sessionDesk({ entry: 'gyld', persistAppearance: false }, {
    search: `?session=${session}`, href: `https://desk.test/?session=${session}`, store: browser(),
    fields: gyldSessionFields(api.grok),
    schedule: (fn: () => void) => { clock.push(fn); return () => { const i = clock.indexOf(fn); if (i >= 0) { clock.splice(i, 1); } }; },
  });
  desk.registerDesktopTaps(api.grok, setup);
  const subscriptions = vi.spyOn(glade.client, 'subscribeOutcome').mockResolvedValue({ ok: true } as never);
  vi.spyOn(glade.client, 'connect').mockResolvedValue(undefined);
  vi.spyOn(glade.client, 'hello').mockResolvedValue({} as never);
  return {
    glade, desk, subscriptions, roots, gyld,
    context(tabId: string, params?: Record<string, unknown>) {
      return tabContextFor(api.grok, tabId, {
        label: 'Graph', defaultSize: { w: 900, h: 600 }, windowComponent: (() => null) as never,
        tabTaps: browserTabTaps, linkFields: gyldLinkFields('gyld.browser'),
      }, params);
    },
    tabRead<T>(tabId: string, grip: Grip<T>): T | undefined {
      const ctx = this.context(tabId);
      const d = ctx.getGripConsumerContext().getOrCreateConsumer(grip); d.subscribe(() => {}); api.grok.flush(); return d.get();
    },
    read<T>(grip: Grip<T>): T | undefined { const d = api.grok.query(grip, api.grok.mainContext); api.grok.flush(); return d.get(); },
    flush: () => api.grok.flush(),
    tick: () => { api.grok.flush(); for (const fn of clock.splice(0)) { fn(); } api.grok.flush(); },
  };
}
function link(pages: Awaited<ReturnType<typeof page>>[]) {
  for (const p of pages) {
    vi.spyOn(p.glade.client, 'sendOps').mockImplementation((ops) => {
      for (const other of pages) { if (p !== other) { other.glade.bus.deliver(ops); other.flush(); } }
    });
  }
}
describe('SS-01/02/03/04/05/08 live session desks over real Glial/client-ts', () => {
  it('mirrors a desk in both directions while keeping keyboard focus local', async () => {
    const a = await page('a', 'shared');
    const b = await page('b', 'shared');
    link([a, b]);
    await a.glade.startGlade(); await b.glade.startGlade();
    a.read(a.desk.SIDEBAR_WIDTH_TAP)!.set(330); a.tick();
    expect(b.read(b.desk.SIDEBAR_WIDTH)).toBe(330);
    b.read(b.desk.DESKTOP_CURRENT_TAP)!.set(2); b.tick();
    expect(a.read(a.desk.DESKTOP_CURRENT)).toBe(2);
    a.read(a.desk.DESKTOP_FOCUSED_TAP)!.set('page-a');
    expect(b.read(b.desk.DESKTOP_FOCUSED)).not.toBe('page-a');
    expect(a.subscriptions.mock.calls).toContainEqual(['ws-razel', 'gyld.desk', new TextEncoder().encode('self:owner/shared')]);
  });
  it('shares appearance across different sessions and isolates their layouts', async () => {
    const a = await page('a', 'one'); const b = await page('b', 'two'); const c = await page('c', 'one', 'bob');
    link([a, b, c]);
    await a.glade.startGlade(); await b.glade.startGlade(); await c.glade.startGlade();
    a.read(a.desk.DESKTOP_THEME_TAP)!.set('nord');
    a.read(a.desk.SIDEBAR_WIDTH_TAP)!.set(360); a.tick();
    expect(b.read(b.desk.DESKTOP_THEME)).toBe('nord');
    expect(b.read(b.desk.SIDEBAR_WIDTH)).toBe(200);
    expect(c.read(c.desk.DESKTOP_THEME)).toBe('light');
    expect(c.read(c.desk.SIDEBAR_WIDTH)).toBe(200);
  });
  it('restores the shared desk from the local engine before a node answers', async () => {
    const engine = new MemoryStoreEngine();
    const a = await page('a', 'saved', 'owner', engine);
    vi.spyOn(a.glade.client, 'sendOps').mockImplementation(() => {});
    await a.glade.startGlade();
    a.read(a.desk.SIDEBAR_WIDTH_TAP)!.set(345); a.tick();
    const reloaded = await page('a', 'saved', 'owner', engine);
    expect(reloaded.read(reloaded.desk.SIDEBAR_WIDTH)).toBe(345);
  });
  it('resets only the shared layout and preserves the user appearance', async () => {
    const a = await page('a', 'shared'); const b = await page('b', 'shared'); link([a, b]);
    await a.glade.startGlade(); await b.glade.startGlade();
    a.read(a.desk.DESKTOP_THEME_TAP)!.set('dark');
    a.read(a.desk.SIDEBAR_WIDTH_TAP)!.set(340); a.tick();
    b.read(b.desk.DESKTOP_RESET_LAYOUT)!(); b.tick();
    expect(a.read(a.desk.SIDEBAR_WIDTH)).toBe(200);
    expect(a.read(a.desk.DESKTOP_THEME)).toBe('dark');
  });
});


describe('SS-06/07 session destinations and Gyld root state', () => {
  it('moves an already-open graph to the other page destination, keeping its search local', async () => {
    const a = await page('a', 'graph'); const b = await page('b', 'graph'); link([a, b]);
    await a.glade.startGlade(); await b.glade.startGlade();
    const opened = a.desk.openWindow([], 'gyld.browser', { w: 900, h: 600 }, 1, { stream: 'base', perspective: 'architecture' });
    const tab = opened.list[0].tabs[0];
    a.read(a.desk.DESKTOP_WINDOWS_TAP)!.set(opened.list); a.tick();
    a.context(tab.id, tab.params); b.context(tab.id, tab.params);
    b.tabRead(tab.id, b.gyld.GYLD_TAB_SEARCH_TAP)!.set('local draft');
    a.tabRead(tab.id, a.gyld.GYLD_DEST_STREAM_TAP)!.set('next');
    a.tick(); b.flush();
    expect(b.tabRead(tab.id, b.gyld.GYLD_DEST_STREAM)).toBe('next');
    expect(b.tabRead(tab.id, b.gyld.GYLD_TAB_SEARCH)).toBe('local draft');
    b.tabRead(tab.id, b.gyld.GYLD_DEST_REF_TAP)!.set('question'); b.tick(); a.flush();
    expect(a.tabRead(tab.id, a.gyld.GYLD_DEST_REF)).toBe('question');
  });
  it('shares serializable roots and semantic focus on one session', async () => {
    const a = await page('a', 'set'); const b = await page('b', 'set'); link([a, b]);
    await a.glade.startGlade(); await b.glade.startGlade();
    a.roots.GyldSetTap.set({ roots: [{ kind: 'share' }, { kind: 'static', baseUrl: '/bundle' }] });
    a.roots.GyldFocusTap.set({ stream: 'base', ref: 'q1' }); a.tick();
    expect(b.roots.GyldSetTap.get().roots).toEqual(a.roots.GyldSetTap.get().roots);
    expect(b.roots.GyldFocusTap.get()).toEqual({ stream: 'base', ref: 'q1' });
  });
});
