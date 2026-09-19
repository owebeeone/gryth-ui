import type { AtomTapHandle } from '@owebeeone/grip-react';
import { defineGrip, type GrythPlugin } from '@grythjs/plugin-api';
import type {
  GyldComparison, GyldDecideNow, GyldEvaluatorRun, GyldSources, GyldStreamDiff,
  GyldValidation,
} from './contract';
import {
  BUNDLE_UNSET, CENSUS_EMPTY, EMPTY_SET, LENS_UNSET, VALUE_UNSET,
  type GyldBundle, type GyldLensState, type GyldRootStatus, type GyldSet,
  type GyldStreamsCensus, type GyldValue,
} from './store/state';
import {
  RECORDS_UNSET, RECORD_UNSET, type GyldRecordView, type GyldRecords,
} from './records/records';
import {
  CAMERA_UNFITTED, NOTHING_DIMMED, NO_SELECTION,
  type GyldCamera, type GyldCameraDrag, type GyldDimmed, type GyldSelection,
} from './lens/camera';
import { LegendPanel } from './lens/legendPanel';
import { NOT_FLASHING, type GyldFlash } from './lens/flash';
import { LENS_PALETTE_LIGHT, type GyldLensPalette } from './lens/palette';
import { NO_FOCUS, type GyldFocus } from './focus';
import { LANDING_UNSET, type GyldLanding } from './landing/landing';
import { NOTHING_PICKED, type GyldFirstPick } from './browser/firstPick';
import { MENU_CLOSED, type GyldNodeMenu } from './browser/menu';
import { PANEL_UNMEASURED, type GyldPanelFit } from './browser/placement';
import type {
  GyldOps, GyldOpsResponse, GyldOpsResult, GyldOutputRecord,
} from './ops/ops';
import type { GyldAskRecord } from './ask/reply';
import { NO_CONVERSATION, type AskConversation } from './ask/conversation';
import { NOTHING_OPEN, type AskCitationsOpen } from './ask/citations';
import { DRAFT_EMPTY, type StreamDraft } from './streams/operations';
import {
  ANSWER_EMPTY, ASK_EMPTY, NOTHING_TAKEN,
  type AnswerDraft, type AskDraft, type TakenDraft,
} from './decide/drafts';

// @grythjs/plugin-gyld grips. Scope and class follow CodingRules.md and the
// grip inventory in gyld-wz/dev-docs/ui/GyldGrythPlugins.md section 3.3.
//
// Phase 0 declares ONLY the grips whose producer already exists in this
// package: the identity grip (produced by the addEntry at module init) and
// the per-tab destination atoms (produced by the tool's tabTaps seeds). The
// source and conversion grips of section 3.3 (Gyld.Streams, Gyld.Bundle,
// Gyld.Lens, Gyld.Records, Gyld.Record, Gyld.DecideNow, Gyld.Validation,
// Gyld.Diff, Gyld.Focus, Gyld.Set, Gyld.Store.Status, Gyld.Ops) arrive with
// their taps in Phase 1, so this package never carries a grip that nothing
// produces.

// The plugin's identity grip: the registry KEY (GrythPluginContract.md,
// "Registration and discovery"). Declaring it and registering under it are
// the same act, in src/index.ts.
export const GYLD_PLUGIN = defineGrip<GrythPlugin>('Gyld.Plugin');

// Class 1 atoms; INSTANCE scope, one set per tab. The desktop seeds these
// into the chrome-held tab context from the opening link's params
// (packages/desktop/src/tabContexts.ts, tabContextFor), so every gyld window
// is its own destination for the store and lens taps and a window rehydrates
// onto the same stream and perspective after a reload.
//
// Empty string means "this window has no destination yet" and is rendered as
// such. It is not a default stream: the UI must never invent a Gyld fact
// (spec section 6.7), and absence is a rendered state, not a substitution.
export const GYLD_DEST_STREAM = defineGrip<string>('Gyld.Dest.Stream', '');
export const GYLD_DEST_STREAM_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Dest.Stream.Tap');

export const GYLD_DEST_PERSPECTIVE = defineGrip<string>('Gyld.Dest.Perspective', '');
export const GYLD_DEST_PERSPECTIVE_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Dest.Perspective.Tap');

// The opening LINK's params for a gyld.browser window (ToolLink.params in
// plugin-api/src/registry.ts). Params ride the tab record, so they are plain
// serializable data and arrive typed as unknown.
export function runFromParams(params?: Record<string, unknown>): string {
  const value = params?.run;
  return typeof value === 'string' ? value : '';
}

