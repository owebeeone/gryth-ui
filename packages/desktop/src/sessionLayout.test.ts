import { describe, expect, it } from 'vitest';
import { startSessionLayout, sessionLayoutKey } from './sessionLayout';
import { foldDocument, type DeskState } from './layoutDocument';
import { HUB } from './foundations';

function fixture(remote?: unknown, cached?: unknown, delayedOwnNotice = false, rows = new Map<string, string>()) {
  let state: DeskState = { current: 1, windows: [], gridMemory: {}, preset: HUB, sidebarOpen: true, sidebarWidth: 200 };
  const defaults = structuredClone(state);
  if (cached !== undefined) { rows.set(sessionLayoutKey('gyld', 'owner', 'desk'), JSON.stringify(cached)); }
  let deskChanged = () => {};
  let zoneChanged = () => {};
  let finish!: (ok: boolean) => void;
  const ready = new Promise<boolean>((resolve) => { finish = resolve; });
  const pending: Array<{ fn: () => void; cancelled: boolean }> = [];
  const writes: unknown[] = [];
  const ports = {
    read: () => state,
    seed: (next: Partial<DeskState>) => { state = { ...state, ...next }; deskChanged(); },
    watch: (fn: () => void) => { deskChanged = fn; },
  };
  const zone = {
    get: () => remote,
    write: (next: unknown) => { writes.push(next); remote = next; if (!delayedOwnNotice) { zoneChanged(); } },
    watch: (fn: () => void) => { zoneChanged = fn; return () => { zoneChanged = () => {}; }; },
  };
  const store = { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); }, removeItem: (key: string) => { rows.delete(key); } };
  const layout = startSessionLayout(ports, {
    entry: 'gyld', principal: 'owner', session: 'desk', zone, replayed: ready, store,
    resetDefaults: () => ports.seed(structuredClone(defaults)),
    schedule: (fn) => { const task = { fn, cancelled: false }; pending.push(task); return () => { task.cancelled = true; }; },
  });
  layout.initialize?.();
  return {
    state: () => state, writes, layout, rows, notice: () => zoneChanged(),
    change: (next: Partial<DeskState>) => ports.seed(next),
    tick: () => { const tasks = pending.splice(0); for (const task of tasks) { if (!task.cancelled) { task.fn(); } } },
    remote: (next: unknown) => { remote = next; if (!delayedOwnNotice) { zoneChanged(); } },
    ready: async (ok = true) => { finish(ok); await ready; await Promise.resolve(); },
  };
}
const document = (width: number) => foldDocument('gyld', {
  current: 1, windows: [], gridMemory: {}, preset: HUB, sidebarOpen: true, sidebarWidth: width,
});

