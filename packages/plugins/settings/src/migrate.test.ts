import { describe, expect, it } from 'vitest';
import { layoutKey, type LayoutStore } from '@grythjs/desktop';
import { DEFAULT_APPEARANCE } from './appearance';
import { AppearanceMemory, lastAppearanceKey, type AppearanceZone } from './migrate';

// A browser's appearance carried into the user's zone once (Glial appearance
// plan, Step 2.4), with the browser's storage and the zone faked. The stored
// desk is written as a build from before Step 2.3 wrote it: with its
// appearance.

/** A browser's local storage. */
class Browser implements LayoutStore {
  readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  /** The stored desk of the `gyld` entry, holding `appearance`. */
  withDesk(appearance: Record<string, unknown>): this {
    this.setItem(layoutKey('gyld'), JSON.stringify({
      version: 1, entry: 'gyld', desks: { current: 1, windows: [] }, sidebar: { open: true, width: 200 },
      appearance,
    }));
    return this;
  }
}

/** The user's zone as this page holds it after its replay. */
class Zone implements AppearanceZone {
  readonly writes: unknown[] = [];

  constructor(private held: unknown = undefined) {}

  empty(): boolean {
    return this.held === undefined;
  }

  write(value: unknown): void {
    this.writes.push(value);
    this.held = value;
  }
}

const OLD = { theme: 'nord', zoom: 1.2, fontScale: 12, wallpaper: '/w.jpeg', wallpaperThemed: false };

describe('the browser\'s record of a user\'s appearance', () => {
  it('takes the stored desk\'s appearance at registration, unless it has one', () => {
    const browser = new Browser().withDesk(OLD);
    new AppearanceMemory(browser, 'gyld', 'owner').adoptLegacy();
    expect(JSON.parse(browser.getItem(lastAppearanceKey('gyld', 'owner'))!)).toEqual({
      value: { v: 1, ...OLD }, seeded: false,
    });
    browser.withDesk({ ...OLD, theme: 'solar' });
    new AppearanceMemory(browser, 'gyld', 'owner').adoptLegacy();
    expect(new AppearanceMemory(browser, 'gyld', 'owner').placeholder().theme).toBe('nord');
  });

  it('is what the desk shows before the zone holds a value, else the defaults', () => {
    const browser = new Browser().withDesk(OLD);
    const memory = new AppearanceMemory(browser, 'gyld', 'owner');
    expect(memory.placeholder()).toEqual(DEFAULT_APPEARANCE);
    memory.adoptLegacy();
    expect(memory.placeholder()).toEqual(OLD);
  });

  it('follows every value the zone takes, for the next first paint', () => {
    const browser = new Browser();
    new AppearanceMemory(browser, 'gyld', 'owner').remember({ v: 1, ...OLD, theme: 'dark' });
    expect(new AppearanceMemory(browser, 'gyld', 'owner').placeholder())
      .toEqual({ ...OLD, theme: 'dark' });
    // another user of the same browser keeps a record of their own
    expect(new AppearanceMemory(browser, 'gyld', 'alice').placeholder()).toEqual(DEFAULT_APPEARANCE);
  });
});

describe('the one-time seed of the zone', () => {
  it('gives an empty zone the old value, in one write', () => {
    const browser = new Browser().withDesk({ theme: 'nord', zoom: 'big' });
    const memory = new AppearanceMemory(browser, 'gyld', 'owner');
    memory.adoptLegacy();
    const zone = new Zone();
    expect(memory.seedOnce(zone)).toBe(true);
    expect(zone.writes).toEqual([{ v: 1, ...DEFAULT_APPEARANCE, theme: 'nord' }]);
  });

  it('gives a zone that holds a value nothing', () => {
    const memory = new AppearanceMemory(new Browser().withDesk(OLD), 'gyld', 'owner');
    memory.adoptLegacy();
    const zone = new Zone({ v: 1, ...DEFAULT_APPEARANCE, theme: 'solar' });
    expect(memory.seedOnce(zone)).toBe(false);
    expect(zone.writes).toEqual([]);
  });

  it('writes nothing at the next boot, even to a zone that is still empty', () => {
    const browser = new Browser().withDesk(OLD);
    const first = new AppearanceMemory(browser, 'gyld', 'owner');
    first.adoptLegacy();
    first.seedOnce(new Zone());
    const again = new AppearanceMemory(browser, 'gyld', 'owner');
    again.adoptLegacy();
    const zone = new Zone();
    expect(again.seedOnce(zone)).toBe(false);
    expect(zone.writes).toEqual([]);
  });

  it('writes nothing when the browser held no appearance', () => {
    const browser = new Browser();
    browser.setItem(layoutKey('gyld'), JSON.stringify({ version: 1, entry: 'gyld', desks: {} }));
    const memory = new AppearanceMemory(browser, 'gyld', 'owner');
    memory.adoptLegacy();
    const zone = new Zone();
    expect(memory.seedOnce(zone)).toBe(false);
    expect(zone.writes).toEqual([]);
    expect(memory.placeholder()).toEqual(DEFAULT_APPEARANCE);
  });

  it('costs the desk nothing when the record is unreadable or the storage refuses', () => {
    const browser = new Browser().withDesk(OLD);
    browser.setItem(lastAppearanceKey('gyld', 'owner'), '{not json');
    const memory = new AppearanceMemory(browser, 'gyld', 'owner');
    expect(memory.placeholder()).toEqual(DEFAULT_APPEARANCE);
    const hostile: LayoutStore = {
      getItem() { throw new Error('site data is blocked'); },
      setItem() { throw new Error('quota exceeded'); },
      removeItem() { throw new Error('site data is blocked'); },
    };
    const blocked = new AppearanceMemory(hostile, 'gyld', 'owner');
    expect(() => {
      blocked.adoptLegacy();
      blocked.remember({ v: 1, ...OLD });
    }).not.toThrow();
    expect(blocked.placeholder()).toEqual(DEFAULT_APPEARANCE);
    expect(blocked.seedOnce(new Zone())).toBe(false);
  });
});
