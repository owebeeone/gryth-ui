import { createAtomValueTap } from '@owebeeone/grip-react';
import { addEntry, grok } from '@grythjs/plugin-api';
import {
  GYLD_PLUGIN,
  GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP,
  GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP,
  GYLD_DEST_REF, GYLD_DEST_REF_TAP,
  streamFromParams, perspectiveFromParams, refFromParams,
} from './grips';
import { GyldBrowser } from './GyldBrowser';
import { GyldSetTap, gyldIndexTap, gyldRecordTap, gyldStoreTap } from './rootTaps';
import { lensTabTaps } from './lens/lensTabTaps';
import './gyld.css';

// @grythjs/plugin-gyld: the Gyld decision-graph tools (see
// gyld-wz/dev-docs/ui/GyldGrythPlugins.md; hosting is IN-REPO per the owner
// rulings of 2026-09-13). Importing this module IS registering: the entry
// lands in the plugin registry under GYLD_PLUGIN.
//
// Phase 0 advertises one stub tool. The remaining tools of section 2
// (gyld.detail, gyld.streams, gyld.decide, gyld.diff, gyld.decidenow, and
// later gyld.compare) are added as their views land; none is declared here
// ahead of a window that can render it.

// The plugin-root taps: the set atom and the one store tap over it. Both are
// registered at the app's root context, so every gyld window resolves its own
// destination through the same stores and the same cache (spec section 3.4).
grok.registerTap(GyldSetTap);
grok.registerTap(gyldStoreTap);
grok.registerTap(gyldIndexTap);
grok.registerTap(gyldRecordTap);

addEntry(GYLD_PLUGIN, {
  tools: {
    'gyld.browser': {
      label: 'Gyld browser',
      defaultSize: { w: 900, h: 620 },
      // Advisory today: packages/desktop/src/foundations.ts places tools by
      // TOOL ID through its `designate` map and never reads `role`, so this
      // window currently lands on the `stage` fallback. Declared anyway
      // because the contract asks for it and it is what a designate entry
      // would say.
      role: 'explorer',
      windowComponent: GyldBrowser,
      // Per-tab destination seeds: the desktop registers these on the tab's
      // chrome-held home context at tab creation and retires them when the
      // tab record leaves the desktop document. `params` is the opening
      // link, so a reopened window comes back on the same destination.
      tabTaps: (_tabId, params) => [
        createAtomValueTap(GYLD_DEST_STREAM, {
          initial: streamFromParams(params),
          handleGrip: GYLD_DEST_STREAM_TAP,
        }),
        createAtomValueTap(GYLD_DEST_PERSPECTIVE, {
          initial: perspectiveFromParams(params),
          handleGrip: GYLD_DEST_PERSPECTIVE_TAP,
        }),
        createAtomValueTap(GYLD_DEST_REF, {
          initial: refFromParams(params),
          handleGrip: GYLD_DEST_REF_TAP,
        }),
        // The lens view's own state: camera, drag, selection, hover, dim set.
        ...lensTabTaps(),
      ],
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
} from './grips';
export { GyldSetTap, gyldIndexTap, gyldRecordTap, gyldStoreTap } from './rootTaps';
export * from './records/records';
export { GyldIndexTap, GyldRecordTap } from './records/taps';
export * from './lens/camera';
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
export * from './store/state';
export { GyldStoreTap, DEFAULT_POLL_MS } from './store/GyldStoreTap';
export {
  DirectoryStore, StaticStore, parseAutoindexNames,
  type FetchLike, type GyldDirectoryHandle, type GyldStore,
} from './store/stores';
export * from './store/layout';