export function proposalFromParams(params?: Record<string, unknown>): string {
  const value = params?.proposal;
  return typeof value === 'string' ? value : '';
}

export function streamFromParams(params?: Record<string, unknown>): string {
  const value = params?.stream;
  return typeof value === 'string' ? value : '';
}

export function perspectiveFromParams(params?: Record<string, unknown>): string {
  const value = params?.perspective;
  return typeof value === 'string' ? value : '';
}

/**
 * The record a window opens ON. Spec section 2 names it `ref` in a
 * `gyld.detail` link and `focus` in a `gyld.browser` link; both are the same
 * qualified slot seeded into the same grip, so both spellings are read here
 * and nothing is duplicated downstream. A link that carries neither leaves the
 * window with no record, which is a rendered state, not a default.
 */
/** The question a browser window opens a PREVIEW of, as a qualified slot. A
 *  link that carries none opens on emitted geometry, which is every link but
 *  the one the Neighbourhood button writes for a question no member exists
 *  for. */
export function previewFromParams(params?: Record<string, unknown>): string {
  const value = params?.preview;
  return typeof value === 'string' ? value : '';
}

/** How the window's legend overlay was left: shrunk, expanded or on the help.
 *  A link that names none opens it shrunk, which takes no room from the
 *  picture (`lens/legendPanel.ts`, `LegendPanel.of`). */
export function legendFromParams(params?: Record<string, unknown>): LegendPanel {
  return LegendPanel.of(params?.legend);
}

export function refFromParams(params?: Record<string, unknown>): string {
  const ref = params?.ref;
  if (typeof ref === 'string') {
    return ref;
  }
  const focus = params?.focus;
  return typeof focus === 'string' ? focus : '';
}

// ---------------------------------------------------------------------------
// Phase 1, step 1.1: the data layer's grips (spec section 3.3).
//
// Every one of these is produced by GyldStoreTap, registered once at the
// plugin root. The two HOME values (the set and what it censuses) are the
// same for every window; the four per-destination values resolve from the
// window's own Gyld.Dest.* seeds, so two browsers on two streams never see
// each other's bundle.
// ---------------------------------------------------------------------------

// Class 1 atom; ENVIRON scope (the user's desk, persisted and roamed), doc
// promotable when a set becomes team shared. The roots only, never a picked
// directory HANDLE: a handle cannot be serialized, so the tap holds it as
// runtime state and a reloaded desktop asks for the directory again.
export const GYLD_SET = defineGrip<GyldSet>('Gyld.Set', EMPTY_SET);
export const GYLD_SET_TAP = defineGrip<AtomTapHandle<GyldSet>>('Gyld.Set.Tap');

// Class 2 status; one entry per root of the set, in the set's own order.
export const GYLD_STORE_STATUS = defineGrip<GyldRootStatus[]>('Gyld.Store.Status', []);

// Class 2 source; the census of streams across every root of the set.
export const GYLD_STREAMS = defineGrip<GyldStreamsCensus>('Gyld.Streams', CENSUS_EMPTY);

// The manual reload escape hatch: drop the cache and re-read with cache
// busting. A handle, not state, so a gesture calls it without a closure read.
export const GYLD_STORE_RELOAD = defineGrip<() => void>('Gyld.Store.Reload');

// Class 2 source, PER DESTINATION from Gyld.Dest.Stream.
export const GYLD_BUNDLE = defineGrip<GyldBundle>('Gyld.Bundle', BUNDLE_UNSET);
export const GYLD_DECIDE_NOW =
  defineGrip<GyldValue<GyldDecideNow>>('Gyld.DecideNow', VALUE_UNSET);
export const GYLD_VALIDATION =
  defineGrip<GyldValue<GyldValidation>>('Gyld.Validation', VALUE_UNSET);

// Class 2 source, per destination from Gyld.Dest.Stream AND .Perspective.
export const GYLD_LENS = defineGrip<GyldLensState>('Gyld.Lens', LENS_UNSET);

// ---------------------------------------------------------------------------
// GyldAskAgent.md step 0.4: the SOURCE INDEX.
//
// Class 2 source. The index is one file at the ROOT of a build, not inside a
// stream, so it is read from whichever root of the set carries this window's
// stream — the same root its bundle came from — and every window of that build
// sees one index.
//
// A build that emitted none publishes as `absent`, which is a RENDERED state:
// the ask window says the build carries no index rather than showing a record
// with no citations, because a citation missing is an omission and MDV-7 says
// an omission is said.
// ---------------------------------------------------------------------------
export const GYLD_SOURCES =
  defineGrip<GyldValue<GyldSources>>('Gyld.Sources', VALUE_UNSET);

