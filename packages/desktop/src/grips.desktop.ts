import type { AtomTapHandle } from '@owebeeone/grip-react';
import { defineGrip, type GrythPlugin, type ToolId } from '@grythjs/plugin-api';
import type { ThemeId } from './themes';
import type { GridStash, Rect } from './ops';

// The desktop's own plugin: the not-yet-converted builtin tools, published
// at this grip like any other plugin (the chrome hard-codes ITS grip — the
// desktop holds no plugin directory).
export const DESKTOP_BUILTINS_PLUGIN = defineGrip<GrythPlugin>('Desktop.BuiltinTools.Plugin');

// The desktop document — environ scope. This is the serializable class-1
// atom map that persists and roams across the user's instances, and the
// surface a delegated agent writes to drive the UI.
//
// Z-order is array order (last = topmost); raise = move to end. Split to
// per-window atoms when replication needs per-window LWW — not before.

// Tool ids are open strings (any registered plugin can add tools); the
// name FacetKind survives as the desktop document's vocabulary for "what a
// tab shows". Unknown ids render the MissingTool placeholder.
export type FacetKind = ToolId;

// Foundation windows: a window whose job is to provide docking areas.
// The layout tree's LEAVES are areas (untyped homes); interior nodes split
// space by `direction` with `size` weights.
export interface LayoutNode {
  id: string;
  size: number;
  direction?: 'row' | 'column';
  children?: LayoutNode[];
  // Areas created by edge-drop splits are ephemeral: they merge back into
  // their sibling when the last docked reference leaves. Preset and
  // menu-created areas are deliberate furniture and persist as holes.
  ephemeral?: boolean;
}

export interface FoundationDef {
  layout: LayoutNode;
  // adoption-time placement hints only — areas stay untyped
  designate: Partial<Record<FacetKind, string>>;
  fallback: string;
}

// A tab is a facet instance; a window record is a FRAME (geometry + tab set).
// Dropping one frame's header on another's merges their tab lists.
export interface TabRecord {
  id: string;
  facet: FacetKind;
  // The LINK snapshot that opened this tab (serializable grip values —
  // repo, path, ref, …). Seeded into the tool's per-tab context; rides
  // along through merge/detach; rehydrates the view after reload.
  params?: Record<string, unknown>;
}

export interface WindowRecord {
  id: string;
  tabs: TabRecord[];
  activeTab: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
  desktop: number;     // which virtual desktop the frame lives on
  sticky: boolean;     // visible on all desktops
  // Edge-snapped (Aero) frame: a symbolic dock onto the implicit 2×1/1×1
  // grid. Effective geometry comes from the LIVE canvas in placeWindows —
  // the frame stays glued to its half through canvas resizes (the
  // grid-connect story); x/y/w/h above remain the FLOAT memory.
  snap?: SnapTarget;
  // Foundation variant: this window provides docking areas (maximized).
  foundation?: FoundationDef;
  // Docked frame: rendered geometry is computed from the foundation's area;
  // x/y/w/h above remain the FLOAT memory and are never overwritten.
  dock?: { foundation: string; area: string };
}

export const DESKTOP_WINDOWS = defineGrip<WindowRecord[]>('Desktop.Windows', []);
export const DESKTOP_WINDOWS_TAP = defineGrip<AtomTapHandle<WindowRecord[]>>('Desktop.Windows.Tap');

// Focused window id, null when none. May become per-instance state when two
// live instances of one environ exist (see GrythVision open questions).
export const DESKTOP_FOCUSED = defineGrip<string | null>('Desktop.FocusedWindow', null);
export const DESKTOP_FOCUSED_TAP = defineGrip<AtomTapHandle<string | null>>('Desktop.FocusedWindow.Tap');

// Current virtual desktop (environ for now; the vision flags this as a
// candidate for per-instance state — two instances may view different
// desktops of one environ).
export const DESKTOP_CURRENT = defineGrip<number>('Desktop.Current', 1);
export const DESKTOP_CURRENT_TAP = defineGrip<AtomTapHandle<number>>('Desktop.Current.Tap');

// Sidebar collapsed/expanded (environ — desktop-geometry preference).
export const SIDEBAR_OPEN = defineGrip<boolean>('Desktop.SidebarOpen', true);
export const SIDEBAR_OPEN_TAP = defineGrip<AtomTapHandle<boolean>>('Desktop.SidebarOpen.Tap');

