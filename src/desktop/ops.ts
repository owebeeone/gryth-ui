import type { FacetKind, SnapTarget, WindowRecord } from '../grips.desktop';

// Pure transforms over the desktop document (the DESKTOP_WINDOWS list).
// Window chrome applies these through the atom tap handle; headless
// participants (tests, agents) can apply the same transforms — the desktop
// has no UI-only behavior.

export const MIN_W = 220;
export const MIN_H = 140;
// Titlebar hit-band height for header-drop tabbing. CSS pins
// .gwin-titlebar to this same height — keep them in sync.
export const TITLEBAR_H = 32;
// Fixed virtual-desktop set for now; dynamic desktops when the desktop
// document earns a schema of its own.
export const DESKTOP_IDS = [1, 2, 3, 4];
const CASCADE = 28;
const ORIGIN = 48;

export function nextWindowId(list: WindowRecord[]): string {
  const max = list.reduce((acc, w) => {
    const n = Number(w.id.replace(/^w/, ''));
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `w${max + 1}`;
}

export function nextTabId(list: WindowRecord[]): string {
  const max = list.reduce((acc, w) => w.tabs.reduce((a, t) => {
    const n = Number(t.id.replace(/^t/, ''));
    return Number.isFinite(n) && n > a ? n : a;
  }, acc), 0);
  return `t${max + 1}`;
}

export function openWindow(
  list: WindowRecord[],
  facet: FacetKind,
  size: { w: number; h: number },
  desktop: number = 1,
): { list: WindowRecord[]; id: string } {
  const id = nextWindowId(list);
  const tabId = nextTabId(list);
  const step = list.length % 8;
  const win: WindowRecord = {
    id,
    tabs: [{ id: tabId, facet }],
    activeTab: tabId,
    x: ORIGIN + step * CASCADE,
    y: ORIGIN + step * CASCADE,
    w: size.w,
    h: size.h,
    minimized: false,
    desktop,
    sticky: false,
  };
  return { list: [...list, win], id };
}

export function closeWindow(list: WindowRecord[], id: string): WindowRecord[] {
  return list.filter((w) => w.id !== id);
}

export function raiseWindow(list: WindowRecord[], id: string): WindowRecord[] {
  const win = list.find((w) => w.id === id);
  if (!win || list[list.length - 1] === win) return list;
  return [...list.filter((w) => w.id !== id), win];
}

export function minimizeWindow(list: WindowRecord[], id: string, minimized: boolean): WindowRecord[] {
  return list.map((w) => (w.id === id ? { ...w, minimized } : w));
}

export function moveWindow(list: WindowRecord[], id: string, x: number, y: number): WindowRecord[] {
  return list.map((w) => (w.id === id ? { ...w, x: Math.max(0, x), y: Math.max(0, y) } : w));
}

// Mid-drag movement: unclamped, so the frame visibly follows the pointer
// over the sidebar (drop targets live there). On release the caller either
// snaps back, sends to a desktop, or settles with the clamped moveWindow.
export function moveWindowFree(list: WindowRecord[], id: string, x: number, y: number): WindowRecord[] {
  return list.map((w) => (w.id === id ? { ...w, x, y } : w));
}

export function resizeWindow(list: WindowRecord[], id: string, w: number, h: number): WindowRecord[] {
  return list.map((win) => (win.id === id
    // a manual resize forgets snap memory
    ? { ...win, w: Math.max(MIN_W, w), h: Math.max(MIN_H, h), presnap: undefined }
    : win));
}

// Header-drop tabbing: the dragged frame's tabs move into the target frame;
// the dragged frame disappears; the target is raised and shows the tab the
// user was holding.
export function mergeWindows(list: WindowRecord[], sourceId: string, targetId: string): WindowRecord[] {
  if (sourceId === targetId) return list;
  const source = list.find((w) => w.id === sourceId);
  const target = list.find((w) => w.id === targetId);
  if (!source || !target) return list;
  const merged: WindowRecord = {
    ...target,
    tabs: [...target.tabs, ...source.tabs],
    activeTab: source.activeTab,
  };
  return [...list.filter((w) => w.id !== sourceId && w.id !== targetId), merged];
}

export function selectTab(list: WindowRecord[], frameId: string, tabId: string): WindowRecord[] {
  return list.map((w) => (w.id === frameId && w.tabs.some((t) => t.id === tabId)
    ? { ...w, activeTab: tabId }
    : w));
}

export function closeTab(list: WindowRecord[], frameId: string, tabId: string): WindowRecord[] {
  const frame = list.find((w) => w.id === frameId);
  if (!frame) return list;
  const index = frame.tabs.findIndex((t) => t.id === tabId);
  if (index < 0) return list;
  const tabs = frame.tabs.filter((t) => t.id !== tabId);
  if (tabs.length === 0) return closeWindow(list, frameId);
  const activeTab = frame.activeTab === tabId
    ? (tabs[index] ?? tabs[tabs.length - 1]).id
    : frame.activeTab;
  return list.map((w) => (w.id === frameId ? { ...w, tabs, activeTab } : w));
}

// Which frame's titlebar contains the point (canvas coords)? Topmost wins;
// the dragged frame and minimized frames are not drop targets.
export function hitTitlebar(list: WindowRecord[], x: number, y: number, excludeId: string): string | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i];
    if (w.id === excludeId || w.minimized) continue;
    if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + TITLEBAR_H) return w.id;
  }
  return null;
}

