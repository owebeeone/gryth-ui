import {
  useAtomValueTap, useGrip, useKeyedMatchingContext, useTap,
} from '@owebeeone/grip-react';
import { DESKTOP_OPEN_TOOL, type ToolViewProps } from '@grythjs/plugin-api';
import {
  VIEWER_WORKSPACE, VIEWER_WORKSPACE_TAP, WORKSPACE_LIST,
} from './grips';
import { simFor } from './graphEngine';
import WorkspaceGraph from './WorkspaceGraph';
import type { GraphRenderNode } from './types';

// Live count in the launcher — a context-mounted menuTitle reading grips.
export function WorkspacesMenuTitle() {
  const count = (useGrip(WORKSPACE_LIST) ?? []).length;
  return <>Workspaces ({count})</>;
}

// The viewer window. Each window creates its OWN keyed matching context
// (the CoinColumn pattern) keyed by its tab id: selection state and the
// graph sim live in that context, so multiple viewers stay independent.
export function WorkspaceViewer({ tabId }: ToolViewProps) {
  const ctx = useKeyedMatchingContext(`workspace-viewer:${tabId}`);
  const sim = simFor(tabId);
  useTap(() => sim, { ctx, deps: [sim, ctx] });

  const list = useGrip(WORKSPACE_LIST) ?? [];
  const selTap = useAtomValueTap(VIEWER_WORKSPACE, {
    ctx,
    initial: '',
    tapGrip: VIEWER_WORKSPACE_TAP,
  });
  const chosen = useGrip(VIEWER_WORKSPACE, ctx);
  const selected = chosen && list.some((w) => w.id === chosen) ? chosen : list[0]?.id ?? '';
  const record = list.find((w) => w.id === selected);
  // idempotent: the engine rebuilds only when the input key changes
  sim.graph.setInput(record?.repos ?? [], record?.deps ?? [], `${tabId}:${selected}`);

  // Clicking a changed file fires TWO links through the desktop's open
  // intent: the explorer revealed at the file, and the viewer on the file
  // anchored to its ref (v1 policy: each link opens a new window).
  const openTool = useGrip(DESKTOP_OPEN_TOOL);
  const openFile = (node: GraphRenderNode, path: string) => {
    openTool?.({ toolId: 'explorer', params: { reveal: `${node.name}::${path}` } });
    openTool?.({
      toolId: 'viewer',
      params: { repo: node.name, path, branch: node.branch, head: node.head, view: 'working' },
    });
  };

  return (
    <div className="ws-viewer">
      <aside className="ws-list">
        {list.map((w) => (
          <button
            key={w.id}
            className={`ws-item${w.id === selected ? ' active' : ''}`}
            onClick={() => selTap.set(w.id)}
          >
            <span className="ws-icon">{w.icon}</span>
            <span className="ws-name">{w.name}</span>
          </button>
        ))}
      </aside>
      <div className="ws-graph-pane">
        <WorkspaceGraph ctx={ctx} engine={sim.graph} edges={record?.deps ?? []} scope={tabId} onOpenFile={openFile} />
      </div>
    </div>
  );
}
