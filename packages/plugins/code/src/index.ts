import { createAtomValueTap } from '@owebeeone/grip-react';
import { addEntry, defineGrip, type GrythPlugin } from '@grythjs/plugin-api';
import { FileViewer } from './FileViewer';
import { Explorer } from './Explorer';
import { Diff } from './Diff';
import {
  WTA, WTA_TAP, SOURCE_ACCENT, sourceHue, wtaFromParams,
} from './grips';
import './code.css';

// @grythjs/plugin-code — explorer/viewer/diff share the file/VCS provider
// seam (see PluginMigration.md Package map). Importing this module IS
// registering.

export const CODE_PLUGIN = defineGrip<GrythPlugin>('Code.Plugin');

addEntry(CODE_PLUGIN, {
  tools: {
    viewer: {
      label: 'Viewer',
      defaultSize: { w: 640, h: 440 },
      role: 'stage',
      windowComponent: FileViewer,
    },
    explorer: {
      label: 'Explorer',
      defaultSize: { w: 280, h: 480 },
      role: 'explorer',
      windowComponent: Explorer,
      // an explorer is a WTA SOURCE: its selection (the WTA) and its
      // identity hue live per-tab, published for any wired sink to inherit.
      // The WTA seeds from the opening link, so an explorer can open AT a
      // file (the workspace-graph pair).
      tabTaps: (tabId, params) => [
        createAtomValueTap(WTA, { initial: wtaFromParams(params), handleGrip: WTA_TAP }),
        createAtomValueTap(SOURCE_ACCENT, { initial: sourceHue(tabId) }),
      ],
    },
    diff: {
      label: 'Diff',
      defaultSize: { w: 720, h: 480 },
      role: 'stage',
      windowComponent: Diff,
    },
  },
});
