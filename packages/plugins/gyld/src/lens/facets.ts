import type { GyldLens, LensNode } from '../contract';
import type { GyldDimmed } from './camera';

// The dimensions a window may dim a box by: node KIND, node STATUS and node
// CLASSIFICATION, the three MDV-2 names as carried by the emitted node and the
// emitted legend. Relations are the fourth dimension and live on the legend's
// edge entries, which the lens view already toggles.
//
// A facet is an OBJECT, not a field-name string passed around (AGENTS.md, "no
// magic strings when the concept has semantics"): it owns where its value
// lives on a node, where its off-list lives in the dim set, and how a toggle
// lands there. Adding a fourth dimension is one more instance, not a fourth
// branch at every call site.

export class NodeFacet {
  constructor(
    /** What the window calls this dimension. */
    readonly name: string,
    private readonly read: (node: LensNode) => string | undefined,
    private readonly listOf: (dimmed: GyldDimmed) => readonly string[],
    private readonly withList: (dimmed: GyldDimmed, list: string[]) => GyldDimmed,
  ) {}

  /** This node's value on this dimension, or undefined when it carries none.
   *  Every emitted node carries both `status` and `classification` with one of
   *  them null, so "carries none" is the ordinary case, not a fault. */
  valueOf(node: LensNode): string | undefined {
    const value = this.read(node);
    return value === undefined || value === '' ? undefined : value;
  }

  /** The distinct values this lens actually drew, sorted. Emitted data: the
   *  window offers a toggle for what is in the picture, never for a value it
   *  imagined the graph might have. */
  values(lens: GyldLens): string[] {
    const seen = new Set<string>();
    for (const node of lens.nodes) {
      const value = this.valueOf(node);
      if (value !== undefined) {
        seen.add(value);
      }
    }
    return [...seen].sort();
  }

  isOff(dimmed: GyldDimmed, value: string): boolean {
    return this.listOf(dimmed).includes(value);
  }

  toggle(dimmed: GyldDimmed, value: string): GyldDimmed {
    const held = this.listOf(dimmed);
    const next = held.includes(value)
      ? held.filter((name) => name !== value)
      : [...held, value];
    return this.withList(dimmed, next);
  }

  /** Whether this window has turned this node's value off. */
  dims(dimmed: GyldDimmed, node: LensNode): boolean {
    const value = this.valueOf(node);
    return value !== undefined && this.isOff(dimmed, value);
  }

  /** What this window is leaving out on this dimension, for the omission
   *  strip: every window says what the reader is no longer seeing (MDV-7). */
  omitted(dimmed: GyldDimmed): readonly string[] {
    return this.listOf(dimmed);
  }

  /** The node's own `kind`, which is the dimension a box class with neither a
   *  status nor a classification is told apart by — a Trigger, for instance. */
  static readonly KIND = new NodeFacet(
    'kind',
    (node) => node.kind,
    (dimmed) => dimmed.kinds,
    (dimmed, kinds) => ({ ...dimmed, kinds }),
  );

  /** The effective status a Question's fill colour stands for. */
  static readonly STATUS = new NodeFacet(
    'status',
    (node) => node.status,
    (dimmed) => dimmed.statuses,
    (dimmed, statuses) => ({ ...dimmed, statuses }),
  );

  /** The declared classification of a library, for example `IOAdapter`. */
  static readonly CLASSIFICATION = new NodeFacet(
    'classification',
    (node) => node.classification,
    (dimmed) => dimmed.classifications,
    (dimmed, classifications) => ({ ...dimmed, classifications }),
  );

  /** The three, in MDV-2's order. */
  static readonly ALL: readonly NodeFacet[] = Object.freeze([
    NodeFacet.KIND, NodeFacet.STATUS, NodeFacet.CLASSIFICATION,
  ]);
}

export const NODE_FACETS: readonly NodeFacet[] = NodeFacet.ALL;

/** Whether ANY facet of this window turns this node off. */
export function facetDims(dimmed: GyldDimmed, node: LensNode): boolean {
  return NODE_FACETS.some((facet) => facet.dims(dimmed, node));
}
