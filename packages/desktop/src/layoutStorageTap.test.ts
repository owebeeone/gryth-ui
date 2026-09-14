import { describe, expect, it } from 'vitest';
import { HUB } from './foundations';
import { foldDocument, type DeskState } from './layoutDocument';
import {
  clearStoredLayout, layoutKey, readStoredLayout, startLayoutPersistence,
  type DeskPorts, type LayoutStore, type Schedule,
} from './layoutStorageTap';

// The INTERIM storage side: what it writes, when it writes it, what it seeds,
// and — the part that matters most for a demo — that a store which is absent,
// full or forbidden costs the reader nothing but persistence.

const STATE: DeskState = {
  current: 1,
  windows: [],
  gridMemory: {},
  preset: HUB,
  sidebarOpen: true,
  sidebarWidth: 200,
  theme: 'light',
  wallpaper: '',
  wallpaperThemed: true,
  zoom: 1,
  fontScale: 10,
};

class FakeStore implements LayoutStore {
  readonly items = new Map<string, string>();
  writes = 0;

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

/** A store that fails every way a real one does: private mode, quota, a
 *  profile whose site data was wiped mid-session. */
const HOSTILE: LayoutStore = {
  getItem() { throw new Error('site data is blocked'); },
  setItem() { throw new Error('quota exceeded'); },
  removeItem() { throw new Error('site data is blocked'); },
};

function fakePorts(initial: DeskState = STATE) {
  let held = initial;
  const listeners: Array<() => void> = [];
  const seeded: Partial<DeskState>[] = [];
  const ports: DeskPorts = {
    read: () => held,
    seed(next) {
      seeded.push(next);
      held = { ...held, ...next };
    },
    watch(onChange) { listeners.push(onChange); },
  };
  return {
    ports,
    seeded,
    change(next: Partial<DeskState>) {
      held = { ...held, ...next };
      for (const listener of listeners) { listener(); }
    },
  };
}

/** The injectable clock: one pending run at a time, exactly as a debounce
 *  keeps it, so a test can assert the coalescing rather than wait 300ms. */
function manualClock() {
  let pending: (() => void) | null = null;
  const schedule: Schedule = (fn) => {
    pending = fn;
    return () => { if (pending === fn) { pending = null; } };
  };
  return {
    schedule,
    get waiting(): boolean { return pending !== null; },
    tick(): void {
      const fn = pending;
      pending = null;
      fn?.();
    },
  };
}

describe('the interim layout store', () => {
  it('writes the desk once a burst of changes has settled', () => {
    const store = new FakeStore();
    const desk = fakePorts();
    const clock = manualClock();
    startLayoutPersistence(desk.ports, { entry: 'gyld', store, schedule: clock.schedule });
    expect(store.writes).toBe(0);
    desk.change({ fontScale: 11 });
    desk.change({ fontScale: 12 });
    expect(store.writes).toBe(0);
    clock.tick();
    // one write for the burst, carrying the LAST value, under this entry's key
    expect(store.writes).toBe(1);
    const doc = readStoredLayout(store, layoutKey('gyld')) as Record<string, unknown>;
    expect((doc.appearance as Record<string, unknown>).fontScale).toBe(12);
    expect(store.items.has(layoutKey('desktop'))).toBe(false);
  });

  it('seeds the desk from a stored document and says it restored one', () => {
    const store = new FakeStore();
    store.setItem(
      layoutKey('gyld'),
      JSON.stringify(foldDocument('gyld', { ...STATE, fontScale: 13, sidebarWidth: 320 })),
    );
    const desk = fakePorts();
    const clock = manualClock();
    const held = startLayoutPersistence(
      desk.ports, { entry: 'gyld', store, schedule: clock.schedule },
    );
    expect(held.restored).toBe(true);
    expect(desk.seeded[0]?.fontScale).toBe(13);
    expect(desk.seeded[0]?.sidebarWidth).toBe(320);
  });

  it('restores nothing when nothing was stored, so the entry defaults stand', () => {
    const desk = fakePorts();
    const held = startLayoutPersistence(desk.ports, { entry: 'gyld', store: new FakeStore() });
    expect(held.restored).toBe(false);
    expect(desk.seeded).toEqual([]);
  });

  it('is simply off when there is no store', () => {
    const desk = fakePorts();
    const held = startLayoutPersistence(desk.ports, { entry: 'gyld', store: null });
    expect(held.restored).toBe(false);
    expect(() => { held.reset(); }).not.toThrow();
  });

  it('never breaks the desk when the store throws', () => {
    const desk = fakePorts();
    const clock = manualClock();
    const held = startLayoutPersistence(
      desk.ports,
      { entry: 'gyld', store: HOSTILE, schedule: clock.schedule, reload: () => {} },
    );
    expect(held.restored).toBe(false);
    desk.change({ fontScale: 11 });
    expect(() => { clock.tick(); }).not.toThrow();
    expect(() => { held.reset(); }).not.toThrow();
  });

  it('forgets the document on reset and stops writing it back', () => {
    const store = new FakeStore();
    store.setItem(layoutKey('gyld'), JSON.stringify(foldDocument('gyld', STATE)));
    const desk = fakePorts();
    const clock = manualClock();
    let reloaded = 0;
    const held = startLayoutPersistence(desk.ports, {
      entry: 'gyld', store, schedule: clock.schedule, reload: () => { reloaded += 1; },
    });
    desk.change({ fontScale: 11 });
    held.reset();
    expect(store.items.has(layoutKey('gyld'))).toBe(false);
    expect(reloaded).toBe(1);
    // the desk this page still holds must not land back in the store between
    // the clear and the reload
    expect(clock.waiting).toBe(false);
    desk.change({ fontScale: 12 });
    clock.tick();
    expect(store.items.has(layoutKey('gyld'))).toBe(false);
  });

  it('clears only what it stored', () => {
    const store = new FakeStore();
    store.setItem(layoutKey('gyld'), '{}');
    store.setItem('someone.else', 'keep me');
    clearStoredLayout(store, layoutKey('gyld'));
    expect(store.items.has(layoutKey('gyld'))).toBe(false);
    expect(store.getItem('someone.else')).toBe('keep me');
    expect(() => { clearStoredLayout(HOSTILE, layoutKey('gyld')); }).not.toThrow();
  });
});