// ---------------------------------------------------------------------------
// Step 2.5: the diff window's destination. A diff is between TWO streams, so
// its destination is a PAIR, and the pair is ordered: `diffs/<left>..<right>`
// is not `diffs/<right>..<left>` and this package never reverses one.
// ---------------------------------------------------------------------------

export const GYLD_DEST_LEFT = defineGrip<string>('Gyld.Dest.Left', '');
export const GYLD_DEST_LEFT_TAP = defineGrip<AtomTapHandle<string>>('Gyld.Dest.Left.Tap');

export const GYLD_DEST_RIGHT = defineGrip<string>('Gyld.Dest.Right', '');
export const GYLD_DEST_RIGHT_TAP = defineGrip<AtomTapHandle<string>>('Gyld.Dest.Right.Tap');

// Class 2 source, per destination from Gyld.Dest.Left AND .Right.
export const GYLD_DIFF =
  defineGrip<GyldValue<GyldStreamDiff>>('Gyld.Diff', VALUE_UNSET);

// Class 1 atom; INSTANCE scope, one per diff window. The record in hand, as a
// QUALIFIED SLOT, shared by the window's two panes: the slot is the only thing
// that means "the same record" in two streams (R1), so one pane writes it and
// the other lights it up. Empty means nothing in hand, and is drawn as such.
export const GYLD_DIFF_SLOT = defineGrip<string>('Gyld.Tab.Diff.Slot', '');
export const GYLD_DIFF_SLOT_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Tab.Diff.Slot.Tap');

// ---------------------------------------------------------------------------
// Step 3.2: the compare window's destination, which is an evaluator RUN and
// one PROPOSAL of it (spec section 2, link params `{ run, proposal }`).
//
// A run is not a bundle and is not censused with one: it has no `streams.json`
// and no streams, it is a directory of proposals indexed by its own `run.json`.
// So `Gyld.Dest.Run` names the run directly, as the base URL it is served
// from, and the store tap opens a read-only store on it beside the set's.
// ---------------------------------------------------------------------------

export const GYLD_DEST_RUN = defineGrip<string>('Gyld.Dest.Run', '');
export const GYLD_DEST_RUN_TAP = defineGrip<AtomTapHandle<string>>('Gyld.Dest.Run.Tap');

export const GYLD_DEST_PROPOSAL = defineGrip<string>('Gyld.Dest.Proposal', '');
export const GYLD_DEST_PROPOSAL_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Dest.Proposal.Tap');

/**
 * Which SIDE of one proposal a picture is of, by name (`baseline` or
 * `candidate`). It is a per-context atom rather than a prop because the store
 * tap resolves the lens file from it, and a tap reads destination params, not
 * React props. The name is the data; the behaviour of a side lives on
 * `CompareSide` (src/compare/sides.ts), which is what every call site uses.
 */
export const GYLD_DEST_SIDE = defineGrip<string>('Gyld.Dest.Side', '');

// Class 2 source, per destination from Gyld.Dest.Run.
export const GYLD_RUN =
  defineGrip<GyldValue<GyldEvaluatorRun>>('Gyld.Run', VALUE_UNSET);

// Class 2 source, per destination from Gyld.Dest.Run AND .Proposal.
export const GYLD_COMPARISON =
  defineGrip<GyldValue<GyldComparison>>('Gyld.Comparison', VALUE_UNSET);

// Class 1 atom; INSTANCE scope, per tab. The run URL the reader is typing,
// which becomes the window's destination when they press Read. A draft, like
// the set picker's: this package never invents a place to read Gyld output
// from, so the field starts empty and nothing is read until it is filled in.
export const GYLD_RUN_DRAFT = defineGrip<string>('Gyld.Tab.Run.Draft', '');
export const GYLD_RUN_DRAFT_TAP = defineGrip<AtomTapHandle<string>>('Gyld.Tab.Run.Draft.Tap');

// ---------------------------------------------------------------------------
// Step 1.2: the two conversion grips. Both are PER DESTINATION, produced by
// GyldIndexTap and GyldRecordTap over the destination's own bundle.
// ---------------------------------------------------------------------------

// Class 1 atom; INSTANCE scope, per tab. The record a detail window is looking
// at, as a qualified slot (the identity that survives a restream) or a record
// id. Empty means the window has no record yet, and is rendered as such.
export const GYLD_DEST_REF = defineGrip<string>('Gyld.Dest.Ref', '');
export const GYLD_DEST_REF_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Dest.Ref.Tap');

