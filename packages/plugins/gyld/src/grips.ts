import type { AtomTapHandle } from '@owebeeone/grip-react';
import { defineGrip, type GrythPlugin } from '@grythjs/plugin-api';
import type { GyldDecideNow, GyldStreamDiff, GyldValidation } from './contract';
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
import { NO_FOCUS, type GyldFocus } from './focus';
import { DRAFT_EMPTY, type StreamDraft } from './streams/operations';
import { ANSWER_EMPTY, ASK_EMPTY, type AnswerDraft, type AskDraft } from './decide/drafts';

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

export const GYLD_PICKER_URL = defineGrip<string>('Gyld.Tab.Picker.Url', '');
export const GYLD_PICKER_URL_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Tab.Picker.Url.Tap');

export const GYLD_PICKER_ERROR = defineGrip<string>('Gyld.Tab.Picker.Error', '');
export const GYLD_PICKER_ERROR_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Tab.Picker.Error.Tap');

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

export const GYLD_ANSWER_EXPORT = defineGrip<string>('Gyld.Tab.Export.Answer', '');
export const GYLD_ANSWER_EXPORT_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Tab.Export.Answer.Tap');

export const GYLD_ASK_EXPORT = defineGrip<string>('Gyld.Tab.Export.Ask', '');
export const GYLD_ASK_EXPORT_TAP =
  defineGrip<AtomTapHandle<string>>('Gyld.Tab.Export.Ask.Tap');

// The tab id of the window that OWNS this context, seeded by the browser's
// tabTaps. A sink wired to a browser inherits it through the graph and so
// knows which tab to retarget, which is GrythPluginContract.md's open question
// 2 (cross-context addressing) answered with data rather than with a registry:
// the source publishes its own address, the sink reads it like any other grip.
// A sink never seeds this, so an unwired window reads the empty default and
// opens a new window instead of retargeting one.
export const GYLD_TAB_ID = defineGrip<string>('Gyld.Tab.Id', '');
