import {
  atPath, readArray, readBoolean, readBoundingBox, readCount, readEnvelope,
  readFinite, readIdentifier, readIdentifiers, readObject, readOptionalCount,
  readOptionalFinite, readOptionalIdentifier, readOptionalPoint,
  readOptionalTexts, readPoint, readSnapshotRef, readTexts,
  requireCount, requireKnown, requirePrefix, type SnapshotRef,
} from './common';

// Spec section 7.3: `<p>.lens.json`, the UI's primary input.
//
// `pos` and `bb` are in points with the Graphviz origin (y up); `size` is in
// inches; `spline` is the Graphviz edge `pos` string. `kind` and `status` are
// copied from the emitted definitions, never recomputed, so both are read as
// open strings. `pinned` is false only for a browser preview.

export const LENS_FORMAT = 'gyld.lens.v1';

/** Spec 7.3: every node carries `id="occ:<occurrence id>"`. */
export const NODE_ID_PREFIX = 'occ:';
/** Every edge carries `id="asn:<assertion id>"`, or `...#<index>` when one
 *  assertion has several role refs. */
export const EDGE_ID_PREFIX = 'asn:';
/** Every cluster carries `id="grp:<group id>"`. */
export const GROUP_ID_PREFIX = 'grp:';

export interface LensLegendEdge {
  relation: string;
  color: string;
  style: string;
  /** The relation's definition id. Optional because the host's own lookup
   *  returns nothing when the relation has no single definition. */
  definition?: string;
  label?: string;
}

export interface LensLegendNode {
  kind: string;
  shape: string;
  fill: string;
  status?: string;
  classification?: string;
  glyph?: string;
}

export interface LensLegend {
  edges: LensLegendEdge[];
  nodes: LensLegendNode[];
}

export interface LensEngine {
  name: string;
  version: string;
  pinned: boolean;
}

export interface LensGroup {
  id: string;
  label: string;
  /** `reading-aid` or `declared` in the emitted lenses. Read, never pinned:
   *  the vocabulary is Gyld's (MDV-3 only asks that the two be told apart). */
  kind: string;
  bb: [number, number, number, number];
  members: string[];
  /** The occurrence a DECLARED container corresponds to, for example the area
   *  record behind an allocation cluster. Absent on a reading aid, which is
   *  the distinction MDV-3 asks the frame style to carry. The occurrence is
   *  not itself drawn as a node of the lens, so nothing resolves it here. */
  occurrence?: string;
}

export interface LensNode {
  id: string;
  slot: string;
  label: string;
  kind: string;
  shape: string;
  pos: [number, number];
  size: [number, number];
  text: string[];
  /** The point size the host drew this node's text at. The two lineages do
   *  not agree (11 for the decision lenses, 12 for the architecture ones), so
   *  it is emitted per node and read, never chosen by the view. */
  fontsize: number;
  /** `left` or `center`, as the host justified this node's text block. A node
   *  with one line is centred whatever its lens does, so this is per node too.
   *  Read as an open string: it is Graphviz's vocabulary, not this package's. */
  justify: string;
  /** A status applies to a Question; other kinds carry none. Every emitted
   *  node carries both `status` and `classification` with one of them null,
   *  so one node shape serves the decision and architecture graphs. */
  status?: string;
  /** The declared classification of a library, for example `IOAdapter`. */
  classification?: string;
  /** The cluster this node is drawn inside, as a group id of this lens. */
  group?: string;
  fill?: string;
  style?: string;
}

/** The styling actually drawn for one edge. The legend carries the same three
 *  per RELATION; an edge repeats what the picture used, which can differ where
 *  the host emphasises a particular assertion. */
export interface LensEdgeStyle {
  color?: string;
  style?: string;
  penwidth?: number;
}

export interface LensEdge {
  id: string;
  relation: string;
  tail: string;
  head: string;
  spline: string;
  label?: string;
  label_pos?: [number, number];
  /** The assertion's qualified slot: the identity that survives a restream
   *  (R1), as against `id`, which does not. */
  slot?: string;
  /**
   * The occurrence the assertion belongs to. NOT necessarily a node of this
   * lens: in the decisions and status lenses an Implies edge is drawn from
   * the alternative's owning question, so `tail` is that question while
   * `owner` is the alternative, which those lenses fold into the question's
   * box text rather than drawing.
   */
  owner?: string;
  /** The reference's own position in the assertion's role list, which is what
   *  the `#<index>` suffix of a multi-reference edge id counts. */
  ref_index?: number;
  style?: LensEdgeStyle;
}

