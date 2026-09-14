import type { FoundationDef, LayoutNode, TabRecord, WindowRecord } from './grips.desktop';
import type { GridStash } from './ops';
import { THEME_IDS, type ThemeId } from './themes';

// ---------------------------------------------------------------------------
// INTERIM demo persistence — the desk document, as pure data.
//
// This module (with ./layoutStorageTap) is the smallest thing that makes a
// demo desk survive a reload. It is NOT the definitive answer and must not be
// treated as one: environ state belongs in a GLIAL value instance, whose
// persistence gap is the recorded one in
// /Users/owebeeone/limbo/glade-wz/dev-docs/glial/GlialFitAssessment-2026-09-15.md
// ("the two things that would actually bite the next step — persistence and
// the offline outbox — are glial's own recorded gaps").
//
// WHAT WILL MOVE is the document SHAPE below. When glial holds this state each
// grip becomes an instance value with its own share and its own conflict rule,
// so `DeskDocument` — one blob, one version number, one all-or-nothing write —
// disappears rather than being ported. Nothing outside these two files knows
// this shape; keep it that way.
// ---------------------------------------------------------------------------

/** Bumped when the shape below changes. A document of any other version is
 *  ignored outright: there is no migration for demo state. */
export const LAYOUT_DOCUMENT_VERSION = 1;

/** The grip VALUES this document is folded from and seeded back into — the
 *  environ-scope subset of the desktop document plus the appearance grips the
 *  settings plugin produces. Instance-scope state (drag, hover, menus, canvas
 *  size, overview) is never persisted, and neither is anything a Gyld window
 *  holds in its own tab context except what its tab record already carries. */
export interface DeskState {
  current: number;
  windows: WindowRecord[];
  gridMemory: Record<number, GridStash>;
  preset: FoundationDef;
  sidebarOpen: boolean;
  sidebarWidth: number;
  theme: ThemeId;
  wallpaper: string;
  wallpaperThemed: boolean;
  zoom: number;
  fontScale: number;
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
  appearance: {
    theme: ThemeId;
    wallpaper: string;
    wallpaperThemed: boolean;
    zoom: number;
    fontScale: number;
  };
}

export function foldDocument(entry: string, state: DeskState): DeskDocument {
  return {
    version: LAYOUT_DOCUMENT_VERSION,
    entry,
    desks: {
      current: state.current,
      windows: state.windows,
      gridMemory: state.gridMemory,
      preset: state.preset,
    },
    sidebar: { open: state.sidebarOpen, width: state.sidebarWidth },
    appearance: {
      theme: state.theme,
      wallpaper: state.wallpaper,
      wallpaperThemed: state.wallpaperThemed,
      zoom: state.zoom,
      fontScale: state.fontScale,
    },
  };
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

/**
 * The grip values a stored document seeds back, or `null` when there is no
 * usable document at all — not an object, the wrong version, or written by
 * another entry. Fields that did not survive validation are simply absent, and
 * the caller leaves those grips alone.
 */
export function seedFrom(raw: unknown, entry?: string): Partial<DeskState> | null {
  if (!isObject(raw) || raw.version !== LAYOUT_DOCUMENT_VERSION) {
    return null;
  }
  const from = str(raw.entry);
  if (from === undefined || (entry !== undefined && from !== entry)) {
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
  const appearance = isObject(raw.appearance) ? raw.appearance : {};
  const theme = str(appearance.theme);
  if (theme !== undefined && (THEME_IDS as string[]).includes(theme)) {
    state.theme = theme as ThemeId;
  }
  const wallpaper = str(appearance.wallpaper);
  if (wallpaper !== undefined) {
    state.wallpaper = wallpaper;
  }
  const themed = bool(appearance.wallpaperThemed);
  if (themed !== undefined) {
    state.wallpaperThemed = themed;
  }
  const zoom = num(appearance.zoom);
  if (zoom !== undefined) {
    state.zoom = zoom;
  }
  const fontScale = num(appearance.fontScale);
  if (fontScale !== undefined) {
    state.fontScale = fontScale;
  }
  return state;
}
