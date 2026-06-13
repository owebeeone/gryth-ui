import { useGrip } from '@owebeeone/grip-react';
import { GRAPH_NODES } from './grips';
import { VBW, VBH, type GraphEngine } from './graphEngine';
import type { DepEdge, GraphRenderNode } from './types';

// The dynamic graph view — ported from grip-lab's WorkspaceGraphView. Pure:
// node positions arrive via GRAPH_NODES (published by the viewer's sim tap
// into its tab context); every gesture goes straight to the engine.

function toCanvas(svg: SVGSVGElement, clientX: number, clientY: number) {
  const rect = svg.getBoundingClientRect();
  return { x: (clientX - rect.left) * (VBW / rect.width), y: (clientY - rect.top) * (VBH / rect.height) };
}

function boundaryIntersection(from: GraphRenderNode, to: GraphRenderNode) {
  const dx = from.x - to.x; const dy = from.y - to.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { x: to.x, y: to.y };
  const scale = Math.min((to.w / 2) / (Math.abs(dx) || Infinity), (to.h / 2) / (Math.abs(dy) || Infinity));
  return { x: to.x + dx * scale, y: to.y + dy * scale };
}

const edgeNodeId = (repoPath: string) => repoPath || 'root';
const svgIdPart = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '_') || 'root';

export default function WorkspaceGraph({ engine, edges, scope, onOpenFile }: {
  engine: GraphEngine | undefined; // resolved from the tab context's sim tap
  edges: DepEdge[];
  scope: string; // unique per viewer — namespaces the SVG marker ids
  onOpenFile?: (node: GraphRenderNode, path: string) => void;
}) {
  const nodes = useGrip(GRAPH_NODES) ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const orderedNodes = [...nodes].sort((a, b) => Number(a.expanded) - Number(b.expanded));
  const markerScope = `graph-${svgIdPart(scope)}`;
  // Dependency edges (source depends on target), arrow points to the dependency.
  const drawn = edges
    .map((e, index) => {
      const source = edgeNodeId(e.source);
      const target = edgeNodeId(e.target);
      const s = byId.get(source);
      const t = byId.get(target);
      if (!s || !t) return null;
      const ti = boundaryIntersection(s, t);
      const si = boundaryIntersection(t, s);
      const hot = s.expanded || t.expanded;
      return {
        id: `${source}->${target}-${index}`,
        marker: `${markerScope}-arrow-${svgIdPart(`${source}->${target}-${index}`)}`,
        x1: si.x, y1: si.y, x2: ti.x, y2: ti.y,
        color: hot ? s.color : '#7c8494',
        hot,
      };
    })
    .filter(Boolean) as { id: string; marker: string; x1: number; y1: number; x2: number; y2: number; color: string; hot: boolean }[];

  return (
    <div className="graph-wrap">
      <div className="graph-toolbar">
        <span className="graph-hint">Drag nodes to anchor · click to pin · hover to expand</span>
        <button className="graph-ghost" onClick={() => engine?.scatter()}>↻ Re-layout</button>
      </div>
      <svg
        className="graph-svg"
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={(e) => engine?.moveDrag(toCanvas(e.currentTarget, e.clientX, e.clientY))}
        onMouseUp={() => engine?.endDrag()}
        onMouseLeave={() => engine?.endDrag()}
        onClick={() => engine?.pin(null)}
      >
        <defs>
          {drawn.map((e) => (
            <marker
              key={e.id}
              id={e.marker}
              markerWidth="10"
              markerHeight="8"
              refX="9"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 10 4 L 0 8 z" fill={e.color} />
            </marker>
          ))}
        </defs>
        <g>
          {drawn.map((e) => (
            <line
              key={e.id}
              x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              stroke={e.color}
              strokeWidth={e.hot ? 2.8 : 1.8}
              markerEnd={`url(#${e.marker})`}
              opacity={e.hot ? 0.98 : 0.72}
            />
          ))}
        </g>
        <g>
          {orderedNodes.map((n) => (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              onMouseEnter={() => engine?.setHover(n.id)}
              onMouseLeave={() => engine?.setHover(null)}
              onMouseDown={(e) => {
                const svg = (e.currentTarget as SVGGElement).ownerSVGElement;
                if (svg) engine?.startDrag(n.id, toCanvas(svg, e.clientX, e.clientY));
              }}
              onClick={(e) => { e.stopPropagation(); engine?.pin(n.id); }}
              style={{ cursor: 'grab' }}
            >
              <rect
                x={-n.w / 2} y={-n.h / 2} width={n.w} height={n.h} rx={10}
                fill="var(--win, Canvas)"
                stroke={n.expanded ? n.color : 'color-mix(in srgb, currentColor 25%, transparent)'}
                strokeWidth={n.expanded ? 2 : 1.2}
              />
              <rect x={-n.w / 2} y={-n.h / 2} width={5} height={n.h} rx={2} fill={n.color} />
              <foreignObject x={-n.w / 2 + 10} y={-n.h / 2 + 6} width={n.w - 18} height={n.h - 12}>
                <div className="gnode-body">
                  <div className="gnode-title">
                    <strong>{n.name}</strong>
                    <span className={`gnode-state ${n.dirty ? 'dirty' : 'clean'}`}>{n.dirty ? 'dirty' : 'clean'}</span>
                  </div>
                  <div className="gnode-meta">
                    <span>⎇ {n.branch}</span>
                    <span className="gnode-sha">{n.head}</span>
                    {n.ahead > 0 && <span className="gnode-ahead">↑{n.ahead}</span>}
                    {n.behind > 0 && <span className="gnode-behind">↓{n.behind}</span>}
                  </div>
                  {n.expanded && n.changedFiles.length > 0 && (
                    <ul className="gnode-files">
                      {n.changedFiles.map((f) => (
                        <li key={f.path}>
                          <button
                            className="gnode-file-link"
                            onMouseDown={(ev) => ev.stopPropagation()}
                            onClick={(ev) => { ev.stopPropagation(); onOpenFile?.(n, f.path); }}
                          >
                            {f.path}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </foreignObject>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
