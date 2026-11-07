import { describe, expect, it, vi } from 'vitest';
import { cancelPointerInteractions, PinchTransform, SurfacePointers } from './pointerInteraction';
const p = (pointerId: number, x = 0, y = 0) => ({ pointerId, clientX: x, clientY: y });
const element = { setPointerCapture() {}, hasPointerCapture() { return false; } } as unknown as Element;
describe('shared pointer lifecycle', () => {
  it('cancels editing before pinch navigation and requires a fresh press afterward', () => {
    const order: string[] = [];
    const update = vi.fn();
    const callbacks = { cancelEdit: () => order.push('cancel'), beginNavigation: () => { order.push('navigation'); return update; } };
    const s = new SurfacePointers();
    expect(s.down(p(1), element, callbacks)).toBe(false);
    expect(s.down(p(2, 100), element, callbacks)).toBe(true);
    expect(order).toEqual(['cancel', 'navigation']);
    s.move(p(2, 200));
    expect(update).toHaveBeenCalledWith({ x: 100, y: 0 }, 2);
    expect(s.up(p(2))).toBe(true);
    expect(s.move(p(1, 30))).toBe(true);
    expect(s.up(p(1))).toBe(true);
    expect(s.down(p(3), element, callbacks)).toBe(false);
    s.cancel();
  });
  it('cancels on coordinate changes and capture loss without treating normal release as cancellation', () => {
    const cancelEdit = vi.fn();
    const s = new SurfacePointers();
    const callbacks = { cancelEdit, beginNavigation: () => () => {} };
    s.down(p(1), element, callbacks); s.up(p(1)); s.lost(1);
    expect(cancelEdit).not.toHaveBeenCalled();
    s.down(p(2), element, callbacks); cancelPointerInteractions();
    expect(cancelEdit).toHaveBeenCalledTimes(1);
    s.down(p(3), element, callbacks); s.lost(3);
    expect(cancelEdit).toHaveBeenCalledTimes(2);
  });
  it('computes translation and scale from a stable two-point baseline', () => {
    const pinch = new PinchTransform({ x: 10, y: 20 }, { x: 110, y: 20 });
    expect(pinch.at({ x: 20, y: 40 }, { x: 220, y: 40 })).toEqual({ center: { x: 120, y: 40 }, scale: 2 });
  });
});
