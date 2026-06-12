import type { Rect } from './ops';

// The shaped-ticker tab strip: pure width solving for the slanted-segment
// strip and its bleed-out picker. One solver serves every surface — the
// header strip and the inflated picker differ only in the width they pass.
//
// Model: each tab wants its natural label width; the strip is ALWAYS filled
// exactly (segments share the full width, scaling up or down). When squeezed,
// the active tab (and the hovered one) are guaranteed a readable floor and
// the rest absorb it — so the strip stays navigable at any width.

export interface TickerSolveInput {
  naturals: number[];   // natural segment widths (label + padding), px
  active: number;       // index of the active tab
  hover: number | null; // index of the hovered tab, if any
  width: number;        // strip width to fill, px
}

// Slant of the shared segment edges (horizontal offset top vs bottom), px.
export const TICKER_SLANT = 6;
// Horizontal padding a segment adds around its label (both sides + slack).
export const SEG_PAD = 24;
// Glyphs squeeze down to this fraction before the clip takes over.
export const MIN_SQUEEZE = 0.55;

// Re-weight ws[idx] so its normalized share of `width` is at least `m`.
function ensureMin(ws: number[], idx: number, width: number, m: number): void {
  if (idx < 0 || idx >= ws.length || m <= 0) return;
  const capped = Math.min(m, width * 0.8);
  const tot = ws.reduce((a, b) => a + b, 0);
  if ((width * ws[idx]) / tot >= capped) return;
  const others = tot - ws[idx];
  if (width - capped <= 0) return;
  ws[idx] = (capped * others) / (width - capped);
}

export function tickerWidths(s: TickerSolveInput): number[] {
  const n = s.naturals.length;
  if (n === 0) return [];
  if (s.width <= 0) return s.naturals.map(() => 0);
  if (n === 1) return [s.width];
  const ws = s.naturals.map((w) => Math.max(1, w));
  ensureMin(ws, s.active, s.width, Math.min(ws[s.active] ?? 0, Math.max(34, s.width * 0.5)));
  if (s.hover !== null && s.hover !== s.active) {
    ensureMin(ws, s.hover, s.width, Math.min(ws[s.hover] ?? 0, Math.max(30, s.width * 0.4)));
  }
  const tot = ws.reduce((a, b) => a + b, 0);
  return ws.map((w) => (w * s.width) / tot);
}

// How hard a label's glyphs squeeze into `avail` px (1 = natural). Below
// MIN_SQUEEZE legibility is gone — stop there and let overflow clip.
export function squeezeScale(natural: number, avail: number): number {
  if (natural <= 0) return 1;
  return Math.min(1, Math.max(MIN_SQUEEZE, avail / natural));
}

// Segment BOX geometry: each box extends one slant past its share on every
// interior side so neighbouring trapezoids interlock; clip-path carves the
// shared edges (see clipFor), and a small gap lets the titlebar show
// through as the visible slant line.
export const TICKER_GAP = 1.5;

export function tickerBoxes(ws: number[]): { left: number; width: number }[] {
  let x = 0;
  return ws.map((w, i) => {
    const first = i === 0;
    const last = i === ws.length - 1;
    const box = {
      left: first ? x : x - TICKER_SLANT,
      width: w + (first ? 0 : TICKER_SLANT) + (last ? 0 : TICKER_SLANT),
    };
    x += w;
    return box;
  });
}

export function clipFor(i: number, n: number): string | undefined {
  if (n === 1) return undefined;
  const S = TICKER_SLANT;
  const G = TICKER_GAP;
  const first = i === 0;
  const last = i === n - 1;
  const tl = first ? '0 0' : `${2 * S + G}px 0`;
  const tr = last ? '100% 0' : `calc(100% - ${G}px) 0`;
  const br = last ? '100% 100%' : `calc(100% - ${2 * S + G}px) 100%`;
  const bl = first ? '0 100%' : `${G}px 100%`;
  return `polygon(${tl}, ${tr}, ${br}, ${bl})`;
}

// The bleed picker's expanded rect: centred on the anchor strip, wide enough
// for every natural label (clamped to the canvas), slightly taller so it
// reads as the same bar inflated in place.
export function bleedRect(anchor: Rect, needed: number, canvas: { w: number; h: number }): Rect {
  const margin = 8;
  const w = Math.min(canvas.w - margin * 2, Math.max(needed, anchor.w));
  const x = Math.max(margin, Math.min(anchor.x + anchor.w / 2 - w / 2, canvas.w - margin - w));
  return { x, y: Math.max(4, anchor.y - 5), w, h: anchor.h + 10 };
}
