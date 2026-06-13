import type { ToolViewProps } from '@grythjs/plugin-api';

// Mock file tree — part of the plugin-code file/VCS seam. Opened by LINKS
// that REVEAL a file ('repo::path' in params): the tree renders that path
// expanded with the file highlighted. A real workspace-tree provider binds
// behind this later.
export function Explorer({ params }: ToolViewProps) {
  const reveal = typeof params?.reveal === 'string' ? params.reveal : '';
  if (reveal) {
    const [repo, file] = reveal.split('::');
    const segments = (file ?? '').split('/');
    const fileName = segments[segments.length - 1];
    const dirs = segments.slice(0, -1);
    return (
      <div className="facet-pad explorer-tree">
        <div className="explorer-dir">{repo}/</div>
        {dirs.map((d, i) => (
          <div key={d} className={`explorer-dir indent-${Math.min(3, i + 1)}`}>{d}/</div>
        ))}
        <div className={`explorer-file revealed indent-${Math.min(3, dirs.length + 1)}`}>{fileName}</div>
      </div>
    );
  }
  return (
    <div className="facet-pad explorer-tree">
      <div className="explorer-dir">gryth-ui/</div>
      <div className="explorer-dir indent-1">src/</div>
      <div className="explorer-dir indent-2">desktop/</div>
      <div className="explorer-file indent-3">Desktop.tsx</div>
      <div className="explorer-file indent-3">Window.tsx</div>
      <div className="explorer-file indent-3">ops.ts</div>
      <div className="explorer-file indent-2">grips.desktop.ts</div>
      <div className="explorer-file indent-2">taps.ts</div>
      <div className="explorer-dir indent-1">dev-docs/</div>
      <div className="explorer-file indent-2">CodingRules.md</div>
      <div className="explorer-file indent-1">package.json</div>
    </div>
  );
}