// Sidebar width in layout px (environ): its boundary drags like any other.
export const SIDEBAR_WIDTH = defineGrip<number>('Desktop.SidebarWidth', 200);
export const SIDEBAR_WIDTH_TAP = defineGrip<AtomTapHandle<number>>('Desktop.SidebarWidth.Tap');

// Display (environ): whole-UI zoom (true scaling) and a unitless FONT scale
// 5–15 (10 = 100%) that scales text only — chrome font sizes are em-based
// so they all follow.
export const DESKTOP_ZOOM = defineGrip<number>('Desktop.UiZoom', 1);
export const DESKTOP_ZOOM_TAP = defineGrip<AtomTapHandle<number>>('Desktop.UiZoom.Tap');
export const DESKTOP_FONT_SCALE = defineGrip<number>('Desktop.FontScale', 10);
export const DESKTOP_FONT_SCALE_TAP = defineGrip<AtomTapHandle<number>>('Desktop.FontScale.Tap');

// Per-desktop grid memory (environ): unlocking stashes the foundation's
// layout + window assignments; the lock toggle restores them.
export const DESKTOP_GRID_MEMORY = defineGrip<Record<number, GridStash>>('Desktop.GridMemory', {});
export const DESKTOP_GRID_MEMORY_TAP = defineGrip<AtomTapHandle<Record<number, GridStash>>>('Desktop.GridMemory.Tap');

// Appearance (environ): preset theme + wallpaper. The wallpaper is ONE wide
// image panned across the virtual desktops (continuous world feel).
export const DESKTOP_THEME = defineGrip<ThemeId>('Desktop.Theme', 'light');
export const DESKTOP_THEME_TAP = defineGrip<AtomTapHandle<ThemeId>>('Desktop.Theme.Tap');
export const DESKTOP_WALLPAPER = defineGrip<string>('Desktop.Wallpaper', '');
export const DESKTOP_WALLPAPER_TAP = defineGrip<AtomTapHandle<string>>('Desktop.Wallpaper.Tap');
// Use the theme's default wallpaper when no custom URL is set.
export const DESKTOP_WALLPAPER_THEMED = defineGrip<boolean>('Desktop.WallpaperThemed', true);
export const DESKTOP_WALLPAPER_THEMED_TAP = defineGrip<AtomTapHandle<boolean>>('Desktop.WallpaperThemed.Tap');

// Instance scope: drag-in-progress. Never replicated, never persisted.
// dropTarget: frame whose titlebar the pointer is over (snap-to-tab).
// dropDesktop: sidebar desktop icon the pointer is over (send-to-desktop).
interface DragBase {
  id: string;          // frame id
  pointerX: number;    // pointer at drag start (client coords)
  pointerY: number;
  canvasLeft: number;  // canvas origin at drag start (client coords)
  canvasTop: number;
  zoom: number;        // UI zoom at drag start: visual px = zoom × layout px
  dropTarget: string | null;
  dropDesktop: number | null;
  // empty foundation area (dockable hole) under the pointer
  dropArea: { foundation: string; area: string } | null;
  // edge band of a foundation area: drop splits that side; rect is the
  // half-area preview (canvas coords)
  dropSplit: {
    foundation: string;
    area: string;
    edge: AreaEdge;
    rect: { x: number; y: number; w: number; h: number };
  } | null;
}

export type AreaEdge = 'left' | 'right' | 'top' | 'bottom';
// Edge snap (Aero-style): dock zones offered while a moving frame nears the
// top of the canvas.
export type SnapTarget = 'left' | 'full' | 'right';

