import type { FoundationDef, LayoutNode, WindowRecord } from '../grips.desktop';
import { areaRects, closeArea, isOnDesktop, splitArea, type Rect } from '../ops';

/** Application data, interpreted by the shell; never a device-name table. */
export class LayoutVariant {
  constructor(
    readonly id: string,
    readonly minimumWidth: number,
    readonly foundation: FoundationDef,
    readonly preferredTools: readonly string[] = [],
    readonly minimumHeight = 0,
  ) {}
  fits(width: number, height: number, allowance = 0): boolean {
    return width >= this.minimumWidth - allowance && height >= this.minimumHeight;
  }
}
export interface LayoutFamily {
  id: string;
  variants: readonly LayoutVariant[];
  hysteresis?: number;
  minimumPaneWidth?: number;
  minimumPaneHeight?: number;
}
export function chooseVariant(family: LayoutFamily, width: number, height: number, previous?: LayoutVariant): LayoutVariant {
  const sorted = [...family.variants].sort((a, b) => a.minimumWidth - b.minimumWidth);
  if (sorted.length === 0) { throw new Error('A responsive family needs a fallback variant'); }
  if (width <= 0 || height <= 0) { return previous ?? sorted[0]; }
  const best = [...sorted].reverse().find(v => v.fits(width, height)) ?? sorted[0];
  if (previous && best.minimumWidth < previous.minimumWidth
    && previous.fits(width, height, family.hysteresis ?? 40)) { return previous; }
  return best;
}
export interface ViewRecord { id: string; facet: string; frameId: string; source?: string }
export function viewsOn(windows: readonly WindowRecord[], desktop: number): ViewRecord[] {
  return windows.filter(w => {
    const host = windows.find(f => f.id === w.dock?.foundation) ?? w;
    return !w.foundation && !w.minimized && isOnDesktop(host, desktop);
  }).flatMap(w => w.tabs.map(t => ({ id: t.id, facet: t.facet, frameId: w.id, source: t.source })));
}
export interface Arrangement {
  tree: LayoutNode;
  groups: Record<string, string[]>;
  selected: Record<string, string>;
}
export function groupFor(variant: LayoutVariant, view: ViewRecord, roles: Partial<Record<string, string>>): string {
  const def = variant.foundation;
  const areas = areaRects(def.layout, { x: 0, y: 0, w: 1, h: 1 });
  const wanted = def.designate[view.facet] ?? roles[view.facet] ?? def.fallback;
  return areas.has(wanted) ? wanted : areas.has(def.fallback) ? def.fallback : [...areas.keys()][0];
}
export function initialArrangement(variant: LayoutVariant, views: ViewRecord[], roles: Partial<Record<string, string>>): Arrangement {
  return reconcile({ tree: variant.foundation.layout, groups: {}, selected: {} }, variant, views, roles);
}
export function reconcile(saved: Arrangement, variant: LayoutVariant, views: ViewRecord[], roles: Partial<Record<string, string>>): Arrangement {
  const leaves = [...areaRects(saved.tree, { x: 0, y: 0, w: 1, h: 1 }).keys()];
  const live = new Set(views.map(v => v.id));
  const assigned = new Set<string>();
  const groups: Record<string, string[]> = {};
  for (const leaf of leaves) {
    groups[leaf] = (saved.groups[leaf] ?? []).filter(id => {
      if (!live.has(id) || assigned.has(id)) { return false; }
      assigned.add(id); return true;
    });
  }
  for (const view of views) {
    if (assigned.has(view.id)) { continue; }
    const home = groupFor(variant, view, roles);
    (groups[home] ?? groups[leaves[0]]).push(view.id);
  }
  const selected: Record<string, string> = {};
  for (const leaf of leaves) {
    const ids = groups[leaf];
    const preferred = variant.preferredTools.map(tool => views.find(v => v.facet === tool && ids.includes(v.id))?.id).find(Boolean);
    selected[leaf] = ids.includes(saved.selected[leaf]) ? saved.selected[leaf] : preferred ?? ids[0] ?? '';
  }
  return { tree: saved.tree, groups, selected };
}
export function selectView(a: Arrangement, id: string): Arrangement {
  const group = Object.keys(a.groups).find(g => a.groups[g].includes(id));
  return group ? { ...a, selected: { ...a.selected, [group]: id } } : a;
}
/** Semantic destinations shared by drag previews and accessible commands. */
export class PanelPlacement {
  static readonly merge = new PanelPlacement('Join tabs');
  static readonly left = new PanelPlacement('Split left', 'row', true);
  static readonly right = new PanelPlacement('Split right', 'row', false);
  static readonly above = new PanelPlacement('Split above', 'column', true);
  static readonly below = new PanelPlacement('Split below', 'column', false);
  static readonly all = [PanelPlacement.merge, PanelPlacement.left, PanelPlacement.right, PanelPlacement.above, PanelPlacement.below];
  private constructor(readonly label: string, readonly axis?: 'row' | 'column', readonly first = false) {}
  fits(rect: Rect, family: LayoutFamily): boolean {
    return !this.axis || (this.axis === 'row' ? rect.w >= 2 * (family.minimumPaneWidth ?? 180) : rect.h >= 2 * (family.minimumPaneHeight ?? 140));
  }
  preview(rect: Rect): Rect {
    if (!this.axis) { return rect; }
    return this.axis === 'row'
      ? { ...rect, w: rect.w / 2, x: rect.x + (this.first ? 0 : rect.w / 2) }
      : { ...rect, h: rect.h / 2, y: rect.y + (this.first ? 0 : rect.h / 2) };
  }
  apply(a: Arrangement, tabId: string, target: string): Arrangement {
    const origin = Object.keys(a.groups).find(g => a.groups[g].includes(tabId));
    if (!origin || !a.groups[target] || (origin === target && (!this.axis || a.groups[target].length < 2))) { return a; }
    let tree = a.tree;
    let destination = target;
    const groups = Object.fromEntries(Object.entries(a.groups).map(([g, ids]) => [g, ids.filter(id => id !== tabId)]));
    if (this.axis) {
      const split = splitArea(tree, target, this.axis, this.first);
      tree = split.layout; destination = split.newAreaId; groups[destination] = [];
    }
    groups[destination].push(tabId);
    const selected = { ...a.selected, [destination]: tabId };
    if (selected[origin] === tabId && origin !== destination) { selected[origin] = groups[origin][0] ?? ''; }
    // Moving the last view also removes its vacated presentation pane.
    // Canonical frame membership is unchanged.
    if (origin !== destination && groups[origin].length === 0) {
      tree = closeArea(tree, origin); delete groups[origin]; delete selected[origin];
    }
    return { tree, groups, selected };
  }
}
export function placementAt(rect: Rect, x: number, y: number): PanelPlacement {
  const band = Math.min(40, rect.w / 4, rect.h / 4);
  if (x - rect.x < band) { return PanelPlacement.left; }
  if (rect.x + rect.w - x < band) { return PanelPlacement.right; }
  if (y - rect.y < band) { return PanelPlacement.above; }
  if (rect.y + rect.h - y < band) { return PanelPlacement.below; }
  return PanelPlacement.merge;
}
/** Presentation fallback only: saved topology remains untouched. */
export function fittedArrangement(a: Arrangement, width: number, height: number, family: LayoutFamily, focused?: string): Arrangement {
  const rects = areaRects(a.tree, { x: 0, y: 0, w: width, h: height });
  if (rects.size <= 1 || [...rects.values()].every(r => r.w >= (family.minimumPaneWidth ?? 180) && r.h >= (family.minimumPaneHeight ?? 140))) { return a; }
  const ids = Object.values(a.groups).flat();
  const selected = focused && ids.includes(focused) ? focused : Object.values(a.selected).find(id => ids.includes(id)) ?? ids[0] ?? '';
  return { tree: { id: 'fit', size: 100 }, groups: { fit: ids }, selected: { fit: selected } };
}

/** Defensive, bounded optional codec. Invalid local data never replaces the desk. */
export function readArrangement(raw: unknown): Arrangement | undefined {
  if (!raw || typeof raw !== 'object') { return undefined; }
  const a = raw as Arrangement;
  const ids = new Set<string>();
  const validTree = (n: LayoutNode, depth: number): boolean => {
    if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !n.id || ids.has(n.id)
      || !Number.isFinite(n.size) || n.size <= 0 || depth > 20 || ids.size > 200) { return false; }
    ids.add(n.id);
    if (n.children === undefined) { return true; }
    return Array.isArray(n.children) && n.children.length > 0 && (n.direction === 'row' || n.direction === 'column')
      && n.children.every(child => validTree(child, depth + 1));
  };
  if (!validTree(a.tree, 0) || !a.groups || typeof a.groups !== 'object' || !a.selected || typeof a.selected !== 'object') { return undefined; }
  if (!Object.values(a.groups).every(v => Array.isArray(v) && v.length < 1000 && v.every(id => typeof id === 'string'))
    || !Object.values(a.selected).every(id => typeof id === 'string')) { return undefined; }
  return { tree: a.tree, groups: a.groups, selected: a.selected };
}
