// The wallpaper is ONE wide image panned across the virtual desktops
// (see grips.desktop.ts): switching desks slides it a little, so four desks
// read as places in one world rather than four identical screens.
//
// That pan CANNOT be expressed as a percentage `background-position` over a
// `cover` background, which is how it was written. `cover` scales the image
// by the SMALLER factor that still covers the box, so the pannable band is
// only whatever the image happens to overflow the canvas by — and that band
// is exactly zero for every canvas at least as wide-for-its-height as the
// image. The shipped wallpapers are 1024x572 (1.79:1), so on a wide window
// the parallax silently vanished: 0% and 100% painted the very same pixels
// (measured: a 1583x760 canvas overflows by 0px).
//
// The band therefore has to be OURS rather than the image's. The wallpaper
// gets a layer that is deliberately WIDER than the canvas, `cover`s that
// larger box — so it still covers the canvas at either extreme — and slides
// by the surplus. The travel is then the same fraction of the canvas at
// every window shape, for every image, including a custom one.

/** How much wider than the canvas the wallpaper layer is, as a percentage of
 *  the canvas width. It is also the TOTAL travel from the first desktop to
 *  the last: a shift that reads as movement without becoming a slideshow. */
export const WALLPAPER_PAN = 8;

export interface WallpaperPan {
  /** Layer width, as a percentage of the canvas width. */
  width: number;
  /** Layer offset, as a percentage of the LAYER's own width — which is what
   *  a percentage in `translateX()` resolves against. Negative: the first
   *  desktop shows the image's left edge and later desks travel right. */
  shift: number;
}

/** Where the wallpaper layer sits for `current`, given the desktop set.
 *  Pure: the chrome turns the two numbers into custom properties and CSS
 *  does the rest. */
export function wallpaperPan(current: number, desks: readonly number[]): WallpaperPan {
  const width = 100 + WALLPAPER_PAN;
  const first = desks[0];
  const last = desks[desks.length - 1];
  // A single desktop (or none) has nowhere to travel. Guarding the span is
  // what keeps the division from being 0 and painting NaN into the style.
  const span = desks.length > 1 ? last - first : 0;
  const raw = span > 0 ? (current - first) / span : 0;
  const fraction = Math.min(1, Math.max(0, raw));
  const travel = (fraction * WALLPAPER_PAN * 100) / width;
  // negated only when there is travel, so a still wallpaper is 0 and not -0
  return { width, shift: travel === 0 ? 0 : -travel };
}
