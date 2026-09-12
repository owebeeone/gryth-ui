import { createAtomValueTap, type Tap } from '@owebeeone/grip-react';
import {
  GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP, GYLD_DEST_REF, GYLD_DEST_REF_TAP,
  GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP, GYLD_PICKER_ERROR, GYLD_PICKER_ERROR_TAP,
  GYLD_PICKER_URL, GYLD_PICKER_URL_TAP, GYLD_TAB_ID, GYLD_TAB_SEARCH, GYLD_TAB_SEARCH_TAP,
  perspectiveFromParams, refFromParams, streamFromParams,
} from '../grips';
import { lensTabTaps } from '../lens/lensTabTaps';

// The gyld.browser seeds. The desktop registers these on the tab's chrome-held
// home context at tab creation and retires them when the tab record leaves the
// desktop document, so a window keeps its camera, its selection and its search
// across an unmount and comes back on the same destination after a reload.
//
// `params` is the opening LINK. Nothing is invented from it: a link with no
// stream seeds an empty stream, which the window renders as "no destination",
// and a non-string param is ignored rather than coerced.

export function browserTabTaps(tabId: string, params?: Record<string, unknown>): Tap[] {
  return [
    createAtomValueTap(GYLD_DEST_STREAM, {
      initial: streamFromParams(params), handleGrip: GYLD_DEST_STREAM_TAP,
    }),
    createAtomValueTap(GYLD_DEST_PERSPECTIVE, {
      initial: perspectiveFromParams(params), handleGrip: GYLD_DEST_PERSPECTIVE_TAP,
    }),
    // The browser is a record SOURCE: a click writes this, and a detail or
    // decide-now window wired to this tab resolves it through the graph.
    createAtomValueTap(GYLD_DEST_REF, {
      initial: refFromParams(params), handleGrip: GYLD_DEST_REF_TAP,
    }),
    createAtomValueTap(GYLD_TAB_SEARCH, { initial: '', handleGrip: GYLD_TAB_SEARCH_TAP }),
    // This window's own address, published so a wired sink can retarget it.
    createAtomValueTap(GYLD_TAB_ID, { initial: tabId }),
    // The set picker's drafts, per window, so two desks pick independently.
    createAtomValueTap(GYLD_PICKER_URL, { initial: '', handleGrip: GYLD_PICKER_URL_TAP }),
    createAtomValueTap(GYLD_PICKER_ERROR, { initial: '', handleGrip: GYLD_PICKER_ERROR_TAP }),
    // The lens view's own state: camera, drag, selection, hover, dim set.
    ...lensTabTaps(),
  ];
}
