import type { AtomTapHandle } from '@owebeeone/grip-react';
import { THEME_IDS, type ThemeId } from '@grythjs/desktop';

// The desk's appearance as ONE value in the user's private zone (Glial
// appearance plan, Step 2.1): where the value lives, the document it is, and
// the five handles the settings window writes through.
//
// Pure, and free of glial and glade on purpose: this package gains those edges
// with the wiring (Step 2.3), which hands the handles glial's value controller
// and the desk's clock from a tap. Nothing here reads the page, a store or a
// timer, and the suite drives all of it with fakes.

// --- where it lives -------------------------------------------------------------

/** The share every appearance value lives on: the workspace share the desk's
 *  node claims, so the value crosses nodes once writes do (owner ruling 1 of
 *  2026-09-25). */
export const APPEARANCE_SHARE = 'ws-razel';

/** One surface as glial's `defineManifest` takes it (its `SurfaceSpec`),
 *  written out here so that this module needs no glial; the wiring freezes it. */
export interface AppearanceSurfaceSpec {
  readonly id: string;
  readonly shape: 'value';
  readonly share: string;
  readonly domain: 'document';
  readonly zone: 'private';
  readonly retention: { readonly policy: 'latest'; readonly ttl_ms: null };
}

/** An entry's appearance manifest: one `value` with the glade id
 *  `<entry>.appearance`, since the entry name already keeps two desks apart.
 *  `gyld`'s is the line grazel's `apps/gyld-app.glade` declares. */
export function appearanceManifest(entry: string): { readonly appearance: AppearanceSurfaceSpec } {
  return {
    appearance: {
      id: `${entry}.appearance`,
      shape: 'value',
      share: APPEARANCE_SHARE,
      domain: 'document',
      zone: 'private',
      retention: { policy: 'latest', ttl_ms: null },
    },
  };
}

/** The zone key of `principal`'s own value: the node's `self:<principal>`.
 *  glial does not build it, since its zone fill never reaches the wire, so this
 *  one function does: the fill takes it as it is, and the route and the boot
 *  subscription take its UTF-8. */
export function selfKey(principal: string): string {
  if (principal.trim() === '') {
    throw new Error('appearance: a blank principal names no user, so it keys no private zone');
  }
  return `self:${principal}`;
}

// --- the document ---------------------------------------------------------------

/** What the desk's five appearance grips carry (`@grythjs/desktop`). */
export interface Appearance {
  readonly theme: ThemeId;
  readonly zoom: number;
  readonly fontScale: number;
  readonly wallpaper: string;
  readonly wallpaperThemed: boolean;
}

/** One setting: its default, and what a stored or handed value must be. */
class Setting<T> {
  constructor(
    readonly fallback: T,
    /** `raw` as a value of this setting, clamped where it has a range, or
     *  nothing when it is not one. */
    readonly accept: (raw: unknown) => T | undefined,
  ) {}

  read(raw: unknown): T {
    return this.accept(raw) ?? this.fallback;
  }
}

/** A finite number, held to `[least, most]`: where the settings window's own
 *  buttons stop (`Settings.tsx`). */
function within(least: number, most: number): (raw: unknown) => number | undefined {
  return (raw) =>
    typeof raw === 'number' && Number.isFinite(raw) ? Math.min(most, Math.max(least, raw)) : undefined;
}

/** The five settings, each defaulting as its desk grip does. */
const SETTINGS: { readonly [K in keyof Appearance]: Setting<Appearance[K]> } = {
  theme: new Setting<ThemeId>('light', (raw) => THEME_IDS.find((id) => id === raw)),
  zoom: new Setting(1, within(0.7, 1.5)),
  fontScale: new Setting(10, within(5, 15)),
  wallpaper: new Setting('', (raw) => (typeof raw === 'string' ? raw : undefined)),
  wallpaperThemed: new Setting(true, (raw) => (typeof raw === 'boolean' ? raw : undefined)),
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: SETTINGS.theme.fallback,
  zoom: SETTINGS.zoom.fallback,
  fontScale: SETTINGS.fontScale.fallback,
  wallpaper: SETTINGS.wallpaper.fallback,
  wallpaperThemed: SETTINGS.wallpaperThemed.fallback,
};

/** The version this build reads and writes. Bump it only for a change an older
 *  build must not read, because that build reads another version as the
 *  defaults; add a field without bumping it, and an older build keeps it. */
export const APPEARANCE_VERSION = 1;

const KNOWN = new Set(['v', ...Object.keys(SETTINGS)]);

function isObject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

/** The appearance value, `{v: 1, theme, zoom, fontScale, wallpaper,
 *  wallpaperThemed}` in glial's default JSON codec, with every field a newer
 *  build wrote carried through untouched. */
export class AppearanceDocument {
  private constructor(
    readonly settings: Appearance,
    private readonly others: Readonly<Record<string, unknown>>,
  ) {}

