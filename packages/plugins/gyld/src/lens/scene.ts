import type { GyldLens, LensEdge, LensLegendEdge, LensLegendNode, LensNode } from '../contract';
import { NOTHING_DIMMED, type GyldDimmed, type GyldSelection } from './camera';
import { NODE_FACETS, facetDims } from './facets';
import {
  cornerRadius, decodeSpline, edgeStyle, groupBox, labelOrigin, lensExtent, nodeBox,
  type Box, type Point,
} from './geometry';

// The scene: what the view draws, as a PURE function of the emitted lens and
// the window's own grips. Calling it twice with the same inputs gives the same
// answer, and it never touches the lens: dimming, hiding, selection and hover
// are flags ON the emitted geometry, never a second layout (MDV-4).

export interface SceneNode {
  id: string;
  slot: string;
  box: Box;
  radius: number;
  fill?: string;
  lines: string[];
  labelAt: Point;
  group?: string;
  hidden: boolean;
  dimmed: boolean;
  selected: boolean;
  hovered: boolean;
  /** True when a search is running and this record matched it. */
  matched: boolean;
}

export interface SceneEdge {
  id: string;
  relation: string;
  slot?: string;
  path: string;
  head?: Point;
  color?: string;
  dash?: string;
  width?: number;
  label?: string;
  labelAt?: Point;
  hidden: boolean;
  dimmed: boolean;
  selected: boolean;
  hovered: boolean;
  matched: boolean;
}

export interface SceneGroup {
  id: string;
  label: string;
  /** True when the group is DECLARED containment; false when it is a reading
   *  aid. MDV-3 asks the two to be visibly different, so the flag is carried
   *  here and the view gives them different frames. */
  declared: boolean;
  box: Box;
}

export interface SceneOmission {
  text: string;
  /** True when the window itself is leaving something out, as against the
   *  omissions the lens was emitted with. */
  fromWindow: boolean;
}

export interface LensScene {
  extent: Box;
  groups: SceneGroup[];
  edges: SceneEdge[];
  nodes: SceneNode[];
  legendEdges: LensLegendEdge[];
  legendNodes: LensLegendNode[];
  omissions: SceneOmission[];
  /** MDV-7: the identity line every window must show. */
  provenance: {
    lineage: string;
    revision: string;
    digest: string;
    stream: string;
    perspective: string;
    relations: string[];
    textRelations: string[];
    engine: string;
    pinned: boolean;
    title: string;
  };
  counts: GyldLens['counts'];
}

/**
 * What a running search selected, as the scene needs it: the lens ids that
 * matched. The matching itself is a projection over the emitted records and
 * lives in `browser/search.ts`, so the scene depends on the ANSWER and not on
 * the index it was computed from.
 */
export interface SceneSearch {
  active: boolean;
  ids: ReadonlySet<string>;
  /** What was searched for, so the omission strip can say it. */
  query: string;
}

const EMPTY_MATCH: ReadonlySet<string> = new Set<string>();

export interface SceneInputs {
  selection?: GyldSelection;
  hover?: string;
  dimmed?: GyldDimmed;
  search?: SceneSearch;
}

/** The ids adjacent to the selection, following the EMITTED edges only. */
function neighbourhood(lens: GyldLens, selected: ReadonlySet<string>): Set<string> {
  const near = new Set<string>(selected);
  if (selected.size === 0) {
    return near;
  }
  for (const edge of lens.edges) {
    if (selected.has(edge.id) || selected.has(edge.tail) || selected.has(edge.head)) {
      near.add(edge.id);
      near.add(edge.tail);
      near.add(edge.head);
    }
  }
  return near;
}

function nodeFill(lens: GyldLens, node: LensNode): string | undefined {
  if (node.fill !== undefined) {
    return node.fill;
  }
  // The legend carries the fill per kind and status, and it is emitted data.
  const entry = lens.legend.nodes.find(
    (row) => row.kind === node.kind && row.status === node.status,
  );
  return entry?.fill;
}

