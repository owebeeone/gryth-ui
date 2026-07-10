import { useGrip } from '@owebeeone/grip-react';
import { DESKTOP_OPEN_WIRED_PAIR, type ToolViewProps } from '@grythjs/plugin-api';
import {
  GRAPH_ENGINE, VIEWER_WORKSPACE, VIEWER_WORKSPACE_TAP, WORKSPACE_LIST,
} from './grips';
import WorkspaceGraph from './WorkspaceGraph';
import type { GraphRenderNode } from './types';

// Live count in the launcher — a context-mounted menuTitle reading grips.
export function WorkspacesMenuTitle() {
  const count = (useGrip(WORKSPACE_LIST) ?? []).length;
  return <>Workspaces ({count})</>;
}

// The viewer window. Chrome mounts it inside the tab's CHROME-HELD context
// where ToolDef.tabTaps seeded the selection atom and the graph sim — so
// plain useGrip resolves per-tab state, multiple viewers stay independent,
// and selection survives unmount/remount (desktop switch, minimize).
export function WorkspaceViewer({ tabId }: ToolViewProps) {
  const list = useGrip(WORKSPACE_LIST) ?? [];
  const selTap = useGrip(VIEWER_WORKSPACE_TAP);
  const chosen = useGrip(VIEWER_WORKSPACE);
  const engine = useGrip(GRAPH_ENGINE);
  const openPair = useGrip(DESKTOP_OPEN_WIRED_PAIR);

  const selected = chosen && list.some((w) => w.id === chosen) ? chosen : list[0]?.id ?? '';
  const record = list.find((w) => w.id === selected);
  // idempotent: the engine rebuilds only when the input key changes
  engine?.setInput(record?.repos ?? [], record?.deps ?? [], `${tabId}:${selected}`);

  // One click drops a WIRED pair: an explorer seeded AT the file (the WTA
  // source) and a viewer following it. Navigate in the explorer and the
  // viewer follows — they cooperate instead of being two stranded windows.
  const openFile = (node: GraphRenderNode, path: string) => {
    openPair?.('explorer', 'viewer', { workspace: node.name, path, ref: node.branch });
  };

  return (
    <div className="ws-viewer">
      <aside className="ws-list">
        {list.map((w) => (
          <button
            key={w.id}
            className={`ws-item${w.id === selected ? ' active' : ''}`}
            onClick={() => selTap?.set(w.id)}
          >
            <span className="ws-icon">{w.icon}</span>
            <span className="ws-name">{w.name}</span>
          </button>
        ))}
      </aside>
      <div className="ws-graph-pane">
        <WorkspaceGraph engine={engine} edges={record?.deps ?? []} scope={tabId} onOpenFile={openFile} />
      </div>
    </div>
  );
}
