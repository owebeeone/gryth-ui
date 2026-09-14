import type { AtomTapHandle, Grip, Grok } from '@owebeeone/grip-react';
import {
  DESKTOP_CURRENT, DESKTOP_FONT_SCALE, DESKTOP_FONT_SCALE_TAP,
  DESKTOP_FOUNDATION_PRESET, DESKTOP_GRID_MEMORY, DESKTOP_THEME, DESKTOP_THEME_TAP,
  DESKTOP_WALLPAPER, DESKTOP_WALLPAPER_TAP, DESKTOP_WALLPAPER_THEMED,
  DESKTOP_WALLPAPER_THEMED_TAP, DESKTOP_WINDOWS, DESKTOP_ZOOM, DESKTOP_ZOOM_TAP,
  SIDEBAR_OPEN, SIDEBAR_WIDTH,
  type FoundationDef, type WindowRecord,
} from './grips.desktop';
import { HUB } from './foundations';
import type { GridStash } from './ops';
import type { ThemeId } from './themes';
import { foldDocument, seedFrom, type DeskDocument, type DeskState } from './layoutDocument';

// ---------------------------------------------------------------------------
// INTERIM demo persistence — the storage side. Read ./layoutDocument's header
// first: this whole pair is get-the-demo-working code and is NOT definitive.
//
// Environ state is meant to be held by a GLIAL value instance — persisted and
// roamed across a user's instances, per gryth-dev's GrythVision.md and the
// scope comments in ./grips.desktop.ts. Glial cannot do it yet; persistence is
// one of its two recorded gaps
// (/Users/owebeeone/limbo/glade-wz/dev-docs/glial/GlialFitAssessment-2026-09-15.md).
// So until it can, one debounced JSON blob in `localStorage` stands in.
//
// What that costs and why it is acceptable for a demo: one writer, one
// browser, last-write-wins over the WHOLE document, no roaming, no merge, no
// history. What will MOVE when glial lands is the document SHAPE, not this
// plumbing — see ./layoutDocument.
//
// Absence, quota and private mode all mean "no persistence" and never a broken
// desk: every read and write is inside a try/catch and a failure leaves the
// desk exactly as the entry's own defaults built it.
// ---------------------------------------------------------------------------

/** The entry name a target that names none is stored under. */
export const DEFAULT_ENTRY = 'desktop';

/** How long a burst of changes settles before it is written. A window drag
 *  publishes once per gesture, but a font-scale button held down publishes per
 *  click, and a locked desk republishes every docked frame at once. */
export const WRITE_DELAY_MS = 300;

/** The stored document's key. The ENTRY is in it, so the Gyld target and the
 *  full desktop keep separate desks in one browser profile. */
export function layoutKey(entry: string): string {
  return `gryth.desk.layout.v1.${entry}`;
}

/** The slice of the Web Storage API this uses, so a test needs no browser. */
export interface LayoutStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The parsed document under `key`, or null when there is nothing usable
 *  there. Absent, unreadable and not-JSON are the same answer. */
