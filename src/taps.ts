import { createAtomValueTap } from '@owebeeone/grip-react';
import { grok } from './runtime';
import { CURRENT_PAGE, CURRENT_PAGE_TAP, WORKSPACE_NAME } from './grips';
import {
  DESKTOP_WINDOWS, DESKTOP_WINDOWS_TAP,
  DESKTOP_FOCUSED, DESKTOP_FOCUSED_TAP,
  DESKTOP_CURRENT, DESKTOP_CURRENT_TAP,
  SIDEBAR_OPEN, SIDEBAR_OPEN_TAP,
  WINDOW_DRAG, WINDOW_DRAG_TAP,
  WINDOW_MENU, WINDOW_MENU_TAP,
  DESKTOP_OVERVIEW, DESKTOP_OVERVIEW_TAP,
  DESK_SLIDE, DESK_SLIDE_TAP,
  DESKTOP_THEME, DESKTOP_THEME_TAP,
  DESKTOP_WALLPAPER, DESKTOP_WALLPAPER_TAP,
  DESKTOP_WALLPAPER_THEMED, DESKTOP_WALLPAPER_THEMED_TAP,
} from './grips.desktop';
import { openWindow } from './desktop/ops';

// First-run desktop: one welcome window. (Size literal duplicates the facet
// registry default to keep taps.ts free of React imports.)
const FIRST_RUN = openWindow([], 'welcome', { w: 520, h: 280 });

// Session-scope UI state: atom taps whose handles are themselves grips, so
// any authorized participant (UI, collaborator, agent) can set them.
export const CurrentPageTap = createAtomValueTap(CURRENT_PAGE, {
  initial: 'workspace',
  handleGrip: CURRENT_PAGE_TAP,
});

// Doc-scope mock provider. Stands in for the gryth service; when the real
// provider exists it binds the same grips (see grip-react-demo's
// withOneOf(WEATHER_PROVIDER_NAME, ...) bindings) and consumers don't change.
export const MockWorkspaceTap = createAtomValueTap(WORKSPACE_NAME, {
  initial: 'mock-workspace',
});

// Desktop document (environ scope) + instance-scope drag state.
export const DesktopWindowsTap = createAtomValueTap(DESKTOP_WINDOWS, {
  initial: FIRST_RUN.list,
  handleGrip: DESKTOP_WINDOWS_TAP,
});
export const DesktopFocusedTap = createAtomValueTap(DESKTOP_FOCUSED, {
  initial: FIRST_RUN.id,
  handleGrip: DESKTOP_FOCUSED_TAP,
});
export const WindowDragTap = createAtomValueTap(WINDOW_DRAG, {
  initial: null,
  handleGrip: WINDOW_DRAG_TAP,
});
export const DesktopCurrentTap = createAtomValueTap(DESKTOP_CURRENT, {
  initial: 1,
  handleGrip: DESKTOP_CURRENT_TAP,
});
export const SidebarOpenTap = createAtomValueTap(SIDEBAR_OPEN, {
  initial: true,
  handleGrip: SIDEBAR_OPEN_TAP,
});
export const WindowMenuTap = createAtomValueTap(WINDOW_MENU, {
  initial: null,
  handleGrip: WINDOW_MENU_TAP,
});
export const DesktopOverviewTap = createAtomValueTap(DESKTOP_OVERVIEW, {
  initial: null,
  handleGrip: DESKTOP_OVERVIEW_TAP,
});
export const DeskSlideTap = createAtomValueTap(DESK_SLIDE, {
  initial: null,
  handleGrip: DESK_SLIDE_TAP,
});
export const DesktopThemeTap = createAtomValueTap(DESKTOP_THEME, {
  initial: 'light',
  handleGrip: DESKTOP_THEME_TAP,
});
export const DesktopWallpaperTap = createAtomValueTap(DESKTOP_WALLPAPER, {
  initial: '',
  handleGrip: DESKTOP_WALLPAPER_TAP,
});
export const DesktopWallpaperThemedTap = createAtomValueTap(DESKTOP_WALLPAPER_THEMED, {
  initial: true,
  handleGrip: DESKTOP_WALLPAPER_THEMED_TAP,
});

export function registerAllTaps() {
  grok.registerTap(CurrentPageTap);
  grok.registerTap(MockWorkspaceTap);
  grok.registerTap(DesktopWindowsTap);
  grok.registerTap(DesktopFocusedTap);
  grok.registerTap(WindowDragTap);
  grok.registerTap(DesktopCurrentTap);
  grok.registerTap(SidebarOpenTap);
  grok.registerTap(WindowMenuTap);
  grok.registerTap(DesktopOverviewTap);
  grok.registerTap(DesktopThemeTap);
  grok.registerTap(DesktopWallpaperTap);
  grok.registerTap(DesktopWallpaperThemedTap);
  grok.registerTap(DeskSlideTap);
}
