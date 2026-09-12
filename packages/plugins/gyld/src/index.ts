import { addEntry, grok } from '@grythjs/plugin-api';
import { GYLD_PLUGIN } from './grips';
import { GyldBrowser } from './GyldBrowser';
import { browserTabTaps } from './browser/browserTabTaps';
import { DecideNowList } from './decidenow/DecideNowList';
import { decideNowTabTaps } from './decidenow/decideNowTabTaps';
import { RecordDetail } from './detail/RecordDetail';
import { detailTabTaps } from './detail/detailTabTaps';
import { StreamManager } from './streams/StreamManager';
import { streamsTabTaps } from './streams/streamsTabTaps';
import { DecideWindow } from './decide/DecideWindow';
import { decideTabTaps } from './decide/decideTabTaps';
import { DiffWindow } from './diff/DiffWindow';
import { diffTabTaps } from './diff/diffTabTaps';
import { CompareWindow } from './compare/CompareWindow';
import { compareTabTaps } from './compare/compareTabTaps';
import { GyldFocusTap, GyldSetTap, gyldIndexTap, gyldRecordTap, gyldStoreTap } from './rootTaps';
import {
  BROWSER_ROLE, COMPARE_ROLE, DECIDE_NOW_ROLE, DECIDE_ROLE, DETAIL_ROLE, DIFF_ROLE,
  STREAMS_ROLE, GYLD_BROWSER_TOOL, GYLD_COMPARE_TOOL, GYLD_DECIDE_NOW_TOOL,
  GYLD_DECIDE_TOOL, GYLD_DETAIL_TOOL, GYLD_DIFF_TOOL, GYLD_STREAMS_TOOL,
} from './tools';
import './gyld.css';

// @grythjs/plugin-gyld: the Gyld decision-graph tools (see
// gyld-wz/dev-docs/ui/GyldGrythPlugins.md; hosting is IN-REPO per the owner
// rulings of 2026-09-13). Importing this module IS registering: the entry
// lands in the plugin registry under GYLD_PLUGIN.
//
// Phase 1 advertised the browser, the record detail and the decide-now list;
// Phase 2 added the stream manager, the decide window and the diff; step 3.2
// adds gyld.compare over an emitted evaluator run, which completes the tool
// set section 2 names. None was ever declared ahead of a window that can
// render it.

// The plugin-root taps: the set atom, the shared focus atom, the one store tap
// and the two conversion taps. All are registered at the app's root context,
// so every gyld window resolves its own destination through the same stores
// and the same cache (spec section 3.4).
grok.registerTap(GyldSetTap);
grok.registerTap(GyldFocusTap);
grok.registerTap(gyldStoreTap);
grok.registerTap(gyldIndexTap);
grok.registerTap(gyldRecordTap);

addEntry(GYLD_PLUGIN, {
  tools: {
    [GYLD_BROWSER_TOOL]: {
      label: 'Gyld browser',
      defaultSize: { w: 900, h: 620 },
      role: BROWSER_ROLE,
      windowComponent: GyldBrowser,
      // Per-tab seeds: the desktop registers these on the tab's chrome-held
      // home context at tab creation and retires them when the tab record
      // leaves the desktop document. `params` is the opening link, so a
      // reopened window comes back on the same destination.
      tabTaps: browserTabTaps,
    },
    [GYLD_DETAIL_TOOL]: {
      label: 'Gyld record',
      defaultSize: { w: 520, h: 620 },
      role: DETAIL_ROLE,
      windowComponent: RecordDetail,
      // Seeds ONLY when the opening link carries a destination: a window
      // opened wired to a browser must resolve the browser's record through
      // the graph, and a seed of its own would shadow it.
      tabTaps: detailTabTaps,
    },
    [GYLD_DECIDE_NOW_TOOL]: {
      label: 'Gyld decide now',
      defaultSize: { w: 560, h: 620 },
      role: DECIDE_NOW_ROLE,
      windowComponent: DecideNowList,
      tabTaps: decideNowTabTaps,
    },
    [GYLD_STREAMS_TOOL]: {
      label: 'Gyld streams',
      defaultSize: { w: 620, h: 640 },
      role: STREAMS_ROLE,
      windowComponent: StreamManager,
      // Seeds the drafts and nothing else: the manager has no destination of
      // its own, so a window opened wired to a browser resolves that
      // browser's and can retarget it.
      tabTaps: streamsTabTaps,
    },
    [GYLD_DECIDE_TOOL]: {
      label: 'Gyld decide',
      defaultSize: { w: 640, h: 760 },
      role: DECIDE_ROLE,
      windowComponent: DecideWindow,
      // The drafts are always seeded; the destination only when the opening
      // link carries one, so a window opened wired to a browser answers the
      // question that browser is on.
      tabTaps: decideTabTaps,
    },
    [GYLD_COMPARE_TOOL]: {
      label: 'Gyld compare',
      defaultSize: { w: 1100, h: 860 },
      role: COMPARE_ROLE,
      windowComponent: CompareWindow,
      // A RUN and one PROPOSAL of it, plus the run URL draft. Each side's own
      // state is seeded on its own child context instead.
      tabTaps: compareTabTaps,
    },
    [GYLD_DIFF_TOOL]: {
      label: 'Gyld diff',
      defaultSize: { w: 1100, h: 760 },
      role: DIFF_ROLE,
      windowComponent: DiffWindow,
      // A PAIR and a perspective, plus the record in hand the two panes share.
      // Each pane's own state is seeded on its own child context instead.
      tabTaps: diffTabTaps,
    },
  },
});