export interface LensCounts {
  nodes: number;
  edges: number;
  groups: number;
  omitted_occurrences: number;
  omitted_assertions: number;
}

export interface GyldLens {
  format: typeof LENS_FORMAT;
  perspective: string;
  snapshot: SnapshotRef;
  /** The stream this lens was emitted for, when one overlays the snapshot.
   *  Null in the emitted architecture lenses, which no stream overlays. */
  stream?: string;
  title: string;
  relations: string[];
  omissions: string[];
  legend: LensLegend;
  engine: LensEngine;
  bb: [number, number, number, number];
  nodes: LensNode[];
  edges: LensEdge[];
  counts: LensCounts;
  text_relations?: string[];
  groups?: LensGroup[];
}

function readLegend(value: unknown, path: string): LensLegend {
  const raw = readObject(value, path);
  const edgesPath = atPath(path, 'edges');
  const nodesPath = atPath(path, 'nodes');
  return {
    edges: readArray(raw.edges, edgesPath).map((item, i) => {
      const entry = readObject(item, atPath(edgesPath, i));
      const at = atPath(edgesPath, i);
      const legendEdge: LensLegendEdge = {
        relation: readIdentifier(entry.relation, atPath(at, 'relation')),
        color: readIdentifier(entry.color, atPath(at, 'color')),
        style: readIdentifier(entry.style, atPath(at, 'style')),
      };
      const definition = readOptionalIdentifier(entry.definition, atPath(at, 'definition'));
      if (definition !== undefined) {
        legendEdge.definition = definition;
      }
      const label = readOptionalIdentifier(entry.label, atPath(at, 'label'));
      if (label !== undefined) {
        legendEdge.label = label;
      }
      return legendEdge;
    }),
    nodes: readArray(raw.nodes, nodesPath).map((item, i) => {
      const entry = readObject(item, atPath(nodesPath, i));
      const at = atPath(nodesPath, i);
      const legendNode: LensLegendNode = {
        kind: readIdentifier(entry.kind, atPath(at, 'kind')),
        shape: readIdentifier(entry.shape, atPath(at, 'shape')),
        fill: readIdentifier(entry.fill, atPath(at, 'fill')),
      };
      const status = readOptionalIdentifier(entry.status, atPath(at, 'status'));
      if (status !== undefined) {
        legendNode.status = status;
      }
      const classification = readOptionalIdentifier(entry.classification, atPath(at, 'classification'));
      if (classification !== undefined) {
        legendNode.classification = classification;
      }
      const glyph = readOptionalIdentifier(entry.glyph, atPath(at, 'glyph'));
      if (glyph !== undefined) {
        legendNode.glyph = glyph;
      }
      return legendNode;
    }),
  };
}

function readNode(value: unknown, path: string): LensNode {
  const raw = readObject(value, path);
  const node: LensNode = {
    id: requirePrefix(
      readIdentifier(raw.id, atPath(path, 'id')), NODE_ID_PREFIX, atPath(path, 'id'),
    ),
    slot: readIdentifier(raw.slot, atPath(path, 'slot')),
    label: readIdentifier(raw.label, atPath(path, 'label')),
    kind: readIdentifier(raw.kind, atPath(path, 'kind')),
    shape: readIdentifier(raw.shape, atPath(path, 'shape')),
    pos: readPoint(raw.pos, atPath(path, 'pos')),
    size: readPoint(raw.size, atPath(path, 'size')),
    text: readTexts(raw.text, atPath(path, 'text')),
    // Required, not optional: a font size the view picks for itself is a
    // picture the emitter did not draw, and the whole point of reading the
    // lens file is that the picture is the emitted one.
    fontsize: readFinite(raw.fontsize, atPath(path, 'fontsize')),
    justify: readIdentifier(raw.justify, atPath(path, 'justify')),
  };
  // A status applies to a Question; other record kinds legitimately have none,
  // so absence is absence rather than a substituted value. The same holds for
  // the two presentational fields the host carries per node.
  const status = readOptionalIdentifier(raw.status, atPath(path, 'status'));
  if (status !== undefined) {
    node.status = status;
  }
  const classification = readOptionalIdentifier(raw.classification, atPath(path, 'classification'));
  if (classification !== undefined) {
    node.classification = classification;
  }
  const group = readOptionalIdentifier(raw.group, atPath(path, 'group'));
  if (group !== undefined) {
    node.group = requirePrefix(group, GROUP_ID_PREFIX, atPath(path, 'group'));
  }
  const fill = readOptionalIdentifier(raw.fill, atPath(path, 'fill'));
  if (fill !== undefined) {
    node.fill = fill;
  }
  const style = readOptionalIdentifier(raw.style, atPath(path, 'style'));
  if (style !== undefined) {
    node.style = style;
  }
  return node;
}