export function buildScene(lens: GyldLens, inputs: SceneInputs = {}): LensScene {
  const selected = new Set(inputs.selection?.ids ?? []);
  const hover = inputs.hover ?? '';
  const dimmed = inputs.dimmed ?? NOTHING_DIMMED;
  const off = new Set(dimmed.relations);
  const hideOff = dimmed.hide;
  const near = neighbourhood(lens, selected);
  const faded = selected.size > 0;
  const searching = inputs.search?.active ?? false;
  const matches = inputs.search?.ids ?? EMPTY_MATCH;

  const edges: SceneEdge[] = [];
  for (const edge of lens.edges) {
    const spline = decodeSpline(lens, edge.spline);
    if (spline === null) {
      // Undrawable emitted geometry. It is left out of the picture and said so
      // in the omission strip below rather than approximated.
      continue;
    }
    const relationOff = off.has(edge.relation);
    const style = edgeStyle(lens, edge);
    const matched = searching && matches.has(edge.id);
    const scene: SceneEdge = {
      id: edge.id,
      relation: edge.relation,
      path: spline.path,
      hidden: relationOff && hideOff,
      dimmed: (relationOff && !hideOff)
        || (faded && !near.has(edge.id))
        || (searching && !matched),
      selected: selected.has(edge.id),
      hovered: hover === edge.id,
      matched,
    };
    if (spline.head !== undefined) {
      scene.head = spline.head;
    }
    if (edge.slot !== undefined) {
      scene.slot = edge.slot;
    }
    if (style.color !== undefined) {
      scene.color = style.color;
    }
    if (style.dash !== undefined) {
      scene.dash = style.dash;
    }
    if (style.width !== undefined) {
      scene.width = style.width;
    }
    if (edge.label !== undefined) {
      scene.label = edge.label;
    }
    if (edge.label_pos !== undefined) {
      const [x, y] = edge.label_pos;
      scene.labelAt = { x: x - lens.bb[0], y: lens.bb[3] - y };
    }
    edges.push(scene);
  }

  const nodes: SceneNode[] = lens.nodes.map((node) => {
    const box = nodeBox(lens, node);
    // A facet this window turned off, exactly as a relation toggle does for an
    // edge: the box stays in the scene at the emitted position either way.
    const facetOff = facetDims(dimmed, node);
    const matched = searching && matches.has(node.id);
    const scene: SceneNode = {
      id: node.id,
      slot: node.slot,
      box,
      radius: cornerRadius(node),
      lines: node.text,
      labelAt: labelOrigin(box, node.text.length),
      hidden: facetOff && hideOff,
      dimmed: (facetOff && !hideOff)
        || (faded && !near.has(node.id))
        || (searching && !matched),
      selected: selected.has(node.id),
      hovered: hover === node.id,
      matched,
    };
    const fill = nodeFill(lens, node);
    if (fill !== undefined) {
      scene.fill = fill;
    }
    if (node.group !== undefined) {
      scene.group = node.group;
    }
    return scene;
  });

  const omissions: SceneOmission[] = lens.omissions.map((text) => ({ text, fromWindow: false }));
  for (const relation of lens.text_relations ?? []) {
    omissions.push({ text: `${relation} is drawn as box text, not as edges`, fromWindow: false });
  }
  if (lens.counts.omitted_occurrences > 0) {
    omissions.push({
      text: `${lens.counts.omitted_occurrences} occurrences outside this lens`,
      fromWindow: false,
    });
  }
  if (lens.counts.omitted_assertions > 0) {
    omissions.push({
      text: `${lens.counts.omitted_assertions} assertions outside this lens`,
      fromWindow: false,
    });
  }
  const undrawable = lens.edges.length - edges.length;
  if (undrawable > 0) {
    omissions.push({
      text: `${undrawable} emitted edges carry a spline this view cannot decode`,
      fromWindow: true,
    });
  }
  for (const relation of off) {
    omissions.push({
      text: `${relation} ${hideOff ? 'hidden' : 'dimmed'} in this window`,
      fromWindow: true,
    });
  }
  for (const facet of NODE_FACETS) {
    for (const value of facet.omitted(dimmed)) {
      omissions.push({
        text: `${facet.name} ${value} ${hideOff ? 'hidden' : 'dimmed'} in this window`,
        fromWindow: true,
      });
    }
  }
  if (searching) {
    const found = nodes.filter((node) => node.matched).length;
    omissions.push({
      text: `${nodes.length - found} of ${nodes.length} boxes dimmed by the search `
        + `for "${inputs.search?.query ?? ''}"`,
      fromWindow: true,
    });
  }

  const provenance: LensScene['provenance'] = {
    lineage: lens.snapshot.lineage,
    revision: lens.snapshot.revision,
    digest: lens.snapshot.digest,
    stream: lens.stream ?? '',
    perspective: lens.perspective,
    relations: lens.relations,
    textRelations: lens.text_relations ?? [],
    engine: `${lens.engine.name} ${lens.engine.version}`,
    pinned: lens.engine.pinned,
    title: lens.title,
  };

  return {
    extent: lensExtent(lens),
    groups: (lens.groups ?? []).map((group) => ({
      id: group.id,
      label: group.label,
      declared: group.kind === 'declared',
      box: groupBox(lens, group),
    })),
    edges,
    nodes,
    legendEdges: lens.legend.edges,
    legendNodes: lens.legend.nodes,
    omissions,
    provenance,
    counts: lens.counts,
  };
}

/** The identity of one drawn picture: the snapshot it was emitted from, the
 *  stream that overlays it and the perspective. A camera is fitted once per
 *  key, so opening a new perspective fits again and panning never re-fits. */
export function lensKeyOf(lens: GyldLens): string {
  return `${lens.snapshot.digest}/${lens.stream ?? ''}/${lens.perspective}`;
}

/** The record a lens id stands for: a node id is an occurrence, an edge id is
 *  an assertion, and the `#index` suffix of a multi reference edge is dropped
 *  because it names the reference, not the record. */
export function recordIdOf(lensId: string): string | null {
  if (lensId.startsWith('occ:')) {
    return lensId.slice(4);
  }
  if (lensId.startsWith('asn:')) {
    const id = lensId.slice(4);
    const hash = id.indexOf('#');
    return hash === -1 ? id : id.slice(0, hash);
  }
  return null;
}

/** The qualified slot a lens id stands for, when the lens emitted one. That is
 *  the identity a detail window and Gyld.Focus travel on (spec R1). */
export function slotOf(lens: GyldLens, lensId: string): string | null {
  const node = lens.nodes.find((entry) => entry.id === lensId);
  if (node !== undefined) {
    return node.slot;
  }
  const edge = lens.edges.find((entry: LensEdge) => entry.id === lensId);
  return edge?.slot ?? null;
}
