/** Reusable pointer ownership. Domain edits remain in their host tool. */
export interface PointerPosition { x: number; y: number }
const cancellations = new Set<() => void>();
export function cancelPointerInteractions(): void {
  for (const cancel of [...cancellations]) { cancel(); }
}
export class PointerInteraction {
  private release?: () => void;
  private cancelled = false;
  constructor(private cancelAction: () => void) {}
  capture(element: Element, pointerId: number): void {
    this.finish(); this.cancelled = false;
    const cancel = () => this.cancel();
    const lost = (event: Event) => {
      if ((event as PointerEvent).pointerId === pointerId) { cancel(); }
    };
    const second = (event: Event) => {
      if ((event as PointerEvent).pointerId !== pointerId) { cancel(); }
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { cancel(); } };
    element.ownerDocument.defaultView?.addEventListener('blur', cancel);
    element.ownerDocument.addEventListener('keydown', key);
    element.addEventListener('lostpointercapture', lost);
    element.addEventListener('pointercancel', lost);
    element.ownerDocument.addEventListener('pointerdown', second, true);
    cancellations.add(cancel);
    this.release = () => {
      element.ownerDocument.defaultView?.removeEventListener('blur', cancel);
      element.ownerDocument.removeEventListener('keydown', key);
      element.removeEventListener('lostpointercapture', lost);
      element.removeEventListener('pointercancel', lost);
      element.ownerDocument.removeEventListener('pointerdown', second, true);
      cancellations.delete(cancel);
      if (element.hasPointerCapture?.(pointerId)) { element.releasePointerCapture(pointerId); }
    };
    element.setPointerCapture?.(pointerId);
  }
  cancel(): void {
    this.cancelled = true; this.finish(); this.cancelAction();
  }
  finish(): boolean {
    const release = this.release; this.release = undefined; release?.();
    return !this.cancelled;
  }
}
/** Two-point navigation expressed as scale and centres in client coordinates. */
export class PinchTransform {
  readonly center: PointerPosition;
  private readonly distance: number;
  constructor(a: PointerPosition, b: PointerPosition) {
    this.center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  }
  at(a: PointerPosition, b: PointerPosition): { center: PointerPosition; scale: number } {
    return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, scale: Math.hypot(a.x - b.x, a.y - b.y) / this.distance };
  }
}

export interface SurfacePointer { pointerId: number; clientX: number; clientY: number }
export interface NavigationCallbacks {
  cancelEdit(): void;
  /** Snapshot the domain's viewport once; return an absolute preview function. */
  beginNavigation(center: PointerPosition): (center: PointerPosition, scale: number) => void;
}
/** Owned by a tab tap. A second pointer cancels edits before navigation begins. */
export class SurfacePointers {
  private points = new Map<number, PointerPosition>();
  private pinch?: PinchTransform;
  private navigate?: (center: PointerPosition, scale: number) => void;
  private blocked = false;
  private origin?: PointerPosition;
  private travelled = false;
  get tap(): boolean { return !this.travelled; }
  private element?: Element;
  private callbacks?: NavigationCallbacks;
  private readonly cancellation = () => this.cancel();
  readonly bind = (element: SVGSVGElement | null): (() => void) | undefined => {
    if (!element) { return undefined; }
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => this.cancel());
    observer?.observe(element);
    const blur = () => this.cancel();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { this.cancel(); } };
    window.addEventListener('blur', blur); element.ownerDocument.addEventListener('keydown', key);
    return () => { this.cancel(); observer?.disconnect(); window.removeEventListener('blur', blur); element.ownerDocument.removeEventListener('keydown', key); };
  };
  get editing(): boolean { return !this.blocked; }
  down(e: SurfacePointer, element: Element, callbacks: NavigationCallbacks): boolean {
    if (!this.points.size) { this.origin = { x: e.clientX, y: e.clientY }; this.travelled = false; }
    this.element = element; this.callbacks = callbacks;
    this.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cancellations.add(this.cancellation);
    element.setPointerCapture?.(e.pointerId);
    if (this.points.size >= 2) {
      callbacks.cancelEdit(); this.blocked = true;
      const [a, b] = [...this.points.values()];
      this.pinch = new PinchTransform(a, b);
      this.navigate = callbacks.beginNavigation(this.pinch.center);
    }
    return this.blocked;
  }
  move(e: SurfacePointer): boolean {
    if (!this.points.has(e.pointerId)) { return this.blocked; }
    if (this.origin && Math.hypot(e.clientX - this.origin.x, e.clientY - this.origin.y) > 6) { this.travelled = true; }
    this.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.points.size >= 2) {
      const [a, b] = [...this.points.values()];
      const transform = this.pinch.at(a, b);
      this.navigate?.(transform.center, transform.scale);
    }
    return this.blocked;
  }
  up(e: SurfacePointer): boolean {
    if (!this.points.has(e.pointerId)) { return true; }
    const blocked = this.blocked;
    this.points.delete(e.pointerId);
    if (this.points.size < 2) { this.pinch = undefined; this.navigate = undefined; }
    if (!this.points.size) { this.blocked = false; cancellations.delete(this.cancellation); }
    return blocked;
  }
  lost(pointerId: number): void {
    // Normal pointerup removes its identity before lostpointercapture fires.
    if (this.points.has(pointerId)) { this.cancel(); }
  }
  cancel(): void {
    const ids = [...this.points.keys()]; this.points.clear();
    this.pinch = undefined; this.navigate = undefined; this.blocked = false;
    cancellations.delete(this.cancellation);
    this.callbacks?.cancelEdit();
    for (const id of ids) {
      if (this.element?.hasPointerCapture?.(id)) { this.element.releasePointerCapture(id); }
    }
  }
}
