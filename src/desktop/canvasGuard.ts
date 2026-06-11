import { grok } from '../runtime';
import { DESKTOP_WINDOWS_TAP } from '../grips.desktop';
import { clampAllWindows } from './ops';

// Imperative canvas watcher kept out of React (cf. terminalController /
// graphEngine): a ResizeObserver clamps the window records into the canvas
// whenever the canvas changes size, through the same tap handle any other
// participant would use. Mounted via the stable ref callback below — no
// useEffect, no window.addEventListener in components.

let observer: ResizeObserver | null = null;

export function observeCanvas(el: HTMLDivElement | null): (() => void) | undefined {
  observer?.disconnect();
  observer = null;
  if (!el) return undefined;
  const handleDrip = grok.mainPresentationContext.getOrCreateConsumer(DESKTOP_WINDOWS_TAP);
  const unsubscribe = handleDrip.subscribe(() => {}); // keep the handle resolved
  observer = new ResizeObserver((entries) => {
    const rect = entries[entries.length - 1]?.contentRect;
    if (!rect) return;
    handleDrip.get()?.update((list) => clampAllWindows(list, { w: rect.width, h: rect.height }));
  });
  observer.observe(el);
  return () => {
    observer?.disconnect();
    observer = null;
    unsubscribe();
  };
}
