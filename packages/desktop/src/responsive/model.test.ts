import { describe, expect, it } from 'vitest';
import { areaRects } from '../ops';
import { chooseVariant, fittedArrangement, initialArrangement, LayoutVariant, PanelPlacement, readArrangement, reconcile, selectView, viewsOn, type LayoutFamily } from './model';
const one = new LayoutVariant('one', 0, { layout: { id: 'all', size: 1 }, designate: {}, fallback: 'all' });
const two = new LayoutVariant('two', 700, { layout: { id: 'root', size: 1, direction: 'row', children: [{ id: 'edit', size: 2 }, { id: 'inspect', size: 1 }] }, designate: { properties: 'inspect' }, fallback: 'edit' }, ['editor']);
const three = new LayoutVariant('three', 1100, two.foundation);
const family: LayoutFamily = { id: 'unrelated-host', variants: [one, two, three], hysteresis: 40 };
const views = [{ id: 'a', frameId: 'wa', facet: 'editor' }, { id: 'b', frameId: 'wb', facet: 'properties', source: 'a' }, { id: 'c', frameId: 'wc', facet: 'unknown-plugin' }];
describe('responsive projection independent of the host', () => {
  it('chooses by actual dimensions with asymmetric boundaries and a hidden-container fallback', () => {
    expect(chooseVariant(family, 390, 844)).toBe(one);
    expect(chooseVariant(family, 844, 390)).toBe(two);
    expect(chooseVariant(family, 1200, 800)).toBe(three);
    expect(chooseVariant(family, 1080, 800, three)).toBe(three);
    expect(chooseVariant(family, 1059, 800, three)).toBe(two);
    expect(chooseVariant(family, 680, 800, two)).toBe(two);
    expect(chooseVariant(family, 659, 800, two)).toBe(one);
    expect(chooseVariant(family, 0, 0, three)).toBe(three);
  });
  it('projects every tab once, keeps source IDs, and does not mutate canonical views', () => {
    const before = JSON.stringify(views);
    const wide = initialArrangement(two, views, {});
    expect(wide.groups).toEqual({ edit: ['a', 'c'], inspect: ['b'] });
    expect(initialArrangement(one, views, {}).groups.all).toEqual(['a', 'b', 'c']);
    expect(JSON.stringify(views)).toBe(before);
  });
  it('restores custom topology after a temporary collapse and codec round trip', () => {
    const a = initialArrangement(two, views, {});
    const custom = PanelPlacement.below.apply(a, 'c', 'inspect');
    expect(areaRects(custom.tree, { x: 0, y: 0, w: 1200, h: 800 }).size).toBe(3);
    const snapshot = JSON.stringify(custom);
    const fitted = fittedArrangement(custom, 300, 250, family, 'c');
    expect(fitted.selected.fit).toBe('c');
    expect(JSON.stringify(custom)).toBe(snapshot);
    expect(fittedArrangement(readArrangement(JSON.parse(snapshot))!, 1200, 800, family)).toEqual(custom);
  });
  it('reconciles closed and moved tabs instead of resurrecting saved references', () => {
    const custom = PanelPlacement.below.apply(initialArrangement(two, views, {}), 'c', 'inspect');
    const next = reconcile(custom, two, views.slice(0, 1), {});
    expect(Object.values(next.groups).flat()).toEqual(['a']);
    expect(Object.values(next.selected)).not.toContain('b');
    expect(Object.values(next.selected)).not.toContain('c');
  });
  it('guards self-splits and undersized drops, and keeps focused selection', () => {
    const a = initialArrangement(two, views, {});
    expect(PanelPlacement.left.apply(a, 'b', 'inspect')).toBe(a);
    expect(PanelPlacement.left.fits({ x: 0, y: 0, w: 300, h: 800 }, family)).toBe(false);
    expect(PanelPlacement.below.fits({ x: 0, y: 0, w: 300, h: 800 }, family)).toBe(true);
    expect(selectView(a, 'c').selected.edit).toBe('c');
  });
  it('removes the vacated pane when its final view joins another group', () => {
    const a = initialArrangement(two, views, {});
    const joined = PanelPlacement.merge.apply(a, 'b', 'edit');
    expect(Object.keys(joined.groups)).toEqual(['edit']);
    expect(areaRects(joined.tree, { x: 0, y: 0, w: 1200, h: 800 }).size).toBe(1);
    expect(joined.selected.edit).toBe('b');
  });
  it('rejects malformed optional profiles while accepting the rest of the desk', () => {
    expect(readArrangement({ tree: { id: 'x', size: -1 }, groups: {}, selected: {} })).toBeUndefined();
    expect(readArrangement({ tree: { id: 'x', size: 1 }, groups: { x: [3] }, selected: {} })).toBeUndefined();
    expect(readArrangement(null)).toBeUndefined();
  });
  it('respects desktop, sticky and minimized canonical visibility', () => {
    const frame = { id: 'w', tabs: [{ id: 't', facet: 'editor' }], activeTab: 't', x: 0, y: 0, w: 100, h: 100, desktop: 2, sticky: false, minimized: false };
    expect(viewsOn([frame], 1)).toEqual([]);
    expect(viewsOn([{ ...frame, sticky: true }], 1)).toHaveLength(1);
    expect(viewsOn([{ ...frame, minimized: true }], 2)).toEqual([]);
  });
});