export interface FrameDrag extends DragBase {
  kind: 'move' | 'resize';
  baseX: number;
  baseY: number;
  baseW: number;
  baseH: number;
  nearTop: boolean;              // pointer near the top edge: show the snap dock
  snapTarget: SnapTarget | null; // hovered dock zone; preview + drop action
}
export interface TabDrag extends DragBase {
  kind: 'tab';
  tabId: string;
  facet: FacetKind;    // for the drag ghost label
  ghostX: number;      // ghost position (canvas coords)
  ghostY: number;
  // a press that never travels >4px is a CLICK (select the tab) — drop
  // intents must not apply to it
  moved: boolean;
}
// Splitter drag on a foundation: adjusts two sibling weights of one
// interior node. Sizes are applied absolutely from the captured base pair
// (no incremental drift).
export interface SplitterDrag extends DragBase {
  kind: 'splitter';
  interiorId: string;
  index: number;       // boundary between children[index] and children[index+1]
  axis: 'row' | 'column';
  baseA: number;
  baseB: number;
  spanPx: number;      // parent span in pixels along the axis
}
// Sidebar boundary drag: adjusts the sidebar width (an environ preference).
export interface SidebarDrag extends DragBase {
  kind: 'sidebar';
  baseW: number; // sidebar width at drag start
}
export type WindowDrag = FrameDrag | TabDrag | SplitterDrag | SidebarDrag;
export const WINDOW_DRAG = defineGrip<WindowDrag | null>('Desktop.WindowDrag', null);
export const WINDOW_DRAG_TAP = defineGrip<AtomTapHandle<WindowDrag | null>>('Desktop.WindowDrag.Tap');

// Instance scope: ticker-strip hover. The hovered segment swells and its
// strip re-solves around it. One pointer, one hover — a single grip serves
// every strip (header and bleed picker alike).
export interface TickerHover {
  frameId: string;
  tabId: string;
}
export const TICKER_HOVER = defineGrip<TickerHover | null>('Desktop.TickerHover', null);
export const TICKER_HOVER_TAP = defineGrip<AtomTapHandle<TickerHover | null>>('Desktop.TickerHover.Tap');

// Instance scope: the bleed picker — a clone of a squeezed header strip that
// inflates in place (after a dwell) so every tab is readable, then shrinks
// back into the header on leave. anchor = the strip's rect in canvas coords;
// 'closing' plays the shrink animation, whose end clears the grip.
export interface TickerBleed {
  frameId: string;
  anchor: Rect;
  phase: 'open' | 'closing';
}
export const TICKER_BLEED = defineGrip<TickerBleed | null>('Desktop.TickerBleed', null);
export const TICKER_BLEED_TAP = defineGrip<AtomTapHandle<TickerBleed | null>>('Desktop.TickerBleed.Tap');

// Instance scope: titlebar context menu (canvas coords), null when closed.
export interface WindowMenu {
  frameId: string;
  x: number;
  y: number;
}
export const WINDOW_MENU = defineGrip<WindowMenu | null>('Desktop.WindowMenu', null);
export const WINDOW_MENU_TAP = defineGrip<AtomTapHandle<WindowMenu | null>>('Desktop.WindowMenu.Tap');

// Instance scope: foundation area context menu (split / close area).
export interface AreaMenu {
  foundationId: string;
  areaId: string;
  hole: boolean;
  x: number;
  y: number;
}
export const AREA_MENU = defineGrip<AreaMenu | null>('Desktop.AreaMenu', null);
export const AREA_MENU_TAP = defineGrip<AtomTapHandle<AreaMenu | null>>('Desktop.AreaMenu.Tap');

// Instance scope: live canvas size, published by canvasGuard's observer.
// Layout math (foundation placement) reads this; {0,0} = not measured yet.
export const CANVAS_SIZE = defineGrip<{ w: number; h: number }>('Desktop.CanvasSize', { w: 0, h: 0 });
export const CANVAS_SIZE_TAP = defineGrip<AtomTapHandle<{ w: number; h: number }>>('Desktop.CanvasSize.Tap');

// Instance scope: desktop-switch slide in progress; windows of `from` exit,
// windows of `to` enter, direction from the desktop numbers. Cleared on
// animationend.
export interface DeskSlide {
  from: number;
  to: number;
}
export const DESK_SLIDE = defineGrip<DeskSlide | null>('Desktop.DeskSlide', null);
export const DESK_SLIDE_TAP = defineGrip<AtomTapHandle<DeskSlide | null>>('Desktop.DeskSlide.Tap');

// Instance scope: overview mode (Mission Control = 'all', App Exposé =
// 'app'), null when inactive. Presentation-only — window geometry in the
// desktop document is untouched. Canvas size is captured at activation;
// 'app' mode pins the facet whose windows are gridded.
export interface OverviewState {
  mode: 'all' | 'app';
  facet: FacetKind | null;
  w: number;
  h: number;
}
export const DESKTOP_OVERVIEW = defineGrip<OverviewState | null>('Desktop.Overview', null);
export const DESKTOP_OVERVIEW_TAP = defineGrip<AtomTapHandle<OverviewState | null>>('Desktop.Overview.Tap');
