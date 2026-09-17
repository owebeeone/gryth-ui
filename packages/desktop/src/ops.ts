import type { AreaEdge, FacetKind, FoundationDef, LayoutNode, SnapTarget, WindowDrag, WindowRecord } from './grips.desktop';

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
  params?: Record<string, unknown>,
  source?: string,
): { list: WindowRecord[]; id: string } {
  const id = nextWindowId(list);
  const tabId = nextTabId(list);
  const step = list.length % 8;
  const win: WindowRecord = {
    id,
    tabs: [{ id: tabId, facet, params, source }],
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

// What each tool ROLE says: the KIND of area a tool belongs in, keyed by
// tool id (ToolDef.role, projected by facets.toolRoles). A plugin declares
// it once and every preset that has a leaf of that name honors it, so a
// preset never has to name another package's tools.
export type RoleMap = Partial<Record<FacetKind, string>>;

// The one docking-home rule, shared by every path that places a window on a
// foundation: the preset's own designation wins (it is the desk owner's
// override), else the tool's role when this preset HAS an area of that name,
// else the fallback. A role naming no area of this preset is not an error —
// the preset simply has no such home.
export function dockingHome(def: FoundationDef, facet: FacetKind, roles: RoleMap = {}): string {
  const designated = def.designate[facet];
  if (designated !== undefined) {
    return designated;
  }
  const role = roles[facet];
  if (role !== undefined && collectLeaves(def.layout).some((leaf) => leaf.id === role)) {
    return role;
  }
  return def.fallback;
}

// Open a tool from a LINK (toolId + serializable params): the one open
// path shared by the launcher, plugins, and agents (the Desktop.OpenTool
// intent). v1 window policy: ALWAYS a new window — find-or-switch is a
// later optimization. On a gridded desktop the new window docks straight
// into its designated home (tabbing with any occupant).
export function openToolWindow(
  list: WindowRecord[],
  facet: FacetKind,
  size: { w: number; h: number },
  desktop: number,
  params?: Record<string, unknown>,
  source?: string,
  roles: RoleMap = {},
): { list: WindowRecord[]; id: string; focusId: string } {
  const result = openWindow(list, facet, size, desktop, params, source);
  let next = result.list;
  let focusId = result.id;
  const f = foundationOn(next, desktop);
  if (f?.foundation) {
    const dm = dockOrMerge(next, result.id, f.id, dockingHome(f.foundation, facet, roles));
    next = dm.list;
    focusId = dm.frameId;
  }
  return { list: next, id: result.id, focusId };
}

// Find an existing SINK wired to `source` showing `facet` — the "current
// editor" lookup behind Desktop.OpenWired. Returns the frame AND the tab
// (both are needed to reveal it: on a locked desk the sink is one tab of a
// tabbed area, so the frame alone does not say what to show), or null when
// there is none and one must be spawned.
export interface WiredTab { frameId: string; tabId: string }
export function findWiredTab(
  list: WindowRecord[],
  source: string,
  facet: FacetKind,
): WiredTab | null {
  for (const w of list) {
    const tab = w.tabs.find((t) => t.source === source && t.facet === facet);
    if (tab !== undefined) {
      return { frameId: w.id, tabId: tab.id };
    }
  }
  return null;
}

// WIRE an EXISTING tab as the SINK of another — the relation Desktop.OpenWired
// makes when it spawns a sink, made after the fact for a sink that outlived
// its source. The source is named by TOOL and resolved here to that tool's
// most recently focused tab (last in z-order), because a sink that has just
// asked the shell to OPEN its source cannot know the tab id the shell assigned
// it — and the shell does. Only the RECORD is written: the chrome adds the
// source's context as a parent on the next render (Window.tsx, wireTabSource),
// which is the same path a sink opened wired takes.
//
// Returns the SAME list when there is nothing to do: no such sink tab, no tab
// of that tool, or the wire already being the one asked for (idempotent, so a
// repeated call notifies nobody).
export function setTabSource(
  list: WindowRecord[],
  tabId: string,
  sourceFacet: FacetKind,
): WindowRecord[] {
  let source: string | undefined;
  for (const w of list) {
    for (const t of w.tabs) {
      if (t.facet === sourceFacet && t.id !== tabId) {
        source = t.id;
      }
    }
  }
  if (source === undefined) {
    return list;
  }
  const frame = list.find((w) => w.tabs.some((t) => t.id === tabId));
  if (!frame || frame.tabs.find((t) => t.id === tabId)?.source === source) {
    return list;
  }
  return list.map((w) => (w === frame
    ? { ...w, tabs: w.tabs.map((t) => (t.id === tabId ? { ...t, source } : t)) }
    : w));
}

// Replace a tab's LINK params in place — the "send to an EXISTING window"
// half of link invocation (Desktop.RetargetTab). The view re-resolves
// against the new params. Returns the SAME list when the tab is unknown.
export function setTabParams(
  list: WindowRecord[],
  tabId: string,
  params: Record<string, unknown>,
): WindowRecord[] {
  const frame = list.find((w) => w.tabs.some((t) => t.id === tabId));
  if (!frame) return list;
  return list.map((w) => (w === frame
    ? { ...w, tabs: w.tabs.map((t) => (t.id === tabId ? { ...t, params } : t)) }
    : w));
}

// PIN/FREEZE a tab: snapshot params onto it and CUT its wire (clear source),
// so it stops following and becomes a standalone view. The chrome drops the
// context edge on the next render (source gone). Same list when unknown.
export function freezeTab(
  list: WindowRecord[],
  tabId: string,
  params: Record<string, unknown>,
): WindowRecord[] {
  const frame = list.find((w) => w.tabs.some((t) => t.id === tabId));
  if (!frame) return list;
  return list.map((w) => (w === frame
    ? { ...w, tabs: w.tabs.map((t) => (t.id === tabId ? { ...t, params, source: undefined } : t)) }
    : w));
}

export function closeWindow(list: WindowRecord[], id: string): WindowRecord[] {
  // a docked frame leaving may empty an ephemeral split area
  return normalizeFoundations(list.filter((w) => w.id !== id));
}

export function raiseWindow(list: WindowRecord[], id: string): WindowRecord[] {
  const win = list.find((w) => w.id === id);
  if (!win || list[list.length - 1] === win) return list;
  return [...list.filter((w) => w.id !== id), win];
}

/** The frames of one desktop, ready to render: the DOM order and the z. */
export interface FrameStack {
  /** Document order — by frame id, so it NEVER changes when the z-order does. */
  order: WindowRecord[];
  /** Each frame's place in the z-order, 1 at the bottom. */
  z: ReadonlyMap<string, number>;
}

/**
 * Z-ORDER IS A STYLE, NOT A DOCUMENT ORDER.
 *
 * The record list is the z-order — `raiseWindow` moves a record to its end —
 * and rendering the frames in that order made a raise move the frame's DOM
 * NODE: React reorders keyed children with `insertBefore`, which takes the
 * node out of the document and puts it back, and a node that leaves the
 * document loses the scroll position of everything inside it. One mousedown
 * on a scrolled tool then snapped it back to the top before the click it
 * carried had landed — found on the Gyld stream tree, where picking the last
 * stream in a long list scrolled the list away from the reader.
 *
 * So the document order is the frame id, a fact no act moves, and the z-order
 * rides as an explicit z-index inside the frames' own stacking layer
 * (`.gwin-layer`, which is what keeps that band under the foundation's
 * splitters however many frames a desk carries).
 */
export function frameStack(frames: readonly WindowRecord[]): FrameStack {
  return {
    order: [...frames].sort((a, b) => a.id.localeCompare(b.id)),
    z: new Map(frames.map((w, index) => [w.id, index + 1])),
  };
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
    // a manual resize releases an edge snap
    ? { ...win, w: Math.max(MIN_W, w), h: Math.max(MIN_H, h), snap: undefined }
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
  // the absorbed frame's dock disappears with it
  return normalizeFoundations([...list.filter((w) => w.id !== sourceId && w.id !== targetId), merged]);
}

export function selectTab(list: WindowRecord[], frameId: string, tabId: string): WindowRecord[] {
  return list.map((w) => (w.id === frameId && w.tabs.some((t) => t.id === tabId)
    ? { ...w, activeTab: tabId }
    : w));
}

// REVEAL the frame an act just landed on — raise it, show the tab it landed
// on, and mark it for the chrome's cue. Every shell intent that delivers an
// act to a window ends here (taps.desktop's `reveal`).
//
// Showing the TAB is the part a floating desk never needed: on a LOCKED desk
// the sink sits in a tabbed area (the Gyld desk tabs Ask, Details and decide
// into one inspector), so retargeting it under a hidden tab changes nothing
// the reader can see. A minimized frame is restored for the same reason — an
// act that lands where nobody can see it has not landed.
//
// The transient mark is a STAMP (see WindowRecord.attention) and only ONE
// frame carries one: an act that moves a browser and THEN opens a sink wired
// to it (the Gyld node menu does exactly that, in one turn) must leave the
// reader with one cue — the window that answered — not a trail of them.
//
// Geometry is untouched, and the SAME list comes back when there is no such
// frame.
export function revealFrame(list: WindowRecord[], frameId: string, tabId?: string): WindowRecord[] {
  if (!list.some((w) => w.id === frameId)) {
    return list;
  }
  const stamp = list.reduce((max, w) => Math.max(max, w.attention ?? 0), 0) + 1;
  return raiseWindow(list, frameId).map((w) => {
    if (w.id !== frameId) {
      return w.attention === undefined ? w : { ...w, attention: undefined };
    }
    const shows = tabId !== undefined && w.tabs.some((t) => t.id === tabId);
    return {
      ...w,
      activeTab: shows ? tabId : w.activeTab,
      minimized: false,
      attention: stamp,
    };
  });
}

// Drop every attention mark: what ./attention's sweep applies when the cue's
// interval is up. Returns the SAME list when there is nothing marked, so a
// sweep over a quiet desk notifies nobody.
export function clearAttention(list: WindowRecord[]): WindowRecord[] {
  if (!list.some((w) => w.attention !== undefined)) {
    return list;
  }
  return list.map((w) => (w.attention === undefined ? w : { ...w, attention: undefined }));
}

// The frame's attention class, ready to concatenate into the chrome's
// className (leading space, like every other flag there) — `desktop.css`
// tints the titlebar for as long as the mark is set, which is also the
// prefers-reduced-motion reader's whole cue.
export function attentionClass(win: WindowRecord): string {
  return win.attention === undefined ? '' : ' attention';
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
    // a docked single-tab frame dragged out floats again (dock cleared)
    const moved = raiseWindow(
      sendToDesktop(moveWindow(undockWindow(list, frameId), frameId, pos.x, pos.y), frameId, desktop),
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

// Snap is a SYMBOLIC dock onto the implicit 2×1/1×1 grid: only the target
// is stored; placeWindows substitutes the live rect every render, so the
// frame stays glued to its half through canvas resizes. The record's own
// geometry is untouched — it remains the float memory.
export function snapWindow(list: WindowRecord[], id: string, target: SnapTarget): WindowRecord[] {
  return list.map((w) => (w.id === id
    ? { ...w, snap: target, dock: undefined, minimized: false }
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

// Release an edge snap: the frame floats again at its remembered (float
// memory) geometry. No-op for unsnapped frames.
export function unsnapWindow(list: WindowRecord[], id: string): WindowRecord[] {
  return list.map((w) => (w.id === id && w.snap ? { ...w, snap: undefined } : w));
}

// ---------------------------------------------------------------------------
// Foundation windows: layout-tree math and dock transforms. All pure.

export interface Rect { x: number; y: number; w: number; h: number }

const r2 = (v: number) => Math.round(v * 100) / 100;

// Leaf rects of a layout tree inside `rect`. Interior nodes split space
// along `direction` by child `size` weights; leaves are AREAS.
export function areaRects(node: LayoutNode, rect: Rect, out: Map<string, Rect> = new Map()): Map<string, Rect> {
  if (!node.children || node.children.length === 0) {
    out.set(node.id, { x: r2(rect.x), y: r2(rect.y), w: r2(rect.w), h: r2(rect.h) });
    return out;
  }
  const total = node.children.reduce((acc, c) => acc + c.size, 0) || 1;
  let offset = 0;
  for (const child of node.children) {
    const frac = child.size / total;
    const r = node.direction === 'column'
      ? { x: rect.x, y: rect.y + rect.h * offset, w: rect.w, h: rect.h * frac }
      : { x: rect.x + rect.w * offset, y: rect.y, w: rect.w * frac, h: rect.h };
    areaRects(child, r, out);
    offset += frac;
  }
  return out;
}

function nextLayoutId(layout: LayoutNode, prefix: string): string {
  let max = 0;
  const walk = (n: LayoutNode) => {
    const m = n.id.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
    n.children?.forEach(walk);
  };
  walk(layout);
  return `${prefix}${max + 1}`;
}

// Split a box: the leaf becomes an interior node; the ORIGINAL area keeps
// its id (docks stay valid). The new empty area (dockable hole) takes the
// trailing half, or the leading half when `newFirst` (left/top edge drops).
export function splitArea(
  layout: LayoutNode,
  areaId: string,
  direction: 'row' | 'column',
  newFirst: boolean = false,
  ephemeral: boolean = false,
): { layout: LayoutNode; newAreaId: string } {
  const interiorId = nextLayoutId(layout, 'n');
  const newAreaId = nextLayoutId(layout, 'a');
  const walk = (n: LayoutNode): LayoutNode => {
    if (!n.children || n.children.length === 0) {
      if (n.id !== areaId) return n;
      const fresh: LayoutNode = ephemeral
        ? { id: newAreaId, size: 50, ephemeral: true }
        : { id: newAreaId, size: 50 };
      const old: LayoutNode = { id: n.id, size: 50, ephemeral: n.ephemeral };
      const halves = newFirst ? [fresh, old] : [old, fresh];
      return { id: interiorId, size: n.size, direction, children: halves };
    }
    return { ...n, children: n.children.map(walk) };
  };
  return { layout: walk(layout), newAreaId };
}

function collectLeaves(node: LayoutNode, out: LayoutNode[] = []): LayoutNode[] {
  if (!node.children || node.children.length === 0) out.push(node);
  else node.children.forEach((c) => collectLeaves(c, out));
  return out;
}

// Housekeeping after any dock-removing mutation: occupants of an ephemeral
// split-half migrate home when the original (non-ephemeral) sibling
// empties; ephemeral areas with no remaining docked reference (minimized
// included) merge back into their sibling; and dock refs pointing at areas
// that no longer exist are cleared. Returns the SAME list reference when
// nothing changes.
export function normalizeFoundations(list: WindowRecord[]): WindowRecord[] {
  let next = list;
  let changed = false;
  for (const f of list.filter((w) => w.foundation)) {
    let layout = f.foundation!.layout;
    let layoutChanged = false;
    const refs = (areaId: string) =>
      next.filter((w) => w.dock?.foundation === f.id && w.dock.area === areaId);
    // migration: an occupied ephemeral half must not outlive an EMPTY
    // non-ephemeral sibling — its tenants move home (the ephemeral then
    // empties and the collapse below removes it)
    const migrate = (node: LayoutNode) => {
      if (!node.children) return;
      node.children.forEach(migrate);
      if (node.children.length !== 2) return;
      const [a, b] = node.children;
      const isLeaf = (n: LayoutNode) => !n.children || n.children.length === 0;
      if (!isLeaf(a) || !isLeaf(b)) return;
      const pairs: [LayoutNode, LayoutNode][] = [[a, b], [b, a]];
      for (const [eph, home] of pairs) {
        if (eph.ephemeral && !home.ephemeral && refs(eph.id).length > 0 && refs(home.id).length === 0) {
          next = next.map((w) => (w.dock?.foundation === f.id && w.dock.area === eph.id
            ? { ...w, dock: { foundation: f.id, area: home.id } }
            : w));
          changed = true;
          return;
        }
      }
    };
    migrate(layout);
    for (;;) {
      const empty = collectLeaves(layout).find((leaf) => leaf.ephemeral
        && !next.some((w) => w.dock?.foundation === f.id && w.dock.area === leaf.id));
      if (!empty) break;
      layout = closeArea(layout, empty.id);
      layoutChanged = true;
    }
    if (layoutChanged) {
      next = next.map((w) => (w.id === f.id ? { ...w, foundation: { ...w.foundation!, layout } } : w));
      changed = true;
    }
    const areaIds = new Set(collectLeaves(layout).map((leaf) => leaf.id));
    if (next.some((w) => w.dock?.foundation === f.id && !areaIds.has(w.dock.area))) {
      next = next.map((w) => (w.dock?.foundation === f.id && !areaIds.has(w.dock.area)
        ? { ...w, dock: undefined }
        : w));
      changed = true;
    }
  }
  return changed ? next : list;
}

// Close an area: remove the leaf; a parent left with one child collapses
// into it. The root leaf cannot be closed (returns the layout unchanged).
export function closeArea(layout: LayoutNode, areaId: string): LayoutNode {
  const walk = (n: LayoutNode): LayoutNode | null => {
    if (!n.children || n.children.length === 0) return n.id === areaId ? null : n;
    const children = n.children.map(walk).filter((c): c is LayoutNode => c !== null);
    if (children.length === 0) return null;
    if (children.length === 1) return { ...children[0], size: n.size };
    return { ...n, children };
  };
  return walk(layout) ?? layout;
}

// Splitter resize: apply absolute sizes to the boundary pair of an interior
// node. Minimum fractions are per side — an EMPTY side (no docked windows
// anywhere under it) may shrink to a sliver, an occupied one keeps 8%.
export function setSplitSizes(
  layout: LayoutNode,
  interiorId: string,
  index: number,
  a: number,
  b: number,
  minAFrac: number = 0.08,
  minBFrac: number = 0.08,
): LayoutNode {
  const walk = (n: LayoutNode): LayoutNode => {
    if (!n.children) return n;
    if (n.id !== interiorId) return { ...n, children: n.children.map(walk) };
    const pair = a + b;
    const aClamped = Math.min(Math.max(a, pair * minAFrac), pair - pair * minBFrac);
    const children = n.children.map((c, i) => (i === index
      ? { ...c, size: aClamped }
      : i === index + 1 ? { ...c, size: pair - aClamped } : c));
    return { ...n, children };
  };
  return walk(layout);
}

// Leaf area ids under one child of an interior node (for occupancy-aware
// splitter minimums).
export function childLeafIds(layout: LayoutNode, interiorId: string, index: number): string[] {
  let found: LayoutNode | undefined;
  const find = (n: LayoutNode) => {
    if (n.id === interiorId) found = n;
    else n.children?.forEach(find);
  };
  find(layout);
  const child = found?.children?.[index];
  return child ? collectLeaves(child).map((leaf) => leaf.id) : [];
}

// Effective geometry: foundations render maximized to the canvas as pure
// scaffolding (no chrome — areas span the whole canvas); docked frames take
// their area's rect; a dangling dock degrades to the frame's float memory,
// which is never overwritten. Returns records with substituted geometry so
// every geometry consumer (render, hit-testing, overview, thumbnails) can
// stay signature-stable.
export function placeWindows(list: WindowRecord[], area: { w: number; h: number }): WindowRecord[] {
  if (area.w <= 0 || area.h <= 0) return list;
  const rectsByFoundation = new Map<string, Map<string, Rect>>();
  for (const w of list) {
    if (w.foundation) {
      const body = { x: 0, y: 0, w: area.w, h: area.h };
      rectsByFoundation.set(w.id, areaRects(w.foundation.layout, body));
    }
  }
  return list.map((w) => {
    if (w.foundation) return { ...w, x: 0, y: 0, w: area.w, h: area.h };
    if (w.dock) {
      const r = rectsByFoundation.get(w.dock.foundation)?.get(w.dock.area);
      if (r) return { ...w, x: r.x, y: r.y, w: r.w, h: r.h };
    }
    if (w.snap) {
      const r = snapRect(w.snap, area);
      return { ...w, x: r.x, y: r.y, w: r.w, h: r.h };
    }
    return w;
  });
}

export function dockWindow(list: WindowRecord[], id: string, foundation: string, area: string): WindowRecord[] {
  // re-docking elsewhere may empty the frame's previous ephemeral area;
  // dock and snap are exclusive homes
  return normalizeFoundations(
    list.map((w) => (w.id === id ? { ...w, dock: { foundation, area }, snap: undefined, minimized: false } : w)),
  );
}

// Dock into an area, tabbing with the occupant when there is one: windows
// allocated to the same area become ONE tabbed frame, never a hidden stack.
// Returns the surviving frame id (the occupant when merged).
export function dockOrMerge(
  list: WindowRecord[],
  id: string,
  foundation: string,
  area: string,
): { list: WindowRecord[]; frameId: string } {
  const occupant = areaOccupants(list, foundation, area).find((w) => w.id !== id);
  if (occupant) return { list: mergeWindows(list, id, occupant.id), frameId: occupant.id };
  return { list: dockWindow(list, id, foundation, area), frameId: id };
}

export function undockWindow(list: WindowRecord[], id: string): WindowRecord[] {
  return normalizeFoundations(
    list.map((w) => (w.id === id && w.dock ? { ...w, dock: undefined } : w)),
  );
}

// Create a foundation on a desktop and adopt its floaters: remembered
// assignments first (grid memory), then the docking home each facet
// resolves to (designation, role, fallback). Sticky floaters, minimized
// frames, and other foundations are skipped.
export function openFoundation(
  list: WindowRecord[],
  desktop: number,
  def: FoundationDef,
  assignments: Record<string, string> = {},
  roles: RoleMap = {},
): { list: WindowRecord[]; id: string } {
  const id = nextWindowId(list);
  const tabId = nextTabId(list);
  const leafIds = new Set(collectLeaves(def.layout).map((leaf) => leaf.id));
  let adopted = list.map((w) => {
    if (w.desktop !== desktop || w.sticky || w.minimized || w.foundation || w.dock) return w;
    const remembered = assignments[w.id];
    const facet = (w.tabs.find((t) => t.id === w.activeTab) ?? w.tabs[0]).facet;
    const area = (remembered && leafIds.has(remembered))
      ? remembered
      : dockingHome(def, facet, roles);
    // adoption docks the frame; an edge snap yields (exclusive homes)
    return { ...w, dock: { foundation: id, area }, snap: undefined };
  });
  // multiply-allocated areas tab together: fold later arrivals into the
  // first frame per area
  const firstByArea = new Map<string, string>();
  for (const w of [...adopted]) {
    if (w.dock?.foundation !== id) continue;
    const first = firstByArea.get(w.dock.area);
    if (!first) firstByArea.set(w.dock.area, w.id);
    else adopted = mergeWindows(adopted, w.id, first);
  }
  const foundation: WindowRecord = {
    id,
    tabs: [{ id: tabId, facet: 'grid' }],
    activeTab: tabId,
    x: 24, y: 24, w: 640, h: 480, // float memory if foundations ever window
    minimized: false,
    desktop,
    sticky: false,
    foundation: def,
  };
  // sweep: a restored layout may carry ephemeral areas whose occupants are
  // gone — they collapse immediately
  return { list: normalizeFoundations([...adopted, foundation]), id };
}

// Grid memory: what unlock stashes so re-locking restores the same layout
// (splits and sizes included) and the same homes for surviving windows.
export interface GridStash {
  def: FoundationDef;
  assignments: Record<string, string>;
}

export function captureGrid(list: WindowRecord[], desktop: number): GridStash | null {
  const f = foundationOn(list, desktop);
  if (!f?.foundation) return null;
  const assignments: Record<string, string> = {};
  for (const w of list) {
    if (w.dock?.foundation === f.id) assignments[w.id] = w.dock.area;
  }
  return { def: f.foundation, assignments };
}

// Close a foundation: every window docked to it falls back to its float
// memory (docks cleared), the foundation is removed.
export function closeFoundation(list: WindowRecord[], id: string): WindowRecord[] {
  return list
    .filter((w) => w.id !== id)
    .map((w) => (w.dock?.foundation === id ? { ...w, dock: undefined } : w));
}

export function areaOccupants(list: WindowRecord[], foundation: string, area: string): WindowRecord[] {
  return list.filter((w) => w.dock?.foundation === foundation && w.dock.area === area && !w.minimized);
}

export function foundationOn(list: WindowRecord[], desktop: number): WindowRecord | undefined {
  return list.find((w) => w.foundation && w.desktop === desktop && !w.minimized);
}

// Probe the current desktop's foundation at a canvas point: which area is
// under the pointer, whether it has an occupant frame (center-drop = tab
// merge), and whether the pointer is in an edge band (drop = split that
// side). An EMPTY box cannot be split — without an occupant the whole hole
// is the drop target, so `edge` is only reported for occupied areas.
// Returns null when no foundation or the point is outside all areas.
export interface AreaProbe {
  foundationId: string;
  areaId: string;
  rect: Rect;
  occupantId: string | null;
  edge: AreaEdge | null;
}

export function probeArea(
  list: WindowRecord[],
  size: { w: number; h: number },
  desktop: number,
  canvasX: number,
  canvasY: number,
  edgeBand: number,
): AreaProbe | null {
  const f = foundationOn(list, desktop);
  if (!f?.foundation || size.w <= 0) return null;
  const body = { x: 0, y: 0, w: size.w, h: size.h };
  for (const [areaId, r] of areaRects(f.foundation.layout, body)) {
    if (canvasX < r.x || canvasX > r.x + r.w || canvasY < r.y || canvasY > r.y + r.h) continue;
    const distances: [AreaEdge, number][] = [
      ['left', canvasX - r.x],
      ['right', r.x + r.w - canvasX],
      ['top', canvasY - r.y],
      ['bottom', r.y + r.h - canvasY],
    ];
    const [edge, dist] = distances.reduce((a, b) => (b[1] < a[1] ? b : a));
    const occupant = areaOccupants(list, f.id, areaId)[0];
    return {
      foundationId: f.id,
      areaId,
      rect: r,
      occupantId: occupant?.id ?? null,
      edge: occupant && dist <= edgeBand ? edge : null,
    };
  }
  return null;
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

/** The class list of the full-window drag overlay.
 *
 * The overlay's classes are a NAMESPACE, not a description. A drag's `kind`
 * and a splitter's `axis` are document words — 'sidebar', 'row', 'column' —
 * and emitting them bare made the overlay match the shell's OWN `.sidebar`
 * rule: it inherited that rule's fixed width and its opaque panel background,
 * so every sidebar resize painted a grey panel over the sidebar for the whole
 * gesture and the live resize underneath was simply hidden. Prefixing every
 * modifier is what keeps a drag state from dressing the overlay as some other
 * element; `desktop.css` matches these prefixed names and nothing else.
 */
export function dragOverlayClass(drag: WindowDrag): string {
  const classes = ['drag-overlay', `drag-${drag.kind}`];
  if (drag.kind === 'splitter') {
    classes.push(`drag-axis-${drag.axis}`);
  }
  return classes.join(' ');
}
