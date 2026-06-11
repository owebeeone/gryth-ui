import { describe, it, expect } from 'vitest';
import {
  MIN_W, MIN_H, TITLEBAR_H, DESKTOP_IDS,
  openWindow, closeWindow, raiseWindow, minimizeWindow,
  moveWindow, resizeWindow,
  mergeWindows, selectTab, closeTab, hitTitlebar,
  detachTab, moveTab, sendToDesktop, setSticky, isOnDesktop,
  moveWindowFree, overviewLayout, snapRect, snapWindow, unsnapSize,
  clampAllWindows,
  areaRects, splitArea, closeArea, setSplitSizes,
  placeWindows, dockWindow, undockWindow, openFoundation, closeFoundation,
  dockOrMerge, probeArea, normalizeFoundations, captureGrid,
} from './ops';
import type { FacetKind, LayoutNode, WindowRecord } from '../grips.desktop';

const SIZE = { w: 400, h: 300 };

function openMany(kinds: FacetKind[]): WindowRecord[] {
  let list: WindowRecord[] = [];
  for (const k of kinds) list = openWindow(list, k, SIZE).list;
  return list;
}

describe('desktop ops', () => {
  it('opens windows with unique ids, appended topmost, cascading', () => {
    const a = openWindow([], 'chat', SIZE);
    const b = openWindow(a.list, 'chat', SIZE);
    expect(a.id).not.toBe(b.id);
    expect(b.list.map((w) => w.id)).toEqual([a.id, b.id]);
    const [w1, w2] = b.list;
    expect(w2.x).toBeGreaterThan(w1.x);
    expect(w2.y).toBeGreaterThan(w1.y);
    expect(w1.minimized).toBe(false);
  });

  it('does not reuse ids after a close', () => {
    const list = openMany(['chat', 'chat', 'chat']);
    const afterClose = closeWindow(list, list[1].id);
    const reopened = openWindow(afterClose, 'chat', SIZE);
    const ids = new Set(reopened.list.map((w) => w.id));
    expect(ids.size).toBe(reopened.list.length);
    expect(ids.has(list[2].id)).toBe(true);
    expect(reopened.id).not.toBe(list[1].id);
  });

  it('raises a window to the top (end of array), preserving the rest', () => {
    const list = openMany(['chat', 'chat', 'chat']);
    const [a, b, c] = list.map((w) => w.id);
    expect(raiseWindow(list, a).map((w) => w.id)).toEqual([b, c, a]);
    // raising the topmost is a no-op order-wise
    expect(raiseWindow(list, c).map((w) => w.id)).toEqual([a, b, c]);
  });

  it('closes and minimizes by id', () => {
    const list = openMany(['chat', 'chat']);
    const [a, b] = list.map((w) => w.id);
    expect(closeWindow(list, a).map((w) => w.id)).toEqual([b]);
    const minimized = minimizeWindow(list, b, true);
    expect(minimized.find((w) => w.id === b)?.minimized).toBe(true);
    expect(minimized.find((w) => w.id === a)?.minimized).toBe(false);
  });

  it('drag movement is unclamped; settling clamps back to the canvas', () => {
    const list = openMany(['chat']);
    const id = list[0].id;
    // mid-drag the frame follows the pointer anywhere (over the sidebar)
    const free = moveWindowFree(list, id, -180, -30);
    expect(free[0]).toMatchObject({ x: -180, y: -30 });
    // settling re-clamps
    const settled = moveWindow(free, id, free[0].x, free[0].y);
    expect(settled[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('moves with a floor of (0,0) and resizes with minimum dimensions', () => {
    const list = openMany(['chat']);
    const id = list[0].id;
    const moved = moveWindow(list, id, -50, -10);
    expect(moved[0]).toMatchObject({ x: 0, y: 0 });
    const resized = resizeWindow(list, id, 10, 10);
    expect(resized[0].w).toBe(MIN_W);
    expect(resized[0].h).toBe(MIN_H);
    const grown = resizeWindow(list, id, 800, 600);
    expect(grown[0]).toMatchObject({ w: 800, h: 600 });
  });

  it('opens frames holding one tab with a globally unique tab id', () => {
    const list = openMany(['chat', 'welcome']);
    expect(list[0].tabs).toHaveLength(1);
    expect(list[0].tabs[0].facet).toBe('chat');
    expect(list[0].activeTab).toBe(list[0].tabs[0].id);
    const tabIds = list.flatMap((w) => w.tabs.map((t) => t.id));
    expect(new Set(tabIds).size).toBe(tabIds.length);
  });

  it('merges a dragged frame into a target frame as tabs', () => {
    const list = openMany(['welcome', 'chat', 'chat']);
    const [a, b, c] = list.map((w) => w.id);
    const merged = mergeWindows(list, a, b); // drag a onto b
    expect(merged.map((w) => w.id)).toEqual([c, b]); // a gone, b raised to top
    const target = merged.find((w) => w.id === b)!;
    expect(target.tabs.map((t) => t.facet)).toEqual(['chat', 'welcome']);
    // the dragged frame's active tab becomes active in the target
    expect(target.activeTab).toBe(list[0].activeTab);
    // merging with self or a missing frame is a no-op
    expect(mergeWindows(list, a, a)).toBe(list);
    expect(mergeWindows(list, a, 'nope')).toBe(list);
  });

  it('selects tabs and closes tabs with active fallback; empty frame closes', () => {
    const list = openMany(['welcome', 'chat']);
    const [a, b] = list.map((w) => w.id);
    const merged = mergeWindows(list, a, b);
    const frame = merged.find((w) => w.id === b)!;
    const [chatTab, welcomeTab] = frame.tabs.map((t) => t.id);

    const selected = selectTab(merged, b, chatTab);
    expect(selected.find((w) => w.id === b)!.activeTab).toBe(chatTab);

    // closing the active tab falls back to a remaining tab
    const closedActive = closeTab(selected, b, chatTab);
    const after = closedActive.find((w) => w.id === b)!;
    expect(after.tabs.map((t) => t.id)).toEqual([welcomeTab]);
    expect(after.activeTab).toBe(welcomeTab);

    // closing the last tab closes the frame
    expect(closeTab(closedActive, b, welcomeTab).find((w) => w.id === b)).toBeUndefined();
  });

  it('detaches a tab into its own frame at a position, keeping the tab id', () => {
    const list = openMany(['welcome', 'chat']);
    const [a, b] = list.map((w) => w.id);
    const merged = mergeWindows(list, a, b); // b: [chat, welcome]
    const frame = merged.find((w) => w.id === b)!;
    const welcomeTab = frame.tabs.find((t) => t.facet === 'welcome')!;

    const out = detachTab(merged, b, welcomeTab.id, { x: 300, y: 200 }, SIZE, 2);
    const source = out.list.find((w) => w.id === b)!;
    expect(source.tabs.map((t) => t.facet)).toEqual(['chat']);
    const detached = out.list.find((w) => w.id === out.id)!;
    expect(detached.tabs).toEqual([welcomeTab]); // same tab record, same id
    expect(detached).toMatchObject({ x: 300, y: 200, w: SIZE.w, h: SIZE.h, desktop: 2, sticky: false });
    expect(detached.activeTab).toBe(welcomeTab.id);
    expect(out.list[out.list.length - 1].id).toBe(out.id); // topmost

    // detaching the only tab of a frame just moves the frame (and re-desktops it)
    const single = openMany(['chat']);
    const moved = detachTab(single, single[0].id, single[0].tabs[0].id, { x: 99, y: 88 }, SIZE, 3);
    expect(moved.id).toBe(single[0].id);
    expect(moved.list).toHaveLength(1);
    expect(moved.list[0]).toMatchObject({ x: 99, y: 88, desktop: 3 });
  });

  it('moves a tab between frames; an emptied source frame closes', () => {
    const list = openMany(['welcome', 'chat', 'chat']);
    const [a, b, c] = list.map((w) => w.id);
    const merged = mergeWindows(list, a, b); // b: [chat, welcome]; frames [c, b]
    const welcomeTab = merged.find((w) => w.id === b)!.tabs.find((t) => t.facet === 'welcome')!;

    const moved = moveTab(merged, b, welcomeTab.id, c);
    const target = moved.find((w) => w.id === c)!;
    expect(target.tabs.map((t) => t.facet)).toEqual(['chat', 'welcome']);
    expect(target.activeTab).toBe(welcomeTab.id);
    expect(moved[moved.length - 1].id).toBe(c); // target raised

    // moving the last tab out closes the source frame
    const chatTab = moved.find((w) => w.id === b)!.tabs[0];
    const emptied = moveTab(moved, b, chatTab.id, c);
    expect(emptied.find((w) => w.id === b)).toBeUndefined();
    expect(emptied.find((w) => w.id === c)!.tabs).toHaveLength(3);

    // moving a tab onto its own frame just selects it
    const self = moveTab(merged, b, welcomeTab.id, b);
    expect(self.find((w) => w.id === b)!.activeTab).toBe(welcomeTab.id);
    expect(self.find((w) => w.id === b)!.tabs).toHaveLength(2);
  });

  it('assigns desktops, toggles sticky, and resolves visibility', () => {
    const list = openMany(['chat']);
    const id = list[0].id;
    expect(list[0].desktop).toBe(1); // default desktop
    expect(DESKTOP_IDS).toContain(list[0].desktop);

    const sent = sendToDesktop(list, id, 3);
    expect(sent[0].desktop).toBe(3);
    expect(isOnDesktop(sent[0], 3)).toBe(true);
    expect(isOnDesktop(sent[0], 1)).toBe(false);

    const sticky = setSticky(sent, id, true);
    expect(isOnDesktop(sticky[0], 1)).toBe(true); // visible on all desktops
    expect(isOnDesktop(sticky[0], 4)).toBe(true);
  });

  it('clamps windows into the canvas after a canvas resize', () => {
    const area = { w: 800, h: 500 };
    let list = openMany(['chat']); // 400x300 at 48,48 — already inside
    const inside = clampAllWindows(list, area);
    expect(inside).toBe(list); // unchanged -> same reference (no churn)

    // pushed off to the right/bottom -> pulled back in
    list = moveWindowFree(list, list[0].id, 700, 450);
    const pulled = clampAllWindows(list, area);
    expect(pulled[0]).toMatchObject({ x: 400, y: 200, w: 400, h: 300 });

    // bigger than the canvas -> shrunk to fit at the origin
    const big = [{ ...list[0], x: 100, y: 100, w: 1000, h: 700 }];
    const shrunk = clampAllWindows(big, area);
    expect(shrunk[0]).toMatchObject({ x: 0, y: 0, w: 800, h: 500 });

    // a zero-size area (canvas not laid out yet) is a no-op
    expect(clampAllWindows(list, { w: 0, h: 0 })).toBe(list);
  });

  it('computes snap rects and applies them to a frame', () => {
    const area = { w: 1201, h: 800 };
    expect(snapRect('full', area)).toEqual({ x: 0, y: 0, w: 1201, h: 800 });
    expect(snapRect('left', area)).toEqual({ x: 0, y: 0, w: 600, h: 800 });
    expect(snapRect('right', area)).toEqual({ x: 600, y: 0, w: 601, h: 800 });
    // halves tile the area exactly (no gap, no overlap, odd widths included)
    const l = snapRect('left', area);
    const r = snapRect('right', area);
    expect(l.w + r.w).toBe(area.w);
    expect(r.x).toBe(l.x + l.w);

    const list = openMany(['chat', 'chat']);
    const snapped = snapWindow(list, list[0].id, 'left', area);
    expect(snapped[0]).toMatchObject({ x: 0, y: 0, w: 600, h: 800 });
    expect(snapped[1]).toMatchObject({ x: list[1].x, y: list[1].y }); // others untouched
  });

  it('remembers pre-snap geometry and restores it on unsnap', () => {
    const area = { w: 1200, h: 800 };
    const list = openMany(['chat']); // 400x300 at 48,48
    const id = list[0].id;
    const snapped = snapWindow(list, id, 'left', area);
    expect(snapped[0].presnap).toEqual({ x: 48, y: 48, w: 400, h: 300 });
    // re-snapping keeps the ORIGINAL pre-snap geometry
    const resnapped = snapWindow(snapped, id, 'right', area);
    expect(resnapped[0].presnap).toEqual({ x: 48, y: 48, w: 400, h: 300 });
    // unsnap restores size (position is the drag's business) and clears
    const un = unsnapSize(resnapped, id);
    expect(un[0]).toMatchObject({ w: 400, h: 300 });
    expect(un[0].presnap).toBeUndefined();
    // unsnap with no presnap is a no-op
    expect(unsnapSize(list, id)[0]).toMatchObject({ w: 400, h: 300 });
    // a manual resize forgets the snap memory
    const resized = resizeWindow(resnapped, id, 500, 400);
    expect(resized[0].presnap).toBeUndefined();
  });

  it('computes nested area rects from a layout tree', () => {
    const tree: LayoutNode = {
      id: 'root', size: 100, direction: 'row',
      children: [
        { id: 'sidebar', size: 20 },
        {
          id: 'main', size: 80, direction: 'column',
          children: [{ id: 'editor', size: 70 }, { id: 'term', size: 30 }],
        },
      ],
    };
    const rects = areaRects(tree, { x: 0, y: 0, w: 1000, h: 800 });
    expect(rects.get('sidebar')).toEqual({ x: 0, y: 0, w: 200, h: 800 });
    expect(rects.get('editor')).toEqual({ x: 200, y: 0, w: 800, h: 560 });
    expect(rects.get('term')).toEqual({ x: 200, y: 560, w: 800, h: 240 });
    expect(rects.has('main')).toBe(false); // interior nodes are not areas
  });

  it('splits a box (area id stays on the original), closes back, resizes splits', () => {
    const tree: LayoutNode = {
      id: 'root', size: 100, direction: 'row',
      children: [{ id: 'sidebar', size: 20 }, { id: 'editor', size: 80 }],
    };
    const split = splitArea(tree, 'editor', 'column');
    const rects = areaRects(split.layout, { x: 0, y: 0, w: 1000, h: 800 });
    // original keeps its id (docks stay valid) and the top half
    expect(rects.get('editor')).toEqual({ x: 200, y: 0, w: 800, h: 400 });
    expect(rects.get(split.newAreaId)).toEqual({ x: 200, y: 400, w: 800, h: 400 });

    // newFirst places the new area on the leading side (left/top edge drops)
    const before = splitArea(tree, 'editor', 'column', true);
    expect(areaRects(before.layout, { x: 0, y: 0, w: 1000, h: 800 }).get(before.newAreaId))
      .toEqual({ x: 200, y: 0, w: 800, h: 400 });

    // closing the new area collapses back to the original shape
    const closed = closeArea(split.layout, split.newAreaId);
    expect(areaRects(closed, { x: 0, y: 0, w: 1000, h: 800 }).get('editor'))
      .toEqual({ x: 200, y: 0, w: 800, h: 800 });
    // the root leaf cannot be closed away
    const single: LayoutNode = { id: 'only', size: 100 };
    expect(closeArea(single, 'only')).toBe(single);

    // splitter resize with a minimum-fraction clamp
    const resized = setSplitSizes(tree, 'root', 0, 35, 65);
    expect(areaRects(resized, { x: 0, y: 0, w: 1000, h: 800 }).get('sidebar')!.w).toBe(350);
    const clamped = setSplitSizes(tree, 'root', 0, 1, 99);
    const w = areaRects(clamped, { x: 0, y: 0, w: 1000, h: 800 }).get('sidebar')!.w;
    expect(w).toBeGreaterThan(50); // not allowed to vanish
    // an EMPTY side may shrink to a sliver (occupancy-aware minimum)
    const sliver = setSplitSizes(tree, 'root', 0, 1, 99, 0.02, 0.08);
    expect(areaRects(sliver, { x: 0, y: 0, w: 1000, h: 800 }).get('sidebar')!.w).toBe(20);
  });

  it('opens a foundation, adopts floaters, places docked windows, and reverts on close', () => {
    const TREE: LayoutNode = {
      id: 'root', size: 100, direction: 'row',
      children: [{ id: 'crew', size: 30 }, { id: 'stage', size: 70 }],
    };
    const DEF = { layout: TREE, designate: { chat: 'crew' as const }, fallback: 'stage' };
    let list = openMany(['chat', 'welcome']);
    list = setSticky(list, list[1].id, true); // sticky welcome must be skipped
    const chatFloat = { x: list[0].x, y: list[0].y };

    const out = openFoundation(list, 1, DEF);
    const f = out.list.find((w) => w.id === out.id)!;
    expect(f.foundation?.layout).toBe(TREE);
    const chat = out.list.find((w) => w.tabs[0]?.facet === 'chat')!;
    expect(chat.dock).toEqual({ foundation: out.id, area: 'crew' });
    expect(out.list.find((w) => w.tabs[0]?.facet === 'welcome')!.dock).toBeUndefined();

    // placement: foundation maximized and headerless — areas span the whole
    // canvas; float memory intact
    const placed = placeWindows(out.list, { w: 1000, h: 832 });
    const pf = placed.find((w) => w.id === out.id)!;
    expect(pf).toMatchObject({ x: 0, y: 0, w: 1000, h: 832 });
    const pc = placed.find((w) => w.id === chat.id)!;
    expect(pc).toMatchObject({ x: 0, y: 0, w: 300, h: 832 });
    expect(chat.x).toBe(chatFloat.x); // record geometry untouched

    // docking to a missing area degrades to float placement
    const lost = dockWindow(out.list, chat.id, out.id, 'nope');
    expect(placeWindows(lost, { w: 1000, h: 832 }).find((w) => w.id === chat.id))
      .toMatchObject({ x: chatFloat.x, y: chatFloat.y });

    // undock and close-foundation both restore float geometry
    expect(undockWindow(out.list, chat.id).find((w) => w.id === chat.id)!.dock).toBeUndefined();
    const closedList = closeFoundation(out.list, out.id);
    expect(closedList.find((w) => w.id === out.id)).toBeUndefined();
    expect(closedList.find((w) => w.id === chat.id)!.dock).toBeUndefined();
  });

  it('tabs windows together when an area is multiply allocated', () => {
    const TREE: LayoutNode = {
      id: 'root', size: 100, direction: 'row',
      children: [{ id: 'crew', size: 30 }, { id: 'stage', size: 70 }],
    };
    const DEF = { layout: TREE, designate: { chat: 'crew' as const, terminal: 'stage' as const }, fallback: 'stage' };
    // adoption: welcome (fallback->stage) and terminal (designated->stage)
    // must end up as ONE tabbed frame in the stage
    const list = openMany(['welcome', 'terminal']);
    const out = openFoundation(list, 1, DEF);
    const stageFrames = out.list.filter((w) => w.dock?.area === 'stage');
    expect(stageFrames).toHaveLength(1);
    expect(stageFrames[0].tabs.map((t) => t.facet).sort()).toEqual(['terminal', 'welcome']);

    // dockOrMerge: docking into an occupied area tabs into the occupant
    const chat = openWindow(out.list, 'chat', SIZE, 1);
    const merged = dockOrMerge(chat.list, chat.id, out.id, 'stage');
    expect(merged.frameId).toBe(stageFrames[0].id);
    expect(merged.list.find((w) => w.id === chat.id)).toBeUndefined(); // frame absorbed
    expect(merged.list.find((w) => w.id === merged.frameId)!.tabs).toHaveLength(3);
    // and into a hole it just docks
    const solo = dockOrMerge(chat.list, chat.id, out.id, 'crew');
    expect(solo.frameId).toBe(chat.id);
    expect(solo.list.find((w) => w.id === chat.id)!.dock).toEqual({ foundation: out.id, area: 'crew' });
  });

  it('collapses ephemeral split areas when their last occupant leaves; preset holes persist', () => {
    const TREE: LayoutNode = {
      id: 'root', size: 100, direction: 'row',
      children: [{ id: 'crew', size: 30 }, { id: 'stage', size: 70 }],
    };
    const DEF = { layout: TREE, designate: {}, fallback: 'stage' };
    const base = openFoundation(openMany(['welcome', 'chat']), 1, DEF); // both tabbed into stage
    const fid = base.id;

    // edge-drop style: ephemeral split of the stage, dock a detached chat there
    const f = base.list.find((w) => w.id === fid)!;
    const split = splitArea(f.foundation!.layout, 'stage', 'column', false, true);
    let list = base.list.map((w) => (w.id === fid
      ? { ...w, foundation: { ...w.foundation!, layout: split.layout } }
      : w));
    const stageFrame = list.find((w) => w.dock?.area === 'stage')!;
    const chatTab = stageFrame.tabs.find((t) => t.facet === 'chat')!;
    const out = detachTab(list, stageFrame.id, chatTab.id, { x: 0, y: 0 }, SIZE, 1);
    list = dockOrMerge(out.list, out.id, fid, split.newAreaId).list;
    expect(areaRects(list.find((w) => w.id === fid)!.foundation!.layout, { x: 0, y: 0, w: 100, h: 100 }).size).toBe(3);

    // undocking the chat empties the ephemeral area -> it merges back
    const after = undockWindow(list, out.id);
    const layout = after.find((w) => w.id === fid)!.foundation!.layout;
    const rects = areaRects(layout, { x: 0, y: 0, w: 1000, h: 800 });
    expect(rects.size).toBe(2); // crew + stage only
    expect(rects.get('stage')).toEqual({ x: 300, y: 0, w: 700, h: 800 }); // full height again

    // the PRESET crew hole persists (decided: dockable holes remain)
    expect(rects.has('crew')).toBe(true);

    // a minimized occupant still counts as a reference: no collapse
    const split2 = splitArea(layout, 'stage', 'column', false, true);
    let list2 = after.map((w) => (w.id === fid
      ? { ...w, foundation: { ...w.foundation!, layout: split2.layout } }
      : w));
    list2 = dockOrMerge(list2, out.id, fid, split2.newAreaId).list;
    list2 = minimizeWindow(list2, out.id, true);
    list2 = normalizeFoundations(list2);
    expect(areaRects(list2.find((w) => w.id === fid)!.foundation!.layout, { x: 0, y: 0, w: 100, h: 100 }).size).toBe(3);

    // closing an area out from under a docked window clears the dangling dock
    const orphaned = list2.map((w) => (w.id === fid
      ? { ...w, foundation: { ...w.foundation!, layout: closeArea(w.foundation!.layout, split2.newAreaId) } }
      : w));
    const normal = normalizeFoundations(orphaned);
    expect(normal.find((w) => w.id === out.id)!.dock).toBeUndefined();

    // identity preserved when nothing changes
    const stable = normalizeFoundations(normal);
    expect(stable).toBe(normal);
  });

  it('migrates ephemeral occupants home when the original half empties (expand-back)', () => {
    const TREE: LayoutNode = {
      id: 'root', size: 100, direction: 'column',
      children: [{ id: 'stage', size: 70 }, { id: 'pulse', size: 30 }],
    };
    const DEF = { layout: TREE, designate: { terminal: 'pulse' as const }, fallback: 'stage' };
    // terminal t1 adopted into pulse; split pulse's top edge for terminal t2
    const base = openFoundation(openMany(['terminal']), 1, DEF);
    const fid = base.id;
    const t1 = base.list.find((w) => w.dock)!;
    const split = splitArea(base.list.find((w) => w.id === fid)!.foundation!.layout, 'pulse', 'column', true, true);
    let list = base.list.map((w) => (w.id === fid
      ? { ...w, foundation: { ...w.foundation!, layout: split.layout } }
      : w));
    const t2 = openWindow(list, 'terminal', SIZE, 1);
    list = dockOrMerge(t2.list, t2.id, fid, split.newAreaId).list;

    // t1 (in the original 'pulse') closes -> t2 must EXPAND into pulse:
    // occupants of the ephemeral half migrate home and the split collapses
    const after = closeWindow(list, t1.id);
    const t2After = after.find((w) => w.id === t2.id)!;
    expect(t2After.dock).toEqual({ foundation: fid, area: 'pulse' });
    const rects = areaRects(after.find((w) => w.id === fid)!.foundation!.layout, { x: 0, y: 0, w: 1000, h: 1000 });
    expect(rects.size).toBe(2);
    expect(rects.get('pulse')).toEqual({ x: 0, y: 700, w: 1000, h: 300 }); // full pulse again
  });

  it('grid memory round-trips: unlock stashes, re-lock restores layout and assignments', () => {
    const TREE: LayoutNode = {
      id: 'root', size: 100, direction: 'row',
      children: [{ id: 'crew', size: 30 }, { id: 'stage', size: 70 }],
    };
    const DEF = { layout: TREE, designate: { chat: 'crew' as const }, fallback: 'stage' };
    const out = openFoundation(openMany(['chat', 'welcome']), 1, DEF);
    // user customizes: persistent split of the stage, welcome moved into it
    const f0 = out.list.find((w) => w.id === out.id)!;
    const split = splitArea(f0.foundation!.layout, 'stage', 'column');
    let list = out.list.map((w) => (w.id === out.id
      ? { ...w, foundation: { ...w.foundation!, layout: split.layout } }
      : w));
    const welcome = list.find((w) => w.tabs[0].facet === 'welcome')!;
    list = dockOrMerge(list, welcome.id, out.id, split.newAreaId).list;

    // unlock: capture then close
    const stash = captureGrid(list, 1)!;
    expect(stash.assignments[welcome.id]).toBe(split.newAreaId);
    const floated = closeFoundation(list, out.id);
    expect(floated.every((w) => !w.dock && !w.foundation)).toBe(true);

    // re-lock with the stash: same layout, same homes
    const relock = openFoundation(floated, 1, stash.def, stash.assignments);
    const welcomeBack = relock.list.find((w) => w.id === welcome.id)!;
    expect(welcomeBack.dock).toEqual({ foundation: relock.id, area: split.newAreaId });
    const rects = areaRects(relock.list.find((w) => w.id === relock.id)!.foundation!.layout, { x: 0, y: 0, w: 100, h: 100 });
    expect([...rects.keys()].sort()).toEqual(['crew', 'stage', split.newAreaId].sort());

    // an assignment to a vanished area degrades to designate/fallback
    const badStash = { ...stash, assignments: { [welcome.id]: 'nope' } };
    const relock2 = openFoundation(floated, 1, badStash.def, badStash.assignments);
    expect(relock2.list.find((w) => w.id === welcome.id)!.dock?.area).toBe('stage');

    // no foundation -> no stash
    expect(captureGrid(floated, 1)).toBeNull();
  });

  it('clears the dock when a docked single-tab frame is tab-dragged out', () => {
    const TREE: LayoutNode = {
      id: 'root', size: 100, direction: 'row',
      children: [{ id: 'crew', size: 30 }, { id: 'stage', size: 70 }],
    };
    const out = openFoundation(openMany(['chat']), 1, { layout: TREE, designate: {}, fallback: 'stage' });
    const chat = out.list.find((w) => w.dock)!;
    const moved = detachTab(out.list, chat.id, chat.tabs[0].id, { x: 50, y: 60 }, SIZE, 1);
    expect(moved.list.find((w) => w.id === chat.id)!.dock).toBeUndefined();
    expect(moved.list.find((w) => w.id === chat.id)).toMatchObject({ x: 50, y: 60 });
  });

  it('probes areas for center-dock, occupant-merge, and edge-split intents', () => {
    const TREE: LayoutNode = {
      id: 'root', size: 100, direction: 'row',
      children: [{ id: 'crew', size: 50 }, { id: 'stage', size: 50 }],
    };
    const DEF = { layout: TREE, designate: {}, fallback: 'stage' };
    const out = openFoundation(openMany(['chat']), 1, DEF); // chat -> stage
    const size = { w: 1000, h: 832 }; // body: y 32, areas 500px wide, 800 tall
    // center of the empty crew area -> hole dock
    expect(probeArea(out.list, size, 1, 250, 432, 28))
      .toMatchObject({ areaId: 'crew', occupantId: null, edge: null });
    // center of the occupied stage -> occupant merge
    const chatFrame = out.list.find((w) => w.dock)!;
    expect(probeArea(out.list, size, 1, 750, 432, 28))
      .toMatchObject({ areaId: 'stage', occupantId: chatFrame.id, edge: null });
    // near the OCCUPIED stage's right edge -> split intent
    expect(probeArea(out.list, size, 1, 990, 432, 28))
      .toMatchObject({ areaId: 'stage', edge: 'right' });
    // near the EMPTY crew's top edge -> NO split: an empty box cannot be
    // split; the whole hole is the drop target
    expect(probeArea(out.list, size, 1, 250, 50, 28))
      .toMatchObject({ areaId: 'crew', occupantId: null, edge: null });
    // no foundation on desktop 2
    expect(probeArea(out.list, size, 2, 250, 432, 28)).toBeNull();
  });

  it('lays out an overview grid with true scaling, inside the area', () => {
    const area = { w: 1200, h: 800 };
    // four windows -> 2x2 grid
    const four = openMany(['chat', 'chat', 'chat', 'chat']);
    const layout = overviewLayout(four, area);
    expect(layout.size).toBe(4);
    for (const w of four) {
      const p = layout.get(w.id)!;
      expect(p.scale).toBeLessThanOrEqual(1);
      expect(p.scale).toBeGreaterThan(0);
      // scaled box fits inside the area
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + w.w * p.scale).toBeLessThanOrEqual(area.w);
      expect(p.y + w.h * p.scale).toBeLessThanOrEqual(area.h);
    }
    // distinct cells: no two placements coincide
    const spots = new Set([...layout.values()].map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
    expect(spots.size).toBe(4);

    // a small window in a roomy grid is NOT upscaled
    const one = openMany(['chat']); // 400x300 in 1200x800
    expect(overviewLayout(one, area).get(one[0].id)!.scale).toBe(1);

    // a big window scales down
    const big = [{ ...one[0], w: 2000, h: 1600 }];
    expect(overviewLayout(big, area).get(one[0].id)!.scale).toBeLessThan(1);

    expect(overviewLayout([], area).size).toBe(0);
  });

  it('hit-tests titlebars topmost-first, excluding the dragged and minimized frames', () => {
    // two overlapping frames: w1 at 48,48; w2 at 76,76 (both 400 wide)
    const list = openMany(['chat', 'chat']);
    const [a, b] = list.map((w) => w.id);
    const inside = { x: 100, y: 76 + TITLEBAR_H / 2 };
    // point is inside both w1's body and w2's titlebar; topmost (w2) wins
    expect(hitTitlebar(list, inside.x, inside.y, 'none')).toBe(b);
    // excluding the dragged frame (w2) leaves no titlebar hit — w1's titlebar is above this point
    expect(hitTitlebar(list, inside.x, inside.y, b)).toBeNull();
    expect(hitTitlebar(list, 100, 48 + TITLEBAR_H / 2, b)).toBe(a);
    // minimized frames are not drop targets
    const min = minimizeWindow(list, b, true);
    expect(hitTitlebar(min, inside.x, inside.y, 'none')).toBeNull();
    // outside everything
    expect(hitTitlebar(list, 5, 5, 'none')).toBeNull();
  });
});
