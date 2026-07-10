import type { CSSProperties } from 'react';
import { useGrip } from '@owebeeone/grip-react';
import { DESKTOP_OPEN_WIRED, type ToolViewProps } from '@grythjs/plugin-api';
import { WTA, WTA_TAP, SOURCE_ACCENT, WORKSPACES, MOCK_TREE } from './grips';

// The explorer is a WTA SOURCE. It owns a per-tab WTA (workspace + selected
// path + ref) and an identity hue. Clicking a file sets the path and ensures
// a viewer WIRED to this explorer — the chrome makes this tab's context the
// viewer's parent, so the viewer follows every selection live. The IDE
// "current editor", but as a graph edge, not a copied param.
export function Explorer({ tabId }: ToolViewProps) {
  const wta = useGrip(WTA);
  const wtaTap = useGrip(WTA_TAP);
  const accent = useGrip(SOURCE_ACCENT) ?? '';
  const openWired = useGrip(DESKTOP_OPEN_WIRED);

  const workspace = wta?.workspace ?? WORKSPACES[0];
  const ref = wta?.ref ?? 'main';
  const path = wta?.path ?? '';
  const files = MOCK_TREE[workspace] ?? [];

  const setWorkspace = (ws: string) => wtaTap?.set({ workspace: ws, path: '', ref });
  const setRef = (r: string) => wtaTap?.set({ workspace, path, ref: r });
  const pick = (file: string) => {
    wtaTap?.set({ workspace, path: file, ref });
    // ensure (or focus) the viewer wired to this explorer
    openWired?.(tabId, { toolId: 'viewer' });
  };

  return (
    <div className="explorer-src" style={{ '--src': accent } as CSSProperties}>
      <header className="explorer-head">
        <span className="src-dot" title="this explorer is a WTA source" />
        <select value={workspace} onChange={(e) => setWorkspace(e.target.value)}>
          {WORKSPACES.map((ws) => <option key={ws} value={ws}>{ws}</option>)}
        </select>
        <input
          className="src-ref"
          value={ref}
          spellCheck={false}
          onChange={(e) => setRef(e.target.value)}
          title="branch / tag / commit"
        />
      </header>
      <div className="explorer-tree">
        {files.map((f) => (
          <div
            key={f}
            className={`explorer-file${f === path ? ' selected' : ''}`}
            onClick={() => pick(f)}
          >
            {f}
          </div>
        ))}
      </div>
    </div>
  );
}
