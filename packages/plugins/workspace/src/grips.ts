import type { AtomTapHandle } from '@owebeeone/grip-react';
import { defineGrip, type GrythPlugin } from '@grythjs/plugin-api';
import type { GraphEngine } from './graphEngine';
import type { DepEdge, GraphRenderNode, RepoInfo } from './types';

// The plugin's identity grip (the registry key — see GrythPluginContract).
export const WORKSPACE_PLUGIN = defineGrip<GrythPlugin>('Workspace.Plugin');

// Doc scope: the workspace list — records carry an icon and a name (plus
// the repo graph the viewer draws). Mock-provided today; the gryth service
// binds the same grip later and consumers don't change.
export interface WorkspaceRecord {
  id: string;
  name: string;
  icon: string;   // emoji for the mock; an asset ref later
  repos: RepoInfo[];
  deps: DepEdge[];
}
export const WORKSPACE_LIST = defineGrip<WorkspaceRecord[]>('Workspace.List', []);
export const WORKSPACE_LIST_TAP = defineGrip<AtomTapHandle<WorkspaceRecord[]>>('Workspace.List.Tap');

// Per-viewer state, resolved in each viewer's KEYED TAB CONTEXT (the
// CoinColumn pattern) — multiple viewer windows select independently.
export const VIEWER_WORKSPACE = defineGrip<string>('Workspace.Viewer.Selected', '');
export const VIEWER_WORKSPACE_TAP = defineGrip<AtomTapHandle<string>>('Workspace.Viewer.Selected.Tap');

// Published by each viewer's graph sim tap into its CHROME-HELD tab
// context (ToolDef.tabTaps): node snapshots + the engine itself (the
// gesture surface — drag/pin/hover go straight to it).
export const GRAPH_NODES = defineGrip<GraphRenderNode[]>('Workspace.Viewer.GraphNodes', []);
export const GRAPH_ENGINE = defineGrip<GraphEngine>('Workspace.Viewer.GraphEngine');