export function readStoredLayout(store: LayoutStore, key: string): unknown {
  try {
    const text = store.getItem(key);
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/** Write the document, or give up quietly. A quota error is not an error the
 *  reader can do anything about, and a desk that throws while being used is
 *  worse than a desk that forgets. */
export function writeStoredLayout(store: LayoutStore, key: string, doc: DeskDocument): void {
  try {
    store.setItem(key, JSON.stringify(doc));
  } catch {
    // no persistence this time; the desk is untouched
  }
}

/** Forget the stored desk. What "Reset layout" clears before it reloads. */
export function clearStoredLayout(store: LayoutStore, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // nothing to do: the desk is in memory and the reload still returns it
    // to the entry's defaults for this session
  }
}

// --- the desk's grips, as ports --------------------------------------------

/** An atom tap, structurally — the desktop passes its own, so this module
 *  imports no tap and taps.desktop.ts can import this one. */
export interface DeskAtom<T> {
  get(): T;
  set(value: T): void;
}

export interface DeskAtoms {
  current: DeskAtom<number>;
  windows: DeskAtom<WindowRecord[]>;
  gridMemory: DeskAtom<Record<number, GridStash>>;
  preset: DeskAtom<FoundationDef>;
  sidebarOpen: DeskAtom<boolean>;
  sidebarWidth: DeskAtom<number>;
}

/** The desk as this module needs it: read it whole, seed what a document
 *  carried, and say when anything changed. A test supplies its own. */
export interface DeskPorts {
  read(): DeskState;
  seed(state: Partial<DeskState>): void;
  watch(onChange: () => void): void;
}

interface Slot<T> {
  value(): T;
  seed(value: T): void;
  watch(onChange: () => void): void;
}

/** A grip the DESKTOP produces: seeded through the tap object itself, which is
 *  synchronous — a handle resolved through the graph is not guaranteed to be
 *  there in the same tick the tap was registered in. */
function ownSlot<T>(grok: Grok, grip: Grip<T>, atom: DeskAtom<T>, fallback: T): Slot<T> {
  const drip = grok.mainPresentationContext.getOrCreateConsumer(grip);
  drip.subscribe(() => {});
  return {
    value: () => atom.get() ?? fallback,
    seed: (value) => atom.set(value),
    watch: (onChange) => { drip.subscribe(() => onChange()); },
  };
}

/** A grip a PLUGIN produces (the appearance five belong to
 *  @grythjs/plugin-settings): read through the value grip, written through the
 *  handle grip. The handle may not have arrived yet, so a seed that finds none
 *  waits for one — once. Without the plugin there is no handle at all and the
 *  seed is simply dropped, which is the same degradation the shell already has
 *  for those grips. */
function pluginSlot<T>(
  grok: Grok,
  grip: Grip<T>,
  handleGrip: Grip<AtomTapHandle<T>>,
  fallback: T,
): Slot<T> {
  const values = grok.mainPresentationContext.getOrCreateConsumer(grip);
  const handles = grok.mainPresentationContext.getOrCreateConsumer(handleGrip);
  values.subscribe(() => {});
  handles.subscribe(() => {});
  return {
    value: () => values.get() ?? fallback,
    seed(value: T) {
      const handle = handles.get();
      if (handle !== undefined) {
        handle.set(value);
        return;
      }
      let seeded = false;
      handles.subscribe((late) => {
        if (!seeded && late !== undefined) {
          seeded = true;
          late.set(value);
        }
      });
    },
    watch: (onChange) => { values.subscribe(() => onChange()); },
  };
}

export function deskPorts(grok: Grok, atoms: DeskAtoms): DeskPorts {
  const current = ownSlot(grok, DESKTOP_CURRENT, atoms.current, 1);
  const windows = ownSlot(grok, DESKTOP_WINDOWS, atoms.windows, []);
  const gridMemory = ownSlot(grok, DESKTOP_GRID_MEMORY, atoms.gridMemory, {});
  const preset = ownSlot(grok, DESKTOP_FOUNDATION_PRESET, atoms.preset, HUB);
  const sidebarOpen = ownSlot(grok, SIDEBAR_OPEN, atoms.sidebarOpen, true);
  const sidebarWidth = ownSlot(grok, SIDEBAR_WIDTH, atoms.sidebarWidth, 200);
  const theme = pluginSlot<ThemeId>(grok, DESKTOP_THEME, DESKTOP_THEME_TAP, 'light');
  const wallpaper = pluginSlot(grok, DESKTOP_WALLPAPER, DESKTOP_WALLPAPER_TAP, '');
  const wallpaperThemed = pluginSlot(
    grok, DESKTOP_WALLPAPER_THEMED, DESKTOP_WALLPAPER_THEMED_TAP, true,
  );
  const zoom = pluginSlot(grok, DESKTOP_ZOOM, DESKTOP_ZOOM_TAP, 1);
  const fontScale = pluginSlot(grok, DESKTOP_FONT_SCALE, DESKTOP_FONT_SCALE_TAP, 10);
  const all = [
    current, windows, gridMemory, preset, sidebarOpen, sidebarWidth,
    theme, wallpaper, wallpaperThemed, zoom, fontScale,
  ];
  return {
    read: () => ({
      current: current.value(),
      windows: windows.value(),
      gridMemory: gridMemory.value(),
      preset: preset.value(),
      sidebarOpen: sidebarOpen.value(),
      sidebarWidth: sidebarWidth.value(),
      theme: theme.value(),
      wallpaper: wallpaper.value(),
      wallpaperThemed: wallpaperThemed.value(),
      zoom: zoom.value(),
      fontScale: fontScale.value(),
    }),
    seed(state) {
      if (state.current !== undefined) { current.seed(state.current); }
      if (state.windows !== undefined) { windows.seed(state.windows); }
      if (state.gridMemory !== undefined) { gridMemory.seed(state.gridMemory); }
      if (state.preset !== undefined) { preset.seed(state.preset); }
      if (state.sidebarOpen !== undefined) { sidebarOpen.seed(state.sidebarOpen); }
      if (state.sidebarWidth !== undefined) { sidebarWidth.seed(state.sidebarWidth); }
      if (state.theme !== undefined) { theme.seed(state.theme); }
      if (state.wallpaper !== undefined) { wallpaper.seed(state.wallpaper); }
      if (state.wallpaperThemed !== undefined) { wallpaperThemed.seed(state.wallpaperThemed); }
      if (state.zoom !== undefined) { zoom.seed(state.zoom); }
      if (state.fontScale !== undefined) { fontScale.seed(state.fontScale); }
    },
    watch(onChange) {
      for (const one of all) {
        one.watch(onChange);
      }
    },
  };
}

// --- the session -----------------------------------------------------------

/** Run `fn` after `ms`, and return the cancel. Injected by tests so a debounce
 *  is asserted without waiting for one. */
export type Schedule = (fn: () => void, ms: number) => () => void;

export interface LayoutPersistenceOptions {
  /** The target's name, in the storage key (default `desktop`). */
  entry?: string;
  /** Where the document lives. Omitted: `localStorage` when there is one, and
   *  no persistence at all when there is not. Pass `null` to switch it off. */
  store?: LayoutStore | null;
  schedule?: Schedule;
  delayMs?: number;
  /** What "Reset layout" does after it clears the document. */
  reload?: () => void;
}

export interface LayoutPersistence {
  /** Whether a stored document seeded the desk. When it did, the entry's own
   *  `locked`/`tools` defaults must NOT be applied over it. */
  restored: boolean;
  /** Forget the stored desk and come back on the entry's defaults. */
  reset(): void;
}

const NO_PERSISTENCE: LayoutPersistence = { restored: false, reset: () => {} };

function timeoutSchedule(fn: () => void, ms: number): () => void {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}

function browserStore(): LayoutStore | null {
  try {
    // a browser with site data blocked THROWS on the property access itself,
    // not on the first use of it
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function browserReload(): void {
  try {
    globalThis.location?.reload();
  } catch {
    // nothing to reload (a test, an embedding): the document is cleared and
    // the next real load comes back on the defaults
  }
}

/**
 * Seed the desk from the stored document, then keep writing it back.
 *
 * The seed is SYNCHRONOUS and happens before the caller applies the entry's
 * own desk setup, so a restored desk is not overwritten by the tools that
 * entry opens with. `restored` says which of the two the reader is looking at.
 */
export function startLayoutPersistence(
  ports: DeskPorts,
  options: LayoutPersistenceOptions = {},
): LayoutPersistence {
  const store = options.store === undefined ? browserStore() : options.store;
  if (store === null) {
    return NO_PERSISTENCE;
  }
  const entry = options.entry ?? DEFAULT_ENTRY;
  const key = layoutKey(entry);
  const schedule = options.schedule ?? timeoutSchedule;
  const delay = options.delayMs ?? WRITE_DELAY_MS;
  const seed = seedFrom(readStoredLayout(store, key), entry);
  if (seed !== null) {
    ports.seed(seed);
  }
  let cancel: (() => void) | null = null;
  let stopped = false;
  ports.watch(() => {
    if (stopped) {
      return;
    }
    cancel?.();
    cancel = schedule(() => {
      cancel = null;
      writeStoredLayout(store, key, foldDocument(entry, ports.read()));
    }, delay);
  });
  return {
    restored: seed !== null,
    reset() {
      // stop first: the desk this page still holds must not be written back
      // between the clear and the reload
      stopped = true;
      cancel?.();
      cancel = null;
      clearStoredLayout(store, key);
      (options.reload ?? browserReload)();
    },
  };
}
