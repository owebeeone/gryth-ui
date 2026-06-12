import type { ToolViewProps } from '@grythjs/plugin-api';

// Mock file viewer — the plugin-code group's first tool. Opened by LINKS
// (workspace graph file clicks, explorer, agents): params carry the repo,
// path, and the REF the view is anchored to. The header shows which
// version is on screen — the working tree plus the branch/HEAD it sits on.

const str = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v : fallback);

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

export function FileViewer({ params }: ToolViewProps) {
  const p = params ?? {};
  const repo = str(p.repo, '?');
  const path = str(p.path, '');
  const branch = str(p.branch, 'main');
  const head = str(p.head, '');
  const view = str(p.view, 'working');

  if (!path) {
    return (
      <div className="facet-pad">
        <h2>Viewer</h2>
        <p>No file linked. Open one from a workspace graph or the explorer.</p>
      </div>
    );
  }
  return (
    <div className="code-viewer">
      <header className="code-viewer-head">
        <code className="code-viewer-path">{repo}/{path}</code>
        <span className="code-chip view">{view}</span>
        <span className="code-chip ref">⎇ {branch}</span>
        {head && <span className="code-chip sha">{head}</span>}
      </header>
      <pre className="code-viewer-body">
        {mockLines(repo, path).join('\n')}
      </pre>
    </div>
  );
}
