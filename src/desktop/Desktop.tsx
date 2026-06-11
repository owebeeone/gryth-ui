import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { useGrip } from '@owebeeone/grip-react';
import {
  DESKTOP_WINDOWS, DESKTOP_WINDOWS_TAP,
  DESKTOP_FOCUSED, DESKTOP_FOCUSED_TAP,
  DESKTOP_CURRENT, DESKTOP_CURRENT_TAP,
  DESKTOP_OVERVIEW, DESKTOP_OVERVIEW_TAP,
  DESK_SLIDE, DESK_SLIDE_TAP,
  SIDEBAR_OPEN, SIDEBAR_OPEN_TAP,
  SIDEBAR_WIDTH, SIDEBAR_WIDTH_TAP,
  DESKTOP_THEME, DESKTOP_WALLPAPER, DESKTOP_WALLPAPER_THEMED,
  DESKTOP_ZOOM, DESKTOP_FONT_SCALE,
  DESKTOP_GRID_MEMORY_TAP,
  WINDOW_DRAG, WINDOW_DRAG_TAP,
  WINDOW_MENU, WINDOW_MENU_TAP,
  AREA_MENU, AREA_MENU_TAP,
  CANVAS_SIZE, CANVAS_SIZE_TAP,
  TICKER_BLEED, TICKER_BLEED_TAP,
  type AreaEdge, type FacetKind, type SnapTarget, type WindowRecord,
} from '../grips.desktop';
import { WORKSPACE_NAME } from '../grips';
import {
  DESKTOP_IDS,
  areaOccupants, captureGrid, childLeafIds, closeArea, closeFoundation,
  detachTab, dockOrMerge, foundationOn,
  hitTitlebar, isOnDesktop, mergeWindows, minimizeWindow, moveTab,
  moveWindow, moveWindowFree, openFoundation, openWindow, overviewLayout,
  placeWindows, probeArea, raiseWindow, resizeWindow, selectTab, sendToDesktop,
  setSplitSizes, setSticky, snapWindow, splitArea, undockWindow, unsnapWindow,
  type Rect,
} from './ops';
import { FACETS, FACET_KINDS } from './facets';
import { SCHEME_WALLPAPERS, THEMES } from './themes';
import { HUB } from './foundations';
import { observeCanvas } from './canvasGuard';
import { bleedRect, tickerWidths } from './ticker';
import { bleedCancel, bleedHold, bleedLeave } from './tickerBleed';
import Window from './Window';
import FoundationWindow from './FoundationWindow';
import TickerStrip from './TickerStrip';
import { tickerNaturals } from './tickerDom';

// The desktop shell: collapsible zen-style LHS sidebar (launcher, virtual
// desktops, vertical window list — topmost first) and the window canvas.
// Drag uses the overlay pattern — mouse movement is handled as React events
// while the instance-scope WINDOW_DRAG grip is set; no window.addEventListener,
// no effects (see dev-docs/CodingRules.md). Header-on-header drop merges
// frames into tabbed windows; tab chips drag out to re-float; frames and
// tabs drop onto desktop icons to move between virtual desktops; on a
// desktop with a foundation (grid) window, empty areas are dockable holes.

function hoveredDesktopIcon(clientX: number, clientY: number): number | null {
  const el = document.elementsFromPoint(clientX, clientY)
    .find((n) => n instanceof HTMLElement && n.dataset.desktopTarget) as HTMLElement | undefined;
  return el ? Number(el.dataset.desktopTarget) : null;
}

const activeFacetOf = (w: WindowRecord): FacetKind =>
  (w.tabs.find((t) => t.id === w.activeTab) ?? w.tabs[0]).facet;

// Docked windows live where their foundation lives.
const hostOf = (list: WindowRecord[], w: WindowRecord): WindowRecord =>
  (w.dock ? list.find((f) => f.id === w.dock!.foundation) ?? w : w);

// Show the snap dock while a moving frame's pointer is this close to the
// top of the canvas.
const SNAP_EDGE = 40;

function hoveredSnapZone(clientX: number, clientY: number): SnapTarget | null {
  const el = document.elementsFromPoint(clientX, clientY)
    .find((n) => n instanceof HTMLElement && n.dataset.snapTarget) as HTMLElement | undefined;
  return el ? (el.dataset.snapTarget as SnapTarget) : null;
}

function canvasSize(): { w: number; h: number } {
  // layout px (zoom-independent) — the space window geometry lives in
  const el = document.querySelector('.desktop-canvas') as HTMLElement;
  return { w: el.offsetWidth, h: el.offsetHeight };
}

// Stable ref callback (module scope) so React runs it once on mount instead
// of stealing focus on every render.
const focusOnMount = (el: HTMLDivElement | null) => el?.focus();

// The half of an area an edge-drop would split off (preview + intent).
const splitHalf = (r: Rect, edge: AreaEdge): Rect => (
  edge === 'left' ? { x: r.x, y: r.y, w: r.w / 2, h: r.h }
    : edge === 'right' ? { x: r.x + r.w / 2, y: r.y, w: r.w / 2, h: r.h }
      : edge === 'top' ? { x: r.x, y: r.y, w: r.w, h: r.h / 2 }
        : { x: r.x, y: r.y + r.h / 2, w: r.w, h: r.h / 2 });

const EDGE_BAND = 28;

