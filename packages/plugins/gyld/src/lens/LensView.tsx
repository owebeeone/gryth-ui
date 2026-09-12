import { useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import type { GyldLensState } from '../store/state';
import {
  GYLD_LENS, GYLD_TAB_CAMERA, GYLD_TAB_CAMERA_DRAG, GYLD_TAB_CAMERA_DRAG_TAP,
  GYLD_TAB_CAMERA_TAP, GYLD_TAB_DIMMED, GYLD_TAB_DIMMED_TAP, GYLD_TAB_HOVER,
  GYLD_TAB_HOVER_TAP, GYLD_TAB_SELECTION, GYLD_TAB_SELECTION_TAP,
} from '../grips';
import {
  CAMERA_UNFITTED, NOTHING_DIMMED, NO_SELECTION, cameraTransform, fitCamera, panBy,
  toggleRelation, toggleSelected, wheelFactor, zoomAt,
  type GyldCamera, type GyldCameraDrag, type GyldDimmed, type GyldSelection,
} from './camera';
import { LABEL_FONT_SIZE, LABEL_LINE_HEIGHT, lensExtent } from './geometry';
import {
  buildScene, lensKeyOf, recordIdOf, type LensScene, type SceneEdge, type SceneNode,
} from './scene';

// The lens view: a pure SVG redraw of `gyld.lens.v1`.
//
// It draws the EMITTED geometry and nothing else. No layout runs here, no
// position is adjusted, and a toggle only dims or hides what is already drawn
// (MDV-4). Every piece of window state is a grip: the camera, the drag, the
// selection, the hover and the dim set all live in per-tab atoms, so this file
// holds no React state and no effect.
//
// Gestures read the CURRENT value through the atom's handle rather than the
// render closure, because a drip notification is queued and a mouse can move
// and release inside one cycle (CodingRules.md).

function classOf(item: { dimmed: boolean; selected: boolean; hovered: boolean }, base: string) {
  return [
    base,
    item.dimmed ? `${base}-dim` : '',
    item.selected ? `${base}-selected` : '',
    item.hovered ? `${base}-hover` : '',
  ].filter((name) => name !== '').join(' ');
}

function EdgeShape({ edge, marker }: { edge: SceneEdge; marker: string }) {
  if (edge.hidden) {
    return null;
  }
  return (
    <g id={edge.id} data-record={recordIdOf(edge.id) ?? undefined} className={classOf(edge, 'gyld-edge')}>
      <path
        d={edge.path}
        fill="none"
        stroke={edge.color ?? 'currentColor'}
        strokeWidth={edge.width ?? 1.2}
        strokeDasharray={edge.dash}
        markerEnd={edge.head === undefined ? undefined : `url(#${marker})`}
      />
      <path className="gyld-edge-hit" d={edge.path} fill="none" stroke="transparent" strokeWidth={10} />
      {edge.label !== undefined && edge.labelAt !== undefined && (
        <text
          x={edge.labelAt.x}
          y={edge.labelAt.y}
          className="gyld-edge-label"
          fontSize={LABEL_FONT_SIZE - 1}
          fill={edge.color ?? 'currentColor'}
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}

function NodeShape({ node }: { node: SceneNode }) {
  if (node.hidden) {
    return null;
  }
  return (
    <g id={node.id} data-record={recordIdOf(node.id) ?? undefined} data-slot={node.slot} className={classOf(node, 'gyld-node')}>
      <rect
        x={node.box.x}
        y={node.box.y}
        width={node.box.width}
        height={node.box.height}
        rx={node.radius}
        fill={node.fill ?? 'var(--win, Canvas)'}
        stroke="currentColor"
      />
      {node.lines.map((line, index) => (
        <text
          key={`${node.id}-line-${index}`}
          x={node.labelAt.x}
          y={node.labelAt.y + index * LABEL_LINE_HEIGHT}
          fontSize={LABEL_FONT_SIZE}
          className="gyld-node-line"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function Figure({ scene, camera, markerFor }: {
  scene: LensScene;
  camera: GyldCamera;
  markerFor: (edge: SceneEdge) => string;
}) {
  const markers = new Map<string, string>();
  for (const edge of scene.edges) {
    const color = edge.color ?? 'currentColor';
    markers.set(markerFor(edge), color);
  }
  return (
    <g transform={cameraTransform(camera)}>
      <defs>
        {[...markers.entries()].map(([id, color]) => (
          <marker key={id} id={id} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 8 3 L 0 6 z" fill={color} />
          </marker>
        ))}
      </defs>
      {scene.groups.map((group) => (
        <g key={group.id} id={group.id} className={`gyld-group ${group.declared ? 'gyld-group-declared' : 'gyld-group-aid'}`}>
          <rect x={group.box.x} y={group.box.y} width={group.box.width} height={group.box.height} rx={8} />
          <text x={group.box.x + 8} y={group.box.y + 14} fontSize={LABEL_FONT_SIZE + 1}>
            {group.label}
            {group.declared ? '' : ' (reading aid)'}
          </text>
        </g>
      ))}
      {scene.edges.map((edge) => (
        <EdgeShape key={edge.id} edge={edge} marker={markerFor(edge)} />
      ))}
      {scene.nodes.map((node) => (
        <NodeShape key={node.id} node={node} />
      ))}
    </g>
  );
}

/** The figure, the legend, the omission strip and the provenance footer, as a
 *  pure function of a scene. Exported so a test renders it with no grip at
 *  all and the view stays the thin grip-reading wrapper. */
export function LensFigure({ scene, camera, scope, onPick, onHover }: {
  scene: LensScene;
  camera: GyldCamera;
  /** Namespaces the SVG marker ids, so two windows never share one. */
  scope: string;
  onPick?: (lensId: string, additive: boolean) => void;
  onHover?: (lensId: string) => void;
}) {
  const markerFor = (edge: SceneEdge) => `${scope}-arrow-${edge.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  return (
    <svg
      className="gyld-lens-svg"
      // Delegated: one handler resolves the nearest drawn group to its id,
      // rather than one handler per node and edge.
      onClick={(event) => {
        const group = (event.target as Element).closest?.('g[id]');
        const id = group?.getAttribute('id') ?? '';
        onPick?.(id, event.shiftKey || event.metaKey);
      }}
      onMouseMove={(event) => {
        const group = (event.target as Element).closest?.('g[id]');
        onHover?.(group?.getAttribute('id') ?? '');
      }}
      onMouseLeave={() => onHover?.('')}
    >
      <Figure scene={scene} camera={camera} markerFor={markerFor} />
    </svg>
  );
}

export function LensLegend({ scene, dimmed, onToggle }: {
  scene: LensScene;
  dimmed: GyldDimmed;
  onToggle?: (relation: string) => void;
}) {
  return (
    <div className="gyld-legend">
      {scene.legendEdges.map((entry) => {
        const off = dimmed.relations.includes(entry.relation);
        return (
          <button
            key={entry.relation}
            type="button"
            className={`gyld-legend-edge${off ? ' gyld-legend-off' : ''}`}
            onClick={() => onToggle?.(entry.relation)}
            title={`${entry.style} line${entry.label === undefined ? '' : `, labelled ${entry.label}`}`}
          >
            <svg width="26" height="10" aria-hidden="true">
              <line
                x1="1" y1="5" x2="25" y2="5"
                stroke={entry.color}
                strokeWidth="2"
                strokeDasharray={entry.style === 'dashed' ? '6 4' : entry.style === 'dotted' ? '2 3' : undefined}
              />
            </svg>
            {entry.relation}
          </button>
        );
      })}
      {scene.legendNodes.map((entry) => (
        <span key={`${entry.kind}/${entry.status ?? ''}/${entry.classification ?? ''}`} className="gyld-legend-node">
          <span className="gyld-swatch" style={{ background: entry.fill }} />
          {entry.kind}
          {entry.status === undefined ? '' : ` · ${entry.status}`}
          {entry.classification === undefined ? '' : ` · ${entry.classification}`}
        </span>
      ))}
    </div>
  );
}

export function LensOmissions({ scene }: { scene: LensScene }) {
  return (
    <ul className="gyld-omissions">
      {scene.omissions.map((omission) => (
        <li key={omission.text} className={omission.fromWindow ? 'gyld-omission-window' : undefined}>
          {omission.text}
        </li>
      ))}
    </ul>
  );
}

export function LensProvenance({ scene }: { scene: LensScene }) {
  const p = scene.provenance;
  return (
    <footer className="gyld-provenance">
      <span>{p.lineage} · {p.revision} · {p.digest.slice(0, 12)}</span>
      <span>stream {p.stream === '' ? 'none' : p.stream} · perspective {p.perspective}</span>
      <span>draws {p.relations.join(', ')}{p.textRelations.length === 0 ? '' : ` · ${p.textRelations.join(', ')} as text`}</span>
      <span>{p.engine} · {p.pinned ? 'pinned layout' : 'PREVIEW, unpinned layout'}</span>
      <span>{scene.counts.nodes} nodes · {scene.counts.edges} edges · {scene.counts.groups} groups</span>
    </footer>
  );
}

/** The viewport of the SVG the gesture happened in. */
function viewportOf(element: Element): { width: number; height: number; left: number; top: number } {
  const rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
}

/**
 * The window's lens. Reads `Gyld.Lens` and the per-tab view atoms; writes
 * through their handles. The camera is fitted once per lens by a REF CALLBACK
 * on the SVG, which is the sanctioned way to reach the DOM (CodingRules.md);
 * panning runs through a full-window overlay while the drag atom is set.
 */
export function LensView({ scope = 'gyld' }: { scope?: string }) {
  const state = useGrip(GYLD_LENS);
  const camera = useGrip(GYLD_TAB_CAMERA) ?? CAMERA_UNFITTED;
  const drag = useGrip(GYLD_TAB_CAMERA_DRAG);
  const selection = useGrip(GYLD_TAB_SELECTION) ?? NO_SELECTION;
  const hover = useGrip(GYLD_TAB_HOVER) ?? '';
  const dimmed = useGrip(GYLD_TAB_DIMMED) ?? NOTHING_DIMMED;
  const cameraTap = useGrip(GYLD_TAB_CAMERA_TAP) as AtomTapHandle<GyldCamera> | undefined;
  const dragTap = useGrip(GYLD_TAB_CAMERA_DRAG_TAP) as
    AtomTapHandle<GyldCameraDrag | undefined> | undefined;
  const selectionTap = useGrip(GYLD_TAB_SELECTION_TAP) as AtomTapHandle<GyldSelection> | undefined;
  const hoverTap = useGrip(GYLD_TAB_HOVER_TAP) as AtomTapHandle<string> | undefined;
  const dimmedTap = useGrip(GYLD_TAB_DIMMED_TAP) as AtomTapHandle<GyldDimmed> | undefined;

  if (state?.status !== 'ok' || state.value === undefined) {
    return <LensAbsent state={state} />;
  }
  const lens = state.value;
  const key = lensKeyOf(lens);
  const scene = buildScene(lens, { selection, hover, dimmed });

  const fitTo = (element: Element, force: boolean) => {
    const held = cameraTap?.get() ?? CAMERA_UNFITTED;
    if (!force && held.fittedTo === key) {
      return;
    }
    cameraTap?.set(fitCamera(lensExtent(lens), viewportOf(element), key));
  };

  return (
    <div className="gyld-lens">
      <div className="gyld-lens-bar">
        <span className="gyld-lens-title">{lens.title}</span>
        <button
          type="button"
          onClick={(event) => {
            const svg = event.currentTarget.closest('.gyld-lens')?.querySelector('svg');
            if (svg) {
              fitTo(svg, true);
            }
          }}
        >
          Fit
        </button>
        <label className="gyld-hide-toggle">
          <input
            type="checkbox"
            checked={dimmed.hide}
            onChange={() => {
              const held = dimmedTap?.get() ?? NOTHING_DIMMED;
              dimmedTap?.set({ ...held, hide: !held.hide });
            }}
          />
          hide instead of dim
        </label>
      </div>
      <LensLegend
        scene={scene}
        dimmed={dimmed}
        onToggle={(relation) => {
          dimmedTap?.set(toggleRelation(dimmedTap.get() ?? NOTHING_DIMMED, relation));
        }}
      />
      <div
        className="gyld-lens-stage"
        // The ref callback fits the camera once per lens. Keyed on the lens so
        // a new perspective re-mounts and fits again.
        key={key}
        ref={(element) => {
          const svg = element?.querySelector('svg');
          if (svg) {
            fitTo(svg, false);
          }
        }}
        onWheel={(event) => {
          const viewport = viewportOf(event.currentTarget);
          const at = { x: event.clientX - viewport.left, y: event.clientY - viewport.top };
          cameraTap?.set(zoomAt(cameraTap.get() ?? CAMERA_UNFITTED, at, wheelFactor(event.deltaY)));
        }}
        onMouseDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          dragTap?.set({ x: event.clientX, y: event.clientY });
        }}
      >
        <LensFigure
          scene={scene}
          camera={camera}
          scope={scope}
          onHover={(id) => {
            if ((hoverTap?.get() ?? '') !== id) {
              hoverTap?.set(id);
            }
          }}
          onPick={(id, additive) => {
            if (id === '') {
              selectionTap?.set(NO_SELECTION);
              return;
            }
            selectionTap?.set(toggleSelected(selectionTap.get() ?? NO_SELECTION, id, additive));
          }}
        />
      </div>
      <LensOmissions scene={scene} />
      <LensProvenance scene={scene} />
      {drag !== undefined && (
        <div
          className="drag-overlay gyld-pan"
          onMouseMove={(event) => {
            const held = dragTap?.get();
            if (held === undefined) {
              return;
            }
            cameraTap?.set(panBy(
              cameraTap.get() ?? CAMERA_UNFITTED,
              event.clientX - held.x,
              event.clientY - held.y,
            ));
            dragTap?.set({ x: event.clientX, y: event.clientY });
          }}
          onMouseUp={() => dragTap?.set(undefined)}
          onMouseLeave={() => dragTap?.set(undefined)}
        />
      )}
    </div>
  );
}

/** Absence as a rendered state: the window says which one it is in. */
function LensAbsent({ state }: { state: GyldLensState | undefined }) {
  const status = state?.status ?? 'unset';
  const messages: Record<string, string> = {
    unset: 'no stream and perspective on this window yet',
    loading: 'reading the lens file',
    absent: 'this stream did not emit that perspective',
    invalid: 'the lens file did not read',
  };
  return (
    <div className="gyld-lens gyld-lens-empty">
      <p className="gyld-note">{messages[status] ?? status}</p>
      {state?.fault !== undefined && (
        <p className="gyld-fault">
          {state.fault.path}: {state.fault.message}
        </p>
      )}
    </div>
  );
}
