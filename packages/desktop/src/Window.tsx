import type { MouseEvent } from 'react';
import { useGrip } from '@owebeeone/grip-react';
import { PLUGIN_REGISTRY, allTools } from '@grythjs/plugin-api';
import {
  DESKTOP_WINDOWS, DESKTOP_WINDOWS_TAP, DESKTOP_FOCUSED_TAP,
  WINDOW_DRAG_TAP, WINDOW_MENU_TAP, DESKTOP_FONT_SCALE,
  type WindowRecord,
} from './grips.desktop';
import { closeTab, minimizeWindow, raiseWindow, type OverviewPlacement, type Rect } from './ops';
import TickerStrip from './TickerStrip';
import { canvasOrigin } from './tickerDom';
import { resolveTool } from './facets';

// Overview presentation handed down by the desktop: a placement transform
// for members of the grid, dimming for non-members (App Exposé), and the
// pick action. Geometry in the desktop document is untouched.
export interface WindowOverview {
  placement: OverviewPlacement | undefined;
  onPick: () => void;
}

// Window chrome: owns ALL desktop behavior for its tabs — drag, resize,
// raise/focus, minimize, close, header-drop merge, context menu. The tab
// strip itself (selection, hover, tear-off, bleed picker) is TickerStrip.
// The facet components inside are unaware of any of it. `rect` is the
// EFFECTIVE geometry (docked windows render at their area's rect; the
// record's own geometry stays the float memory).

export default function Window({ win, rect, focused, dropTarget, overview, deskAnim }: {
  win: WindowRecord;
  rect: Rect;
  focused: boolean;
  dropTarget: boolean;
  overview: WindowOverview | null;
  deskAnim: string | null;
}) {
  const windows = useGrip(DESKTOP_WINDOWS) ?? [];
  const windowsTap = useGrip(DESKTOP_WINDOWS_TAP);
  const focusedTap = useGrip(DESKTOP_FOCUSED_TAP);
  const dragTap = useGrip(WINDOW_DRAG_TAP);
  const menuTap = useGrip(WINDOW_MENU_TAP);
  const fontScale = useGrip(DESKTOP_FONT_SCALE) ?? 10;
  // tool resolution enumerates registry DATA — the chrome imports no plugin
  const defs = allTools(useGrip(PLUGIN_REGISTRY));
  const active = win.tabs.find((t) => t.id === win.activeTab) ?? win.tabs[0];
  const activeDef = resolveTool(defs, active.facet);
  const Facet = activeDef.windowComponent;
  const docked = !!win.dock;

  // The ticker strip fills the titlebar minus the chrome reserve; its
  // segment widths are solved purely from that width (see ticker.ts).
  const RESERVE = 90 + fontScale * 4; // dock/id chip + controls + paddings
  const stripW = Math.max(40, rect.w - RESERVE);

  const raise = () => {
    windowsTap?.update((list) => raiseWindow(list, win.id));
    focusedTap?.set(win.id);
  };

  // Drags start on the primary button only. A right-click must NOT start a
  // drag — the overlay would mount over the header and swallow the
  // contextmenu event before our menu (and preventDefault) could run.
  const startFrameDrag = (e: MouseEvent, kind: 'move' | 'resize') => {
    if (e.button !== 0) return;
    const origin = canvasOrigin(e);
    dragTap?.set({
      kind, id: win.id,
      pointerX: e.clientX, pointerY: e.clientY,
      canvasLeft: origin.left, canvasTop: origin.top, zoom: origin.zoom,
      baseX: rect.x, baseY: rect.y, baseW: rect.w, baseH: rect.h,
      dropTarget: null, dropDesktop: null, dropArea: null, dropSplit: null,
      nearTop: false, snapTarget: null,
    });
    e.preventDefault();
  };

  const openMenu = (e: MouseEvent) => {
    e.preventDefault();
    const origin = canvasOrigin(e);
    menuTap?.set({
      frameId: win.id,
      x: (e.clientX - origin.left) / origin.zoom,
      y: (e.clientY - origin.top) / origin.zoom,
    });
  };

  // × closes the CURRENT tab; the frame goes only when its last tab does.
  const close = () => {
    const next = closeTab(windows, win.id, active.id);
    windowsTap?.set(next);
    if (!next.some((w) => w.id === win.id)) focusedTap?.set(next[next.length - 1]?.id ?? null);
  };

  const place = overview?.placement;
  return (
    <section
      className={`gwin${focused ? ' focused' : ''}${dropTarget ? ' drop-target' : ''}${docked ? ' docked' : ''}${overview ? (place ? ' overview' : ' overview dimmed') : ''}${deskAnim ? ` desk-${deskAnim}` : ''}`}
      style={{
        left: rect.x, top: rect.y, width: rect.w, height: rect.h,
        transform: place
          ? `translate(${place.x - rect.x}px, ${place.y - rect.y}px) scale(${place.scale})`
          : undefined,
      }}
      onMouseDown={raise}
      onMouseDownCapture={overview ? (e) => { e.stopPropagation(); if (place) overview.onPick(); } : undefined}
      onContextMenuCapture={overview ? (e) => { e.stopPropagation(); e.preventDefault(); } : undefined}
    >
      <header
        className="gwin-titlebar"
        onMouseDown={(e) => startFrameDrag(e, 'move')}
        onContextMenu={openMenu}
      >
        {win.tabs.length === 1 ? (
          <span className="gwin-title">{activeDef.label}</span>
        ) : (
          <TickerStrip win={win} width={stripW} height={24} bleed={false} />
        )}
        {win.sticky && <span className="gwin-sticky" title="Visible on all desktops">◎</span>}
        <span className="gwin-id">{win.dock ? win.dock.area : win.id}</span>
        <span className="gwin-controls">
          {!docked && (
            <button
              title="Minimize"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => windowsTap?.update((list) => minimizeWindow(list, win.id, true))}
            >–</button>
          )}
          <button title="Close tab" onMouseDown={(e) => e.stopPropagation()} onClick={close}>×</button>
        </span>
      </header>
      <div className="gwin-body">
        <Facet tabId={active.id} params={active.params} />
      </div>
      {!docked && (
        <div className="gwin-resize" onMouseDown={(e) => { e.stopPropagation(); startFrameDrag(e, 'resize'); }} />
      )}
    </section>
  );
}