// Class 3 conversion, per destination from Gyld.Bundle.
export const GYLD_RECORDS = defineGrip<GyldRecords>('Gyld.Records', RECORDS_UNSET);

// Class 3 conversion, per destination from Gyld.Records and Gyld.Dest.Ref.
export const GYLD_RECORD = defineGrip<GyldRecordView>('Gyld.Record', RECORD_UNSET);

// ---------------------------------------------------------------------------
// Step 1.3: the lens view's own state. All class 1 atoms, all INSTANCE scope
// (this client only, one set per tab), seeded by lensTabTaps. They are view
// state, not Gyld facts: the camera moves the eye and the dim set changes what
// is drawn over a FIXED layout (MDV-4), so none of them can alter a record.
// ---------------------------------------------------------------------------

export const GYLD_TAB_CAMERA = defineGrip<GyldCamera>('Gyld.Tab.Camera', CAMERA_UNFITTED);
export const GYLD_TAB_CAMERA_TAP =
  defineGrip<AtomTapHandle<GyldCamera>>('Gyld.Tab.Camera.Tap');

// Set while a pan is in progress. The view renders the full-window overlay
// that captures the movement as React events for exactly as long as this is
// set (CodingRules.md, "Drag with global movement").
export const GYLD_TAB_CAMERA_DRAG =
  defineGrip<GyldCameraDrag | undefined>('Gyld.Tab.Camera.Drag', undefined);
export const GYLD_TAB_CAMERA_DRAG_TAP =
  defineGrip<AtomTapHandle<GyldCameraDrag | undefined>>('Gyld.Tab.Camera.Drag.Tap');

export const GYLD_TAB_SELECTION = defineGrip<GyldSelection>('Gyld.Tab.Selection', NO_SELECTION);
export const GYLD_TAB_SELECTION_TAP =
  defineGrip<AtomTapHandle<GyldSelection>>('Gyld.Tab.Selection.Tap');

export const GYLD_TAB_HOVER = defineGrip<string>('Gyld.Tab.Hover', '');
export const GYLD_TAB_HOVER_TAP = defineGrip<AtomTapHandle<string>>('Gyld.Tab.Hover.Tap');

export const GYLD_TAB_DIMMED = defineGrip<GyldDimmed>('Gyld.Tab.Dimmed', NOTHING_DIMMED);
export const GYLD_TAB_DIMMED_TAP = defineGrip<AtomTapHandle<GyldDimmed>>('Gyld.Tab.Dimmed.Tap');

// The legend overlay on the picture: shrunk to its tab, expanded, or showing
// the help. Per window like everything else here, and — unlike everything else
// here — folded into the window's TAB RECORD as one word, so a reload reopens
// the legend the way the reader left it (./lens/legendPanel.ts).
export const GYLD_TAB_LEGEND = defineGrip<LegendPanel>('Gyld.Tab.Legend', LegendPanel.SHRUNK);
export const GYLD_TAB_LEGEND_TAP =
  defineGrip<AtomTapHandle<LegendPanel>>('Gyld.Tab.Legend.Tap');

// Which legend row this window is flashing, and which flash it is. Written by
// a press on a row and cleared a second and a half later by the sweep that
// owns the clock (./lens/flash.ts). Not persisted: a mark that came back from
// a reload would say something had just happened when nothing had.
export const GYLD_TAB_FLASH = defineGrip<GyldFlash>('Gyld.Tab.Flash', NOT_FLASHING);
export const GYLD_TAB_FLASH_TAP = defineGrip<AtomTapHandle<GyldFlash>>('Gyld.Tab.Flash.Tap');

// What the panel over a box measured of itself, and of the stage it has to fit
// inside. Written by the panel's own ref callback — the sanctioned reach into
// the DOM (CodingRules.md) — and read by the placement rule, which flips the
// card to the top of a box near the bottom of the stage rather than letting it
// be clipped away with its buttons on it (./browser/placement.ts).
export const GYLD_TAB_CARD_SIZE =
  defineGrip<GyldPanelFit>('Gyld.Tab.Card.Size', PANEL_UNMEASURED);
export const GYLD_TAB_CARD_SIZE_TAP =
  defineGrip<AtomTapHandle<GyldPanelFit>>('Gyld.Tab.Card.Size.Tap');

