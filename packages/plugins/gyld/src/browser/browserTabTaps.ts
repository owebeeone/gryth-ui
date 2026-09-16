import { createAtomValueTap, type Tap } from '@owebeeone/grip-react';
import {
  GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP, GYLD_DEST_REF, GYLD_DEST_REF_TAP,
  GYLD_DEST_PREVIEW, GYLD_DEST_PREVIEW_TAP, GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP,
  GYLD_PICKER_ERROR, GYLD_PICKER_ERROR_TAP, GYLD_PICKER_URL, GYLD_PICKER_URL_TAP,
  GYLD_TAB_DRAFT_TAKEN, GYLD_TAB_DRAFT_TAKEN_TAP, GYLD_TAB_ID, GYLD_TAB_MENU,
  GYLD_TAB_MENU_TAP, GYLD_TAB_SEARCH, GYLD_TAB_SEARCH_TAP,
  perspectiveFromParams, previewFromParams, refFromParams, streamFromParams,
} from '../grips';
import { NOTHING_TAKEN } from '../decide/drafts';
import { lensTabTaps } from '../lens/lensTabTaps';
import { GyldFirstPickTap } from './GyldFirstPickTap';
import { MENU_CLOSED } from './menu';

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
    // The question this window previews the neighbourhood of, when the link
    // asked for one. Empty is the normal case: the window draws the emitted
    // lens its perspective names and no layout runs in the browser at all.
    createAtomValueTap(GYLD_DEST_PREVIEW, {
      initial: previewFromParams(params), handleGrip: GYLD_DEST_PREVIEW_TAP,
    }),
    createAtomValueTap(GYLD_TAB_SEARCH, { initial: '', handleGrip: GYLD_TAB_SEARCH_TAP }),
    // The node menu, one per window: a right-click or a shift-click on a box
    // writes it and every dismissal writes it back. Seeded HERE rather than in
    // lensTabTaps because the menu is the browser's own act surface — a diff
    // pane and a compare side draw a picture and offer no acts on it, so they
    // seed none and read the closed default.
    createAtomValueTap(GYLD_TAB_MENU, { initial: MENU_CLOSED, handleGrip: GYLD_TAB_MENU_TAP }),
    // This window's own address, published so a wired sink can retarget it.
    createAtomValueTap(GYLD_TAB_ID, { initial: tabId }),
    // The hand-off between two of this browser's sinks: a ruling the agent
    // drafted in the ask window and a reader took into the decide window
    // (GyldAskAgent.md section 8). It is seeded HERE, on the source, because
    // the browser is the only context both sinks resolve.
    createAtomValueTap(GYLD_TAB_DRAFT_TAKEN, {
      initial: NOTHING_TAKEN, handleGrip: GYLD_TAB_DRAFT_TAKEN_TAP,
    }),
    // The set picker's drafts, per window, so two desks pick independently.
    createAtomValueTap(GYLD_PICKER_URL, { initial: '', handleGrip: GYLD_PICKER_URL_TAP }),
    createAtomValueTap(GYLD_PICKER_ERROR, { initial: '', handleGrip: GYLD_PICKER_ERROR_TAP }),
    // The lens view's own state: camera, drag, selection, hover, dim set.
    ...lensTabTaps(),
    // LAST, so the atoms above are registered before it reads them: the tap
    // that opens a window on what the census puts first when the link named
    // nothing. It only ever fills a seed that is empty (./firstPick.ts).
    new GyldFirstPickTap(),
  ];
}
