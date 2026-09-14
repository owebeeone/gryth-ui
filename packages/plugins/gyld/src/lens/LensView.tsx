import { useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import type { GyldLensState } from '../store/state';
import { effectiveSelection } from '../browser/links';
import { applyPick } from './pick';
import type { GyldFocus } from '../focus';
import {
  GYLD_DEST_REF, GYLD_DEST_REF_TAP, GYLD_DEST_STREAM, GYLD_FOCUS_TAP,
  GYLD_LENS, GYLD_LENS_PALETTE,
  GYLD_TAB_CAMERA, GYLD_TAB_CAMERA_DRAG, GYLD_TAB_CAMERA_DRAG_TAP,
  GYLD_TAB_CAMERA_TAP, GYLD_TAB_DIMMED, GYLD_TAB_DIMMED_TAP, GYLD_TAB_HOVER,
  GYLD_TAB_HOVER_TAP, GYLD_TAB_SELECTION, GYLD_TAB_SELECTION_TAP,
} from '../grips';
import {
  CAMERA_UNFITTED, NOTHING_DIMMED, NO_SELECTION, cameraTransform, fitCamera, isPanning,
  panBy, panningAt, pressAt, toggleRelation, wheelFactor, zoomAt,
  type GyldCamera, type GyldCameraDrag, type GyldDimmed, type GyldSelection,
} from './camera';
import { EDGE_LABEL_FONT_SIZE, GROUP_LABEL_FONT_SIZE, lensExtent } from './geometry';
import {
  LENS_PALETTE_LIGHT, inkOn, labelOn, lineOn, type GyldLensPalette,
} from './palette';
import {
  buildScene, lensKeyOf, recordIdOf, slotOf,
  type LensScene, type SceneEdge, type SceneNode, type SceneSearch,
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
//
// COLOUR is the one thing the view decides for itself, and it decides it from
// `Gyld.Lens.Palette` and nothing else. The emitted FILLS are left alone —
// they are the status legend — but the ink a box's text is written in, and
// every line, arrow head and legend sample, are moved onto the desk's own
// canvas until they meet the WCAG minima (./contrast.ts). A lens file is
// emitted for a light canvas; a dark desk would otherwise show light text on
// a pastel fill and near-invisible edges, and none of that is a layout
// change, so MDV-4 still holds.

function classOf(
  item: { dimmed: boolean; selected: boolean; hovered: boolean; matched: boolean },
  base: string,
) {
  return [
    base,
    item.dimmed ? `${base}-dim` : '',
    item.selected ? `${base}-selected` : '',
    item.hovered ? `${base}-hover` : '',
    item.matched ? `${base}-match` : '',
  ].filter((name) => name !== '').join(' ');
}

function EdgeShape({ edge, marker, palette }: {
  edge: SceneEdge;
  marker: string;
  palette: GyldLensPalette;
}) {
  if (edge.hidden) {
    return null;
  }
  return (
    <g id={edge.id} data-record={recordIdOf(edge.id) ?? undefined} className={classOf(edge, 'gyld-edge')}>
      <path
        d={edge.path}
        fill="none"
        stroke={lineOn(palette, edge.color)}
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
          fontSize={EDGE_LABEL_FONT_SIZE}
          fill={labelOn(palette, edge.color)}
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}

function NodeShape({ node, palette }: { node: SceneNode; palette: GyldLensPalette }) {
  if (node.hidden) {
    return null;
  }
  // The emitted fill stands for the node's status, so it is drawn as emitted
  // and the TEXT moves instead: whichever of the desk's two inks reads on it.
  const ink = inkOn(palette, node.fill);
  return (
    <g id={node.id} data-record={recordIdOf(node.id) ?? undefined} data-slot={node.slot} className={classOf(node, 'gyld-node')}>
      <rect
        x={node.box.x}
        y={node.box.y}
        width={node.box.width}
        height={node.box.height}
        rx={node.radius}
        fill={node.fill ?? palette.canvas}
        stroke={palette.stroke}
      />
      {node.lines.map((line, index) => (
        <text
          key={`${node.id}-line-${index}`}
          x={node.labelAt.x}
          y={node.labelAt.y + index * node.lineHeight}
          fontSize={node.fontSize}
          textAnchor={node.anchor}
          className="gyld-node-line"
          // An inline style, not a `fill` attribute: `.gyld-node-line` sets
          // `fill: currentColor` in the sheet, and a stylesheet rule beats a
          // presentation attribute.
          style={{ fill: ink }}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function Figure({ scene, camera, markerFor, palette }: {
  scene: LensScene;
  camera: GyldCamera;
  markerFor: (edge: SceneEdge) => string;
  palette: GyldLensPalette;
}) {
  const markers = new Map<string, string>();
  for (const edge of scene.edges) {
    markers.set(markerFor(edge), lineOn(palette, edge.color));
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
          <text x={group.box.x + 8} y={group.box.y + 14} fontSize={GROUP_LABEL_FONT_SIZE}>
            {group.label}
            {group.declared ? '' : ' (reading aid)'}
          </text>
        </g>
      ))}
      {scene.edges.map((edge) => (
        <EdgeShape key={edge.id} edge={edge} marker={markerFor(edge)} palette={palette} />
      ))}
      {scene.nodes.map((node) => (
        <NodeShape key={node.id} node={node} palette={palette} />
      ))}
    </g>
  );
}

/** The figure, the legend, the omission strip and the provenance footer, as a
 *  pure function of a scene. Exported so a test renders it with no grip at
 *  all and the view stays the thin grip-reading wrapper. */
export function LensFigure({
  scene, camera, scope, palette = LENS_PALETTE_LIGHT, onPick, onHover,
}: {
  scene: LensScene;
  camera: GyldCamera;
  /** Namespaces the SVG marker ids, so two windows never share one. */
  scope: string;
  /** The desk's colours. Defaults to the LIGHT palette, which is the canvas
   *  the lens files are emitted for, so a caller with no theme in reach draws
   *  the emitted colours exactly. */
  palette?: GyldLensPalette;
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
      <Figure scene={scene} camera={camera} markerFor={markerFor} palette={palette} />
    </svg>
  );
}

export function LensLegend({ scene, dimmed, palette = LENS_PALETTE_LIGHT, onToggle }: {
  scene: LensScene;
  dimmed: GyldDimmed;
  /** The same palette the figure is drawn with, so the legend names the
   *  colours that are actually ON the picture and not the ones the file was
   *  emitted with. */
  palette?: GyldLensPalette;
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
                stroke={lineOn(palette, entry.color)}
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
          <span
            className="gyld-swatch"
            style={{ background: entry.fill, borderColor: palette.stroke }}
          />
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
export function LensView({ scope = 'gyld', search, onSlot, state: shown }: {
  scope?: string;
  search?: SceneSearch;
  /**
   * The picture to draw, when the window around this one has already resolved
   * one. A browser window showing a browser PREVIEW passes `Gyld.Preview`
   * here; every other window passes nothing and this reads `Gyld.Lens`.
   *
   * The view does not branch on which it got: a preview arrives in the same
   * `gyld.lens.v1` shape an emitted lens does, is built into a scene by the
   * same builder, and its `engine.pinned: false` is what the provenance footer
   * reads out. Rendering a preview differently would be the view deciding what
   * is emitted, which is not the view's to decide.
   */
  state?: GyldLensState;
  /**
   * Told the QUALIFIED SLOT the reader just picked or hovered, when a window
   * around this one wants to know. The diff window is the one that does: the
   * slot is the only thing that means "the same record" in two pictures (R1),
   * so one pane tells the window and the other lights it up.
   *
   * A window that passes none is unchanged, and a pick that resolves no slot
   * reports the empty string rather than an occurrence id, which would not
   * survive a restream and so could not correspond to anything.
   */
  onSlot?: (slot: string) => void;
}) {
  const resolved = useGrip(GYLD_LENS);
  const state = shown ?? resolved;
  const camera = useGrip(GYLD_TAB_CAMERA) ?? CAMERA_UNFITTED;
  const drag = useGrip(GYLD_TAB_CAMERA_DRAG);
  const held = useGrip(GYLD_TAB_SELECTION) ?? NO_SELECTION;
  const hover = useGrip(GYLD_TAB_HOVER) ?? '';
  const dimmed = useGrip(GYLD_TAB_DIMMED) ?? NOTHING_DIMMED;
  const palette = useGrip(GYLD_LENS_PALETTE) ?? LENS_PALETTE_LIGHT;
  const stream = useGrip(GYLD_DEST_STREAM) ?? '';
  const ref = useGrip(GYLD_DEST_REF) ?? '';
  const cameraTap = useGrip(GYLD_TAB_CAMERA_TAP) as AtomTapHandle<GyldCamera> | undefined;
  const dragTap = useGrip(GYLD_TAB_CAMERA_DRAG_TAP) as
    AtomTapHandle<GyldCameraDrag | undefined> | undefined;
  const selectionTap = useGrip(GYLD_TAB_SELECTION_TAP) as AtomTapHandle<GyldSelection> | undefined;
  const hoverTap = useGrip(GYLD_TAB_HOVER_TAP) as AtomTapHandle<string> | undefined;
  const dimmedTap = useGrip(GYLD_TAB_DIMMED_TAP) as AtomTapHandle<GyldDimmed> | undefined;
  const refTap = useGrip(GYLD_DEST_REF_TAP) as AtomTapHandle<string> | undefined;
  const focusTap = useGrip(GYLD_FOCUS_TAP) as AtomTapHandle<GyldFocus> | undefined;

  if (state?.status !== 'ok' || state.value === undefined) {
    return <LensAbsent state={state} />;
  }
  const lens = state.value;
  const key = lensKeyOf(lens);
  // A window opened on a focus record draws it selected without writing
  // anything: the seeded ref IS the selection until the reader picks.
  const selection = effectiveSelection(lens, held, ref);
  const scene = buildScene(lens, { selection, hover, dimmed, search });

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
        palette={palette}
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
        // The press ARMS the gesture and nothing more. Mounting the capture
        // overlay here would take the release away from the figure, and a
        // browser that saw the press on a node and the release on the overlay
        // dispatches no click at all, so nothing could ever be picked.
        onMouseDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          dragTap?.set(pressAt(event.clientX, event.clientY));
        }}
        // The FIRST move is what turns an armed press into a pan, and the pan
        // overlay is what carries it from there. This handler therefore pans
        // exactly once per gesture and is then covered by the overlay it
        // mounted. Read through the handle, never the render closure: a move
        // and a release can land inside one notification cycle
        // (CodingRules.md).
        onMouseMove={(event) => {
          const held = dragTap?.get();
          if (held === undefined) {
            return;
          }
          if (event.buttons === 0) {
            // Released somewhere this window never saw. The press is over.
            dragTap?.set(undefined);
            return;
          }
          cameraTap?.set(panBy(
            cameraTap.get() ?? CAMERA_UNFITTED,
            event.clientX - held.x,
            event.clientY - held.y,
          ));
          dragTap?.set(panningAt(event.clientX, event.clientY));
        }}
        // A press that never moved ends here, before the click the figure
        // picks on. Guarded so a release with nothing held writes nothing.
        onMouseUp={() => {
          if (dragTap?.get() !== undefined) {
            dragTap.set(undefined);
          }
        }}
      >
        <LensFigure
          scene={scene}
          camera={camera}
          scope={scope}
          palette={palette}
          onHover={(id) => {
            if ((hoverTap?.get() ?? '') !== id) {
              hoverTap?.set(id);
              onSlot?.(id === '' ? '' : (slotOf(lens, id) ?? ''));
            }
          }}
          // One pick, three writes: this window's selection, the record this
          // window is ON (what a wired sink resolves) and the shared focus
          // every gyld window may follow (MDV-5). Each is read back through
          // its handle, never through the render closure (./pick.ts).
          onPick={(id, additive) => {
            const outcome = applyPick(
              { selection: selectionTap, ref: refTap, focus: focusTap },
              lens,
              stream,
              id,
              additive,
            );
            onSlot?.(outcome.ref);
          }}
        />
      </div>
      <LensOmissions scene={scene} />
      <LensProvenance scene={scene} />
      {isPanning(drag) && (
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
            dragTap?.set(panningAt(event.clientX, event.clientY));
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