// The colours the picture is drawn WITH, as against the colours it was
// emitted with. Class 3 conversion over `Desktop.Theme` and the theme table,
// produced at the plugin root (see rootTaps.ts) and read by every lens view.
// It is not state: nothing writes it, and it holds no answer the theme does
// not already determine. The default is the LIGHT desk the lens files were
// emitted for, so a view with no theme in reach draws the emitted colours.
export const GYLD_LENS_PALETTE =
  defineGrip<GyldLensPalette>('Gyld.Lens.Palette', LENS_PALETTE_LIGHT);

// ---------------------------------------------------------------------------
// Step 1.4: the browser window's own state and the shared focus.
// ---------------------------------------------------------------------------

// Class 1 atom; ENVIRON intent, share-promotable (spec section 3.2): the one
// cross-window "what are you looking at", written by a click in any gyld
// window and readable by every other. It lives at the PLUGIN ROOT, not in a
// tab, because MDV-5 correlates dimensions across windows rather than inside
// one picture.
export const GYLD_FOCUS = defineGrip<GyldFocus>('Gyld.Focus', NO_FOCUS);
export const GYLD_FOCUS_TAP = defineGrip<AtomTapHandle<GyldFocus>>('Gyld.Focus.Tap');

// Class 1 atoms; INSTANCE scope, per tab. The search box's text, and the set
// picker's two drafts. All three are view state: typing in the search box
// changes what is highlighted and dimmed over a FIXED layout, never the
// layout, and never a Gyld fact.
export const GYLD_TAB_SEARCH = defineGrip<string>('Gyld.Tab.Search', '');
export const GYLD_TAB_SEARCH_TAP = defineGrip<AtomTapHandle<string>>('Gyld.Tab.Search.Tap');

// Class 1 atom; INSTANCE scope, per tab. Whether THIS window follows the
// shared focus (spec section 2: "Gyld.Focus is the cross-window focus every
// gyld window may follow"). It is per window because following is a reader's
// choice about one window, not a fact about the graph: a desk can hold one
// detail window pinned to a record and another walking the focus, which is the
// correlation MDV-5 asks for. A window WIRED to a browser ignores it, because
// it already follows that browser's selection and two sources would race.
export const GYLD_TAB_FOLLOW = defineGrip<boolean>('Gyld.Tab.Follow', false);
export const GYLD_TAB_FOLLOW_TAP = defineGrip<AtomTapHandle<boolean>>('Gyld.Tab.Follow.Tap');

// Class 1 atom; INSTANCE scope, one per browser window (GyldAskAgent.md
// section 2, "Where the state lives"). Which box this window's menu is open
// over, and where it is anchored, in the lens's own user units.
//
// ONE atom means ONE menu per window: opening a menu over another box replaces
// it rather than stacking a second. The empty slot is a rendered state — no
// menu, and the hover card drawn instead — and not a default.
export const GYLD_TAB_MENU = defineGrip<GyldNodeMenu>('Gyld.Tab.Menu', MENU_CLOSED);
export const GYLD_TAB_MENU_TAP =
  defineGrip<AtomTapHandle<GyldNodeMenu>>('Gyld.Tab.Menu.Tap');

// ---------------------------------------------------------------------------
// GyldAskAgent.md step 0.3: the ask window's own state. Class 1 atoms,
// INSTANCE scope, one set per `gyld.ask` window, seeded by askTabTaps.
//
// Both are the READER's, not Gyld's. A conversation id is minted by the window
// that opened the menu and rides in the envelope, so a follow-up is the same
// verb with the same id; the draft is what the reader typed and has reached
// nothing until they press send. Empty is a rendered state for both: a window
// with no conversation says so rather than inventing one.
// ---------------------------------------------------------------------------

// The conversation carries the record it is ON as well as its id (step 2.1):
// a conversation is ABOUT a record, and a window wired to a browser follows
// whatever box the reader picks next, so the pair is what says whether the
// next turn is a follow-up or a new conversation (src/ask/conversation.ts).
export const GYLD_TAB_ASK_CONVERSATION =
  defineGrip<AskConversation>('Gyld.Tab.Ask.Conversation', NO_CONVERSATION);
export const GYLD_TAB_ASK_CONVERSATION_TAP =
  defineGrip<AtomTapHandle<AskConversation>>('Gyld.Tab.Ask.Conversation.Tap');

export const GYLD_TAB_ASK_DRAFT = defineGrip<string>('Gyld.Tab.Ask.Draft', '');
export const GYLD_TAB_ASK_DRAFT_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Tab.Ask.Draft.Tap');

