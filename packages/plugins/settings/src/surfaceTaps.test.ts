import { describe, expect, it } from 'vitest';
import { GripRegistry, Grok, type Grip } from '@owebeeone/grip-react';
import { GlialBinder, type Fill, type GladeDestination, type StoredOp } from '@owebeeone/glial-runtime';
import {
  DESKTOP_THEME, DESKTOP_THEME_TAP, DESKTOP_WALLPAPER, DESKTOP_WALLPAPER_TAP, DESKTOP_ZOOM,
  DESKTOP_ZOOM_TAP,
} from '@grythjs/desktop';
import { DEFAULT_APPEARANCE, WALLPAPER_SETTLE_MS, type Schedule } from './appearance';
import { APPEARANCE_FOLLOWS } from './grips';
import { registerAppearance, type AppearanceIdentity } from './surfaceTaps';

// Which producers a page registers for its appearance (Glial appearance plan,
// Step 2.3), and what the user's zone gets from them, with the node faked by
// glial's own test double: a destination that records what the page sends and
// delivers what another tab sent. Two real tabs over real sessions are
// `live.test.ts`.

/** The user's zone, as one page's destination sees it. */
class Zone implements GladeDestination {
  readonly sent: unknown[] = [];
  private seq = 0;
  private handler?: (ops: StoredOp[]) => void;

  send(payload: Uint8Array): StoredOp {
    this.sent.push(JSON.parse(new TextDecoder().decode(payload)));
    this.seq += 1;
    return { origin: 'tab', seq: this.seq, lamport: this.seq, prev: null, payload };
  }

  subscribe(onOps: (ops: StoredOp[]) => void): () => void {
    this.handler = onOps;
    return () => {
      this.handler = undefined;
    };
  }

  /** Another tab's write, arriving from the node. */
  deliver(value: unknown, lamport: number): void {
    const payload = new TextEncoder().encode(JSON.stringify(value));
    this.handler?.([{ origin: 'other', seq: lamport, lamport, prev: null, payload }]);
  }
}

/** A clock that moves only when told to. */
function clock() {
  let now = 0;
  let timers: Array<{ at: number; fn: () => void }> = [];
  const schedule: Schedule = (fn, ms) => {
    const timer = { at: now + ms, fn };
    timers.push(timer);
    return () => {
      timers = timers.filter((one) => one !== timer);
    };
  };
  return {
    schedule,
    advance(ms: number): void {
      now += ms;
      const due = timers.filter((one) => one.at <= now);
      timers = timers.filter((one) => one.at > now);
      for (const one of due) {
        one.fn();
      }
    },
  };
}

/** A composed page: its grip graph, with its appearance registered. */
function page(identity: AppearanceIdentity, zone?: Zone, placeholder = DEFAULT_APPEARANCE) {
  const grok = new Grok(new GripRegistry());
  const fills: Fill[] = [];
  const kept: unknown[] = [];
  const time = clock();
  const handle = registerAppearance(grok, {
    binder: new GlialBinder(),
    destination: (fill) => {
      fills.push(fill);
      return zone;
    },
    identity,
    entry: 'gyld',
    placeholder,
    schedule: time.schedule,
    remember: (value) => kept.push(value),
  });
  const read = <T>(grip: Grip<T>): T | undefined => {
    const held = grok.query(grip, grok.mainContext);
    grok.flush();
    return held.get();
  };
  return { fills, read, time, flush: () => grok.flush(), handle, kept };
}

describe('a page whose principal is its tab alone', () => {
  it('registers today\'s atom taps and mounts nothing on the node', () => {
    const tab = page({ principal: 'k3j2h1', roams: false });
    tab.read(DESKTOP_THEME_TAP)?.set('dark');
    expect(tab.read(DESKTOP_THEME)).toBe('dark');
    expect(tab.fills).toEqual([]);
    expect(tab.read(APPEARANCE_FOLLOWS)).toBeUndefined();
    // and there is no zone for a migration to seed
    expect(tab.handle).toBeUndefined();
  });
});

describe('a page whose principal names its user', () => {
  it('mounts that user\'s private zone and shows the placeholder until it holds a value', () => {
    const zone = new Zone();
    const placeholder = { ...DEFAULT_APPEARANCE, theme: 'nord' as const };
    const tab = page({ principal: 'owner', roams: true }, zone, placeholder);
    expect(tab.fills).toEqual([{ domain: 'gyld', zone: 'private', key: 'self:owner' }]);
    expect(tab.read(DESKTOP_THEME)).toBe('nord');
    expect(tab.read(APPEARANCE_FOLLOWS)).toBe('owner');
    // a write changes what the reader sees, and nothing else
    tab.read(DESKTOP_ZOOM_TAP)?.set(1.1);
    expect(zone.sent).toEqual([{ v: 1, ...placeholder, zoom: 1.1 }]);
  });

  it('writes the whole value to the zone, and follows another tab\'s write', () => {
    const zone = new Zone();
    const tab = page({ principal: 'owner', roams: true }, zone);
    tab.read(DESKTOP_THEME_TAP)?.set('dark');
    expect(zone.sent).toEqual([{ v: 1, ...DEFAULT_APPEARANCE, theme: 'dark' }]);
    expect(tab.read(DESKTOP_THEME)).toBe('dark');
    zone.deliver({ v: 1, ...DEFAULT_APPEARANCE, theme: 'nord', zoom: 1.2 }, 9);
    tab.flush();
    expect([tab.read(DESKTOP_THEME), tab.read(DESKTOP_ZOOM)]).toEqual(['nord', 1.2]);
  });

  it('shows wallpaper text at once and writes it once it settles', () => {
    const zone = new Zone();
    const tab = page({ principal: 'owner', roams: true }, zone);
    // the settings window is already showing the field as the reader types
    expect(tab.read(DESKTOP_WALLPAPER)).toBe('');
    tab.read(DESKTOP_WALLPAPER_TAP)?.set('/wide.jpeg');
    expect(tab.read(DESKTOP_WALLPAPER)).toBe('/wide.jpeg');
    expect(zone.sent).toEqual([]);
    tab.time.advance(WALLPAPER_SETTLE_MS);
    expect(zone.sent).toEqual([{ v: 1, ...DEFAULT_APPEARANCE, wallpaper: '/wide.jpeg' }]);
  });
});

describe('the zone, for the migration (Step 2.4)', () => {
  it('shows the browser\'s last value until the replay, then the zone\'s, and keeps each', () => {
    const zone = new Zone();
    const last = { ...DEFAULT_APPEARANCE, theme: 'nord' as const, fontScale: 12 };
    const tab = page({ principal: 'owner', roams: true }, zone, last);
    expect([tab.read(DESKTOP_THEME), tab.kept]).toEqual(['nord', []]);
    const replayed = { v: 1, ...DEFAULT_APPEARANCE, theme: 'solar' };
    zone.deliver(replayed, 4);
    tab.flush();
    expect(tab.read(DESKTOP_THEME)).toBe('solar');
    expect(tab.kept).toEqual([replayed]);
  });

  it('says whether the zone holds a value, and takes a whole one', () => {
    const zone = new Zone();
    const tab = page({ principal: 'owner', roams: true }, zone);
    expect(tab.handle?.empty()).toBe(true);
    tab.handle?.write({ v: 1, ...DEFAULT_APPEARANCE, theme: 'dark' });
    expect(zone.sent).toEqual([{ v: 1, ...DEFAULT_APPEARANCE, theme: 'dark' }]);
    expect(tab.handle?.empty()).toBe(false);
  });
});
