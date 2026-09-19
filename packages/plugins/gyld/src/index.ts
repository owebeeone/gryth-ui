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
import { AskWindow } from './ask/AskWindow';
import { askTabTaps } from './ask/askTabTaps';
import {
  GyldFocusTap, GyldSetTap, gyldIndexTap, gyldLandingTap, gyldLensPaletteTap,
  gyldPreviewLayoutTap, gyldRecordTap, gyldStoreTap,
} from './rootTaps';
import {
  ASK_ROLE, BROWSER_ROLE, COMPARE_ROLE, DECIDE_NOW_ROLE, DECIDE_ROLE, DETAIL_ROLE,
  DIFF_ROLE, STREAMS_ROLE, GYLD_ASK_TOOL, GYLD_BROWSER_TOOL, GYLD_COMPARE_TOOL,
  GYLD_DECIDE_NOW_TOOL, GYLD_DECIDE_TOOL, GYLD_DETAIL_TOOL, GYLD_DIFF_TOOL,
  GYLD_STREAMS_TOOL,
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
//
// THE LABELS ARE PLAIN, the tool IDS are not (GyldUiSimplification.md 2.3,
// owner ruling U5 of 2026-09-16: everywhere, not only in the Gyld-only
// target). `Graph`, `Streams`, `Details` and `Next up` are what a launcher
// shows, because a reader meeting this desk has to hold nine words already
// and the window names were four more. The ids stay `gyld.browser`,
// `gyld.streams`, `gyld.detail` and `gyld.decidenow`: they are what a stored
// layout, a wire and every link written inside this plugin resolve by, so
// renaming one would strand a desk. The three windows the report names no
// plain word for — decide, compare and diff — keep the labels they had.

// The plugin-root taps: the set atom, the shared focus atom, the one store tap
// and the two conversion taps. All are registered at the app's root context,
// so every gyld window resolves its own destination through the same stores
// and the same cache (spec section 3.4).
grok.registerTap(GyldSetTap);
grok.registerTap(GyldFocusTap);
grok.registerTap(gyldStoreTap);
grok.registerTap(gyldIndexTap);
grok.registerTap(gyldRecordTap);
grok.registerTap(gyldPreviewLayoutTap);
// And the palette conversion, so every lens view draws the emitted picture in
// colours that read on THIS desk's theme rather than on the light canvas the
// lens file was emitted for.
grok.registerTap(gyldLensPaletteTap);
// And the landing tap, which watches the mirrored glade presence so an empty
// desk puts the glade node on itself when the session comes up.
grok.registerTap(gyldLandingTap);

addEntry(GYLD_PLUGIN, {
  tools: {
    [GYLD_BROWSER_TOOL]: {
      label: 'Graph',
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
      label: 'Details',
      defaultSize: { w: 520, h: 620 },
      role: DETAIL_ROLE,
      windowComponent: RecordDetail,
      // Seeds ONLY when the opening link carries a destination: a window
      // opened wired to a browser must resolve the browser's record through
      // the graph, and a seed of its own would shadow it.
      tabTaps: detailTabTaps,
    },
    [GYLD_DECIDE_NOW_TOOL]: {
      label: 'Next up',
      defaultSize: { w: 560, h: 620 },
      role: DECIDE_NOW_ROLE,
      windowComponent: DecideNowList,
      tabTaps: decideNowTabTaps,
    },
    [GYLD_STREAMS_TOOL]: {
      label: 'Streams',
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
    [GYLD_ASK_TOOL]: {
      label: 'Ask',
      defaultSize: { w: 620, h: 760 },
      role: ASK_ROLE,
      windowComponent: AskWindow,
      // The conversation and the draft are always seeded; the destination only
      // when the opening link carries one, so a window opened wired to a
      // browser asks about the record that browser is on.
      tabTaps: askTabTaps,
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
  GYLD_BUNDLE, GYLD_LENS, GYLD_DECIDE_NOW, GYLD_VALIDATION, GYLD_SOURCES,
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
  GYLD_DEST_PREVIEW, GYLD_DEST_PREVIEW_TAP, GYLD_PREVIEW,
  GYLD_OPS, GYLD_OPS_RESULT, GYLD_OPS_RESULT_TAP, GYLD_OPS_RUN_ID,
  GYLD_OPS_RUN_ID_TAP, GYLD_OPS_STREAM, GYLD_OPS_STATUS,
  GYLD_ASK_CONVERSATION, GYLD_ASK_CONVERSATION_TAP, GYLD_ASK_STREAM,
  GYLD_LANDING, GYLD_NODE, GYLD_TAB_PICKED,
} from './grips';
export * from './ops/verbs';
export {
  createGyldOps, responseFrom,
  type GyldExchangeOutcome, type GyldOps, type GyldOpsResponse, type GyldOpsResult,
  type GyldOpsWire, type GyldOutputRecord,
} from './ops/ops';
export { GYLD_DOMAIN, GyldSurfaces, gyldAskTap, gyldOutputTap } from './ops/surfaces';
export {
  GYLD_STATIC_BASE, buildUrl, opsGate, retargetToBuild, type OpsGate,
} from './ops/submit';
export { OpsPanel } from './ops/OpsPanel';
export { DiffButton, ListButton, RebuildButton } from './ops/RebuildButton';
export * from './focus';
export * from './tools';
export {
  GyldFocusTap, GyldSetTap, gyldIndexTap, gyldLandingTap, gyldLensPaletteTap,
  gyldPreviewLayoutTap, gyldRecordTap, gyldStoreTap,
} from './rootTaps';
export { GyldLandingTap } from './landing/GyldLandingTap';
export {
  GladePresence, LANDING_UNSET, landingSays, landsGladeRoot,
  type GyldLanding, type LandingSays,
} from './landing/landing';
export { GyldPreviewLayoutTap, PREVIEW_UNSET } from './preview/GyldPreviewLayoutTap';
export { PreviewPerspective, type PreviewPlan } from './preview/neighbourhood';
export { PREVIEW_GRAPH_NAME, dotLabel, previewDot, quote } from './preview/dot';
export { geometryOf, previewDocument, type PreviewEngine } from './preview/document';
export {
  VIZ_PACKAGE, workerRenderer, type PreviewRenderResult, type PreviewRenderer,
} from './preview/renderer';
export * from './records/records';
export { GyldIndexTap, GyldRecordTap } from './records/taps';
export {
  GraphNote, HelpSection, HOW_TO_READ, HOW_TO_READ_TITLE,
  KIND_NOTES, RELATION_NOTES, STATUS_NOTES, kindSays, relationSays, statusSays,
} from './help/graphHelp';
export * from './lens/contrast';
export * from './lens/palette';
export * from './lens/camera';
export * from './lens/facets';
export * from './lens/flash';
export * from './lens/geometry';
export * from './lens/glyphs';
export * from './lens/legend';
export * from './lens/scene';
export { lensTabTaps } from './lens/lensTabTaps';
export {
  LensFigure, LensLegend, LensOmissions, LensProvenance, LensView,
} from './lens/LensView';
export {
  GYLD_TAB_CAMERA, GYLD_TAB_CAMERA_TAP, GYLD_TAB_CAMERA_DRAG, GYLD_TAB_CAMERA_DRAG_TAP,
  GYLD_TAB_SELECTION, GYLD_TAB_SELECTION_TAP, GYLD_TAB_HOVER, GYLD_TAB_HOVER_TAP,
  GYLD_TAB_DIMMED, GYLD_TAB_DIMMED_TAP, GYLD_LENS_PALETTE,
  GYLD_TAB_MENU, GYLD_TAB_MENU_TAP,
  GYLD_TAB_ASK_CONVERSATION, GYLD_TAB_ASK_CONVERSATION_TAP,
  GYLD_TAB_ASK_DRAFT, GYLD_TAB_ASK_DRAFT_TAP,
  GYLD_TAB_ASK_ANSWER, GYLD_TAB_ASK_ANSWER_TAP,
} from './grips';
export { BrowserChrome } from './browser/BrowserChrome';
export { GyldBrowser } from './GyldBrowser';
export { SetPicker } from './browser/SetPicker';
export { addDirectoryRoot, addShareRoot, addStaticRoot, describeRoot } from './browser/setOps';
export { browserTabTaps } from './browser/browserTabTaps';
export { GyldFirstPickTap } from './browser/GyldFirstPickTap';
export {
  NOTHING_PICKED, OPENING_PERSPECTIVE, firstPick, type GyldFirstPick,
} from './browser/firstPick';
export {
  askOn, decideOn, detailOn, focusOn, useBrowserFocus,
  type BrowserFocus, type BrowserFocusHandles,
} from './browser/useBrowserFocus';
export { NodeCard } from './browser/NodeCard';
export { NodeMenu } from './browser/NodeMenu';
export { AskWindow } from './ask/AskWindow';
export { askTabTaps, conversationFromParams } from './ask/askTabTaps';
export * from './ask/envelope';
export {
  AskStream, NO_REPLY, compareRunIds, foldAskReply, hasReply,
  type AskReply, type AskSaid, type AskTurn,
  type GyldAskCitation, type GyldAskRecord,
} from './ask/reply';
export { explainGate, explainSubmit } from './ask/submit';
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
export * from './decide/compose';
export * from './decide/symbols';
export { StreamManager } from './streams/StreamManager';
export { streamsTabTaps } from './streams/streamsTabTaps';
export * from './streams/operations';
export { streamSubmit } from './streams/submit';
export * from './streams/tree';
export { useStreamTarget, type StreamTarget } from './streams/useStreamTarget';
export { useKeyedContext } from './contexts';
export { DecideNowList } from './decidenow/DecideNowList';
export { groupQuestions, type Group } from './decidenow/groups';
export { decideNowTabTaps } from './decidenow/decideNowTabTaps';
export * from './browser/card';
export * from './browser/menu';
export * from './browser/links';
export * from './browser/nextUp';
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
export {
  GyldShareSurface, NothingPublished, ShareStore, readPointer, verified,
  type GyldFilePointer, type GyldShareProvider,
} from './store/shareStore';
export {
  BOOT_RUN, ROOT_WAITING, WAITING_REASON, anyWaiting, bootRunOf, isWaiting,
  rootLine, waitingSays,
} from './store/waiting';
