import { addEntry, grok } from '@grythjs/plugin-api';
import { WORKSPACE_PLUGIN } from './grips';
import { WorkspaceListTap } from './mock';
import { WorkspacesMenuTitle, WorkspaceViewer } from './WorkspaceViewer';
import './workspace.css';

// @grythjs/plugin-workspace — the workspace viewer (the first real plugin
// package; see dev-docs/PluginMigration.md). Importing this module IS
// registering: the plugin object lands in the registry under its grip and
// the workspace-list provider joins the context graph.

addEntry(WORKSPACE_PLUGIN, {
  tools: {
    workspace: {
      label: 'Workspaces',
      defaultSize: { w: 760, h: 520 },
      role: 'stage',
      menuTitle: WorkspacesMenuTitle,
      windowComponent: WorkspaceViewer,
    },
  },
});
grok.registerTap(WorkspaceListTap);

export { WORKSPACE_PLUGIN, WORKSPACE_LIST, WORKSPACE_LIST_TAP, type WorkspaceRecord } from './grips';
