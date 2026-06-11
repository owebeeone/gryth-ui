import { grok } from '../runtime';
import { CANVAS_SIZE_TAP, DESKTOP_WINDOWS_TAP } from '../grips.desktop';
import { clampAllWindows } from './ops';

// Imperative canvas watcher kept out of React (cf. terminalController /
// graphEngine): publishes the canvas size to the CANVAS_SIZE grip and clamps
// the window records into the canvas whenever it changes, through the same
// tap handles any other participant would use. Mounted via the stable ref
// callback below — no useEffect, no listeners in components.
//
// Measurement is belt-and-braces: an immediate measure on attach, a window
// resize listener, a slow poll, AND a ResizeObserver — because (a) the tap
// handles resolve asynchronously, so the first observation can race them,
// and (b) ResizeObserver has been observed inert in embedded preview
// webviews. Publication retries on handle arrival.

let observer: ResizeObserver | null = null;

export function observeCanvas(el: HTMLDivElement | null): (() => void) | undefined {
  observer?.disconnect();
  observer = null;
  if (!el) return undefined;
  const handleDrip = grok.mainPresentationContext.getOrCreateConsumer(DESKTOP_WINDOWS_TAP);
  const sizeDrip = grok.mainPresentationContext.getOrCreateConsumer(CANVAS_SIZE_TAP);

  let lastSize = { w: 0, h: 0 };
  const publish = () => {
    if (lastSize.w <= 0) return;
    sizeDrip.get()?.set(lastSize);
    handleDrip.get()?.update((list) => clampAllWindows(list, lastSize));
  };
  // handle arrival can postdate the first measurement — republish then
  const unsubscribe = handleDrip.subscribe(() => publish());
  const unsubscribeSize = sizeDrip.subscribe(() => publish());

  const measure = () => {
    // offsetWidth/Height are LAYOUT px — unaffected by the UI zoom, which
    // is the coordinate space all window geometry lives in.
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w > 0 && (w !== lastSize.w || h !== lastSize.h)) {
      lastSize = { w, h };
      publish();
    }
  };
  measure();
  const poll = setInterval(measure, 500);
  window.addEventListener('resize', measure);
  observer = new ResizeObserver(measure);
  observer.observe(el);

  return () => {
    clearInterval(poll);
    window.removeEventListener('resize', measure);
    observer?.disconnect();
    observer = null;
    unsubscribe();
    unsubscribeSize();
  };
}
