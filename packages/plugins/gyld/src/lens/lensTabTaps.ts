import { createAtomValueTap, type Tap } from '@owebeeone/grip-react';
import {
  GYLD_TAB_CAMERA, GYLD_TAB_CAMERA_DRAG, GYLD_TAB_CAMERA_DRAG_TAP, GYLD_TAB_CAMERA_TAP,
  GYLD_TAB_DIMMED, GYLD_TAB_DIMMED_TAP, GYLD_TAB_HOVER, GYLD_TAB_HOVER_TAP,
  GYLD_TAB_SELECTION, GYLD_TAB_SELECTION_TAP,
} from '../grips';
import { CAMERA_UNFITTED, NOTHING_DIMMED, NO_SELECTION } from './camera';

// The lens view's per-tab seeds. One set per window, registered on the tab's
// chrome-held home context, so two windows on the same lens pan, select and
// dim independently and a window keeps its view across an unmount.

export function lensTabTaps(): Tap[] {
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
  ];
}
