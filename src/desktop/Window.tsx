import type { MouseEvent } from 'react';
import { useGrip } from '@owebeeone/grip-react';
import {
  DESKTOP_WINDOWS, DESKTOP_WINDOWS_TAP, DESKTOP_FOCUSED_TAP,
  WINDOW_DRAG_TAP, WINDOW_MENU_TAP,
  type WindowRecord,
} from '../grips.desktop';
import { closeWindow, closeTab, minimizeWindow, raiseWindow, type OverviewPlacement } from './ops';
import { FACETS } from './facets';

// Overview presentation handed down by the desktop: a placement transform
// for members of the grid, dimming for non-members (App Exposé), and the
// pick action. Geometry in the desktop document is untouched.
export interface WindowOverview {
  placement: OverviewPlacement | undefined;
  onPick: () => void;
}

// Window chrome: owns ALL desktop behavior for its tabs — drag, resize,
// raise/focus, minimize, close, tab strip, header-drop merge, tab drag-out,
// context menu. The facet components inside are unaware of any of it.

function canvasOrigin(e: MouseEvent): { left: number; top: number } {
  const rect = (e.currentTarget as HTMLElement).closest('.desktop-canvas')!.getBoundingClientRect();
  return { left: rect.left, top: rect.top };
}

export default function Window({ win, focused, dropTarget, overview, deskAnim }: {
  win: WindowRecord;
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
  const active = win.tabs.find((t) => t.id === win.activeTab) ?? win.tabs[0];
  const Facet = FACETS[active.facet].Component;

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
      canvasLeft: origin.left, canvasTop: origin.top,
      baseX: win.x, baseY: win.y, baseW: win.w, baseH: win.h,
      dropTarget: null, dropDesktop: null,
      nearTop: false, snapTarget: null,
    });
    e.preventDefault();
  };

  // Tab chip drag: starts a TabDrag. A click with no movement ends with
  // dropTarget still = this frame, which dragEnd treats as "select tab".
  const startTabDrag = (e: MouseEvent, tabId: string) => {
    if (e.button !== 0) return;
    const origin = canvasOrigin(e);
    const facet = win.tabs.find((t) => t.id === tabId)!.facet;
    dragTap?.set({
      kind: 'tab', id: win.id, tabId, facet,
      pointerX: e.clientX, pointerY: e.clientY,
      canvasLeft: origin.left, canvasTop: origin.top,
      ghostX: e.clientX - origin.left + 10, ghostY: e.clientY - origin.top + 10,
      dropTarget: win.id, dropDesktop: null,
    });
    e.stopPropagation();
    e.preventDefault();
  };

  const openMenu = (e: MouseEvent) => {
    e.preventDefault();
    const origin = canvasOrigin(e);
    menuTap?.set({ frameId: win.id, x: e.clientX - origin.left, y: e.clientY - origin.top });
  };

  const close = () => {
    const next = closeWindow(windows, win.id);
    windowsTap?.set(next);
    focusedTap?.set(next[next.length - 1]?.id ?? null);
  };

  const place = overview?.placement;
  return (
    <section
      className={`gwin${focused ? ' focused' : ''}${dropTarget ? ' drop-target' : ''}${overview ? (place ? ' overview' : ' overview dimmed') : ''}${deskAnim ? ` desk-${deskAnim}` : ''}`}
      style={{
        left: win.x, top: win.y, width: win.w, height: win.h,
        transform: place
          ? `translate(${place.x - win.x}px, ${place.y - win.y}px) scale(${place.scale})`
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
          <span className="gwin-title">{FACETS[active.facet].title}</span>
        ) : (
          <span className="gwin-tabs">
            {win.tabs.map((t) => (
              <button
                key={t.id}
                className={`gwin-tab${t.id === win.activeTab ? ' active' : ''}`}
                onMouseDown={(e) => startTabDrag(e, t.id)}
              >
                {FACETS[t.facet].title}
                <span
                  className="gwin-tab-close"
                  title="Close tab"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    windowsTap?.update((list) => closeTab(list, win.id, t.id));
                  }}
                >×</span>
              </button>
            ))}
          </span>
        )}
        {win.sticky && <span className="gwin-sticky" title="Visible on all desktops">◎</span>}
        <span className="gwin-id">{win.id}</span>
        <span className="gwin-controls">
          <button
            title="Minimize"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => windowsTap?.update((list) => minimizeWindow(list, win.id, true))}
          >–</button>
          <button title="Close" onMouseDown={(e) => e.stopPropagation()} onClick={close}>×</button>
        </span>
      </header>
      <div className="gwin-body">
        <Facet />
      </div>
      <div className="gwin-resize" onMouseDown={(e) => { e.stopPropagation(); startFrameDrag(e, 'resize'); }} />
    </section>
  );
}