// Whether this window's transcript is scrolled to its end, which is what
// decides whether it FOLLOWS what is arriving or stays where the reader put it
// (src/ask/transcript.ts). Written by the transcript's own scroll handler and
// read at render: the scroll itself is performed in the ref callback, and the
// fact behind it lives in an atom like every other piece of UI state
// (CodingRules.md). True is the opening state — a window opens at the end of
// the conversation it opens on.
export const GYLD_TAB_ASK_AT_END = defineGrip<boolean>('Gyld.Tab.Ask.AtEnd', true);
export const GYLD_TAB_ASK_AT_END_TAP =
  defineGrip<AtomTapHandle<boolean>>('Gyld.Tab.Ask.AtEnd.Tap');

// THIS window's own last answer from the supplier, written when the `explain`
// it sent comes back. Per tab and not the desk-wide `Gyld.Ops.Result`, because
// the answer is about this conversation: the three refusals that arrive
// synchronously — no model key, no source index, an envelope that did not
// decode — are the run's own words and belong beside the question that drew
// them, not on a panel shared with the last rebuild.
//
// `null` is a rendered state: nothing has been asked from this window yet.
export const GYLD_TAB_ASK_ANSWER =
  defineGrip<GyldOpsResponse | null>('Gyld.Tab.Ask.Answer', null);
export const GYLD_TAB_ASK_ANSWER_TAP =
  defineGrip<AtomTapHandle<GyldOpsResponse | null>>('Gyld.Tab.Ask.Answer.Tap');

// Which citation boxes this window has open, which footer chips are expanded,
// and which Copy last landed (src/ask/citations.ts). Keyed by (run id, tag),
// because a box belongs to one turn's citation of one tag and two turns citing
// the same tag are two boxes. Opened by a marker in the prose or by a turn's
// footer chip, closed by the same press, by Collapse, by Escape — and dropped
// whole by Start over, since the conversation those boxes belonged to is no
// longer the one this window folds. UI state, so it is an atom and never a
// React hook (CodingRules.md).
export const GYLD_TAB_ASK_CITES =
  defineGrip<AskCitationsOpen>('Gyld.Tab.Ask.Cites', NOTHING_OPEN);
export const GYLD_TAB_ASK_CITES_TAP =
  defineGrip<AtomTapHandle<AskCitationsOpen>>('Gyld.Tab.Ask.Cites.Tap');

export const GYLD_PICKER_URL = defineGrip<string>('Gyld.Tab.Picker.Url', '');
export const GYLD_PICKER_URL_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Tab.Picker.Url.Tap');

export const GYLD_PICKER_ERROR = defineGrip<string>('Gyld.Tab.Picker.Error', '');
export const GYLD_PICKER_ERROR_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Tab.Picker.Error.Tap');

// ---------------------------------------------------------------------------
// Step 3.1: the browser-side neighbourhood PREVIEW.
//
// A preview is a layout of emitted records (spec section 3.5): the window
// stays on the emitted `decisions` lens, which is what `Gyld.Lens` resolves,
// and `Gyld.Dest.Preview` names the ONE question whose neighbourhood of that
// lens is being laid out in the browser. Empty means this window wants no
// preview, which is every window until a reader asks for one.
//
// The question travels as a QUALIFIED SLOT, because that is the identity that
// survives a restream (R1) and is what a pick in the picture puts in hand.
// ---------------------------------------------------------------------------

export const GYLD_DEST_PREVIEW = defineGrip<string>('Gyld.Dest.Preview', '');
export const GYLD_DEST_PREVIEW_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Dest.Preview.Tap');

// Class 3 conversion plus a layout, per destination from Gyld.Dest.Stream,
// Gyld.Dest.Preview and Gyld.Lens. Produced by GyldPreviewLayoutTap, and
// carried in the SAME shape an emitted lens arrives in, so the lens view draws
// a preview with no branch of its own. `engine.pinned` is false on every
// document that comes out of it.
export const GYLD_PREVIEW = defineGrip<GyldLensState>('Gyld.Preview', LENS_UNSET);

// ---------------------------------------------------------------------------
// Step 2.3: the stream manager's own state. Class 1 atoms, INSTANCE scope, one
// set per tab (spec section 3.3, `Gyld.Streams.Draft`).
//
// Both are DRAFTS, not Gyld facts. The draft is what the owner has typed so
// far; the export is the command line composed from it. In this stage nothing
// is submitted, so neither one ever reaches a bundle: the owner runs the
// command, and the watch loop picks up what that run emits (spec section 4.6).
// ---------------------------------------------------------------------------

