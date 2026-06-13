import { BaseTap, createAtomValueTap, type Grip, type GripContext, type Grok } from '@owebeeone/grip-react';
import {
  addEntry, allTools, PluginRegistryTap,
  DESKTOP_OPEN_TOOL, DESKTOP_RETARGET_TAB, DESKTOP_TAB_LINKS,
  type TabLinkInfo, type ToolLink,
} from '@grythjs/plugin-api';
import { DESKTOP_BUILTINS, resolveTool } from './facets';
import { DESKTOP_BUILTINS_PLUGIN } from './grips.desktop';
import {
  DESKTOP_WINDOWS, DESKTOP_WINDOWS_TAP,
  DESKTOP_FOCUSED, DESKTOP_FOCUSED_TAP,
  DESKTOP_CURRENT, DESKTOP_CURRENT_TAP,
  SIDEBAR_OPEN, SIDEBAR_OPEN_TAP,
  SIDEBAR_WIDTH, SIDEBAR_WIDTH_TAP,
  WINDOW_DRAG, WINDOW_DRAG_TAP,
  WINDOW_MENU, WINDOW_MENU_TAP,
  DESKTOP_OVERVIEW, DESKTOP_OVERVIEW_TAP,
  DESK_SLIDE, DESK_SLIDE_TAP,
  AREA_MENU, AREA_MENU_TAP,
  CANVAS_SIZE, CANVAS_SIZE_TAP,
  DESKTOP_GRID_MEMORY, DESKTOP_GRID_MEMORY_TAP,
  TICKER_HOVER, TICKER_HOVER_TAP,
  TICKER_BLEED, TICKER_BLEED_TAP,
} from './grips.desktop';
import { openToolWindow, openWindow, setTabParams } from './ops';

// Shell chrome taps — the desktop document (environ scope) plus the
// instance-scope gesture state. These are the desktop itself, NOT plugins
// (see dev-docs/PluginMigration.md). The appearance grips (theme, wallpaper,
// zoom, font scale) still live here and the chrome consumes them, but their
// PRODUCERS moved to @grythjs/plugin-settings; absent that plugin they fall
// back to each grip's default.

// First-run desktop: one welcome window. (Size literal duplicates the facet
// registry default to keep this module free of React imports.)
const FIRST_RUN = openWindow([], 'welcome', { w: 520, h: 280 });

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
export const SidebarWidthTap = createAtomValueTap(SIDEBAR_WIDTH, {
  initial: 200,
  handleGrip: SIDEBAR_WIDTH_TAP,
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
export const AreaMenuTap = createAtomValueTap(AREA_MENU, {
  initial: null,
  handleGrip: AREA_MENU_TAP,
});
export const CanvasSizeTap = createAtomValueTap(CANVAS_SIZE, {
  initial: { w: 0, h: 0 },
  handleGrip: CANVAS_SIZE_TAP,
});
export const DesktopGridMemoryTap = createAtomValueTap(DESKTOP_GRID_MEMORY, {
  initial: {},
  handleGrip: DESKTOP_GRID_MEMORY_TAP,
});
export const TickerHoverTap = createAtomValueTap(TICKER_HOVER, {
  initial: null,
  handleGrip: TICKER_HOVER_TAP,
});
export const TickerBleedTap = createAtomValueTap(TICKER_BLEED, {
  initial: null,
  handleGrip: TICKER_BLEED_TAP,
});

// The Desktop.OpenTool intent: invoking a LINK opens a new window at the
// tool's default size (v1 policy — always a new window), docking home on a
// gridded desktop. Published as a grip value, so the launcher, plugins,
// and agents all open views through this one surface.
const openToolIntent = (link: ToolLink) => {
  const def = resolveTool(allTools(PluginRegistryTap.get()), link.toolId);
  const out = openToolWindow(
    DesktopWindowsTap.get(),
    link.toolId,
    def.defaultSize,
    DesktopCurrentTap.get(),
    link.params,
  );
  DesktopWindowsTap.set(out.list);
  DesktopFocusedTap.set(out.focusId);
};
export const OpenToolTap = createAtomValueTap(DESKTOP_OPEN_TOOL, {
  initial: openToolIntent,
});

// Desktop.RetargetTab intent: replace an existing tab's link params — the
// "send to an EXISTING window" half of link invocation.
export const RetargetTabTap = createAtomValueTap(DESKTOP_RETARGET_TAB, {
  initial: (tabId: string, params: Record<string, unknown>) => {
    DesktopWindowsTap.update((list) => setTabParams(list, tabId, params));
  },
});

// Desktop.TabLinks: every tab's link (toolId + params) as serializable
// data, derived from the desktop document — how plugins learn which views
// are open (e.g. the session browser's attached/orphaned derivation)
// without touching the window manager.
class TabLinksTap extends BaseTap {
  constructor() {
    super({ provides: [DESKTOP_TAB_LINKS], homeParamGrips: [DESKTOP_WINDOWS] });
  }

  produce(opts?: { destContext?: GripContext }): void {
    const windows = this.paramDrips.get(DESKTOP_WINDOWS as Grip<unknown>)?.get() as
      | typeof DESKTOP_WINDOWS.defaultValue
      | undefined;
    const links: TabLinkInfo[] = [];
    for (const w of windows ?? []) {
      if (w.foundation) continue;
      for (const t of w.tabs) links.push({ tabId: t.id, toolId: t.facet, params: t.params });
    }
    this.publish(new Map([[DESKTOP_TAB_LINKS as Grip<unknown>, links as unknown]]), opts?.destContext);
  }

  produceOnParams(): void { this.produce(); }
  produceOnDestParams(): void {}
}
export const DesktopTabLinksTap = new TabLinksTap();

export function registerDesktopTaps(grok: Grok) {
  // publish the not-yet-converted builtin tools at the desktop's own
  // plugin grip — the chrome consumes that grip like any plugin consumer
  addEntry(DESKTOP_BUILTINS_PLUGIN, DESKTOP_BUILTINS);
  grok.registerTap(DesktopWindowsTap);
  grok.registerTap(DesktopFocusedTap);
  grok.registerTap(WindowDragTap);
  grok.registerTap(DesktopCurrentTap);
  grok.registerTap(SidebarOpenTap);
  grok.registerTap(SidebarWidthTap);
  grok.registerTap(WindowMenuTap);
  grok.registerTap(DesktopOverviewTap);
  grok.registerTap(DeskSlideTap);
  grok.registerTap(AreaMenuTap);
  grok.registerTap(CanvasSizeTap);
  grok.registerTap(DesktopGridMemoryTap);
  grok.registerTap(TickerHoverTap);
  grok.registerTap(TickerBleedTap);
  grok.registerTap(OpenToolTap);
  grok.registerTap(RetargetTabTap);
  grok.registerTap(DesktopTabLinksTap);
}
