import type { AtomTapHandle } from '@owebeeone/grip-react';
import { defineGrip } from './runtime';
import type { ThemeId } from './desktop/themes';

// The desktop document — environ scope. This is the serializable class-1
// atom map that persists and roams across the user's instances, and the
// surface a delegated agent writes to drive the UI.
//
// Z-order is array order (last = topmost); raise = move to end. Split to
// per-window atoms when replication needs per-window LWW — not before.

export type FacetKind = 'welcome' | 'chat' | 'terminal' | 'diff' | 'settings';

// A tab is a facet instance; a window record is a FRAME (geometry + tab set).
// Dropping one frame's header on another's merges their tab lists.
export interface TabRecord {
  id: string;
  facet: FacetKind;
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
  // Geometry remembered when the frame was edge-snapped; restored when the
  // frame is dragged away, forgotten on manual resize.
  presnap?: { x: number; y: number; w: number; h: number };
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
  dropTarget: string | null;
  dropDesktop: number | null;
}
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
}
export type WindowDrag = FrameDrag | TabDrag;
export const WINDOW_DRAG = defineGrip<WindowDrag | null>('Desktop.WindowDrag', null);
export const WINDOW_DRAG_TAP = defineGrip<AtomTapHandle<WindowDrag | null>>('Desktop.WindowDrag.Tap');

// Instance scope: titlebar context menu (canvas coords), null when closed.
export interface WindowMenu {
  frameId: string;
  x: number;
  y: number;
}
export const WINDOW_MENU = defineGrip<WindowMenu | null>('Desktop.WindowMenu', null);
export const WINDOW_MENU_TAP = defineGrip<AtomTapHandle<WindowMenu | null>>('Desktop.WindowMenu.Tap');

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
