import type { CSSProperties, KeyboardEvent } from 'react';
import { useGrip } from '@owebeeone/grip-react';
import {
  DESKTOP_WINDOWS, DESKTOP_WINDOWS_TAP,
  DESKTOP_FOCUSED, DESKTOP_FOCUSED_TAP,
  DESKTOP_CURRENT, DESKTOP_CURRENT_TAP,
  DESKTOP_OVERVIEW, DESKTOP_OVERVIEW_TAP,
  DESK_SLIDE, DESK_SLIDE_TAP,
  SIDEBAR_OPEN, SIDEBAR_OPEN_TAP,
  DESKTOP_THEME, DESKTOP_WALLPAPER, DESKTOP_WALLPAPER_THEMED,
  WINDOW_DRAG, WINDOW_DRAG_TAP,
  WINDOW_MENU, WINDOW_MENU_TAP,
  type FacetKind, type SnapTarget, type WindowRecord,
} from '../grips.desktop';
import { SCHEME_WALLPAPERS, THEMES } from './themes';
import { observeCanvas } from './canvasGuard';
import { WORKSPACE_NAME } from '../grips';
import {
  DESKTOP_IDS,
  detachTab, hitTitlebar, isOnDesktop, mergeWindows, minimizeWindow, moveTab,
  moveWindow, moveWindowFree, openWindow, overviewLayout, raiseWindow,
  resizeWindow, sendToDesktop, setSticky, snapWindow, unsnapSize,
} from './ops';
import { FACETS, FACET_KINDS } from './facets';
import Window from './Window';

// The desktop shell: collapsible zen-style LHS sidebar (launcher, virtual
// desktops, vertical window list — topmost first) and the window canvas.
// Drag uses the overlay pattern — mouse movement is handled as React events
// while the instance-scope WINDOW_DRAG grip is set; no window.addEventListener,
// no effects (see dev-docs/CodingRules.md). Header-on-header drop merges
// frames into tabbed windows; tab chips drag out to re-float; frames and
// tabs drop onto desktop icons to move between virtual desktops.

function hoveredDesktopIcon(clientX: number, clientY: number): number | null {
  const el = document.elementsFromPoint(clientX, clientY)
    .find((n) => n instanceof HTMLElement && n.dataset.desktopTarget) as HTMLElement | undefined;
  return el ? Number(el.dataset.desktopTarget) : null;
}

const activeFacetOf = (w: WindowRecord): FacetKind =>
  (w.tabs.find((t) => t.id === w.activeTab) ?? w.tabs[0]).facet;

// Show the snap dock while a moving frame's pointer is this close to the
// top of the canvas.
const SNAP_EDGE = 40;

function hoveredSnapZone(clientX: number, clientY: number): SnapTarget | null {
  const el = document.elementsFromPoint(clientX, clientY)
    .find((n) => n instanceof HTMLElement && n.dataset.snapTarget) as HTMLElement | undefined;
  return el ? (el.dataset.snapTarget as SnapTarget) : null;
}

