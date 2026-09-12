import { addEntry, grok } from '@grythjs/plugin-api';
import { GYLD_PLUGIN } from './grips';
import { GyldBrowser } from './GyldBrowser';
import { browserTabTaps } from './browser/browserTabTaps';
import { GyldFocusTap, GyldSetTap, gyldIndexTap, gyldRecordTap, gyldStoreTap } from './rootTaps';
import { BROWSER_ROLE, GYLD_BROWSER_TOOL } from './tools';
import './gyld.css';

// @grythjs/plugin-gyld: the Gyld decision-graph tools (see
// gyld-wz/dev-docs/ui/GyldGrythPlugins.md; hosting is IN-REPO per the owner
// rulings of 2026-09-13). Importing this module IS registering: the entry
// lands in the plugin registry under GYLD_PLUGIN.
//
// Phase 1 advertises the browser. The remaining tools of section 2
// (gyld.streams, gyld.decide, gyld.diff and later gyld.compare) are added as
// their views land; none is declared here ahead of a window that can render
// it.

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
  GYLD_PICKER_URL, GYLD_PICKER_URL_TAP, GYLD_PICKER_ERROR, GYLD_PICKER_ERROR_TAP,
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
export * from './browser/links';
export * from './browser/search';
export { directoryPicker, isPickerCancel } from './browser/fsAccess';
export * from './store/state';
export { GyldStoreTap, DEFAULT_POLL_MS } from './store/GyldStoreTap';
export {
  DirectoryStore, StaticStore, parseAutoindexNames,
  type FetchLike, type GyldDirectoryHandle, type GyldStore,
} from './store/stores';
export * from './store/layout';
