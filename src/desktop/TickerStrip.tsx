import type { CSSProperties, MouseEvent } from 'react';
import { useGrip } from '@owebeeone/grip-react';
import {
  DESKTOP_FONT_SCALE, DESKTOP_WINDOWS_TAP,
  TICKER_HOVER, TICKER_HOVER_TAP, TICKER_BLEED_TAP,
  WINDOW_DRAG_TAP,
  type WindowRecord,
} from '../grips.desktop';
import { selectTab } from './ops';
import { SEG_PAD, clipFor, squeezeScale, tickerBoxes, tickerWidths } from './ticker';
import { canvasOrigin, tickerNaturals } from './tickerDom';
import { bleedEnter, bleedLeave } from './tickerBleed';
import { FACETS } from './facets';

// The shaped-ticker tab strip: slanted interlocking segments that always
// fill the strip exactly (ticker.ts solves the widths). The SAME component
// renders a frame's header strip and the bleed picker — only the width it
// fills differs, so click/wheel/tear-off behave identically on both.

export default function TickerStrip({ win, width, height, bleed, from }: {
  win: WindowRecord;
  width: number;
  height: number;
  bleed: boolean; // this instance IS the bleed picker
  // anchor-solve for the bleed morph (keyframe from/to states): the header
  // strip's x relative to the picker, and its solved widths
  from?: { x: number; widths: number[] };
}) {
  const windowsTap = useGrip(DESKTOP_WINDOWS_TAP);
  const dragTap = useGrip(WINDOW_DRAG_TAP);
  const hover = useGrip(TICKER_HOVER) ?? null;
  const hoverTap = useGrip(TICKER_HOVER_TAP);
  const bleedTap = useGrip(TICKER_BLEED_TAP);
  const fontScale = useGrip(DESKTOP_FONT_SCALE) ?? 10;

  const naturals = tickerNaturals(win, fontScale);
  const activeIdx = Math.max(0, win.tabs.findIndex((t) => t.id === win.activeTab));
  const hoverIdx = hover?.frameId === win.id ? win.tabs.findIndex((t) => t.id === hover.tabId) : -1;
  const ws = tickerWidths({ naturals, active: activeIdx, hover: hoverIdx >= 0 ? hoverIdx : null, width });
  const boxes = tickerBoxes(ws);
  const fromBoxes = from ? tickerBoxes(from.widths) : null;
  const squeezed = naturals.reduce((a, b) => a + b, 0) > width + 1;

  const cycleTab = (dir: 1 | -1) => {
    if (win.tabs.length < 2) return;
    const next = win.tabs[(activeIdx + dir + win.tabs.length) % win.tabs.length];
    windowsTap?.update((list) => selectTab(list, win.id, next.id));
  };

  // Tab drag: a click (no movement) selects via dragEnd's !moved path and
  // the picker stays open; real movement tears the tab off (dragMove shrinks
  // the picker the moment the gesture becomes a drag).
  const startTabDrag = (e: MouseEvent, tabId: string) => {
    if (e.button !== 0) return;
    const origin = canvasOrigin(e);
    const facet = win.tabs.find((t) => t.id === tabId)!.facet;
    dragTap?.set({
      kind: 'tab', id: win.id, tabId, facet,
      pointerX: e.clientX, pointerY: e.clientY,
      canvasLeft: origin.left, canvasTop: origin.top, zoom: origin.zoom,
      ghostX: (e.clientX - origin.left) / origin.zoom + 10,
      ghostY: (e.clientY - origin.top) / origin.zoom + 10,
      moved: false,
      dropTarget: win.id, dropDesktop: null, dropArea: null, dropSplit: null,
    });
    e.stopPropagation();
    e.preventDefault();
  };

  // Header strips arm the bleed dwell when squeezed; the anchor rect is
  // measured at gesture time (exact under zoom and any layout).
  const enter = (e: MouseEvent) => {
    if (bleed || !squeezed) return;
    const o = canvasOrigin(e);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    bleedEnter(bleedTap, win.id, {
      x: (r.left - o.left) / o.zoom,
      y: (r.top - o.top) / o.zoom,
      w: r.width / o.zoom,
      h: r.height / o.zoom,
    });
  };

  return (
    <span
      className="tk-strip"
      style={{ width, height }}
      onWheel={(e) => cycleTab(e.deltaY + e.deltaX > 0 ? 1 : -1)}
      onMouseEnter={bleed ? undefined : enter}
      onMouseLeave={bleed ? undefined : () => bleedLeave(bleedTap)}
    >
      {win.tabs.map((t, i) => {
        const isActive = i === activeIdx;
        const scale = squeezeScale(naturals[i] - SEG_PAD, ws[i] - SEG_PAD);
        const fromBox = fromBoxes?.[i];
        const morphVars = fromBox && from
          ? { '--sx': `${from.x + fromBox.left}px`, '--sw': `${fromBox.width}px` }
          : undefined;
        return (
          <button
            key={t.id}
            className={`tk-seg${isActive ? ' active' : ''}`}
            title={FACETS[t.facet].title}
            style={{
              left: boxes[i].left,
              width: boxes[i].width,
              clipPath: clipFor(i, win.tabs.length),
              ...morphVars,
            } as CSSProperties}
            onMouseDown={(e) => startTabDrag(e, t.id)}
            onMouseEnter={() => hoverTap?.set({ frameId: win.id, tabId: t.id })}
            onMouseLeave={() => hoverTap?.update((h) => (h?.tabId === t.id ? null : h))}
          >
            <span
              className="tk-label"
              style={{ transform: scale < 1 ? `scaleX(${scale})` : undefined }}
            >
              {FACETS[t.facet].title}
            </span>
          </button>
        );
      })}
    </span>
  );
}