describe('SS-03/04/08 session layout contract', () => {
  it('waits for replay before seeding an empty zone and seeds only once', async () => {
    const page = fixture(undefined, document(350));
    expect(page.layout.restored).toBe(true);
    expect(page.state().sidebarWidth).toBe(350);
    page.tick();
    expect(page.writes).toEqual([]);
    await page.ready();
    expect(page.writes).toHaveLength(1);
    page.remote(document(400));
    page.tick();
    expect(page.writes).toHaveLength(1);
  });
  it('lets the remote desk replace a stale browser seed without an echo', async () => {
    const page = fixture(document(450), document(300));
    await page.ready();
    expect(page.state().sidebarWidth).toBe(450);
    page.tick();
    expect(page.writes).toEqual([]);
  });
  it('debounces a burst of local edits and writes the last one', async () => {
    const page = fixture(document(200));
    await page.ready();
    page.change({ sidebarWidth: 300 });
    page.change({ sidebarWidth: 320, current: 2 });
    expect(page.writes).toEqual([]);
    page.tick();
    expect(page.writes).toEqual([expect.objectContaining({ sidebar: { open: true, width: 320 }, desks: expect.objectContaining({ current: 2 }) })]);
  });
  it('does not let a delayed own-value notice erase the next local gesture', async () => {
    const page = fixture(document(200), undefined, true);
    await page.ready();
    page.change({ sidebarWidth: 300 }); page.tick();
    page.change({ sidebarWidth: 320 });
    page.notice(); page.tick();
    expect(page.state().sidebarWidth).toBe(320);
    expect(page.writes.at(-1)).toHaveProperty('sidebar.width', 320);
  });
  it('cancels a stale pending write when a remote desk arrives', async () => {
    const page = fixture(document(200));
    await page.ready();
    page.change({ sidebarWidth: 300 });
    page.remote(document(400));
    page.tick();
    expect(page.state().sidebarWidth).toBe(400);
    expect(page.writes).toEqual([]);
  });
  it('never seeds after a refused replay, but remembers an offline edit', async () => {
    const page = fixture(undefined, document(300));
    await page.ready(false);
    page.change({ sidebarWidth: 330 });
    page.tick();
    expect(page.writes).toEqual([]);
    expect(JSON.parse(page.rows.get(sessionLayoutKey('gyld', 'owner', 'desk'))!)).toMatchObject({ sidebar: { width: 330 } });
  });
  it('retries an explicit offline edit after reload even with a stale stored zone', async () => {
    const offline = fixture(document(200));
    await offline.ready(false);
    offline.change({ sidebarWidth: 330 }); offline.tick();
    const cached = JSON.parse(offline.rows.get(sessionLayoutKey('gyld', 'owner', 'desk'))!);
    const reloaded = fixture(document(200), cached, false, offline.rows);
    expect(reloaded.state().sidebarWidth).toBe(330);
    await reloaded.ready();
    expect(reloaded.writes.at(-1)).toHaveProperty('sidebar.width', 330);
  });
  it('keeps an explicit pre-replay gesture while inbound replay catches up', async () => {
    const page = fixture(document(200));
    page.change({ sidebarWidth: 330 });
    page.remote(document(400));
    await page.ready();
    expect(page.state().sidebarWidth).toBe(330);
    expect(page.writes.at(-1)).toHaveProperty('sidebar.width', 330);
  });
  it('never migrates the same browser seed twice when a later replay is empty', async () => {
    const first = fixture(undefined, document(310));
    await first.ready();
    const later = fixture(undefined, document(310), false, first.rows);
    await later.ready(); later.tick();
    expect(later.writes).toEqual([]);
  });
  it('ignores malformed or wrong-entry documents', async () => {
    const page = fixture({ version: 99 }, { version: 1, entry: 'desktop' });
    expect(page.layout.restored).toBe(false);
    await page.ready();
    expect(page.state().sidebarWidth).toBe(200);
  });
  it('resets the shared layout with the entry defaults and leaves appearance out', async () => {
    const page = fixture(document(450));
    await page.ready();
    page.layout.reset();
    page.tick();
    expect(page.state().sidebarWidth).toBe(200);
    expect(page.writes.at(-1)).not.toHaveProperty('appearance');
  });
  it('stops timers and subscriptions on dispose', async () => {
    const page = fixture(document(200));
    await page.ready();
    page.change({ sidebarWidth: 320 });
    page.layout.dispose();
    page.tick();
    page.remote(document(400));
    expect(page.writes).toEqual([]);
    expect(page.state().sidebarWidth).toBe(320);
  });
  it('preserves unknown top-level fields on a local edit', async () => {
    const page = fixture({ ...document(200), future: { retained: true } });
    await page.ready();
    page.change({ current: 2 });
    page.tick();
    expect(page.writes.at(-1)).toHaveProperty('future', { retained: true });
  });
  it('does not rewrite defaults on a late denied replay or after disposal', async () => {
    const page = fixture();
    page.layout.dispose();
    await page.ready();
    expect(page.writes).toEqual([]);
  });
});
