import type { CSSProperties } from 'react';
import { useGrip } from '@owebeeone/grip-react';
import { DESKTOP_PIN_TAB, type ToolViewProps } from '@grythjs/plugin-api';
import { WTA, SOURCE_ACCENT, wtaFromParams } from './grips';

// File viewer — a SINK. Wired to a source explorer, it inherits that
// explorer's WTA through the context graph and follows it live (the "current
// editor"). PIN it to freeze on the current file: it snapshots into its own
// params and the wire is cut, so it stops following and the next selection
// opens a fresh live viewer. Unwired (pinned, or opened standalone) it reads
// the snapshot from params.

// deterministic mock content per path (a real provider binds later)
function mockLines(repo: string, path: string): string[] {
  const stem = path.split('/').pop() ?? path;
  return [
    `// ${repo}/${path}`,
    `// mock contents — the file provider binds behind this grip later`,
    '',
    `export function ${stem.replace(/[^A-Za-z0-9]/g, '_')}() {`,
    `  return '${path}';`,
    '}',
  ];
}

export function FileViewer({ tabId, params }: ToolViewProps) {
  const live = useGrip(WTA);                 // inherited from a wired source, or null
  const accentRaw = useGrip(SOURCE_ACCENT) ?? '';
  const pinTab = useGrip(DESKTOP_PIN_TAB);
  // PINNED tabs ignore the wire and read their frozen snapshot. (We cut the
  // source edge on pin, but grip-core does not re-resolve an already-resolved
  // consumer when a parent is unlinked, so the flag — not the edge — is what
  // makes a pinned viewer stop following.)
  const isPinned = !!params?.pinned;
  const wired = !!live && !isPinned;
  const accent = wired ? accentRaw : '';
  const w = wired ? live : wtaFromParams(params);   // live wire wins; else the snapshot
  const pinned = isPinned && !!w.path;

  if (!w.path) {
    return (
      <div className="facet-pad">
        <h2>Viewer</h2>
        <p>{wired
          ? 'Wired to an explorer — pick a file there.'
          : 'No file linked. Open one from an explorer or the workspace graph.'}</p>
      </div>
    );
  }
  return (
    <div className={`code-viewer${wired ? ' wired' : ''}`} style={{ '--src': accent } as CSSProperties}>
      <header className="code-viewer-head">
        {wired && <span className="src-dot" title="wired to a source explorer" />}
        <code className="code-viewer-path">{w.workspace}/{w.path}</code>
        <span className="code-chip ref">⎇ {w.ref}</span>
        {wired && <span className="code-chip live">live</span>}
        {pinned && <span className="code-chip pinned">pinned</span>}
        <span className="code-head-spacer" />
        {wired && (
          <button
            className="pin-btn"
            title="Pin this file — stop following the explorer"
            onClick={() => pinTab?.(tabId, { workspace: w.workspace, path: w.path, ref: w.ref, pinned: true })}
          >📌</button>
        )}
      </header>
      <pre className="code-viewer-body">
        {mockLines(w.workspace, w.path).join('\n')}
      </pre>
    </div>
  );
}