function readEdgeStyle(value: unknown, path: string): LensEdgeStyle | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const raw = readObject(value, path);
  const style: LensEdgeStyle = {};
  const color = readOptionalIdentifier(raw.color, atPath(path, 'color'));
  if (color !== undefined) {
    style.color = color;
  }
  const dash = readOptionalIdentifier(raw.style, atPath(path, 'style'));
  if (dash !== undefined) {
    style.style = dash;
  }
  const penwidth = readOptionalFinite(raw.penwidth, atPath(path, 'penwidth'));
  if (penwidth !== undefined) {
    style.penwidth = penwidth;
  }
  return style;
}

function readEdge(value: unknown, path: string, nodeIds: ReadonlySet<string>): LensEdge {
  const raw = readObject(value, path);
  const edge: LensEdge = {
    id: requirePrefix(
      readIdentifier(raw.id, atPath(path, 'id')), EDGE_ID_PREFIX, atPath(path, 'id'),
    ),
    relation: readIdentifier(raw.relation, atPath(path, 'relation')),
    tail: requireKnown(
      readIdentifier(raw.tail, atPath(path, 'tail')), nodeIds,
      'a node in this lens', atPath(path, 'tail'),
    ),
    head: requireKnown(
      readIdentifier(raw.head, atPath(path, 'head')), nodeIds,
      'a node in this lens', atPath(path, 'head'),
    ),
    spline: readIdentifier(raw.spline, atPath(path, 'spline')),
  };
  const label = readOptionalIdentifier(raw.label, atPath(path, 'label'));
  if (label !== undefined) {
    edge.label = label;
  }
  const labelPos = readOptionalPoint(raw.label_pos, atPath(path, 'label_pos'));
  if (labelPos !== undefined) {
    edge.label_pos = labelPos;
  }
  const slot = readOptionalIdentifier(raw.slot, atPath(path, 'slot'));
  if (slot !== undefined) {
    edge.slot = slot;
  }
  const owner = readOptionalIdentifier(raw.owner, atPath(path, 'owner'));
  if (owner !== undefined) {
    edge.owner = requirePrefix(owner, NODE_ID_PREFIX, atPath(path, 'owner'));
  }
  const refIndex = readOptionalCount(raw.ref_index, atPath(path, 'ref_index'));
  if (refIndex !== undefined) {
    edge.ref_index = refIndex;
  }
  const style = readEdgeStyle(raw.style, atPath(path, 'style'));
  if (style !== undefined) {
    edge.style = style;
  }
  return edge;
}

function readGroup(value: unknown, path: string, nodeIds: ReadonlySet<string>): LensGroup {
  const raw = readObject(value, path);
  const membersPath = atPath(path, 'members');
  const group: LensGroup = {
    id: requirePrefix(
      readIdentifier(raw.id, atPath(path, 'id')), GROUP_ID_PREFIX, atPath(path, 'id'),
    ),
    label: readIdentifier(raw.label, atPath(path, 'label')),
    // R4: a reading-aid group and declared containment look alike, so the lens
    // marks which it is. The vocabulary is Gyld's, so it is read, not pinned.
    kind: readIdentifier(raw.kind, atPath(path, 'kind')),
    bb: readBoundingBox(raw.bb, atPath(path, 'bb')),
    members: readIdentifiers(raw.members, membersPath).map(
      (id, i) => requireKnown(id, nodeIds, 'a node in this lens', atPath(membersPath, i)),
    ),
  };
  const occurrence = readOptionalIdentifier(raw.occurrence, atPath(path, 'occurrence'));
  if (occurrence !== undefined) {
    group.occurrence = requirePrefix(occurrence, NODE_ID_PREFIX, atPath(path, 'occurrence'));
  }
  return group;
}

