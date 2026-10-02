import type { FoundationDef, LayoutNode, TabRecord, WindowRecord } from './grips.desktop';
import type { GridStash } from './ops';
import { THEME_IDS, type ThemeId } from './themes';

// ---------------------------------------------------------------------------
// Versioned desk data. The browser-local path and the session adapter share
// this codec. Named Gyld sessions mount one whole-document LWW Glial value;
// per-window merge rules remain deferred until measured lost moves justify them.
// Appearance is omitted when its environ surface persists separately.
// ---------------------------------------------------------------------------

/** Bumped when the shape below changes. A document of any other version is
 *  ignored outright: there is no migration for demo state. */
export const LAYOUT_DOCUMENT_VERSION = 1;

/** The appearance grips the settings plugin produces, as this document keeps
 *  them. */
export interface DeskAppearance {
  theme: ThemeId;
  wallpaper: string;
  wallpaperThemed: boolean;
  zoom: number;
  fontScale: number;
}

/** The grip VALUES this document is folded from and seeded back into — the
 *  session-scope subset of the desktop document plus, unless the target keeps
 *  them elsewhere (`DesktopSetup.persistAppearance`), the appearance grips.
 *  The fold carries the whole appearance or none of it. Instance-scope state
 *  (drag, hover, menus, canvas size, overview) is never persisted, and neither
 *  is anything a Gyld window holds in its own tab context except what its tab
 *  record already carries. */
export interface DeskState extends Partial<DeskAppearance> {
  current: number;
  windows: WindowRecord[];
  gridMemory: Record<number, GridStash>;
  preset: FoundationDef;
  sidebarOpen: boolean;
  sidebarWidth: number;
}

/** One entry's stored desk. `entry` names the TARGET it was written by, so the
 *  Gyld desk and the full desktop never restore each other's windows. */
export interface DeskDocument {
  version: number;
  entry: string;
  desks: {
    current: number;
    windows: WindowRecord[];
    gridMemory: Record<number, GridStash>;
    /** The preset itself, not an id: presets are exported objects with no
     *  registry to name them by, and a def restores without one. */
    preset: FoundationDef;
  };
  sidebar: { open: boolean; width: number };
  /** Absent from the document of a desk that keeps its appearance elsewhere.
   *  The version stays 1 either way: a reader already reads a version-1
   *  document with no appearance, and one of another version is ignored whole,
   *  which would lose every stored layout. */
  appearance?: DeskAppearance;
}

export function foldDocument(entry: string, state: DeskState): DeskDocument {
  const doc: DeskDocument = {
    version: LAYOUT_DOCUMENT_VERSION,
    entry,
    desks: {
      current: state.current,
      windows: state.windows,
      gridMemory: state.gridMemory,
      preset: state.preset,
    },
    sidebar: { open: state.sidebarOpen, width: state.sidebarWidth },
  };
  const { theme, wallpaper, wallpaperThemed, zoom, fontScale } = state;
  if (
    theme !== undefined && wallpaper !== undefined && wallpaperThemed !== undefined
    && zoom !== undefined && fontScale !== undefined
  ) {
    doc.appearance = { theme, wallpaper, wallpaperThemed, zoom, fontScale };
  }
  return doc;
}

// --- readers ---------------------------------------------------------------
//
// Everything below reads UNTRUSTED JSON: a document written by an older build,
// hand-edited, or truncated by a full disk. A malformed FIELD is dropped (the
// grip keeps whatever it has); a malformed DOCUMENT is ignored whole. Tool ids
// are NOT checked against the registry — an unknown one is kept, because the
// desktop already renders a MissingTool placeholder for it and dropping the
// window would lose a reader's layout over a plugin that is merely absent.

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readLayout(raw: unknown): LayoutNode | undefined {
  if (!isObject(raw)) {
    return undefined;
  }
  const id = str(raw.id);
  const size = num(raw.size);
  if (id === undefined || size === undefined) {
    return undefined;
  }
  const node: LayoutNode = { id, size };
  const direction = str(raw.direction);
  if (direction === 'row' || direction === 'column') {
    node.direction = direction;
  }
  if (raw.children !== undefined) {
    if (!Array.isArray(raw.children)) {
      return undefined;
    }
    const children: LayoutNode[] = [];
    for (const child of raw.children) {
      const one = readLayout(child);
      // a broken branch breaks the TREE: placement walks the whole thing, and
      // half a layout would put windows in areas that do not exist
      if (one === undefined) {
        return undefined;
      }
      children.push(one);
    }
    node.children = children;
  }
  if (bool(raw.ephemeral) === true) {
    node.ephemeral = true;
  }
  return node;
}

function readNames(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObject(raw)) {
    return out;
  }
  for (const [key, value] of Object.entries(raw)) {
    const name = str(value);
    if (name !== undefined) {
      out[key] = name;
    }
  }
  return out;
}

function readFoundation(raw: unknown): FoundationDef | undefined {
  if (!isObject(raw)) {
    return undefined;
  }
  const layout = readLayout(raw.layout);
  const fallback = str(raw.fallback);
  if (layout === undefined || fallback === undefined) {
    return undefined;
  }
  return { layout, designate: readNames(raw.designate), fallback };
}

function readTab(raw: unknown): TabRecord | undefined {
  if (!isObject(raw)) {
    return undefined;
  }
  const id = str(raw.id);
  const facet = str(raw.facet);
  if (id === undefined || facet === undefined) {
    return undefined;
  }
  const tab: TabRecord = { id, facet };
  if (isObject(raw.params)) {
    tab.params = { ...raw.params };
  }
  const source = str(raw.source);
  if (source !== undefined) {
    tab.source = source;
  }
  return tab;
}

