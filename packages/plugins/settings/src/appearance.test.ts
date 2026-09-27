import { describe, expect, it } from 'vitest';
import {
  DESKTOP_FONT_SCALE, DESKTOP_THEME, DESKTOP_WALLPAPER, DESKTOP_WALLPAPER_THEMED, DESKTOP_ZOOM,
  type ThemeId,
} from '@grythjs/desktop';
import {
  AppearanceDocument,
  AppearanceHandles,
  DEFAULT_APPEARANCE,
  WALLPAPER_SETTLE_MS,
  appearanceManifest,
  selfKey,
  type AppearanceController,
  type Schedule,
} from './appearance';

// The desk's appearance as one value in the user's private zone (Glial
// appearance plan, Step 2.1), as data: where it lives, what a stored value
// reads as, and what the five handles write. The zone is a fake that folds each
// write at once, as glial's value controller does, and the clock moves only
// when told to.

/** A zone holding one appearance value. */
class Zone implements AppearanceController {
  readonly writes: Record<string, unknown>[] = [];

  constructor(private held: unknown = undefined) {}

  get(): unknown {
    return this.held;
  }

  set(value: unknown): void {
    // through JSON, as glial's default codec carries it
    const landed = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    this.writes.push(landed);
    this.held = landed;
  }

  /** Another tab's write, arriving from the node. */
  land(value: unknown): void {
    this.held = value;
  }
}

/** A clock that moves only when told to. */
class Clock {
  private now = 0;
  private timers: Array<{ at: number; fn: () => void }> = [];

  readonly schedule: Schedule = (fn, ms) => {
    const timer = { at: this.now + ms, fn };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((one) => one !== timer);
    };
  };

  get pending(): number {
    return this.timers.length;
  }

  advance(ms: number): void {
    this.now += ms;
    const due = this.timers.filter((one) => one.at <= this.now);
    this.timers = this.timers.filter((one) => one.at > this.now);
    for (const one of due) {
      one.fn();
    }
  }
}

/** A version-1 value as a desk writes it. */
const STORED = {
  v: 1, theme: 'nord', zoom: 1.2, fontScale: 12, wallpaper: '/w.jpeg', wallpaperThemed: false,
};
const STORED_SETTINGS = {
  theme: 'nord', zoom: 1.2, fontScale: 12, wallpaper: '/w.jpeg', wallpaperThemed: false,
};

function handlesOver(zone: Zone, clock = new Clock(), changed = () => {}): AppearanceHandles {
  return new AppearanceHandles(zone, { schedule: clock.schedule, changed });
}

describe('where the appearance lives', () => {
  it('is one value per entry on ws-razel, in the private zone, kept latest', () => {
    // gyld's is the line grazel's apps/gyld-app.glade declares:
    // `binding gyld.appearance value share private latest`
    expect(appearanceManifest('gyld')).toEqual({
      appearance: {
        id: 'gyld.appearance',
        shape: 'value',
        share: 'ws-razel',
        domain: 'document',
        zone: 'private',
        retention: { policy: 'latest', ttl_ms: null },
      },
    });
    expect(appearanceManifest('desktop').appearance.id).toBe('desktop.appearance');
  });

  it('keys each user by name, and a blank name keys no one', () => {
    expect(selfKey('owner')).toBe('self:owner');
    expect(selfKey('alice')).toBe('self:alice');
    expect(() => selfKey('')).toThrow(/blank principal/);
    expect(() => selfKey('  ')).toThrow(/blank principal/);
  });
});

describe('the appearance document', () => {
  it('round-trips through the wire form', () => {
    const document = AppearanceDocument.read(STORED);
    expect(document.settings).toEqual(STORED_SETTINGS);
    const wire: unknown = JSON.parse(JSON.stringify(document.write()));
    expect(wire).toEqual(STORED);
    expect(AppearanceDocument.read(wire).settings).toEqual(STORED_SETTINGS);
  });

  it('defaults to the desk grips\' own defaults', () => {
    expect(DEFAULT_APPEARANCE).toEqual({
      theme: DESKTOP_THEME.defaultValue,
      zoom: DESKTOP_ZOOM.defaultValue,
      fontScale: DESKTOP_FONT_SCALE.defaultValue,
      wallpaper: DESKTOP_WALLPAPER.defaultValue,
      wallpaperThemed: DESKTOP_WALLPAPER_THEMED.defaultValue,
    });
  });

  it('clamps zoom to 0.7–1.5 and font scale to 5–15, the settings window\'s ranges', () => {
    const high = AppearanceDocument.read({ ...STORED, zoom: 3, fontScale: 40 }).settings;
    expect([high.zoom, high.fontScale]).toEqual([1.5, 15]);
    const low = AppearanceDocument.read({ ...STORED, zoom: 0.1, fontScale: -2 }).settings;
    expect([low.zoom, low.fontScale]).toEqual([0.7, 5]);
  });

  it('reads a malformed field as its default and keeps the rest', () => {
    expect(AppearanceDocument.read({ ...STORED, theme: 'purple' }).settings)
      .toEqual({ ...STORED_SETTINGS, theme: 'light' });
    expect(AppearanceDocument.read({
      v: 1, theme: 7, zoom: 'big', fontScale: null, wallpaper: false, wallpaperThemed: 'yes',
    }).settings).toEqual(DEFAULT_APPEARANCE);
  });

  it('reads an unreadable value as all defaults', () => {
    const unreadable: unknown[] = [
      undefined, null, 'nord', 42, true, [], [STORED],
      // a value with no version, or another one: its fields may mean something else
      { theme: 'nord' }, { ...STORED, v: 2 }, { ...STORED, v: '1' },
    ];
    for (const raw of unreadable) {
      expect(AppearanceDocument.read(raw).settings).toEqual(DEFAULT_APPEARANCE);
    }
  });

  it('keeps a field it does not know, so an older tab never drops a newer one', () => {
    const zone = new Zone({ ...STORED, accent: 'teal', dock: { side: 'left' } });
    handlesOver(zone).zoom.set(1.3);
    expect(zone.writes).toEqual([{ ...STORED, zoom: 1.3, accent: 'teal', dock: { side: 'left' } }]);
  });
});