function readCounts(value: unknown, path: string): LensCounts {
  const raw = readObject(value, path);
  return {
    nodes: readCount(raw.nodes, atPath(path, 'nodes')),
    edges: readCount(raw.edges, atPath(path, 'edges')),
    groups: readCount(raw.groups, atPath(path, 'groups')),
    omitted_occurrences: readCount(raw.omitted_occurrences, atPath(path, 'omitted_occurrences')),
    omitted_assertions: readCount(raw.omitted_assertions, atPath(path, 'omitted_assertions')),
  };
}

/**
 * Read one `gyld.lens.v1` file.
 *
 * Two integrity checks beyond field shape, both of them internal to the
 * envelope and neither of them a derived Gyld fact:
 *
 * 1. Every edge endpoint and every group member resolves to a node this lens
 *    carries. An unresolved endpoint is undrawable geometry, and section 7.3
 *    puts the omitted records in `counts`, not in `nodes`.
 1a. Every node's `group`, when it has one, is a group this lens carries.
 * 2. `counts.nodes`, `counts.edges` and `counts.groups` equal the lengths of
 *    the arrays beside them. This is the closest thing section 7 defines to a
 *    checksum: the counts declare what the file carries, so a mismatch means
 *    a truncated or edited file. The two `omitted_*` counts are NOT checked,
 *    because the omitted records are not in the file to count.
 */
export function readLens(value: unknown): GyldLens {
  const raw = readEnvelope(value, LENS_FORMAT);
  const path = LENS_FORMAT;
  const nodesPath = atPath(path, 'nodes');
  const nodes = readArray(raw.nodes, nodesPath).map(
    (item, i) => readNode(item, atPath(nodesPath, i)),
  );
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edgesPath = atPath(path, 'edges');
  const edges = readArray(raw.edges, edgesPath).map(
    (item, i) => readEdge(item, atPath(edgesPath, i), nodeIds),
  );
  const enginePath = atPath(path, 'engine');
  const engine = readObject(raw.engine, enginePath);
  const lens: GyldLens = {
    format: LENS_FORMAT,
    perspective: readIdentifier(raw.perspective, atPath(path, 'perspective')),
    snapshot: readSnapshotRef(raw.snapshot, atPath(path, 'snapshot')),
    title: readIdentifier(raw.title, atPath(path, 'title')),
    relations: readIdentifiers(raw.relations, atPath(path, 'relations')),
    omissions: readTexts(raw.omissions, atPath(path, 'omissions')),
    legend: readLegend(raw.legend, atPath(path, 'legend')),
    engine: {
      name: readIdentifier(engine.name, atPath(enginePath, 'name')),
      version: readIdentifier(engine.version, atPath(enginePath, 'version')),
      pinned: readBoolean(engine.pinned, atPath(enginePath, 'pinned')),
    },
    bb: readBoundingBox(raw.bb, atPath(path, 'bb')),
    nodes,
    edges,
    counts: readCounts(raw.counts, atPath(path, 'counts')),
  };
  const stream = readOptionalIdentifier(raw.stream, atPath(path, 'stream'));
  if (stream !== undefined) {
    lens.stream = stream;
  }
  const textRelations = readOptionalTexts(raw.text_relations, atPath(path, 'text_relations'));
  if (textRelations !== undefined) {
    lens.text_relations = textRelations;
  }
  if (raw.groups !== null && raw.groups !== undefined) {
    const groupsPath = atPath(path, 'groups');
    lens.groups = readArray(raw.groups, groupsPath).map(
      (item, i) => readGroup(item, atPath(groupsPath, i), nodeIds),
    );
  }
  const groupIds = new Set((lens.groups ?? []).map((g) => g.id));
  lens.nodes.forEach((node, i) => {
    if (node.group !== undefined) {
      requireKnown(
        node.group, groupIds, 'a group in this lens',
        atPath(atPath(nodesPath, i), 'group'),
      );
    }
  });
  const countsPath = atPath(path, 'counts');
  requireCount(lens.counts.nodes, lens.nodes.length, atPath(countsPath, 'nodes'));
  requireCount(lens.counts.edges, lens.edges.length, atPath(countsPath, 'edges'));
  requireCount(lens.counts.groups, lens.groups?.length ?? 0, atPath(countsPath, 'groups'));
  return lens;
}