// Tab drag-out: re-float a tab as its own frame at a canvas position. The
// tab record (and id) is preserved. Detaching a frame's only tab just moves
// the frame. The new/moved frame lands on `desktop`, topmost.
export function detachTab(
  list: WindowRecord[],
  frameId: string,
  tabId: string,
  pos: { x: number; y: number },
  size: { w: number; h: number },
  desktop: number,
): { list: WindowRecord[]; id: string } {
  const frame = list.find((w) => w.id === frameId);
  const tab = frame?.tabs.find((t) => t.id === tabId);
  if (!frame || !tab) return { list, id: frameId };
  if (frame.tabs.length === 1) {
    const moved = raiseWindow(
      sendToDesktop(moveWindow(list, frameId, pos.x, pos.y), frameId, desktop),
      frameId,
    );
    return { list: moved, id: frameId };
  }
  const without = closeTab(list, frameId, tabId);
  const win: WindowRecord = {
    id: nextWindowId(without),
    tabs: [tab],
    activeTab: tab.id,
    x: Math.max(0, pos.x),
    y: Math.max(0, pos.y),
    w: size.w,
    h: size.h,
    minimized: false,
    desktop,
    sticky: false,
  };
  return { list: [...without, win], id: win.id };
}

// Drop a tab on another frame's titlebar: move it there and show it. Moving
// a tab onto its own frame selects it. An emptied source frame closes.
export function moveTab(
  list: WindowRecord[],
  sourceId: string,
  tabId: string,
  targetId: string,
): WindowRecord[] {
  if (sourceId === targetId) return selectTab(list, sourceId, tabId);
  const source = list.find((w) => w.id === sourceId);
  const target = list.find((w) => w.id === targetId);
  const tab = source?.tabs.find((t) => t.id === tabId);
  if (!source || !target || !tab) return list;
  const without = closeTab(list, sourceId, tabId);
  const placed = without.map((w) => (w.id === targetId
    ? { ...w, tabs: [...w.tabs, tab], activeTab: tab.id }
    : w));
  return raiseWindow(placed, targetId);
}

export function sendToDesktop(list: WindowRecord[], frameId: string, desktop: number): WindowRecord[] {
  return list.map((w) => (w.id === frameId ? { ...w, desktop } : w));
}

export function setSticky(list: WindowRecord[], frameId: string, sticky: boolean): WindowRecord[] {
  return list.map((w) => (w.id === frameId ? { ...w, sticky } : w));
}

export function isOnDesktop(w: WindowRecord, desktop: number): boolean {
  return w.sticky || w.desktop === desktop;
}

// Edge snap: the area a snap target resolves to. Halves tile the area
// exactly — the right half absorbs an odd pixel boundary.
export function snapRect(target: SnapTarget, area: { w: number; h: number }): { x: number; y: number; w: number; h: number } {
  if (target === 'full') return { x: 0, y: 0, w: area.w, h: area.h };
  const half = Math.floor(area.w / 2);
  return target === 'left'
    ? { x: 0, y: 0, w: half, h: area.h }
    : { x: half, y: 0, w: area.w - half, h: area.h };
}

export function snapWindow(
  list: WindowRecord[],
  id: string,
  target: SnapTarget,
  area: { w: number; h: number },
): WindowRecord[] {
  const r = snapRect(target, area);
  return list.map((w) => (w.id === id
    ? {
      ...w, x: r.x, y: r.y, w: r.w, h: r.h, minimized: false,
      // remember the ORIGINAL geometry across re-snaps
      presnap: w.presnap ?? { x: w.x, y: w.y, w: w.w, h: w.h },
    }
    : w));
}

// Keep every window on the desktop after the canvas resizes: shrink frames
// larger than the canvas, pull stranded frames back inside. Returns the SAME
// list reference when nothing changes (no notification churn).
export function clampAllWindows(list: WindowRecord[], area: { w: number; h: number }): WindowRecord[] {
  if (area.w <= 0 || area.h <= 0) return list;
  let changed = false;
  const next = list.map((win) => {
    const w = Math.min(win.w, area.w);
    const h = Math.min(win.h, area.h);
    const x = Math.min(Math.max(0, win.x), area.w - w);
    const y = Math.min(Math.max(0, win.y), area.h - h);
    if (w === win.w && h === win.h && x === win.x && y === win.y) return win;
    changed = true;
    return { ...win, x, y, w, h };
  });
  return changed ? next : list;
}

// Dragging a snapped frame away restores its remembered size; the drag owns
// the position. No-op for frames with no snap memory.
export function unsnapSize(list: WindowRecord[], id: string): WindowRecord[] {
  return list.map((w) => (w.id === id && w.presnap
    ? { ...w, w: w.presnap.w, h: w.presnap.h, presnap: undefined }
    : w));
}

// Overview (Mission Control / App Exposé): grid placements for the given
// windows inside an area. TRUE scaling — the desktop document is untouched;
// placements are presentation-only transforms the chrome applies. Windows
// fill cells in z-order; scale never exceeds 1.
export interface OverviewPlacement {
  x: number;
  y: number;
  scale: number;
}

export function overviewLayout(
  wins: WindowRecord[],
  area: { w: number; h: number },
  pad: number = 24,
): Map<string, OverviewPlacement> {
  const out = new Map<string, OverviewPlacement>();
  const n = wins.length;
  if (n === 0) return out;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = (area.w - pad * (cols + 1)) / cols;
  const cellH = (area.h - pad * (rows + 1)) / rows;
  wins.forEach((w, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const scale = Math.min(cellW / w.w, cellH / w.h, 1);
    out.set(w.id, {
      x: pad + col * (cellW + pad) + (cellW - w.w * scale) / 2,
      y: pad + row * (cellH + pad) + (cellH - w.h * scale) / 2,
      scale,
    });
  });
  return out;
}
