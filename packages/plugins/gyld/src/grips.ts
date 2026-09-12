import type { AtomTapHandle } from '@owebeeone/grip-react';
import { defineGrip, type GrythPlugin } from '@grythjs/plugin-api';
import type { GyldDecideNow, GyldValidation } from './contract';
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

export function refFromParams(params?: Record<string, unknown>): string {
  const value = params?.ref;
  return typeof value === 'string' ? value : '';
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
