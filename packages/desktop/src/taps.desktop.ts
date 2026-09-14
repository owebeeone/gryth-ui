import { BaseTap, createAtomValueTap, type Grip, type GripContext, type Grok } from '@owebeeone/grip-react';
import {
  addEntry, allTools, PluginRegistryTap,
  DESKTOP_OPEN_TOOL, DESKTOP_OPEN_WIRED, DESKTOP_OPEN_WIRED_PAIR, DESKTOP_PIN_TAB,
  DESKTOP_RETARGET_TAB, DESKTOP_TAB_LINKS,
  type TabLinkInfo, type ToolId, type ToolLink,
} from '@grythjs/plugin-api';
import { DESKTOP_BUILTINS, resolveTool, toolRoles } from './facets';
import { DESKTOP_BUILTINS_PLUGIN, type FoundationDef } from './grips.desktop';
import { HUB } from './foundations';
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
  DESKTOP_FOUNDATION_PRESET, DESKTOP_FOUNDATION_PRESET_TAP,
  TICKER_HOVER, TICKER_HOVER_TAP,
  TICKER_BLEED, TICKER_BLEED_TAP,
} from './grips.desktop';
import {
  findWiredTab, foundationOn, freezeTab, nextTabId,
  openFoundation, openToolWindow, openWindow, setTabParams,
} from './ops';

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
export const DesktopFoundationPresetTap = createAtomValueTap(DESKTOP_FOUNDATION_PRESET, {
  initial: HUB,
  handleGrip: DESKTOP_FOUNDATION_PRESET_TAP,
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
function openToolAt(link: ToolLink, source?: string): void {
  const defs = allTools(PluginRegistryTap.get());
  const def = resolveTool(defs, link.toolId);
  const out = openToolWindow(
    DesktopWindowsTap.get(),
    link.toolId,
    def.defaultSize,
    DesktopCurrentTap.get(),
    link.params,
    source,
    toolRoles(defs),
  );
  DesktopWindowsTap.set(out.list);
  DesktopFocusedTap.set(out.focusId);
}

const openToolIntent = (link: ToolLink) => {
  openToolAt(link);
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

// Desktop.OpenWired intent: open (or focus) a SINK wired to a source tab.
// First call spawns the sink with source set (the chrome then makes the
// source's context a parent); later calls focus the existing wire — the
// "current editor" reuse. The live grip link carries the data, so a focus
// is all a repeat needs.
const openWiredIntent = (sourceTabId: string, link: ToolLink) => {
  const list = DesktopWindowsTap.get();
  const existing = findWiredTab(list, sourceTabId, link.toolId);
  // already wired and live: the WTA grip updates it in place — do NOT
  // raise/refocus on every click (that was the jarring jump).
  if (existing) return;
  const defs = allTools(PluginRegistryTap.get());
  const def = resolveTool(defs, link.toolId);
  const out = openToolWindow(
    list, link.toolId, def.defaultSize, DesktopCurrentTap.get(), link.params, sourceTabId, toolRoles(defs),
  );
  DesktopWindowsTap.set(out.list);
  DesktopFocusedTap.set(out.focusId);
};
export const OpenWiredTap = createAtomValueTap(DESKTOP_OPEN_WIRED, {
  initial: openWiredIntent,
});

// Desktop.OpenWiredPair intent: open a SOURCE seeded from params plus a SINK
// wired to it. The source's tab id is the next id the list will assign, so
// the sink can name it as its source before either window exists.
const openWiredPairIntent = (sourceToolId: ToolId, sinkToolId: ToolId, params?: Record<string, unknown>) => {
  const defs = allTools(PluginRegistryTap.get());
  const desktop = DesktopCurrentTap.get();
  const list = DesktopWindowsTap.get();
  const srcTabId = nextTabId(list);
  const roles = toolRoles(defs);
  const a = openToolWindow(
    list, sourceToolId, resolveTool(defs, sourceToolId).defaultSize, desktop, params, undefined, roles,
  );
  const b = openToolWindow(
    a.list, sinkToolId, resolveTool(defs, sinkToolId).defaultSize, desktop, params, srcTabId, roles,
  );
  DesktopWindowsTap.set(b.list);
  DesktopFocusedTap.set(b.focusId);
};
export const OpenWiredPairTap = createAtomValueTap(DESKTOP_OPEN_WIRED_PAIR, {
  initial: openWiredPairIntent,
});

// Desktop.PinTab intent: freeze a tab on its current snapshot and cut its
// wire (the chrome drops the context edge next render).
export const PinTabTap = createAtomValueTap(DESKTOP_PIN_TAB, {
  initial: (tabId: string, params: Record<string, unknown>) => {
    DesktopWindowsTap.update((list) => freezeTab(list, tabId, params));
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

// What a TARGET says about its desk, at the one place a target already
// composes the shell. Both are optional and both default to the full
// desktop's behavior: preset HUB, first desk floating.
export interface DesktopSetup {
  /** The pane preset every lock on this composition opens (default HUB). */
  foundation?: FoundationDef;
  /** Open desk 1 LOCKED on that preset, instead of floating windows. */
  locked?: boolean;
  /**
   * The tools desk 1 opens with, in the order they should be opened.
   *
   * A target whose windows ARE its purpose should not ask the reader to open
   * them first. They are opened through the SAME `Desktop.OpenTool` intent the
   * launcher invokes, so a booted window and a launched one are the same
   * window, docked by the same role. Naming any tool also means this desk is
   * not empty, so the shell's first-run Welcome window is not opened.
   */
  tools?: readonly DeskTool[];
}

/**
 * One tool a desk opens with, and — when it is a SINK — the tool it is wired
 * to (`Desktop.OpenWired`'s relation, declared instead of clicked).
 *
 * A desk whose two windows are a selector and the view it drives must open
 * them wired, or the selector opens a second view on every pick because it
 * resolves no source to retarget. Declaring it here is the same wire the
 * chrome makes for a sink opened at runtime: the source's tab id lands on the
 * sink's tab record and `wireTabSource` makes the source's context a parent.
 */
export interface DeskTool extends ToolLink {
  /** The tool this one is opened WIRED to, named EARLIER in the same list. A
   *  tool that is not in the list ahead of this one wires nothing, because the
   *  tab it would name does not exist yet. */
  wiredTo?: ToolId;
}

// Lock desk 1 at composition time. A target whose desk IS its purpose
// should not make the reader find the lock button first. The adoption is
// the ordinary one — same openFoundation, same roles — so a boot-locked
// desk and a hand-locked one are the same desk.
function lockFirstDesk(): void {
  const list = DesktopWindowsTap.get();
  if (foundationOn(list, 1)) {
    return;
  }
  const out = openFoundation(
    list, 1, DesktopFoundationPresetTap.get(), {}, toolRoles(allTools(PluginRegistryTap.get())),
  );
  DesktopWindowsTap.set(out.list);
}

export function registerDesktopTaps(grok: Grok, setup?: DesktopSetup) {
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
  grok.registerTap(DesktopFoundationPresetTap);
  grok.registerTap(TickerHoverTap);
  grok.registerTap(TickerBleedTap);
  grok.registerTap(OpenToolTap);
  grok.registerTap(RetargetTabTap);
  grok.registerTap(OpenWiredTap);
  grok.registerTap(OpenWiredPairTap);
  grok.registerTap(PinTabTap);
  grok.registerTap(DesktopTabLinksTap);
  // the target's desk, after the taps exist: the preset first, so a boot
  // lock opens the preset the target just named
  if (setup?.foundation !== undefined) {
    DesktopFoundationPresetTap.set(setup.foundation);
  }
  const tools = setup?.tools ?? [];
  if (tools.length > 0) {
    // The Welcome window is the shell's answer to a desktop with nothing on
    // it, and a desk that names its own tools is not that. Cleared BEFORE the
    // lock, so the preset is adopted onto the desk those tools land on rather
    // than onto the window they replace.
    DesktopWindowsTap.set([]);
  }
  if (setup?.locked === true) {
    lockFirstDesk();
  }
  // Through the launcher's own open path, so a booted window and a launched
  // one are the same window, docked by the same declared role. The tab id each
  // one lands on is read off the list BEFORE it opens (what `openWindow` will
  // assign), which is how `Desktop.OpenWiredPair` names a source that does not
  // exist yet, so a later tool in the list can be opened wired to it.
  const openedAs = new Map<ToolId, string>();
  for (const link of tools) {
    const tabId = nextTabId(DesktopWindowsTap.get());
    openToolAt(link, link.wiredTo === undefined ? undefined : openedAs.get(link.wiredTo));
    openedAs.set(link.toolId, tabId);
  }
}
