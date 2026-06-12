import { describe, it, expect } from 'vitest';
import { bleedRect, squeezeScale, tickerWidths } from './ticker';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('tickerWidths', () => {
  it('fills the strip exactly', () => {
    const ws = tickerWidths({ naturals: [100, 80, 120], active: 0, hover: null, width: 600 });
    expect(sum(ws)).toBeCloseTo(600, 4);
  });

  it('scales up proportionally when everything fits', () => {
    const ws = tickerWidths({ naturals: [100, 100, 100], active: 1, hover: null, width: 600 });
    expect(ws).toEqual([200, 200, 200]);
  });

  it('guarantees the active tab a readable share when squeezed', () => {
    const ws = tickerWidths({ naturals: Array(10).fill(120), active: 3, hover: null, width: 300 });
    // floor = min(natural 120, max(34, 0.5 * 300) = 150) = 120
    expect(ws[3]).toBeGreaterThanOrEqual(119.9);
    expect(sum(ws)).toBeCloseTo(300, 4);
  });

  it('the active floor never exceeds its natural width', () => {
    const ws = tickerWidths({ naturals: [40, 200, 200, 200, 200], active: 0, hover: null, width: 300 });
    expect(ws[0]).toBeGreaterThanOrEqual(39.9);
    expect(ws[0]).toBeLessThanOrEqual(45);
  });

  it('guarantees the hovered tab a share when squeezed', () => {
    const ws = tickerWidths({ naturals: Array(10).fill(120), active: 0, hover: 7, width: 300 });
    // hover floor = min(natural 120, max(30, 0.4 * 300) = 120) = 120
    expect(ws[7]).toBeGreaterThanOrEqual(100);
    expect(sum(ws)).toBeCloseTo(300, 4);
  });

  it('a single tab takes the whole strip', () => {
    expect(tickerWidths({ naturals: [90], active: 0, hover: null, width: 480 })).toEqual([480]);
  });

  it('degrades to zeros when the strip has no width', () => {
    expect(tickerWidths({ naturals: [90, 90], active: 0, hover: null, width: 0 })).toEqual([0, 0]);
  });
});

describe('squeezeScale', () => {
  it('is 1 when the label fits', () => {
    expect(squeezeScale(80, 100)).toBe(1);
  });

  it('squeezes glyphs proportionally when it does not', () => {
    expect(squeezeScale(100, 80)).toBeCloseTo(0.8, 5);
  });

  it('never squeezes below the legibility floor', () => {
    expect(squeezeScale(100, 10)).toBeCloseTo(0.55, 5);
  });
});

describe('bleedRect', () => {
  const canvas = { w: 1200, h: 800 };

  it('centres the expanded bar on the anchor and grows it slightly taller', () => {
    const r = bleedRect({ x: 500, y: 100, w: 200, h: 24 }, 600, canvas);
    expect(r.w).toBe(600);
    expect(r.x).toBe(500 + 100 - 300);
    expect(r.y).toBe(95);
    expect(r.h).toBe(34);
  });

  it('never shrinks below the anchor width', () => {
    const r = bleedRect({ x: 100, y: 100, w: 300, h: 24 }, 150, canvas);
    expect(r.w).toBe(300);
  });

  it('clamps to the canvas with a margin', () => {
    const r = bleedRect({ x: 20, y: 2, w: 200, h: 24 }, 5000, canvas);
    expect(r.x).toBe(8);
    expect(r.w).toBe(1200 - 16);
    expect(r.y).toBe(4);
  });
});