export const GYLD_STREAM_DRAFT = defineGrip<StreamDraft>('Gyld.Streams.Draft', DRAFT_EMPTY);
export const GYLD_STREAM_DRAFT_TAP =
  defineGrip<AtomTapHandle<StreamDraft>>('Gyld.Streams.Draft.Tap');

// The exported command text, empty until the owner presses Export. It is a
// grip rather than a render-time computation so the box holds what was
// exported, and keeps holding it while the form is edited underneath.
export const GYLD_STREAM_EXPORT = defineGrip<string>('Gyld.Streams.Export', '');
export const GYLD_STREAM_EXPORT_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Streams.Export.Tap');

// ---------------------------------------------------------------------------
// Step 2.4: the decide window's own state. Class 1 atoms, INSTANCE scope, one
// set per tab (spec section 3.3, `Gyld.Tab.Draft`).
//
// Two drafts, because the window does two things and neither is a mode of the
// other: an answer records a ruling over a question that exists, and an ask
// declares a question that does not. Each has its own export, so composing one
// never overwrites the other's text.
//
// All four are DRAFTS. Nothing here is a Gyld fact and nothing here reaches a
// bundle: in this stage the window exports text and the owner runs it (spec
// section 4.6).
// ---------------------------------------------------------------------------

export const GYLD_ANSWER_DRAFT = defineGrip<AnswerDraft>('Gyld.Tab.Draft.Answer', ANSWER_EMPTY);
export const GYLD_ANSWER_DRAFT_TAP =
  defineGrip<AtomTapHandle<AnswerDraft>>('Gyld.Tab.Draft.Answer.Tap');

export const GYLD_ASK_DRAFT = defineGrip<AskDraft>('Gyld.Tab.Draft.Ask', ASK_EMPTY);
export const GYLD_ASK_DRAFT_TAP =
  defineGrip<AtomTapHandle<AskDraft>>('Gyld.Tab.Draft.Ask.Tap');

// Class 1 atom; INSTANCE scope, one per BROWSER window, seeded by
// `browserTabTaps` (GyldAskAgent.md section 8, step 3.2).
//
// The ruling an agent drafted and a reader TOOK, on its way from the ask
// window to the decide window. It is seeded by the browser because that is
// the one context both of them resolve: each is a SINK wired to the browser,
// and two sinks of one source see each other's nothing. The ask window writes
// it through the handle it resolves from the browser; the decide window's own
// `GyldTakenDraftTap` reads it and fills the form, once per take.
//
// `take: 0` is a rendered state — nothing has been taken on this browser —
// and not a default to fill anything in from.
export const GYLD_TAB_DRAFT_TAKEN =
  defineGrip<TakenDraft>('Gyld.Tab.Draft.Taken', NOTHING_TAKEN);
export const GYLD_TAB_DRAFT_TAKEN_TAP =
  defineGrip<AtomTapHandle<TakenDraft>>('Gyld.Tab.Draft.Taken.Tap');

/** What the decide window's own tap has APPLIED into its form, so the tags
 *  that draft cited can be offered beside the sources field (section 8: the
 *  reader takes them, the agent never writes them). */
export const GYLD_TAB_DRAFT_TOOK =
  defineGrip<TakenDraft>('Gyld.Tab.Draft.Took', NOTHING_TAKEN);

export const GYLD_ANSWER_EXPORT = defineGrip<string>('Gyld.Tab.Export.Answer', '');
export const GYLD_ANSWER_EXPORT_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Tab.Export.Answer.Tap');

export const GYLD_ASK_EXPORT = defineGrip<string>('Gyld.Tab.Export.Ask', '');
export const GYLD_ASK_EXPORT_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Tab.Export.Ask.Tap');

// ---------------------------------------------------------------------------
// Step 4.3: the write path's grips (spec section 4.7).
//
// `Gyld.Ops` is the OPERATIONS HANDLE, produced only by the live module
// (src/live.ts), which is the only file in this package that imports
// `@grythjs/glade`. A composition with no glade node registers no producer for
// it, so it reads as UNRESOLVED, and every submit is disabled with that as its
// reason. That is the whole of the read-only stage's fallback: the export path
// beside each submit stays exactly as it was.
// ---------------------------------------------------------------------------

export const GYLD_OPS = defineGrip<GyldOps>('Gyld.Ops');

// Class 1 atoms; INSTANCE scope, shared by every gyld window of the desk (one
// supplier, one run at a time). The last answer, the run whose output the log
// mount follows, and the records that mount has folded.
export const GYLD_OPS_RESULT =
  defineGrip<GyldOpsResult | null>('Gyld.Ops.Result', null);