function readWindow(raw: unknown): WindowRecord | undefined {
  if (!isObject(raw) || !Array.isArray(raw.tabs)) {
    return undefined;
  }
  const id = str(raw.id);
  const activeTab = str(raw.activeTab);
  const x = num(raw.x);
  const y = num(raw.y);
  const w = num(raw.w);
  const h = num(raw.h);
  const desktop = num(raw.desktop);
  if (id === undefined || activeTab === undefined || desktop === undefined) {
    return undefined;
  }
  if (x === undefined || y === undefined || w === undefined || h === undefined) {
    return undefined;
  }
  const tabs: TabRecord[] = [];
  for (const one of raw.tabs) {
    const tab = readTab(one);
    if (tab === undefined) {
      return undefined;
    }
    tabs.push(tab);
  }
  const record: WindowRecord = {
    id,
    tabs,
    activeTab,
    x,
    y,
    w,
    h,
    minimized: bool(raw.minimized) ?? false,
    desktop,
    sticky: bool(raw.sticky) ?? false,
  };
  const snap = str(raw.snap);
  if (snap === 'left' || snap === 'right' || snap === 'full') {
    record.snap = snap;
  }
  if (raw.foundation !== undefined) {
    const foundation = readFoundation(raw.foundation);
    // a FOUNDATION window with an unreadable tree docks nothing: drop the
    // window rather than restore a desk whose areas are gone
    if (foundation === undefined) {
      return undefined;
    }
    record.foundation = foundation;
  }
  if (isObject(raw.dock)) {
    const foundation = str(raw.dock.foundation);
    const area = str(raw.dock.area);
    if (foundation !== undefined && area !== undefined) {
      record.dock = { foundation, area };
    }
  }
  return record;
}

function readGridMemory(raw: unknown): Record<number, GridStash> {
  const out: Record<number, GridStash> = {};
  if (!isObject(raw)) {
    return out;
  }
  for (const [key, value] of Object.entries(raw)) {
    const desk = Number(key);
    if (!Number.isInteger(desk) || !isObject(value)) {
      continue;
    }
    const def = readFoundation(value.def);
    if (def === undefined) {
      continue;
    }
    out[desk] = { def, assignments: readNames(value.assignments) };
  }
  return out;
}

/** Whether `raw` is a document at all: an object of this version, written by
 *  `entry` when one is named. */
function usable(raw: unknown, entry?: string): raw is Record<string, unknown> {
  if (!isObject(raw) || raw.version !== LAYOUT_DOCUMENT_VERSION) {
    return false;
  }
  const from = str(raw.entry);
  return from !== undefined && (entry === undefined || from === entry);
}

/** The fields of an `appearance` block that survive validation. */
function readAppearance(raw: unknown): Partial<DeskAppearance> {
  const appearance: Partial<DeskAppearance> = {};
  if (!isObject(raw)) {
    return appearance;
  }
  const theme = str(raw.theme);
  if (theme !== undefined && (THEME_IDS as string[]).includes(theme)) {
    appearance.theme = theme as ThemeId;
  }
  const wallpaper = str(raw.wallpaper);
  if (wallpaper !== undefined) {
    appearance.wallpaper = wallpaper;
  }
  const themed = bool(raw.wallpaperThemed);
  if (themed !== undefined) {
    appearance.wallpaperThemed = themed;
  }
  const zoom = num(raw.zoom);
  if (zoom !== undefined) {
    appearance.zoom = zoom;
  }
  const fontScale = num(raw.fontScale);
  if (fontScale !== undefined) {
    appearance.fontScale = fontScale;
  }
  return appearance;
}

/**
 * The appearance a stored document carries, read as `seedFrom` reads it, or
 * nothing when there is no usable document or no field of its appearance
 * reads. A desk that keeps its appearance elsewhere seeds none from this
 * document, so this is what carries the value a browser held across, once
 * (Glial appearance plan, Step 2.4).
 */
export function readLegacyAppearance(
  raw: unknown,
  entry?: string,
): Partial<DeskAppearance> | undefined {
  if (!usable(raw, entry)) {
    return undefined;
  }
  const appearance = readAppearance(raw.appearance);
  return Object.keys(appearance).length > 0 ? appearance : undefined;
}

/**
 * The grip values a stored document seeds back, or `null` when there is no
 * usable document at all — not an object, the wrong version, or written by
 * another entry. Fields that did not survive validation are simply absent, and
 * the caller leaves those grips alone.
 */
export function seedFrom(raw: unknown, entry?: string): Partial<DeskState> | null {
  if (!usable(raw, entry)) {
    return null;
  }
  const state: Partial<DeskState> = {};
  const desks = isObject(raw.desks) ? raw.desks : {};
  const current = num(desks.current);
  if (current !== undefined) {
    state.current = current;
  }
  if (Array.isArray(desks.windows)) {
    const windows: WindowRecord[] = [];
    for (const one of desks.windows) {
      const record = readWindow(one);
      // one unreadable record loses one window, not the desk
      if (record !== undefined) {
        windows.push(record);
      }
    }
    state.windows = windows;
  }
  if (desks.gridMemory !== undefined) {
    state.gridMemory = readGridMemory(desks.gridMemory);
  }
  const preset = readFoundation(desks.preset);
  if (preset !== undefined) {
    state.preset = preset;
  }
  const sidebar = isObject(raw.sidebar) ? raw.sidebar : {};
  const open = bool(sidebar.open);
  if (open !== undefined) {
    state.sidebarOpen = open;
  }
  const width = num(sidebar.width);
  if (width !== undefined) {
    state.sidebarWidth = width;
  }
  return { ...state, ...readAppearance(raw.appearance) };
}
