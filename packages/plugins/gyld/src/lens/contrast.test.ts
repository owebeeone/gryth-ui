import { describe, it, expect } from 'vitest';
import { THEMES } from '@grythjs/desktop';
import { readLens } from '../contract';
import {
  MIN_GRAPHIC_RATIO, MIN_TEXT_RATIO, adaptToCanvas, contrastRatio, hslToRgb, parseHex,
  relativeLuminance, rgbToHsl, textOn, toHex,
} from './contrast';
import { LENS_PALETTE_LIGHT, inkOn, labelOn, lineOn, paletteOf } from './palette';
import decisionsFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';
import branchFixture from '../../test/fixtures/bundle/streams/base/lenses/branch.lens.json';

// The defect these tests hold shut: the lens files are emitted for a LIGHT
// canvas, so their pastel fills and dark relation colours are unreadable on a
// dark desk unless the view adapts them. Every colour below is a real one —
// the fixtures' emitted fills and legend colours, against the real `--win` of
// the shipped themes.

const lens = readLens(decisionsFixture);
const branch = readLens(branchFixture);
const LIGHT = THEMES.light.vars['--win'];
const DARK = THEMES.dark.vars['--win'];

describe('WCAG arithmetic', () => {
  it('parses both hex spellings and rejects what it cannot measure', () => {
    expect(parseHex('#dcfce7')).toEqual({ r: 220, g: 252, b: 231 });
    expect(parseHex('#DCFCE7')).toEqual({ r: 220, g: 252, b: 231 });
    expect(parseHex('#abc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseHex('currentColor')).toBeNull();
    expect(parseHex('var(--win)')).toBeNull();
    expect(parseHex('rebeccapurple')).toBeNull();
  });

  it('agrees with the reference luminances and the 21:1 extreme', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 10);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 10);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 6);
    expect(contrastRatio('#dcfce7', '#dcfce7')).toBeCloseTo(1, 10);
    // Nothing is CLAIMED for a colour that could not be measured.
    expect(contrastRatio('currentColor', '#ffffff')).toBe(1);
  });

  it('round-trips a colour through HSL', () => {
    for (const color of ['#1f4e79', '#b45309', '#6b7280', '#dcfce7', '#7c3aed']) {
      expect(toHex(hslToRgb(rgbToHsl(parseHex(color)!)))).toBe(color);
    }
  });
});

describe('the emitted colours on a light canvas', () => {
  it('leaves every emitted legend colour alone: it is already legible there', () => {
    for (const entry of [...lens.legend.edges, ...branch.legend.edges]) {
      expect(contrastRatio(entry.color, LIGHT)).toBeGreaterThanOrEqual(MIN_GRAPHIC_RATIO);
      expect(adaptToCanvas(entry.color, LIGHT, MIN_GRAPHIC_RATIO)).toBe(entry.color);
    }
  });

  it("writes node text in the desk's own text colour on every emitted fill", () => {
    for (const entry of lens.legend.nodes) {
      const ink = inkOn(LENS_PALETTE_LIGHT, entry.fill);
      expect(ink).toBe(THEMES.light.vars['--text']);
      expect(contrastRatio(ink, entry.fill)).toBeGreaterThanOrEqual(MIN_TEXT_RATIO);
    }
  });
});

describe('the emitted colours on a dark canvas', () => {
  const palette = paletteOf('dark');

  it('is the defect: the emitted colours fail both minima against `--win`', () => {
    // The bug in numbers. `Requires` on the dark window surface, and the desk's
    // own light text on the pastel a Lean question is filled with.
    expect(contrastRatio('#1f4e79', DARK)).toBeLessThan(MIN_GRAPHIC_RATIO);
    expect(contrastRatio(THEMES.dark.vars['--text'], '#dcfce7')).toBeLessThan(MIN_TEXT_RATIO);
  });

  it('lifts every emitted relation colour to the graphical minimum', () => {
    for (const entry of [...lens.legend.edges, ...branch.legend.edges]) {
      const moved = lineOn(palette, entry.color);
      expect(contrastRatio(moved, DARK)).toBeGreaterThanOrEqual(MIN_GRAPHIC_RATIO);
      expect(contrastRatio(labelOn(palette, entry.color), DARK))
        .toBeGreaterThanOrEqual(MIN_TEXT_RATIO);
      // The hue survives: an adapted `Implies` is still the amber the legend
      // names it by, only lighter. A near-grey is exempt, because 8-bit
      // rounding swings the hue of a colour that barely has one and
      // `GatedBy`'s #6b7280 carries 9% saturation.
      const before = rgbToHsl(parseHex(entry.color)!);
      const after = rgbToHsl(parseHex(moved)!);
      if (before.s >= 0.2) {
        expect(after.h).toBeCloseTo(before.h, 0);
      }
      expect(after.l).toBeGreaterThan(before.l);
    }
  });

  it('turns node text over to the ink that reads on the emitted fill', () => {
    for (const entry of lens.legend.nodes) {
      const ink = inkOn(palette, entry.fill);
      expect(ink).toBe(THEMES.dark.vars['--win']);
      expect(contrastRatio(ink, entry.fill)).toBeGreaterThanOrEqual(MIN_TEXT_RATIO);
    }
  });

  it('keeps a node with no emitted fill on the canvas readable', () => {
    const ink = inkOn(palette, undefined);
    expect(ink).toBe(THEMES.dark.vars['--text']);
    expect(contrastRatio(ink, palette.canvas)).toBeGreaterThanOrEqual(MIN_TEXT_RATIO);
  });

  it('draws an uncoloured line in a stroke that is visible on the canvas', () => {
    expect(contrastRatio(lineOn(palette, undefined), DARK))
      .toBeGreaterThanOrEqual(MIN_GRAPHIC_RATIO);
  });
});

describe('every shipped theme', () => {
  it('gives a palette whose inks and stroke clear the minima on every fill', () => {
    for (const id of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
      const palette = paletteOf(id);
      expect(palette.canvas).toBe(THEMES[id].vars['--win']);
      expect(contrastRatio(palette.stroke, palette.canvas))
        .toBeGreaterThanOrEqual(MIN_GRAPHIC_RATIO);
      // Solarized Light is why `inkOn` does not stop at picking the better
      // of the two inks: neither of its own clears 4.5:1 on a pale blue.
      for (const entry of [...lens.legend.nodes, ...branch.legend.nodes]) {
        expect(contrastRatio(inkOn(palette, entry.fill), entry.fill))
          .toBeGreaterThanOrEqual(MIN_TEXT_RATIO);
      }
      for (const entry of [...lens.legend.edges, ...branch.legend.edges]) {
        expect(contrastRatio(lineOn(palette, entry.color), palette.canvas))
          .toBeGreaterThanOrEqual(MIN_GRAPHIC_RATIO);
      }
    }
  });

  it('hands the same palette object back for an unchanged theme', () => {
    expect(paletteOf('dark')).toBe(paletteOf('dark'));
  });
});

describe('adapting a colour it cannot escape', () => {
  it('stops at the end of the road rather than looping', () => {
    // 21:1 is the most any pair can give, so a 21:1 demand against a mid grey
    // is unreachable; the answer is the extreme, not a hang.
    const answer = adaptToCanvas('#808080', '#808080', 21);
    expect(parseHex(answer)).not.toBeNull();
  });

  it('leaves a colour it cannot measure exactly as it was handed it', () => {
    expect(adaptToCanvas('currentColor', DARK, MIN_GRAPHIC_RATIO)).toBe('currentColor');
    expect(textOn('currentColor', [])).toBe('currentColor');
  });
});