function canvasSize(): { w: number; h: number } {
  const r = document.querySelector('.desktop-canvas')!.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

// Stable ref callback (module scope) so React runs it once on mount instead
// of stealing focus on every render.
const focusOnMount = (el: HTMLDivElement | null) => el?.focus();

export default function Desktop() {
  const windows = useGrip(DESKTOP_WINDOWS) ?? [];
  const windowsTap = useGrip(DESKTOP_WINDOWS_TAP);
  const focused = useGrip(DESKTOP_FOCUSED) ?? null;
  const focusedTap = useGrip(DESKTOP_FOCUSED_TAP);
  const current = useGrip(DESKTOP_CURRENT) ?? 1;
  const currentTap = useGrip(DESKTOP_CURRENT_TAP);
  const sidebarOpen = useGrip(SIDEBAR_OPEN) ?? true;
  const sidebarTap = useGrip(SIDEBAR_OPEN_TAP);
  const drag = useGrip(WINDOW_DRAG) ?? null;
  const dragTap = useGrip(WINDOW_DRAG_TAP);
  const menu = useGrip(WINDOW_MENU) ?? null;
  const menuTap = useGrip(WINDOW_MENU_TAP);
  const overview = useGrip(DESKTOP_OVERVIEW) ?? null;
  const overviewTap = useGrip(DESKTOP_OVERVIEW_TAP);
  const slide = useGrip(DESK_SLIDE) ?? null;
  const slideTap = useGrip(DESK_SLIDE_TAP);
  const themeId = useGrip(DESKTOP_THEME) ?? 'light';
  const wallpaper = useGrip(DESKTOP_WALLPAPER) ?? '';
  const wallpaperThemed = useGrip(DESKTOP_WALLPAPER_THEMED) ?? true;
  const workspace = useGrip(WORKSPACE_NAME);

  const theme = THEMES[themeId];
  // Wallpaper: cover semantics, so the image's aspect ratio survives any
  // canvas resize. The image is scaled to cover one desktop view; whatever
  // horizontal overhang it has is panned across the desktops (a ~4x-wide
  // image gives the full continuous-world slide; a screen-aspect image
  // barely moves). Custom URL wins; otherwise the theme's scheme default
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

  const visible = windows.filter((w) => isOnDesktop(w, current));
  const shown = visible.filter((w) => !w.minimized);
  const menuFrame = menu ? windows.find((w) => w.id === menu.frameId) : undefined;

  // Overview placements: presentation-only grid over the shown windows
  // ('all') or the focused application's windows ('app'; others dim).
  const overviewMembers = overview
    ? (overview.mode === 'app' ? shown.filter((w) => activeFacetOf(w) === overview.facet) : shown)
    : [];
  const placements = overview ? overviewLayout(overviewMembers, { w: overview.w, h: overview.h }) : null;

  const pick = (id: string) => {
    windowsTap?.update((list) => raiseWindow(list, id));
    focusedTap?.set(id);
    overviewTap?.set(null);
  };

  // Shift+Up = all-windows overview; Shift+Down = focused app's windows;
  // Escape (or the same chord again) exits. Reads state via tap handles per
  // the gesture rule in dev-docs/CodingRules.md.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
    const cur = overviewTap?.get() ?? null;
    if (e.key === 'Escape' && cur) {
      overviewTap?.set(null);
      return;
    }
    if (!e.shiftKey) return;
    // Shift+Left/Right: previous/next desktop.
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
    const onDesk = wins.filter((w) => isOnDesktop(w, desk) && !w.minimized);
    if (onDesk.length === 0) return;
    let facet: FacetKind | null = null;
    if (mode === 'app') {
      const focusedWin = onDesk.find((w) => w.id === focusedTap?.get()) ?? onDesk[onDesk.length - 1];
      facet = activeFacetOf(focusedWin);
    }
    const r = document.querySelector('.desktop-canvas')!.getBoundingClientRect();
    overviewTap?.set({ mode, facet, w: r.width, h: r.height });
  };

  const focusTopVisible = (list: WindowRecord[], desk: number) => {
    const vis = list.filter((w) => isOnDesktop(w, desk) && !w.minimized);
    focusedTap?.set(vis[vis.length - 1]?.id ?? null);
  };

  const open = (kind: FacetKind) => {
    const result = openWindow(windows, kind, FACETS[kind].defaultSize, current);
    windowsTap?.set(result.list);
    focusedTap?.set(result.id);
    overviewTap?.set(null);
  };

  // Sidebar entries cover ALL desktops: activating a window on another
  // desktop switches there first.
  const restore = (id: string) => {
    const wins = windowsTap?.get() ?? [];
    const win = wins.find((w) => w.id === id);
    if (!win) return;
    if (!isOnDesktop(win, currentTap?.get() ?? 1)) currentTap?.set(win.desktop);
    windowsTap?.update((list) => raiseWindow(minimizeWindow(list, id, false), id));
    focusedTap?.set(id);
    overviewTap?.set(null);
  };

  const switchDesktop = (desk: number) => {
    const cur = currentTap?.get() ?? 1;
    if (desk === cur) return;
    const wins = windowsTap?.get() ?? [];
    // slide only when some window actually enters or exits
    const animates = wins.some((w) => !w.minimized && isOnDesktop(w, cur) !== isOnDesktop(w, desk));
    slideTap?.set(animates ? { from: cur, to: desk } : null);
    currentTap?.set(desk);
    overviewTap?.set(null);
    focusTopVisible(wins, desk);
  };

  // Directional slide classes during a desktop switch; sticky windows
  // (visible on both sides) do not animate.
  const deskAnimFor = (w: WindowRecord): string | null => {
    if (!slide) return null;
    const movingRight = slide.to > slide.from;
    if (!isOnDesktop(w, slide.from)) return movingRight ? 'enter-right' : 'enter-left';
    if (!isOnDesktop(w, slide.to)) return movingRight ? 'exit-left' : 'exit-right';
    return null;
  };
  const exiting = slide
    ? windows.filter((w) => !w.minimized && isOnDesktop(w, slide.from) && !isOnDesktop(w, slide.to))
    : [];

  // Drag handlers read CURRENT atom state via the tap handles, never the
  // render closure — a real mouse can move+release inside one notification
  // cycle, and a stale closure would drop the gesture's final state.
  const dragMove = (clientX: number, clientY: number) => {
    let d = dragTap?.get();
    if (!d) return;
    // Dragging a snapped frame away: restore its remembered size, keeping
    // the grab point proportionally under the pointer.
    if (d.kind === 'move') {
      const frame = (windowsTap?.get() ?? []).find((w) => w.id === d!.id);
      if (frame?.presnap) {
        const grabRatio = Math.min(0.9, Math.max(0.05, ((d.pointerX - d.canvasLeft) - d.baseX) / d.baseW));
        const restored = {
          ...d,
          baseX: (d.pointerX - d.canvasLeft) - grabRatio * frame.presnap.w,
          baseW: frame.presnap.w,
          baseH: frame.presnap.h,
        };
        windowsTap?.update((list) => unsnapSize(list, d!.id));
        dragTap?.set(restored);
        d = restored;
      }
    }
    const canvasX = clientX - d.canvasLeft;
    const canvasY = clientY - d.canvasTop;
    const desk = currentTap?.get() ?? 1;
    const onDesk = (windowsTap?.get() ?? []).filter((w) => isOnDesktop(w, desk));
    const dropDesktop = d.kind !== 'resize' ? hoveredDesktopIcon(clientX, clientY) : null;
    if (d.kind === 'tab') {
      const dropTarget = dropDesktop ? null : hitTitlebar(onDesk, canvasX, canvasY, '');
      dragTap?.set({ ...d, ghostX: canvasX + 10, ghostY: canvasY + 10, dropTarget, dropDesktop });
      return;
    }
    const dx = clientX - d.pointerX;
    const dy = clientY - d.pointerY;
    windowsTap?.update((list) => (d.kind === 'move'
      ? moveWindowFree(list, d.id, d.baseX + dx, d.baseY + dy)
      : resizeWindow(list, d.id, d.baseW + dx, d.baseH + dy)));
    if (d.kind === 'move') {
      const nearTop = !dropDesktop && canvasY < SNAP_EDGE;
      const snapTarget = nearTop ? hoveredSnapZone(clientX, clientY) : null;
      const dropTarget = (dropDesktop || snapTarget) ? null : hitTitlebar(onDesk, canvasX, canvasY, d.id);
      if (dropTarget !== d.dropTarget || dropDesktop !== d.dropDesktop
        || nearTop !== d.nearTop || snapTarget !== d.snapTarget) {
        dragTap?.set({ ...d, dropTarget, dropDesktop, nearTop, snapTarget });
      }
    }
  };

  const dragEnd = (clientX: number, clientY: number) => {
    const d = dragTap?.get();
    if (!d) return;
    const wins = windowsTap?.get() ?? [];
    const desk = currentTap?.get() ?? 1;
    if (d.kind === 'move') {
      const canvasX = clientX - d.canvasLeft;
      const canvasY = clientY - d.canvasTop;
      if (d.dropDesktop) {
        // sent to a desktop (or dropped on the current one): the frame goes
        // home to its pre-drag position
        const homed = moveWindow(wins, d.id, d.baseX, d.baseY);
        const next = d.dropDesktop !== desk ? sendToDesktop(homed, d.id, d.dropDesktop) : homed;
        windowsTap?.set(next);
        if (d.dropDesktop !== desk) focusTopVisible(next, desk);
      } else if (d.snapTarget) {
        windowsTap?.set(snapWindow(wins, d.id, d.snapTarget, canvasSize()));
      } else if (d.dropTarget) {
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
      const canvasX = clientX - d.canvasLeft;
      const canvasY = clientY - d.canvasTop;
      const size = FACETS[d.facet].defaultSize;
      if (d.dropDesktop) {
        const out = detachTab(wins, d.id, d.tabId, { x: 96, y: 96 }, size, d.dropDesktop);
        windowsTap?.set(out.list);
        focusTopVisible(out.list, desk);
      } else if (d.dropTarget) {
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
    const next = sendToDesktop(windows, menuFrame.id, desk);
    windowsTap?.set(next);
    focusTopVisible(next, current);
    menuTap?.set(null);
  };

  // Sidebar window list, grouped: sticky windows first ("All desktops"),
  // then desktops in fixed numeric order (stable spatial memory; empty
  // groups skipped). Within a group: topmost first.
  const topFirst = [...windows].reverse();
  const windowGroups: { key: string; label: string; desk: number | null; wins: WindowRecord[] }[] = [];
  const stickyWins = topFirst.filter((w) => w.sticky);
  if (stickyWins.length) windowGroups.push({ key: 'all', label: 'All desktops', desk: null, wins: stickyWins });
  for (const d of DESKTOP_IDS) {
    const wins = topFirst.filter((w) => !w.sticky && w.desktop === d);
    if (wins.length) windowGroups.push({ key: `d${d}`, label: `Desktop ${d}`, desk: d, wins });
  }

  // Each desktop icon is a thumbnail mini-map of its windows. Boxes are
  // scaled from canvas coords into a nominal viewport; they will pick up
  // per-window colour when windows grow one.
  const THUMB_VIEW = { w: 1500, h: 950 };
  const pct = (v: number, axis: number) => `${Math.min(92, Math.max(0, (v / axis) * 100))}%`;
  const desktopIcons = (
    <nav className="sidebar-desktops">
      {DESKTOP_IDS.map((d) => (
        <button
          key={d}
          data-desktop-target={d}
          title={`Desktop ${d} (${windows.filter((w) => isOnDesktop(w, d)).length} windows)`}
          className={`desk-btn${d === current ? ' current' : ''}${drag?.dropDesktop === d ? ' drop' : ''}`}
          onClick={() => switchDesktop(d)}
        >
          {windows.filter((w) => isOnDesktop(w, d) && !w.minimized).map((w) => (
            <span
              key={w.id}
              className={`thumb-box${w.id === focused ? ' focused' : ''}`}
              style={{
                left: pct(w.x, THUMB_VIEW.w),
                top: pct(w.y, THUMB_VIEW.h),
                width: `max(14%, ${pct(w.w, THUMB_VIEW.w)})`,
                height: `max(18%, ${pct(w.h, THUMB_VIEW.h)})`,
              }}
            />
          ))}
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
      style={{ ...theme.vars, colorScheme: theme.scheme } as CSSProperties}
    >
      {sidebarOpen ? (
        <aside className="sidebar">
          <div className="sidebar-head">
            <span className="sidebar-brand">gryth</span>
            <button className="sidebar-toggle" title="Collapse sidebar" onClick={() => sidebarTap?.set(false)}>&lt;</button>
          </div>
          <nav className="sidebar-launcher">
            {FACET_KINDS.map((kind) => (
              <button key={kind} title={`Open ${FACETS[kind].title}`} onClick={() => open(kind)}>
                + {FACETS[kind].title}
              </button>
            ))}
          </nav>
          {desktopIcons}
          <nav className="sidebar-windows">
            {windowGroups.map((g) => (
              <div key={g.key} className="side-group">
                {g.desk !== null ? (
                  <button
                    className={`side-group-label${g.desk === current ? ' current' : ''}`}
                    onClick={() => switchDesktop(g.desk!)}
                  >{g.label}</button>
                ) : (
                  <span className="side-group-label">{g.label}</span>
                )}
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
                      <span className="gwin-id">{w.id}</span>
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
          <Window key={w.id} win={w} focused={false} dropTarget={false} overview={null} deskAnim={deskAnimFor(w)} />
        ))}
        {shown.map((w) => (
          <Window
            key={w.id}
            win={w}
            focused={w.id === focused}
            dropTarget={drag?.dropTarget === w.id && drag.id !== w.id}
            overview={overview ? { placement: placements?.get(w.id), onPick: () => pick(w.id) } : null}
            deskAnim={deskAnimFor(w)}
          />
        ))}
        {drag?.kind === 'tab' && (
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
        {menu && menuFrame && (
          <>
            <div className="menu-backdrop" onMouseDown={() => menuTap?.set(null)} />
            <div className="win-menu" style={{ left: menu.x, top: menu.y }}>
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
      </div>
      {drag && (
        <div
          className={`drag-overlay ${drag.kind}`}
          onMouseMove={(e) => dragMove(e.clientX, e.clientY)}
          onMouseUp={(e) => dragEnd(e.clientX, e.clientY)}
          onMouseLeave={(e) => dragEnd(e.clientX, e.clientY)}
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
    </div>
  );
}
