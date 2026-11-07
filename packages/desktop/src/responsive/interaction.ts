import { PointerInteraction } from '../pointerInteraction';
import { PanelPlacement, placementAt } from './model';
import type { ResponsiveController, ResponsiveSnapshot } from './runtime';

export interface PanelPointer { pointerId: number; clientX: number; clientY: number }
export class PanelDrag {
  private capture: PointerInteraction;
  private moved = false;
  private target?: { group: string; placement: PanelPlacement };
  constructor(private actions: ResponsiveController, private tab: string, private start: PanelPointer, element: Element, private canvas: HTMLElement) {
    this.capture = new PointerInteraction(() => actions.cancelDrag());
    this.capture.capture(element, start.pointerId);
  }
  move(e: PanelPointer, state: ResponsiveSnapshot): void {
    if (e.pointerId !== this.start.pointerId) { return; }
    this.moved ||= Math.hypot(e.clientX - this.start.clientX, e.clientY - this.start.clientY) > 6;
    if (!this.moved) { return; }
    const box = this.canvas.getBoundingClientRect();
    const x = (e.clientX - box.left) * this.canvas.offsetWidth / box.width;
    const y = (e.clientY - box.top) * this.canvas.offsetHeight / box.height;
    this.target = undefined;
    for (const [group, rect] of state.rects) {
      if (x < rect.x || y < rect.y || x > rect.x + rect.w || y > rect.y + rect.h) { continue; }
      const placement = placementAt(rect, x, y);
      const own = state.arrangement.groups[group].includes(this.tab);
      if (!placement.fits(rect, state.family) || (own && (placement === PanelPlacement.merge || state.arrangement.groups[group].length < 2))) { break; }
      this.target = { group, placement };
      this.actions.showPreview(placement.preview(rect)); return;
    }
    this.actions.showPreview();
  }
  end(e: PanelPointer): void {
    if (e.pointerId !== this.start.pointerId) { return; }
    if (this.capture.finish() && this.moved && this.target) {
      this.actions.move(this.tab, this.target.group, this.target.placement);
    }
    this.actions.cancelDrag();
  }
  cancel(): void { this.capture.finish(); }
}
export class SplitDrag {
  private capture: PointerInteraction;
  private weights?: [number, number];
  constructor(private actions: ResponsiveController, private start: PanelPointer, element: Element,
    private interior: string, private index: number, private axis: 'row' | 'column',
    private a: number, private b: number, private span: number, private minimum: number, private zoom: number) {
    this.capture = new PointerInteraction(() => actions.cancelDrag());
    this.capture.capture(element, start.pointerId);
  }
  move(e: PanelPointer): void {
    if (e.pointerId !== this.start.pointerId) { return; }
    const delta = (this.axis === 'row' ? e.clientX - this.start.clientX : e.clientY - this.start.clientY) / this.zoom;
    const total = this.a + this.b;
    const low = Math.min(0.5, this.minimum / this.span) * total;
    const a = Math.max(low, Math.min(total - low, this.a + delta / this.span * total));
    this.weights = [a, total - a];
    this.actions.previewResize(this.interior, this.index, ...this.weights);
  }
  end(e: PanelPointer): void {
    if (e.pointerId !== this.start.pointerId) { return; }
    if (this.capture.finish() && this.weights) { this.actions.resize(this.interior, this.index, ...this.weights); }
    this.actions.cancelDrag();
  }
  cancel(): void { this.capture.finish(); }
}