describe('the five handles', () => {
  it('write the whole value with one field changed, and read it back', () => {
    const zone = new Zone(STORED);
    const handles = handlesOver(zone);
    handles.theme.set('dark');
    handles.wallpaperThemed.set(true);
    expect(zone.writes).toEqual([
      { ...STORED, theme: 'dark' },
      { ...STORED, theme: 'dark', wallpaperThemed: true },
    ]);
    expect([handles.theme.get(), handles.wallpaperThemed.get()]).toEqual(['dark', true]);
  });

  it('write to an empty zone a whole version-1 value', () => {
    const zone = new Zone();
    handlesOver(zone).fontScale.set(11);
    expect(zone.writes).toEqual([{ v: 1, ...DEFAULT_APPEARANCE, fontScale: 11 }]);
  });

  it('update from the latest value, another tab\'s write included', () => {
    const zone = new Zone(STORED);
    const handles = handlesOver(zone);
    handles.fontScale.update((scale) => scale + 1);
    handles.fontScale.update((scale) => scale + 1);
    expect(zone.writes.map((one) => one.fontScale)).toEqual([13, 14]);
    zone.land({ ...STORED, theme: 'solar', fontScale: 8 });
    handles.fontScale.update((scale) => scale + 1);
    expect(zone.writes[2]).toEqual({ ...STORED, theme: 'solar', fontScale: 9 });
  });

  it('write nothing for a value already there or one that does not read, and clamp the rest', () => {
    const zone = new Zone(STORED);
    const handles = handlesOver(zone);
    handles.theme.set('nord');
    handles.zoom.set(1.2);
    handles.wallpaperThemed.set(false);
    handles.theme.set('purple' as ThemeId);
    handles.zoom.set(Number.NaN);
    expect(zone.writes).toEqual([]);
    handles.zoom.set(9);
    handles.zoom.set(2);
    expect(zone.writes).toEqual([{ ...STORED, zoom: 1.5 }]);
  });

  it('show a burst of wallpaper keystrokes at once and write it once, 400 ms after the last', () => {
    const zone = new Zone(STORED);
    const clock = new Clock();
    let told = 0;
    const handles = handlesOver(zone, clock, () => {
      told += 1;
    });
    handles.wallpaper.set('h');
    clock.advance(100);
    handles.wallpaper.set('ht');
    clock.advance(100);
    handles.wallpaper.update((text) => `${text}t`);
    expect(handles.wallpaper.get()).toBe('htt');
    expect(told).toBe(3);
    expect(zone.writes).toEqual([]);
    // another tab's write meanwhile: shown under the settling text, and kept
    zone.land({ ...STORED, theme: 'dark' });
    expect(handles.shown()).toEqual({ ...STORED_SETTINGS, theme: 'dark', wallpaper: 'htt' });
    expect(WALLPAPER_SETTLE_MS).toBe(400);
    clock.advance(WALLPAPER_SETTLE_MS - 1);
    expect(zone.writes).toEqual([]);
    clock.advance(1);
    expect(zone.writes).toEqual([{ ...STORED, theme: 'dark', wallpaper: 'htt' }]);
    expect(clock.pending).toBe(0);
    expect(handles.wallpaper.get()).toBe('htt');
  });

  it('write settling wallpaper text at once when flushed, and once only', () => {
    const zone = new Zone(STORED);
    const clock = new Clock();
    const handles = handlesOver(zone, clock);
    handles.wallpaper.set('/x.jpeg');
    expect(zone.writes).toEqual([]);
    handles.flush();
    expect(zone.writes).toEqual([{ ...STORED, wallpaper: '/x.jpeg' }]);
    clock.advance(WALLPAPER_SETTLE_MS * 2);
    handles.flush();
    expect(zone.writes).toHaveLength(1);
  });

  it('write no wallpaper text that settles back to what the zone holds', () => {
    const zone = new Zone(STORED);
    const clock = new Clock();
    const handles = handlesOver(zone, clock);
    handles.wallpaper.set('/w.jpe');
    handles.wallpaper.set('/w.jpeg');
    clock.advance(WALLPAPER_SETTLE_MS);
    expect(zone.writes).toEqual([]);
    expect(handles.wallpaper.get()).toBe('/w.jpeg');
  });
});