export {
  GYLD_PLUGIN,
  GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP,
  GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP,
  GYLD_SET, GYLD_SET_TAP, GYLD_STORE_STATUS, GYLD_STORE_RELOAD, GYLD_STREAMS,
  GYLD_BUNDLE, GYLD_LENS, GYLD_DECIDE_NOW, GYLD_VALIDATION,
  GYLD_DEST_REF, GYLD_DEST_REF_TAP, GYLD_RECORDS, GYLD_RECORD,
  GYLD_FOCUS, GYLD_FOCUS_TAP, GYLD_TAB_ID, GYLD_TAB_SEARCH, GYLD_TAB_SEARCH_TAP,
  GYLD_TAB_FOLLOW, GYLD_TAB_FOLLOW_TAP,
  GYLD_PICKER_URL, GYLD_PICKER_URL_TAP, GYLD_PICKER_ERROR, GYLD_PICKER_ERROR_TAP,
  GYLD_STREAM_DRAFT, GYLD_STREAM_DRAFT_TAP, GYLD_STREAM_EXPORT, GYLD_STREAM_EXPORT_TAP,
  GYLD_ANSWER_DRAFT, GYLD_ANSWER_DRAFT_TAP, GYLD_ANSWER_EXPORT, GYLD_ANSWER_EXPORT_TAP,
  GYLD_ASK_DRAFT, GYLD_ASK_DRAFT_TAP, GYLD_ASK_EXPORT, GYLD_ASK_EXPORT_TAP,
  GYLD_DEST_LEFT, GYLD_DEST_LEFT_TAP, GYLD_DEST_RIGHT, GYLD_DEST_RIGHT_TAP,
  GYLD_DIFF, GYLD_DIFF_SLOT, GYLD_DIFF_SLOT_TAP,
  GYLD_DEST_RUN, GYLD_DEST_RUN_TAP, GYLD_DEST_PROPOSAL, GYLD_DEST_PROPOSAL_TAP,
  GYLD_DEST_SIDE, GYLD_RUN, GYLD_COMPARISON, GYLD_RUN_DRAFT, GYLD_RUN_DRAFT_TAP,
} from './grips';
export * from './focus';
export * from './tools';
export {
  GyldFocusTap, GyldSetTap, gyldIndexTap, gyldRecordTap, gyldStoreTap,
} from './rootTaps';
export * from './records/records';
export { GyldIndexTap, GyldRecordTap } from './records/taps';
export * from './lens/camera';
export * from './lens/facets';
export * from './lens/geometry';
export * from './lens/scene';
export { lensTabTaps } from './lens/lensTabTaps';
export {
  LensFigure, LensLegend, LensOmissions, LensProvenance, LensView,
} from './lens/LensView';
export {
  GYLD_TAB_CAMERA, GYLD_TAB_CAMERA_TAP, GYLD_TAB_CAMERA_DRAG, GYLD_TAB_CAMERA_DRAG_TAP,
  GYLD_TAB_SELECTION, GYLD_TAB_SELECTION_TAP, GYLD_TAB_HOVER, GYLD_TAB_HOVER_TAP,
  GYLD_TAB_DIMMED, GYLD_TAB_DIMMED_TAP,
} from './grips';
export { BrowserChrome } from './browser/BrowserChrome';
export { GyldBrowser } from './GyldBrowser';
export { SetPicker } from './browser/SetPicker';
export { addDirectoryRoot, addStaticRoot } from './browser/setOps';
export { browserTabTaps } from './browser/browserTabTaps';
export { useBrowserFocus, type BrowserFocus } from './browser/useBrowserFocus';
export { DETAIL_FOCUS_CONTEXT, RecordDetail } from './detail/RecordDetail';
export { detailTabTaps } from './detail/detailTabTaps';
export { FocusDestTap } from './detail/followFocus';
export { CompareWindow } from './compare/CompareWindow';
export { compareTabTaps, sideTabTaps } from './compare/compareTabTaps';
export * from './compare/report';
export * from './compare/sides';
export { DiffWindow } from './diff/DiffWindow';
export { diffTabTaps, paneTabTaps } from './diff/diffTabTaps';
export * from './diff/panes';
export { DecideWindow } from './decide/DecideWindow';
export { decideTabTaps } from './decide/decideTabTaps';
export * from './decide/drafts';
export * from './decide/overlay';
export * from './decide/symbols';
export { StreamManager } from './streams/StreamManager';
export { streamsTabTaps } from './streams/streamsTabTaps';
export * from './streams/operations';
export * from './streams/tree';
export { useStreamTarget, type StreamTarget } from './streams/useStreamTarget';
export { useKeyedContext } from './contexts';
export { DecideNowList } from './decidenow/DecideNowList';
export { groupQuestions, type Group } from './decidenow/groups';
export { decideNowTabTaps } from './decidenow/decideNowTabTaps';
export * from './browser/links';
export * from './browser/perspectives';
export * from './browser/search';
export { directoryPicker, isPickerCancel } from './browser/fsAccess';
export * from './store/state';
export { GyldStoreTap, DEFAULT_POLL_MS, RUN_INDEX_PATH } from './store/GyldStoreTap';
export {
  DirectoryStore, StaticStore, parseAutoindexNames,
  type FetchLike, type GyldDirectoryHandle, type GyldStore,
} from './store/stores';
export * from './store/layout';
