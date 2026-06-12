import { addEntry, defineGrip, type GrythPlugin } from '@grythjs/plugin-api';
import { FileViewer } from './FileViewer';
import './code.css';

// @grythjs/plugin-code — explorer/viewer/diff share the file/VCS provider
// seam (see PluginMigration.md Package map). First tool: the file viewer.
// Importing this module IS registering.

export const CODE_PLUGIN = defineGrip<GrythPlugin>('Code.Plugin');

addEntry(CODE_PLUGIN, {
  tools: {
    viewer: {
      label: 'Viewer',
      defaultSize: { w: 640, h: 440 },
      role: 'stage',
      windowComponent: FileViewer,
    },
  },
});
