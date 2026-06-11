import type { MouseEvent } from 'react';
import type { WindowRecord } from '../grips.desktop';
import { SEG_PAD } from './ticker';
import { FACETS } from './facets';

// DOM-side helpers for the ticker strip (separate from TickerStrip.tsx so
// the component file only exports components — fast-refresh rule).

// Canvas origin + zoom for converting client coords into canvas coords
// (offsetWidth = layout px; rect.width = visual px under zoom).
export function canvasOrigin(e: MouseEvent): { left: number; top: number; zoom: number } {
  const el = (e.currentTarget as HTMLElement).closest('.desktop-canvas') as HTMLElement;
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, zoom: el.offsetWidth ? rect.width / el.offsetWidth : 1 };
}

// Label measurement for the width solver: a cached 2D context measures with
// the strip's font. jsdom has no canvas — fall back to a flat estimate so
// headless tests still solve sensibly.
const FONT_FAMILY = 'system-ui, -apple-system, sans-serif';
let measureCtx: CanvasRenderingContext2D | null | undefined;
function measureLabel(text: string, px: number): number {
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * px * 0.6;
  measureCtx.font = `${px}px ${FONT_FAMILY}`;
  return measureCtx.measureText(text).width;
}

// .tk-label is 0.78em of the desktop root font (fontScale 10 = 15px).
const tickerLabelPx = (fontScale: number) => fontScale * 1.5 * 0.78;

export function tickerNaturals(win: WindowRecord, fontScale: number): number[] {
  const px = tickerLabelPx(fontScale);
  return win.tabs.map((t) => measureLabel(FACETS[t.facet].title, px) + SEG_PAD);
}
