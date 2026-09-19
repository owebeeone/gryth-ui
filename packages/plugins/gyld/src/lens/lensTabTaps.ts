import { createAtomValueTap, type Tap } from '@owebeeone/grip-react';
import {
  GYLD_TAB_CAMERA, GYLD_TAB_CAMERA_DRAG, GYLD_TAB_CAMERA_DRAG_TAP, GYLD_TAB_CAMERA_TAP,
  GYLD_TAB_CARD_SIZE, GYLD_TAB_CARD_SIZE_TAP,
  GYLD_TAB_DIMMED, GYLD_TAB_DIMMED_TAP, GYLD_TAB_FLASH, GYLD_TAB_FLASH_TAP,
  GYLD_TAB_HOVER, GYLD_TAB_HOVER_TAP, GYLD_TAB_LEGEND, GYLD_TAB_LEGEND_TAP,
  GYLD_TAB_SELECTION, GYLD_TAB_SELECTION_TAP,
} from '../grips';
import { PANEL_UNMEASURED } from '../browser/placement';
import { CAMERA_UNFITTED, NOTHING_DIMMED, NO_SELECTION } from './camera';
import { NOT_FLASHING } from './flash';
import { LegendPanel } from './legendPanel';

// The lens view's per-tab seeds. One set per window, registered on the tab's
// chrome-held home context, so two windows on the same lens pan, select and
// dim independently and a window keeps its view across an unmount.

/**
 * @param legend how this window's legend overlay was left, out of the opening
 * link's params. A window whose link names none opens it shrunk, which is
 * every window but a browser restored from a desk that had it open.
 */
export function lensTabTaps(legend: LegendPanel = LegendPanel.SHRUNK): Tap[] {
  return [
    createAtomValueTap(GYLD_TAB_CAMERA, {
      initial: CAMERA_UNFITTED, handleGrip: GYLD_TAB_CAMERA_TAP,
    }),
    createAtomValueTap(GYLD_TAB_CAMERA_DRAG, {
      initial: undefined, handleGrip: GYLD_TAB_CAMERA_DRAG_TAP,
    }),
    createAtomValueTap(GYLD_TAB_SELECTION, {
      initial: NO_SELECTION, handleGrip: GYLD_TAB_SELECTION_TAP,
    }),
    createAtomValueTap(GYLD_TAB_HOVER, { initial: '', handleGrip: GYLD_TAB_HOVER_TAP }),
    createAtomValueTap(GYLD_TAB_DIMMED, {
      initial: NOTHING_DIMMED, handleGrip: GYLD_TAB_DIMMED_TAP,
    }),
    // The legend overlay, seeded from the link so a restored desk comes back
    // with it the way it was left, and the flash it is not showing yet.
    createAtomValueTap(GYLD_TAB_LEGEND, { initial: legend, handleGrip: GYLD_TAB_LEGEND_TAP }),
    createAtomValueTap(GYLD_TAB_FLASH, {
      initial: NOT_FLASHING, handleGrip: GYLD_TAB_FLASH_TAP,
    }),
    // What the panel over a box last measured of itself and of this window's
    // stage. Seeded here rather than with the menu, because the hover card is
    // drawn by every picture — a diff pane and a compare side included — and
    // each of them clips its own panels at its own edges.
    createAtomValueTap(GYLD_TAB_CARD_SIZE, {
      initial: PANEL_UNMEASURED, handleGrip: GYLD_TAB_CARD_SIZE_TAP,
    }),
  ];
}
