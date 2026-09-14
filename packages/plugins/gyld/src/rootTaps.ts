import { createAtomValueTap, createFunctionTap } from '@owebeeone/grip-react';
import { DESKTOP_THEME } from '@grythjs/desktop';
import { GYLD_FOCUS, GYLD_FOCUS_TAP, GYLD_LENS_PALETTE, GYLD_SET, GYLD_SET_TAP } from './grips';
import { NO_FOCUS } from './focus';
import { paletteOf } from './lens/palette';
import { EMPTY_SET } from './store/state';
import { GyldStoreTap } from './store/GyldStoreTap';
import { GyldIndexTap, GyldRecordTap } from './records/taps';
import { GyldLandingTap } from './landing/GyldLandingTap';
import { GyldPreviewLayoutTap } from './preview/GyldPreviewLayoutTap';

// The plugin-root taps. They live here rather than in index.ts so a gesture in
// a view can reach `gyldStoreTap.setDirectoryHandle(...)` without importing
// the registration module, which would be an import cycle.

/** The set of bundle roots. Class 1 atom, environ scope (see grips.ts). It
 *  starts EMPTY: a desk with no root shows the picker, and the plugin never
 *  invents a place to read Gyld output from. */
export const GyldSetTap = createAtomValueTap(GYLD_SET, {
  initial: EMPTY_SET,
  handleGrip: GYLD_SET_TAP,
});

/** The cross-window focus (spec section 3.2). Plugin root, not per tab: it is
 *  what several windows share to correlate dimensions (MDV-5), and it starts
 *  at nothing rather than at some record the user never picked. */
export const GyldFocusTap = createAtomValueTap(GYLD_FOCUS, {
  initial: NO_FOCUS,
  handleGrip: GYLD_FOCUS_TAP,
});

/**
 * `Gyld.Lens.Palette`: the colours the lens views DRAW with, converted from
 * the desk's theme and the theme table. A class 3 conversion — one grip in,
 * one grip out, no store, no clock — so one instance at the plugin root
 * serves every window, and switching the theme in Settings redraws every open
 * picture with no window state to keep in step.
 *
 * The theme is a HOME parameter: it is one desk-wide fact, not something a
 * window carries per destination. `Desktop.Theme` defaults to `light`, so a
 * target that ships no appearance editor still resolves a palette.
 */
export const gyldLensPaletteTap = createFunctionTap<
  { palette: typeof GYLD_LENS_PALETTE },
  { theme: typeof DESKTOP_THEME }
>({
  provides: [GYLD_LENS_PALETTE],
  homeParamGrips: [DESKTOP_THEME],
  compute: ({ getHomeParam }) => new Map([
    [GYLD_LENS_PALETTE, paletteOf(getHomeParam(DESKTOP_THEME) ?? 'light')],
  ]),
});

/** The one store tap for this plugin (spec section 3.4: registered once at the
 *  plugin root). Directory handles are runtime-only state on this instance. */
export const gyldStoreTap = new GyldStoreTap();

/** The two conversion taps over whatever the store tap resolved for a
 *  destination. Pure, so one instance serves every window. */
export const gyldIndexTap = new GyldIndexTap();
export const gyldRecordTap = new GyldRecordTap();

/** What an empty desk lands on. It watches the mirrored glade presence and,
 *  on the edge into ready with no root of any kind, adds the glade node the
 *  way `Add glade node` does — once, in the tap layer, never in a component. */
export const gyldLandingTap = new GyldLandingTap();

/** The one browser-side layout tap (step 3.1). It owns the wasm Graphviz
 *  worker, which it starts on the first preview a window asks for and stops
 *  when no window is asking, so a desk with no preview open carries none. */
export const gyldPreviewLayoutTap = new GyldPreviewLayoutTap();