  /** The value the zone holds, each field validated as the desk blob's reader
   *  validates its appearance (`layoutDocument.ts`). Where that reader leaves a
   *  grip as it was, this one has no grip to leave: anything but a version-1
   *  object is the defaults, a field that does not read is its default, and
   *  zoom and font scale are clamped. */
  static read(raw: unknown): AppearanceDocument {
    if (!isObject(raw) || raw.v !== APPEARANCE_VERSION) {
      return new AppearanceDocument(DEFAULT_APPEARANCE, {});
    }
    return new AppearanceDocument(
      {
        theme: SETTINGS.theme.read(raw.theme),
        zoom: SETTINGS.zoom.read(raw.zoom),
        fontScale: SETTINGS.fontScale.read(raw.fontScale),
        wallpaper: SETTINGS.wallpaper.read(raw.wallpaper),
        wallpaperThemed: SETTINGS.wallpaperThemed.read(raw.wallpaperThemed),
      },
      Object.fromEntries(Object.entries(raw).filter(([name]) => !KNOWN.has(name))),
    );
  }

  /** This document with `name` set to `value`, clamped; this very document when
   *  that changes nothing or `value` is not a value of that setting. */
  with<K extends keyof Appearance>(name: K, value: Appearance[K]): AppearanceDocument {
    const setting: Setting<Appearance[K]> = SETTINGS[name];
    const accepted = setting.accept(value);
    if (accepted === undefined || accepted === this.settings[name]) {
      return this;
    }
    return new AppearanceDocument({ ...this.settings, [name]: accepted }, this.others);
  }

  /** The whole value, as the controller writes it. */
  write(): Record<string, unknown> {
    return { ...this.others, v: APPEARANCE_VERSION, ...this.settings };
  }
}

// --- the handles ----------------------------------------------------------------

/** What the handles write through: the part of glial's value controller
 *  (`GlialTapController`) a value surface uses, the zone's value as glial
 *  folds it and a write of the whole. */
export interface AppearanceController {
  get(): unknown;
  set(value: unknown): void;
}

/** Run `fn` after `ms`, and return the cancel: the desk's clock shape
 *  (`@grythjs/desktop`'s `Schedule`), so a suite fires it by hand. */
export type Schedule = (fn: () => void, ms: number) => () => void;

/** How long wallpaper text settles before it is written: the field changes at
 *  every keystroke, and every write stays in the zone as an op. */
export const WALLPAPER_SETTLE_MS = 400;

export interface AppearanceHandlesOptions {
  /** The desk's clock. The wiring hands in the real one from its tap. */
  readonly schedule: Schedule;
  /** Told when what the reader sees changes before the zone does: wallpaper
   *  text still settling. The zone's own changes arrive through glial. */
  readonly changed?: () => void;
}

/** The five appearance handles, `AtomTapHandle`-shaped as the desk's grips
 *  declare them, over one controller. Each reads the zone's value when called,
 *  changes one field and writes the whole, so another tab's write that landed
 *  in between is kept; a value already there writes nothing. The wallpaper
 *  handle shows its text at once and writes it after WALLPAPER_SETTLE_MS of
 *  quiet. */
export class AppearanceHandles {
  readonly theme: AtomTapHandle<ThemeId>;
  readonly zoom: AtomTapHandle<number>;
  readonly fontScale: AtomTapHandle<number>;
  readonly wallpaper: AtomTapHandle<string>;
  readonly wallpaperThemed: AtomTapHandle<boolean>;

  private settling: string | undefined;
  private cancel: (() => void) | undefined;

  constructor(
    private readonly controller: AppearanceController,
    private readonly options: AppearanceHandlesOptions,
  ) {
    this.theme = this.field('theme');
    this.zoom = this.field('zoom');
    this.fontScale = this.field('fontScale');
    this.wallpaperThemed = this.field('wallpaperThemed');
    this.wallpaper = {
      get: () => this.shown().wallpaper,
      set: (text) => this.settle(text),
      update: (next) => this.settle(next(this.shown().wallpaper)),
    };
  }

  /** What the reader sees: the zone's appearance, with wallpaper text that has
   *  not settled yet in place of the zone's. */
  shown(): Appearance {
    const settings = this.document().settings;
    return this.settling === undefined ? settings : { ...settings, wallpaper: this.settling };
  }

  /** Write settling wallpaper text now rather than after the quiet, as the
   *  wiring does when its tap goes away. */
  flush(): void {
    this.cancel?.();
    this.cancel = undefined;
    const text = this.settling;
    this.settling = undefined;
    if (text !== undefined) {
      this.write('wallpaper', text);
    }
  }

  private document(): AppearanceDocument {
    return AppearanceDocument.read(this.controller.get());
  }

  private field<K extends keyof Appearance>(name: K): AtomTapHandle<Appearance[K]> {
    return {
      get: () => this.document().settings[name],
      set: (value) => this.write(name, value),
      update: (next) => this.write(name, next(this.document().settings[name])),
    };
  }

  private write<K extends keyof Appearance>(name: K, value: Appearance[K]): void {
    const held = this.document();
    const next = held.with(name, value);
    if (next !== held) {
      this.controller.set(next.write());
    }
  }

  private settle(text: string): void {
    if (text === this.shown().wallpaper) {
      return;
    }
    this.settling = text;
    this.cancel?.();
    this.cancel = this.options.schedule(() => this.flush(), WALLPAPER_SETTLE_MS);
    this.options.changed?.();
  }
}
