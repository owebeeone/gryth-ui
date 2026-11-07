// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { PanelDrag, SplitDrag } from './interaction';
import { initialArrangement, LayoutVariant, PanelPlacement } from './model';
import { areaRects } from '../ops';
import { cancelPointerInteractions } from '../pointerInteraction';
import type { ResponsiveController, ResponsiveSnapshot } from './runtime';
const variant = new LayoutVariant('wide', 0, { layout: { id: 'main', size: 1 }, designate: {}, fallback: 'main' });
const family = { id: 'fixture', variants: [variant] };
const views = [{ id: 'a', facet: 'editor', frameId: 'w' }, { id: 'b', facet: 'help', frameId: 'x' }];
const arrangement = initialArrangement(variant, views, {});
const state: ResponsiveSnapshot = { variant, family, views, arrangement, rects: areaRects(arrangement.tree, { x: 0, y: 0, w: 800, h: 600 }) };
const pointer = (pointerId: number, clientX: number, clientY = 300) => ({ pointerId, clientX, clientY });
function canvas() {
  const el = document.createElement('div');
  Object.defineProperties(el, { offsetWidth: { value: 800 }, offsetHeight: { value: 600 } });
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 } as DOMRect);
  return el;
}
it('previews the same edge split as the menu and commits only once on release', () => {
  const el = canvas(); let result = arrangement;
  const move = vi.fn((id, target, placement: PanelPlacement) => { result = placement.apply(result, id, target); });
  const showPreview = vi.fn();
  const actions = { move, showPreview, cancelDrag: () => drag.cancel() } as unknown as ResponsiveController;
  const drag = new PanelDrag(actions, 'a', pointer(1, 400), el, el);
  drag.move(pointer(1, 790), state);
  expect(showPreview).toHaveBeenCalledWith({ x: 400, y: 0, w: 400, h: 600 });
  expect(move).not.toHaveBeenCalled();
  drag.end(pointer(1, 790));
  expect(move).toHaveBeenCalledOnce();
  expect(Object.values(result.groups)).toEqual(Object.values(PanelPlacement.right.apply(arrangement, 'a', 'main').groups));
});
it('cancels panel movement on a second pointer, capture loss, blur or coordinate change', () => {
  for (const cancel of [
    (el: HTMLElement) => { const e = new Event('pointerdown', { bubbles: true }); Object.assign(e, { pointerId: 2 }); el.ownerDocument.dispatchEvent(e); },
    (el: HTMLElement) => { const e = new Event('lostpointercapture'); Object.assign(e, { pointerId: 1 }); el.dispatchEvent(e); },
    () => window.dispatchEvent(new Event('blur')),
    () => cancelPointerInteractions(),
  ]) {
    const el = canvas(), move = vi.fn();
    const actions = { move, showPreview: vi.fn(), cancelDrag: () => drag.cancel() } as unknown as ResponsiveController;
    const drag = new PanelDrag(actions, 'a', pointer(1, 400), el, el);
    drag.move(pointer(1, 790), state); cancel(el); drag.end(pointer(1, 790));
    expect(move).not.toHaveBeenCalled();
  }
});
it('keeps splitter movement provisional and respects minimum widths', () => {
  const el = canvas(), resize = vi.fn(), previewResize = vi.fn();
  const actions = { resize, previewResize, cancelDrag: () => drag.cancel() } as unknown as ResponsiveController;
  const drag = new SplitDrag(actions, pointer(1, 400), el, 'root', 0, 'row', 50, 50, 800, 180, 1);
  drag.move(pointer(1, 799));
  expect(previewResize).toHaveBeenLastCalledWith('root', 0, 77.5, 22.5);
  expect(resize).not.toHaveBeenCalled();
  cancelPointerInteractions(); drag.end(pointer(1, 799));
  expect(resize).not.toHaveBeenCalled();
});
