import { addEntry, defineGrip, type GrythPlugin } from '@grythjs/plugin-api';
import { FileViewer } from './FileViewer';
import { Explorer } from './Explorer';
import { Diff } from './Diff';
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
    },
    diff: {
      label: 'Diff',
      defaultSize: { w: 720, h: 480 },
      role: 'stage',
      windowComponent: Diff,
    },
  },
});
