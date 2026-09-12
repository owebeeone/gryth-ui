import { LENS_FORMAT } from '../contract';
import type { PreviewPlan } from './neighbourhood';

// json0 in, `gyld.lens.v1` out.
//
// This is the host's `geometry_of` and `lens_document`
// (gyld/scripts/lens_geometry.py) with one difference, and the difference is
// the whole point of the step: `engine.pinned` is FALSE and the engine named
// is the browser's own wasm Graphviz. Everything that is not geometry is
// copied from the emitted lens the plan was restricted out of, so the snapshot,
// the stream, the relations, the legend and every node's text arrive here
// already emitted and leave unchanged.

/** What laid a preview out. `name` carries the npm package and its version,
 *  `version` the Graphviz build inside it, because a reader comparing a
 *  preview with the emitted picture needs both. */
export interface PreviewEngine {
  name: string;
  version: string;
}

interface PlacedNode {
  pos: [number, number];
  size: [number, number];
}

interface PlacedEdge {
  spline: string;
  labelPos?: [number, number];
  tail: string;
  head: string;
}

interface Geometry {
  bb: [number, number, number, number];
  nodes: Map<string, PlacedNode>;
  edges: Map<string, PlacedEdge>;
  groups: Map<string, [number, number, number, number]>;
}

/** A preview that cannot be built is an error, never a picture with a number
 *  filled in. The tap turns this into an `invalid` state with the message. */
function reject(message: string): never {
  throw new Error(`preview layout: ${message}`);
}

function numbers(value: unknown, what: string): number[] {
  if (typeof value !== 'string') {
    reject(`${what} is not a Graphviz coordinate string`);
  }
  return value.split(',').map((part) => {
    const found = Number(part);
    if (!Number.isFinite(found)) {
      reject(`${what} carries ${part}, which is not a number`);
    }
    return found;
  });
}

function point(value: unknown, what: string): [number, number] {
  const found = numbers(value, what);
  if (found.length !== 2) {
    reject(`${what} is not a point`);
  }
  return [found[0], found[1]];
}

function box(value: unknown, what: string): [number, number, number, number] {
  const found = numbers(value, what);
  if (found.length !== 4) {
    reject(`${what} is not a bounding box`);
  }
  return [found[0], found[1], found[2], found[3]];
}

function size(item: Record<string, unknown>, id: string): [number, number] {
  const width = Number(item.width);
  const height = Number(item.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    reject(`${id} was laid out with no size`);
  }
  return [width, height];
}

/** Record id to position, size, bounding box and spline, from one json0
 *  document. The host's `geometry_of`, field for field. */
export function geometryOf(json0: string): Geometry {
  const document = JSON.parse(json0) as Record<string, unknown>;
  const nodes = new Map<string, PlacedNode>();
  const groups = new Map<string, [number, number, number, number]>();
  const byGvid = new Map<number, string>();
  for (const raw of (document.objects ?? []) as Record<string, unknown>[]) {
    const id = typeof raw.id === 'string' ? raw.id : '';
    byGvid.set(Number(raw._gvid), id);
    if (raw.pos !== undefined) {
      nodes.set(id, { pos: point(raw.pos, `${id} pos`), size: size(raw, id) });
    } else {
      groups.set(id, box(raw.bb, `${id} bb`));
    }
  }
  const edges = new Map<string, PlacedEdge>();
  for (const raw of (document.edges ?? []) as Record<string, unknown>[]) {
    const id = typeof raw.id === 'string' ? raw.id : '';
    if (edges.has(id)) {
      reject(`two drawn edges share id ${id}`);
    }
    const placed: PlacedEdge = {
      spline: typeof raw.pos === 'string' ? raw.pos : reject(`${id} was laid out with no spline`),
      tail: byGvid.get(Number(raw.tail)) ?? '',
      head: byGvid.get(Number(raw.head)) ?? '',
    };
    if (raw.lp !== undefined) {
      placed.labelPos = point(raw.lp, `${id} lp`);
    }
    edges.set(id, placed);
  }
  return { bb: box(document.bb, 'graph bb'), nodes, edges, groups };
}

/**
 * The `gyld.lens.v1` document for one preview. The caller passes it through
 * `readLens`, which is the package's own reader: a preview that does not read
 * is a preview the windows will not draw, on exactly the terms an emitted file
 * that does not read is not drawn.
 */
export function previewDocument(
  plan: PreviewPlan,
  json0: string,
  engine: PreviewEngine,
): Record<string, unknown> {
  const geometry = geometryOf(json0);
  const nodes = plan.nodes.map((node) => {
    const placed = geometry.nodes.get(node.id);
    if (placed === undefined) {
      reject(`${node.id} was not laid out`);
    }
    return { ...node, pos: placed.pos, size: placed.size };
  });
  const edges = plan.edges.map((edge) => {
    const drawn = geometry.edges.get(edge.id);
    if (drawn === undefined) {
      reject(`${edge.id} was not laid out`);
    }
    if (drawn.tail !== edge.tail || drawn.head !== edge.head) {
      reject(`${edge.id} was laid out between other nodes`);
    }
    const placed: Record<string, unknown> = { ...edge, spline: drawn.spline };
    if (drawn.labelPos !== undefined) {
      placed.label_pos = drawn.labelPos;
    } else {
      delete placed.label_pos;
    }
    return placed;
  });
  const groups = plan.groups.map((group) => {
    const drawn = geometry.groups.get(group.id);
    if (drawn === undefined) {
      reject(`${group.id} was not laid out`);
    }
    return { ...group, bb: drawn };
  });
  const source = plan.source;
  const document: Record<string, unknown> = {
    format: LENS_FORMAT,
    perspective: plan.perspective,
    family: plan.family,
    parameter: plan.parameter,
    snapshot: source.snapshot,
    title: plan.title,
    relations: source.relations,
    omissions: plan.omissions,
    legend: source.legend,
    engine: { name: engine.name, version: engine.version, pinned: false },
    bb: geometry.bb,
    groups,
    nodes,
    edges,
    counts: {
      nodes: nodes.length,
      edges: edges.length,
      groups: groups.length,
      omitted_occurrences: plan.omittedOccurrences,
      omitted_assertions: plan.omittedAssertions,
    },
  };
  // Absent stays absent: an architecture lens no stream overlays carries no
  // `stream`, and a lens that drew no relation as text carries no
  // `text_relations`. A preview of one repeats what its source said.
  if (source.stream !== undefined) {
    document.stream = source.stream;
  }
  if (source.text_relations !== undefined) {
    document.text_relations = source.text_relations;
  }
  return document;
}
