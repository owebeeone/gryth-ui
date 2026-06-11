import { describe, it, expect } from 'vitest';
import {
  MIN_W, MIN_H, TITLEBAR_H, DESKTOP_IDS,
  openWindow, closeWindow, raiseWindow, minimizeWindow,
  moveWindow, resizeWindow,
  mergeWindows, selectTab, closeTab, hitTitlebar,
  detachTab, moveTab, sendToDesktop, setSticky, isOnDesktop,
  moveWindowFree, overviewLayout, snapRect, snapWindow, unsnapSize,
  clampAllWindows,
} from './ops';
import type { WindowRecord } from '../grips.desktop';

const SIZE = { w: 400, h: 300 };

function openMany(kinds: ('welcome' | 'chat')[]): WindowRecord[] {
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