export const GYLD_OPS_RESULT_TAP =
  defineGrip<AtomTapHandle<GyldOpsResult | null>>('Gyld.Ops.Result.Tap');

/** The streaming run id. It is the `gyld.output` mount's FILL KEY, so writing
 *  it remounts the fold: a distinct run is a distinct instance. */
export const GYLD_OPS_RUN_ID = defineGrip<string>('Gyld.Ops.RunId', '');
export const GYLD_OPS_RUN_ID_TAP = defineGrip<AtomTapHandle<string>>('Gyld.Ops.RunId.Tap');

/** The run's stdout and stderr lines as they arrive, in the order the log
 *  folded them. Absent records are absent lines, never blank ones. */
export const GYLD_OPS_STREAM = defineGrip<GyldOutputRecord[]>('Gyld.Ops.Stream', []);

/**
 * The conversation whose reply the `gyld.ask` mount follows, and the records
 * it has folded (GyldAskAgent.md section 6, step 1.5).
 *
 * The pair `Gyld.Ops.RunId` / `Gyld.Ops.Stream` is for a BUILD; this is the
 * same pair for a CONSULTATION, and the one difference is the key: a reply is
 * keyed by the conversation rather than by the run, so a follow-up is another
 * turn on one mount and not a second mount. The id is written by the ops
 * handle when the supplier accepts an `explain`, exactly as the run id is.
 *
 * A window reads these and folds only the records of ITS OWN conversation, so
 * two ask windows on one desk never draw each other's replies.
 */
export const GYLD_ASK_CONVERSATION = defineGrip<string>('Gyld.Ask.Conversation', '');
export const GYLD_ASK_CONVERSATION_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Ask.Conversation.Tap');

export const GYLD_ASK_STREAM = defineGrip<GyldAskRecord[]>('Gyld.Ask.Stream', []);

/**
 * The glade connection's own state, mirrored into this package's vocabulary by
 * the live module. Empty means "no glade in this composition at all", which is
 * a different fact from `offline` and is rendered as one.
 *
 * It is mirrored rather than read from `@grythjs/glade` directly because that
 * module reads the DOM at import: this package's windows and its whole test
 * suite must stay able to run without one (owner ruling O6's boundary).
 */
export const GYLD_OPS_STATUS = defineGrip<string>('Gyld.Ops.Status', '');

/**
 * The node URL the page would attach to, mirrored from `Glade.Node` by the
 * live module for the same reason `Gyld.Ops.Status` is: this package must not
 * import the module that reads the DOM.
 *
 * Empty until grazel's `/bootstrap.json` has been asked (and in a composition
 * with no glade at all), which is why the picker names it only when it has
 * one. It is the URL the page WOULD use, resolved before the socket is tried,
 * so it is exactly the right thing to print beside "nothing answered".
 */
export const GYLD_NODE = defineGrip<string>('Gyld.Node', '');

// ---------------------------------------------------------------------------
// What an empty desk lands on.
//
// `Gyld.Landing` is produced by `GyldLandingTap` at the plugin root: the glade
// presence, the node URL, and whether this desk put the glade root on itself.
// The set picker is a pure read of it, so the copy a reader sees is decided in
// one place and asserted without a window.
// ---------------------------------------------------------------------------

export const GYLD_LANDING = defineGrip<GyldLanding>('Gyld.Landing', LANDING_UNSET);

/**
 * What a browser window chose FOR ITSELF, produced per tab by
 * `GyldFirstPickTap`: the stream and the perspective it filled in because the
 * opening link named none and the census did.
 *
 * It is a record of an act, not a destination: the destination is still
 * `Gyld.Dest.Stream` and `Gyld.Dest.Perspective`, which is what the whole
 * graph resolves from. Empty fields are the ones the window chose nothing
 * for, because the reader had already chosen or the census named nothing.
 */
export const GYLD_TAB_PICKED = defineGrip<GyldFirstPick>('Gyld.Tab.Picked', NOTHING_PICKED);

// The tab id of the window that OWNS this context, seeded by the browser's
// tabTaps. A sink wired to a browser inherits it through the graph and so
// knows which tab to retarget, which is GrythPluginContract.md's open question
// 2 (cross-context addressing) answered with data rather than with a registry:
// the source publishes its own address, the sink reads it like any other grip.
// A sink never seeds this, so an unwired window reads the empty default and
// opens a new window instead of retargeting one.
export const GYLD_TAB_ID = defineGrip<string>('Gyld.Tab.Id', '');
