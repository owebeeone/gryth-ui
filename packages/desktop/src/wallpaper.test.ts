import { describe, expect, it } from 'vitest';
import { WALLPAPER_PAN, wallpaperPan } from './wallpaper';
import { DESKTOP_IDS } from './ops';

// The regression this guards: the travel must be a fraction of the CANVAS,
// never of whatever the image happens to overflow by. So the numbers below
// mention no image and no window size at all.
describe('wallpaperPan', () => {
  const layer = 100 + WALLPAPER_PAN;
  /** the shift expressed back in canvas percent, which is what is visible */
  const travelled = (current: number, desks: readonly number[] = DESKTOP_IDS) =>
    (-wallpaperPan(current, desks).shift * layer) / 100;

  it('is a layer wider than the canvas by the whole travel', () => {
    expect(wallpaperPan(1, DESKTOP_IDS).width).toBe(layer);
    expect(wallpaperPan(4, DESKTOP_IDS).width).toBe(layer);
  });

  it('travels the full pan from the first desktop to the last', () => {
    expect(travelled(1)).toBeCloseTo(0, 10);
    expect(travelled(4)).toBeCloseTo(WALLPAPER_PAN, 10);
  });

  it('spaces the desktops in between evenly', () => {
    expect(travelled(2)).toBeCloseTo(WALLPAPER_PAN / 3, 10);
    expect(travelled(3)).toBeCloseTo((WALLPAPER_PAN * 2) / 3, 10);
    // every step is movement: no two desks paint the same slice
    const shifts = DESKTOP_IDS.map((d) => wallpaperPan(d, DESKTOP_IDS).shift);
    expect(new Set(shifts).size).toBe(DESKTOP_IDS.length);
  });

  it('clamps a desktop outside the set instead of over-travelling', () => {
    expect(travelled(0)).toBeCloseTo(0, 10);
    expect(travelled(9)).toBeCloseTo(WALLPAPER_PAN, 10);
  });

  it('stands still, rather than emitting NaN, when there is nowhere to go', () => {
    for (const desks of [[], [1]]) {
      const pan = wallpaperPan(1, desks);
      expect(pan.shift).toBe(0);
      expect(Number.isNaN(pan.width)).toBe(false);
    }
  });
});