export default function Desktop() {
  const windows = useGrip(DESKTOP_WINDOWS) ?? [];
  const windowsTap = useGrip(DESKTOP_WINDOWS_TAP);
  const focused = useGrip(DESKTOP_FOCUSED) ?? null;
  const focusedTap = useGrip(DESKTOP_FOCUSED_TAP);
  const current = useGrip(DESKTOP_CURRENT) ?? 1;
  const currentTap = useGrip(DESKTOP_CURRENT_TAP);
  const sidebarOpen = useGrip(SIDEBAR_OPEN) ?? true;
  const sidebarTap = useGrip(SIDEBAR_OPEN_TAP);
  const sidebarWidth = useGrip(SIDEBAR_WIDTH) ?? 200;
  const sidebarWidthTap = useGrip(SIDEBAR_WIDTH_TAP);
  const drag = useGrip(WINDOW_DRAG) ?? null;
  const dragTap = useGrip(WINDOW_DRAG_TAP);
  const menu = useGrip(WINDOW_MENU) ?? null;
  const menuTap = useGrip(WINDOW_MENU_TAP);
  const areaMenu = useGrip(AREA_MENU) ?? null;
  const areaMenuTap = useGrip(AREA_MENU_TAP);
  const overview = useGrip(DESKTOP_OVERVIEW) ?? null;
  const overviewTap = useGrip(DESKTOP_OVERVIEW_TAP);
  const slide = useGrip(DESK_SLIDE) ?? null;
  const slideTap = useGrip(DESK_SLIDE_TAP);
  const themeId = useGrip(DESKTOP_THEME) ?? 'light';
  const wallpaper = useGrip(DESKTOP_WALLPAPER) ?? '';
  const wallpaperThemed = useGrip(DESKTOP_WALLPAPER_THEMED) ?? true;
  const uiZoom = useGrip(DESKTOP_ZOOM) ?? 1;
  const fontScale = useGrip(DESKTOP_FONT_SCALE) ?? 10;
  const gridMemoryTap = useGrip(DESKTOP_GRID_MEMORY_TAP);
  const canvas = useGrip(CANVAS_SIZE) ?? { w: 0, h: 0 };
  const canvasTap = useGrip(CANVAS_SIZE_TAP);
  const bleed = useGrip(TICKER_BLEED) ?? null;
  const bleedTap = useGrip(TICKER_BLEED_TAP);
  const workspace = useGrip(WORKSPACE_NAME);

  const theme = THEMES[themeId];
  // Wallpaper: cover semantics, so the image's aspect ratio survives any
  // canvas resize. Custom URL wins; otherwise the theme's scheme default
  // (when enabled); otherwise none.
  const effectiveWallpaper = wallpaper || (wallpaperThemed ? SCHEME_WALLPAPERS[theme.scheme] : '');
  const lastDesk = DESKTOP_IDS[DESKTOP_IDS.length - 1];
  const wallpaperStyle: CSSProperties | undefined = effectiveWallpaper
    ? {
      backgroundImage: `url("${effectiveWallpaper.replace(/"/g, '%22')}")`,
      backgroundSize: 'cover',
      backgroundPosition: `${((current - 1) / (lastDesk - 1)) * 100}% 50%`,
    }
    : undefined;

  // Effective geometry: foundations maximized, docked frames at their area
  // rect, floaters at their own record geometry.
  const placed = placeWindows(windows, canvas);
  const placedById = new Map(placed.map((w) => [w.id, w]));
  const rectOf = (w: WindowRecord) => {
    const p = placedById.get(w.id) ?? w;
    return { x: p.x, y: p.y, w: p.w, h: p.h };
  };

  const visible = windows.filter((w) => isOnDesktop(hostOf(windows, w), current));
  const shown = visible.filter((w) => !w.minimized);
  const shownFoundations = shown.filter((w) => w.foundation);
  const shownFrames = shown.filter((w) => !w.foundation);
  const menuFrame = menu ? windows.find((w) => w.id === menu.frameId) : undefined;
  const areaMenuFoundation = areaMenu ? windows.find((w) => w.id === areaMenu.foundationId) : undefined;

  // Overview placements: presentation-only grid over the shown frames
  // ('all') or the focused application's windows ('app'; others dim).
  // Foundations are not overview members.
  const overviewMembers = overview
    ? (overview.mode === 'app' ? shownFrames.filter((w) => activeFacetOf(w) === overview.facet) : shownFrames)
    : [];
  const placements = overview
    ? overviewLayout(overviewMembers.map((w) => placedById.get(w.id) ?? w), { w: overview.w, h: overview.h })
    : null;

  const pick = (id: string) => {
    windowsTap?.update((list) => raiseWindow(list, id));
    focusedTap?.set(id);
    overviewTap?.set(null);
  };

  const focusTopVisible = (list: WindowRecord[], desk: number) => {
    const vis = list.filter((w) => !w.foundation && isOnDesktop(hostOf(list, w), desk) && !w.minimized);
    focusedTap?.set(vis[vis.length - 1]?.id ?? null);
  };

  const open = (kind: FacetKind) => {
    const wins = windowsTap?.get() ?? [];
    const desk = currentTap?.get() ?? 1;
    const result = openWindow(wins, kind, FACETS[kind].defaultSize, desk);
    let next = result.list;
    let focusId = result.id;
    // a new window opened onto a gridded desktop docks straight into its
    // home — tabbing with whatever already lives there
    const f = foundationOn(next, desk);
    if (f?.foundation) {
      const dm = dockOrMerge(next, result.id, f.id, f.foundation.designate[kind] ?? f.foundation.fallback);
      next = dm.list;
      focusId = dm.frameId;
    }
    windowsTap?.set(next);
    focusedTap?.set(focusId);
    overviewTap?.set(null);
  };

  // Sidebar entries cover ALL desktops: activating a window on another
  // desktop switches there first.
  const restore = (id: string) => {
    const wins = windowsTap?.get() ?? [];
    const win = wins.find((w) => w.id === id);
    if (!win) return;
    if (!isOnDesktop(hostOf(wins, win), currentTap?.get() ?? 1)) currentTap?.set(hostOf(wins, win).desktop);
    windowsTap?.update((list) => raiseWindow(minimizeWindow(list, id, false), id));
    focusedTap?.set(id);
    overviewTap?.set(null);
  };

  // The sidebar boundary drags like every other border. Width is environ
  // state; the canvas observer republishes CANVAS_SIZE as it changes, so
  // foundations and snapped frames track the boundary live.
  const startSidebarDrag = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const aside = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    const zoom = aside.offsetWidth ? aside.getBoundingClientRect().width / aside.offsetWidth : 1;
    dragTap?.set({
      kind: 'sidebar', id: 'sidebar', baseW: sidebarWidthTap?.get() ?? 200,
      pointerX: e.clientX, pointerY: e.clientY,
      canvasLeft: 0, canvasTop: 0, zoom,
      dropTarget: null, dropDesktop: null, dropArea: null, dropSplit: null,
    });
    e.preventDefault();
  };

  const switchDesktop = (desk: number) => {
    const cur = currentTap?.get() ?? 1;
    if (desk === cur) return;
    const wins = windowsTap?.get() ?? [];
    // slide only when some window actually enters or exits
    const animates = wins.some((w) => !w.minimized && isOnDesktop(hostOf(wins, w), cur) !== isOnDesktop(hostOf(wins, w), desk));
    slideTap?.set(animates ? { from: cur, to: desk } : null);
    currentTap?.set(desk);
    overviewTap?.set(null);
    focusTopVisible(wins, desk);
  };

  // Directional slide classes during a desktop switch; sticky windows
  // (visible on both sides) do not animate.
  const deskAnimFor = (w: WindowRecord): string | null => {
    if (!slide) return null;
    const host = hostOf(windows, w);
    const movingRight = slide.to > slide.from;
    if (!isOnDesktop(host, slide.from)) return movingRight ? 'enter-right' : 'enter-left';
    if (!isOnDesktop(host, slide.to)) return movingRight ? 'exit-left' : 'exit-right';
    return null;
  };
  const exiting = slide
    ? windows.filter((w) => {
      const host = hostOf(windows, w);
      return !w.minimized && isOnDesktop(host, slide.from) && !isOnDesktop(host, slide.to);
    })
    : [];

  // Drag handlers read CURRENT atom state via the tap handles, never the
  // render closure — a real mouse can move+release inside one notification
  // cycle, and a stale closure would drop the gesture's final state.
  const dragMove = (clientX: number, clientY: number, altKey: boolean = false) => {
    let d = dragTap?.get();
    if (!d) return;
    const size = canvasTap?.get() ?? { w: 0, h: 0 };
    if (d.kind === 'sidebar') {
      const dx = (clientX - d.pointerX) / d.zoom;
      sidebarWidthTap?.set(Math.min(420, Math.max(150, d.baseW + dx)));
      return;
    }
    if (d.kind === 'splitter') {
      const s = d;
      const deltaPx = (s.axis === 'row' ? clientX - s.pointerX : clientY - s.pointerY) / s.zoom;
      const deltaW = (deltaPx / s.spanPx) * (s.baseA + s.baseB);
      // empty sides may shrink to a few px (just a grab/dock target);
      // occupied sides keep 8%. spanPx is the pair's exact pixel span, so
      // px → weight-fraction is exact.
      const EMPTY_MIN_PX = 6;
      const winsNow = windowsTap?.get() ?? [];
      const foundation = winsNow.find((w) => w.id === s.id);
      const minOf = (i: number) => {
        const ids = foundation?.foundation ? childLeafIds(foundation.foundation.layout, s.interiorId, i) : [];
        const empty = ids.length > 0 && ids.every((id) => areaOccupants(winsNow, s.id, id).length === 0);
        return empty ? EMPTY_MIN_PX / Math.max(EMPTY_MIN_PX, s.spanPx) : 0.08;
      };
      const minA = minOf(s.index);
      const minB = minOf(s.index + 1);
      windowsTap?.update((list) => list.map((w) => (w.id === s.id && w.foundation
        ? { ...w, foundation: { ...w.foundation, layout: setSplitSizes(w.foundation.layout, s.interiorId, s.index, s.baseA + deltaW, s.baseB - deltaW, minA, minB) } }
        : w)));
      return;
    }
    // Dragging a docked frame away: undock, restore float size under pointer.
    if (d.kind === 'move') {
      const frame = (windowsTap?.get() ?? []).find((w) => w.id === d!.id);
      if (frame?.dock) {
        const startX = (d.pointerX - d.canvasLeft) / d.zoom;
        const startY = (d.pointerY - d.canvasTop) / d.zoom;
        const grabRatio = Math.min(0.9, Math.max(0.05, (startX - d.baseX) / d.baseW));
        const restored = {
          ...d,
          baseX: startX - grabRatio * frame.w,
          baseY: startY - 10,
          baseW: frame.w,
          baseH: frame.h,
        };
        windowsTap?.update((list) => undockWindow(list, d!.id));
        dragTap?.set(restored);
        d = restored;
      }
    }
    // Dragging a snapped frame away: release the snap; the float memory
    // (the record's own geometry) provides the size, the grab point stays
    // proportionally under the pointer.
    if (d.kind === 'move') {
      const frame = (windowsTap?.get() ?? []).find((w) => w.id === d!.id);
      if (frame?.snap) {
        const startX = (d.pointerX - d.canvasLeft) / d.zoom;
        const grabRatio = Math.min(0.9, Math.max(0.05, (startX - d.baseX) / d.baseW));
        const restored = {
          ...d,
          baseX: startX - grabRatio * frame.w,
          baseW: frame.w,
          baseH: frame.h,
        };
        windowsTap?.update((list) => unsnapWindow(list, d!.id));
        dragTap?.set(restored);
        d = restored;
      }
    }
    // Resizing a snapped frame: materialize its effective rect into the
    // record first; the resize then owns a normal floater.
    if (d.kind === 'resize') {
      const fd0 = d;
      const frame = (windowsTap?.get() ?? []).find((w) => w.id === fd0.id);
      if (frame?.snap) {
        windowsTap?.update((list) => list.map((w) => (w.id === fd0.id
          ? { ...w, x: fd0.baseX, y: fd0.baseY, w: fd0.baseW, h: fd0.baseH, snap: undefined }
          : w)));
      }
    }
    const canvasX = (clientX - d.canvasLeft) / d.zoom;
    const canvasY = (clientY - d.canvasTop) / d.zoom;
    const desk = currentTap?.get() ?? 1;
    const wins = windowsTap?.get() ?? [];
    const placedNow = placeWindows(wins, size);
    const onDesk = placedNow.filter((w) => !w.foundation && !w.minimized
      && isOnDesktop(hostOf(wins, wins.find((x) => x.id === w.id) ?? w), desk));
    const deskFoundation = foundationOn(wins, desk);
    // Alt-drag = float intent: every dock/merge/split/snap target is
    // suppressed; the drop lands free.
    const floatIntent = altKey;
    const dropDesktop = hoveredDesktopIcon(clientX, clientY);
    // foundation areas: edge band = split intent, empty center = hole dock,
    // occupied center = tab into the occupant
    const probe = (dropDesktop || floatIntent) ? null : probeArea(wins, size, desk, canvasX, canvasY, EDGE_BAND);
    const dropSplit = probe?.edge
      ? { foundation: probe.foundationId, area: probe.areaId, edge: probe.edge, rect: splitHalf(probe.rect, probe.edge) }
      : null;
    const dropArea = (!dropSplit && probe && !probe.occupantId)
      ? { foundation: probe.foundationId, area: probe.areaId }
      : null;
    const areaMerge = (!dropSplit && probe?.occupantId && probe.occupantId !== d.id)
      ? probe.occupantId
      : null;
    if (d.kind === 'tab') {
      const moved = d.moved
        || Math.abs(clientX - d.pointerX) + Math.abs(clientY - d.pointerY) > 4;
      // the press became a tear-off: the bleed picker shrinks away
      if (moved && !d.moved) bleedCancel(bleedTap);
      const dropTarget = (dropDesktop || dropArea || dropSplit || floatIntent)
        ? null
        : (areaMerge ?? hitTitlebar(onDesk, canvasX, canvasY, ''));
      dragTap?.set({ ...d, moved, ghostX: canvasX + 10, ghostY: canvasY + 10, dropTarget, dropDesktop, dropArea, dropSplit });
      return;
    }
    const fd = d;
    const dx = (clientX - fd.pointerX) / fd.zoom;
    const dy = (clientY - fd.pointerY) / fd.zoom;
    windowsTap?.update((list) => (fd.kind === 'move'
      ? moveWindowFree(list, fd.id, fd.baseX + dx, fd.baseY + dy)
      : resizeWindow(list, fd.id, fd.baseW + dx, fd.baseH + dy)));
    if (d.kind === 'move') {
      const nearTop = !dropDesktop && !deskFoundation && !floatIntent && canvasY < SNAP_EDGE;
      const snapTarget = nearTop ? hoveredSnapZone(clientX, clientY) : null;
      const dropTarget = (dropDesktop || dropArea || dropSplit || snapTarget || floatIntent)
        ? null
        : (areaMerge ?? hitTitlebar(onDesk, canvasX, canvasY, d.id));
      if (dropTarget !== d.dropTarget || dropDesktop !== d.dropDesktop
        || nearTop !== d.nearTop || snapTarget !== d.snapTarget
        || dropArea?.area !== d.dropArea?.area || dropArea?.foundation !== d.dropArea?.foundation
        || dropSplit?.area !== d.dropSplit?.area || dropSplit?.edge !== d.dropSplit?.edge) {
        dragTap?.set({ ...d, dropTarget, dropDesktop, nearTop, snapTarget, dropArea, dropSplit });
      }
    }
  };

  // Apply an edge-drop: split the area (new hole on the dropped side) and
  // dock the frame into it.
  const applySplitDrop = (
    wins: WindowRecord[],
    frameId: string,
    ds: { foundation: string; area: string; edge: AreaEdge },
  ) => {
    const direction: 'row' | 'column' = ds.edge === 'left' || ds.edge === 'right' ? 'row' : 'column';
    const newFirst = ds.edge === 'left' || ds.edge === 'top';
    let newAreaId = '';
    const next = wins.map((w) => {
      if (w.id !== ds.foundation || !w.foundation) return w;
      // edge-drop splits are ephemeral: they merge back when emptied
      const s = splitArea(w.foundation.layout, ds.area, direction, newFirst, true);
      newAreaId = s.newAreaId;
      return { ...w, foundation: { ...w.foundation, layout: s.layout } };
    });
    if (!newAreaId) return null;
    const dm = dockOrMerge(next, frameId, ds.foundation, newAreaId);
    windowsTap?.set(raiseWindow(dm.list, dm.frameId));
    focusedTap?.set(dm.frameId);
    return dm.frameId;
  };

  // Alt at RELEASE always means float — the user may press it after the
  // last mousemove, so the stored drop intents must yield to it.
  const dragEnd = (clientX: number, clientY: number, altKey: boolean = false) => {
    const d = dragTap?.get();
    if (!d) return;
    if (d.kind === 'sidebar') {
      dragTap?.set(null);
      return;
    }
    const wins = windowsTap?.get() ?? [];
    const desk = currentTap?.get() ?? 1;
    if (d.kind === 'move') {
      const canvasX = (clientX - d.canvasLeft) / d.zoom;
      const canvasY = (clientY - d.canvasTop) / d.zoom;
      if (d.dropDesktop) {
        // sent to a desktop (or dropped on the current one): the frame goes
        // home to its pre-drag position
        const homed = moveWindow(wins, d.id, d.baseX, d.baseY);
        const next = d.dropDesktop !== desk ? sendToDesktop(homed, d.id, d.dropDesktop) : homed;
        windowsTap?.set(next);
        if (d.dropDesktop !== desk) focusTopVisible(next, desk);
      } else if (!altKey && d.dropSplit) {
        applySplitDrop(wins, d.id, d.dropSplit);
      } else if (!altKey && d.dropArea) {
        const dm = dockOrMerge(wins, d.id, d.dropArea.foundation, d.dropArea.area);
        windowsTap?.set(raiseWindow(dm.list, dm.frameId));
        focusedTap?.set(dm.frameId);
      } else if (!altKey && d.snapTarget) {
        windowsTap?.set(snapWindow(wins, d.id, d.snapTarget));
      } else if (!altKey && d.dropTarget) {
        windowsTap?.set(mergeWindows(wins, d.id, d.dropTarget));
        focusedTap?.set(d.dropTarget);
      } else if (canvasX < 0 || canvasY < 0) {
        // released off-canvas (over the sidebar) but not on a drop target:
        // snap back
        windowsTap?.set(moveWindow(wins, d.id, d.baseX, d.baseY));
      } else {
        // settle where dropped, re-clamped to the canvas
        const win = wins.find((w) => w.id === d.id);
        if (win) windowsTap?.set(moveWindow(wins, d.id, win.x, win.y));
      }
    } else if (d.kind === 'tab') {
      // a press that never moved is a CLICK: select the tab, ignore intents.
      // The drag overlay's mount faked a picker mouseleave — re-hold it so
      // selection keeps the picker open.
      if (!d.moved) {
        windowsTap?.set(selectTab(wins, d.id, d.tabId));
        dragTap?.set(null);
        bleedHold(bleedTap);
        return;
      }
      const canvasX = (clientX - d.canvasLeft) / d.zoom;
      const canvasY = (clientY - d.canvasTop) / d.zoom;
      const size = FACETS[d.facet].defaultSize;
      if (d.dropDesktop) {
        const out = detachTab(wins, d.id, d.tabId, { x: 96, y: 96 }, size, d.dropDesktop);
        windowsTap?.set(out.list);
        focusTopVisible(out.list, desk);
      } else if (!altKey && d.dropSplit) {
        const out = detachTab(wins, d.id, d.tabId, { x: 96, y: 96 }, size, desk);
        applySplitDrop(out.list, out.id, d.dropSplit);
      } else if (!altKey && d.dropArea) {
        const out = detachTab(wins, d.id, d.tabId, { x: 96, y: 96 }, size, desk);
        const dm = dockOrMerge(out.list, out.id, d.dropArea.foundation, d.dropArea.area);
        windowsTap?.set(raiseWindow(dm.list, dm.frameId));
        focusedTap?.set(dm.frameId);
      } else if (!altKey && d.dropTarget) {
        windowsTap?.set(moveTab(wins, d.id, d.tabId, d.dropTarget));
        focusedTap?.set(d.dropTarget);
      } else if (canvasX >= 0 && canvasY >= 0) {
        const out = detachTab(wins, d.id, d.tabId, { x: canvasX - 40, y: canvasY - 12 }, size, desk);
        windowsTap?.set(out.list);
        focusedTap?.set(out.id);
      }
    }
    dragTap?.set(null);
  };

  const sendFromMenu = (desk: number) => {
    if (!menuFrame) return;
    // a docked frame undocks before travelling
    const wins = windowsTap?.get() ?? [];
    const next = sendToDesktop(undockWindow(wins, menuFrame.id), menuFrame.id, desk);
    windowsTap?.set(next);
    focusTopVisible(next, currentTap?.get() ?? 1);
    menuTap?.set(null);
  };

  const editFoundationLayout = (foundationId: string, edit: (f: NonNullable<WindowRecord['foundation']>) => NonNullable<WindowRecord['foundation']>) => {
    windowsTap?.update((list) => list.map((w) => (w.id === foundationId && w.foundation
      ? { ...w, foundation: edit(w.foundation) }
      : w)));
  };

  // The lock toggles a desktop's grid. Unlocking stashes the layout +
  // assignments (grid memory); re-locking restores them, with newcomers
  // adopted by designate/fallback.
  const toggleGrid = (desk: number) => {
    const wins = windowsTap?.get() ?? [];
    const f = foundationOn(wins, desk);
    if (f) {
      const stash = captureGrid(wins, desk);
      if (stash) gridMemoryTap?.update((m) => ({ ...m, [desk]: stash }));
      const next = closeFoundation(wins, f.id);
      windowsTap?.set(next);
      focusTopVisible(next, currentTap?.get() ?? 1);
    } else {
      const stash = (gridMemoryTap?.get() ?? {})[desk];
      const out = openFoundation(wins, desk, stash?.def ?? HUB, stash?.assignments ?? {});
      windowsTap?.set(out.list);
      focusTopVisible(out.list, currentTap?.get() ?? 1);
    }
    overviewTap?.set(null);
  };

  const splitFromMenu = (foundationId: string, areaId: string, direction: 'row' | 'column') => {
    editFoundationLayout(foundationId, (f) => ({ ...f, layout: splitArea(f.layout, areaId, direction).layout }));
    areaMenuTap?.set(null);
    menuTap?.set(null);
  };

  // Shift+Up = all-windows overview; Shift+Down = focused app's windows;
  // Shift+Left/Right = previous/next desktop; Escape exits overview.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
    const cur = overviewTap?.get() ?? null;
    if (e.key === 'Escape' && cur) {
      overviewTap?.set(null);
      return;
    }
    if (!e.shiftKey) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const desk = currentTap?.get() ?? 1;
      const next = e.key === 'ArrowRight'
        ? Math.min(DESKTOP_IDS[DESKTOP_IDS.length - 1], desk + 1)
        : Math.max(DESKTOP_IDS[0], desk - 1);
      if (next !== desk) switchDesktop(next);
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const mode = e.key === 'ArrowUp' ? 'all' : 'app';
    if (cur?.mode === mode) {
      overviewTap?.set(null);
      return;
    }
    const wins = windowsTap?.get() ?? [];
    const desk = currentTap?.get() ?? 1;
    const onDesk = wins.filter((w) => isOnDesktop(hostOf(wins, w), desk) && !w.minimized && !w.foundation);
    if (onDesk.length === 0) return;
    let facet: FacetKind | null = null;
    if (mode === 'app') {
      const focusedWin = onDesk.find((w) => w.id === focusedTap?.get()) ?? onDesk[onDesk.length - 1];
      facet = activeFacetOf(focusedWin);
    }
    const { w, h } = canvasSize();
    overviewTap?.set({ mode, facet, w, h });
  };

  // Sidebar window list, grouped: sticky windows first ("All desktops"),
  // then desktops in fixed numeric order (stable spatial memory; empty
  // groups skipped). Within a group: topmost first.
  // foundations are scaffolding, not windows — they don't appear in the list
  const topFirst = [...windows].reverse().filter((w) => !w.foundation);
  const windowGroups: { key: string; label: string; desk: number | null; wins: WindowRecord[] }[] = [];
  const stickyWins = topFirst.filter((w) => w.sticky && !w.dock);
  if (stickyWins.length) windowGroups.push({ key: 'all', label: 'All desktops', desk: null, wins: stickyWins });
  for (const d of DESKTOP_IDS) {
    const wins = topFirst.filter((w) => !(w.sticky && !w.dock) && hostOf(windows, w).desktop === d);
    // a gridded desktop shows its group even when empty (the lock lives there)
    if (wins.length || foundationOn(windows, d)) windowGroups.push({ key: `d${d}`, label: `Desktop ${d}`, desk: d, wins });
  }

  // Each desktop icon is a thumbnail mini-map of its windows, scaled by the
  // REAL canvas size and letterboxed to its aspect; the margin outside the
  // mapped region (inaccessible space) shows as a subtle checker.
  const THUMB_ASPECT = 1.5; // .desk-btn inner aspect (3rem / 2rem)
  const viewW = canvas.w > 0 ? canvas.w : 1500;
  const viewH = canvas.h > 0 ? canvas.h : 950;
  const viewAspect = viewW / viewH;
  const thumbFit = viewAspect >= THUMB_ASPECT
    ? { w: 100, h: (THUMB_ASPECT / viewAspect) * 100 }
    : { w: (viewAspect / THUMB_ASPECT) * 100, h: 100 };
  const pct = (v: number, axis: number) => `${Math.min(95, Math.max(0, (v / axis) * 100))}%`;
  const desktopIcons = (
    <nav className="sidebar-desktops">
      {DESKTOP_IDS.map((d) => (
        <button
          key={d}
          data-desktop-target={d}
          title={`Desktop ${d} (${windows.filter((w) => isOnDesktop(hostOf(windows, w), d)).length} windows)`}
          className={`desk-btn${d === current ? ' current' : ''}${drag?.dropDesktop === d ? ' drop' : ''}`}
          onClick={() => switchDesktop(d)}
        >
          <span className="thumb-view" style={{ width: `${thumbFit.w}%`, height: `${thumbFit.h}%` }}>
            {windows.filter((w) => isOnDesktop(hostOf(windows, w), d) && !w.minimized && !w.foundation).map((w) => {
              const r = rectOf(w);
              return (
                <span
                  key={w.id}
                  className={`thumb-box${w.id === focused ? ' focused' : ''}`}
                  style={{
                    left: pct(r.x, viewW),
                    top: pct(r.y, viewH),
                    width: `max(10%, ${pct(r.w, viewW)})`,
                    height: `max(14%, ${pct(r.h, viewH)})`,
                  }}
                />
              );
            })}
          </span>
          <span className="desk-num">{d}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <div
      className="desktop"
      tabIndex={0}
      ref={focusOnMount}
      onKeyDown={onKeyDown}
      style={{
        ...theme.vars,
        colorScheme: theme.scheme,
        zoom: uiZoom === 1 ? undefined : uiZoom,
        // font scale 5–15 (10 = 100%); chrome fonts are em-based so all
        // text follows, layout metrics (px/rem) do not
        fontSize: `${(fontScale * 15) / 10}px`,
      } as CSSProperties}
    >
      {sidebarOpen ? (
        <aside className="sidebar" style={{ width: sidebarWidth }}>
          <div className="sidebar-resize" onMouseDown={startSidebarDrag} />
          <div className="sidebar-head">
            <span className="sidebar-brand">gryth</span>
            <button className="sidebar-toggle" title="Collapse sidebar" onClick={() => sidebarTap?.set(false)}>&lt;</button>
          </div>
          <nav className="sidebar-launcher">
            {FACET_KINDS.filter((kind) => kind !== 'grid').map((kind) => (
              <button key={kind} title={`Open ${FACETS[kind].title}`} onClick={() => open(kind)}>
                + {FACETS[kind].title}
              </button>
            ))}
          </nav>
          {desktopIcons}
          <nav className="sidebar-windows">
            {windowGroups.map((g) => (
              <div key={g.key} className="side-group">
                <div className="side-group-head">
                  {g.desk !== null ? (
                    <button
                      className={`side-group-label${g.desk === current ? ' current' : ''}`}
                      onClick={() => switchDesktop(g.desk!)}
                    >{g.label}</button>
                  ) : (
                    <span className="side-group-label">{g.label}</span>
                  )}
                  {g.desk !== null && (
                    <button
                      className="side-lock"
                      title={foundationOn(windows, g.desk)
                        ? `Unlock Desktop ${g.desk} — windows float back`
                        : `Lock Desktop ${g.desk} into its grid`}
                      onClick={() => toggleGrid(g.desk!)}
                    >{foundationOn(windows, g.desk) ? '🔒' : '🔓'}</button>
                  )}
                </div>
                {g.wins.map((w) => {
                  const active = w.tabs.find((t) => t.id === w.activeTab) ?? w.tabs[0];
                  return (
                    <button
                      key={w.id}
                      className={`side-win${w.id === focused ? ' focused' : ''}${w.minimized ? ' minimized' : ''}`}
                      onClick={() => restore(w.id)}
                    >
                      <span className="side-title">{FACETS[active.facet].title}</span>
                      {w.tabs.length > 1 && <span className="side-count">{w.tabs.length}</span>}
                      <span className="gwin-id">{w.dock ? w.dock.area : w.id}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sidebar-workspace">{workspace}</div>
        </aside>
      ) : (
        <aside className="sidebar closed">
          <button className="sidebar-toggle" title="Expand sidebar" onClick={() => sidebarTap?.set(true)}>&gt;</button>
          {desktopIcons}
        </aside>
      )}
      <div
        className={`desktop-canvas${drag?.kind === 'move' ? ' dragging' : ''}`}
        style={wallpaperStyle}
        ref={observeCanvas}
        onAnimationEnd={(e) => { if (e.animationName.startsWith('desk-')) slideTap?.set(null); }}
      >
        {exiting.map((w) => (
          <Window key={w.id} win={w} rect={rectOf(w)} focused={false} dropTarget={false} overview={null} deskAnim={deskAnimFor(w)} />
        ))}
        {shownFoundations.map((w) => (
          <FoundationWindow key={w.id} win={w} rect={rectOf(w)} />
        ))}
        {shownFrames.map((w) => (
          <Window
            key={w.id}
            win={w}
            rect={rectOf(w)}
            focused={w.id === focused}
            dropTarget={drag?.dropTarget === w.id && drag.id !== w.id}
            overview={overview ? { placement: placements?.get(w.id), onPick: () => pick(w.id) } : null}
            deskAnim={deskAnimFor(w)}
          />
        ))}
        {drag?.kind === 'tab' && drag.moved && (
          <div className="tab-ghost" style={{ left: drag.ghostX, top: drag.ghostY }}>
            {FACETS[drag.facet].title}
          </div>
        )}
        {drag?.kind === 'move' && drag.snapTarget && (() => {
          // The preview GROWS out of the dragged window: its rect at mount
          // feeds the animation's from-state via custom properties.
          const frame = windows.find((w) => w.id === drag.id);
          const fromRect = frame
            ? { '--fx': `${frame.x}px`, '--fy': `${frame.y}px`, '--fw': `${frame.w}px`, '--fh': `${frame.h}px` } as CSSProperties
            : undefined;
          return <div className={`snap-preview ${drag.snapTarget}`} style={fromRect} />;
        })()}
        {drag && drag.kind !== 'splitter' && drag.dropSplit && (
          <div
            className="split-preview"
            style={{
              left: drag.dropSplit.rect.x, top: drag.dropSplit.rect.y,
              width: drag.dropSplit.rect.w, height: drag.dropSplit.rect.h,
            }}
          />
        )}
        {drag?.kind === 'move' && drag.nearTop && (
          <div className="snap-dock">
            {(['left', 'full', 'right'] as SnapTarget[]).map((t) => (
              <span
                key={t}
                data-snap-target={t}
                title={t === 'full' ? 'Whole desktop' : `${t === 'left' ? 'Left' : 'Right'} half`}
                className={`snap-zone ${t}${drag.snapTarget === t ? ' active' : ''}`}
              />
            ))}
          </div>
        )}
        {bleed && !overview && (() => {
          // The bleed picker: a clone of a squeezed header strip, inflated in
          // place. Mounts at its expanded rect; the from-state (the anchor
          // rect + the anchor-solved segment widths) rides custom properties
          // into the open/close keyframes — the snap-preview pattern.
          const frame = windows.find((w) => w.id === bleed.frameId);
          if (!frame || frame.tabs.length < 2 || frame.minimized
            || !isOnDesktop(hostOf(windows, frame), current)) return null;
          const naturals = tickerNaturals(frame, fontScale);
          const needed = naturals.reduce((a, b) => a + b, 0);
          const er = bleedRect(bleed.anchor, needed, canvas);
          const activeIdx = Math.max(0, frame.tabs.findIndex((t) => t.id === frame.activeTab));
          const anchorWs = tickerWidths({ naturals, active: activeIdx, hover: null, width: bleed.anchor.w });
          return (
            <div
              className={`tk-bleed${bleed.phase === 'closing' ? ' closing' : ''}`}
              style={{
                left: er.x, top: er.y, width: er.w, height: er.h,
                '--ax': `${bleed.anchor.x}px`, '--ay': `${bleed.anchor.y}px`,
                '--aw': `${bleed.anchor.w}px`, '--ah': `${bleed.anchor.h}px`,
              } as CSSProperties}
              onMouseEnter={() => bleedHold(bleedTap)}
              onMouseLeave={() => bleedLeave(bleedTap)}
              onAnimationEnd={(e) => { if (e.animationName === 'tk-bleed-out') bleedTap?.set(null); }}
            >
              <TickerStrip
                win={frame}
                width={er.w}
                height={er.h}
                bleed
                from={{ x: bleed.anchor.x - er.x, widths: anchorWs }}
              />
            </div>
          );
        })()}
        {menu && menuFrame && (
          <>
            <div className="menu-backdrop" onMouseDown={() => menuTap?.set(null)} />
            <div className="win-menu" style={{ left: menu.x, top: menu.y }}>
              {menuFrame.dock && (
                <>
                  <button onClick={() => { windowsTap?.update((l) => undockWindow(l, menuFrame.id)); menuTap?.set(null); }}>
                    Undock (float)
                  </button>
                  <button onClick={() => splitFromMenu(menuFrame.dock!.foundation, menuFrame.dock!.area, 'row')}>
                    Split area ⇆
                  </button>
                  <button onClick={() => splitFromMenu(menuFrame.dock!.foundation, menuFrame.dock!.area, 'column')}>
                    Split area ⇵
                  </button>
                  <hr />
                </>
              )}
              {DESKTOP_IDS.map((d) => (
                <button key={d} disabled={menuFrame.desktop === d && !menuFrame.sticky} onClick={() => sendFromMenu(d)}>
                  Send to Desktop {d}{menuFrame.desktop === d ? ' •' : ''}
                </button>
              ))}
              <hr />
              <button
                onClick={() => {
                  windowsTap?.update((list) => setSticky(list, menuFrame.id, !menuFrame.sticky));
                  menuTap?.set(null);
                }}
              >
                {menuFrame.sticky ? '✓ ' : ''}Visible on all desktops
              </button>
            </div>
          </>
        )}
        {areaMenu && areaMenuFoundation?.foundation && (
          <>
            <div className="menu-backdrop" onMouseDown={() => areaMenuTap?.set(null)} />
            <div className="win-menu" style={{ left: areaMenu.x, top: areaMenu.y }}>
              <button onClick={() => splitFromMenu(areaMenu.foundationId, areaMenu.areaId, 'row')}>
                Split ⇆ (left/right)
              </button>
              <button onClick={() => splitFromMenu(areaMenu.foundationId, areaMenu.areaId, 'column')}>
                Split ⇵ (top/bottom)
              </button>
              <hr />
              <button
                disabled={!areaMenu.hole}
                onClick={() => {
                  editFoundationLayout(areaMenu.foundationId, (f) => ({ ...f, layout: closeArea(f.layout, areaMenu.areaId) }));
                  areaMenuTap?.set(null);
                }}
              >
                Close area
              </button>
            </div>
          </>
        )}
      </div>
      {drag && (
        <div
          className={`drag-overlay ${drag.kind}${drag.kind === 'splitter' ? ` ${drag.axis}` : ''}`}
          onMouseMove={(e) => dragMove(e.clientX, e.clientY, e.altKey)}
          onMouseUp={(e) => dragEnd(e.clientX, e.clientY, e.altKey)}
          onMouseLeave={(e) => dragEnd(e.clientX, e.clientY, e.altKey)}
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
    </div>
  );
}
