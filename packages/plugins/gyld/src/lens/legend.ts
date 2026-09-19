import type { GyldLens, LensLegendEdge, LensLegendNode, LensNode } from '../contract';
import { kindSays, relationSays, statusSays } from '../help/graphHelp';
import { toggleRelation, type GyldDimmed } from './camera';
import { NodeFacet } from './facets';

// The LEGEND as a model: one entry per drawn class, with everything a row of
// it needs and nothing about how a row looks.
//
// An entry is an OBJECT, not a label branched on at the press site (AGENTS.md,
// "no magic strings when the concept has semantics"). Each one owns its own
// key, its sample, the emitted docstring behind it, the app's sentence about
// it, which drawn shapes belong to it, and what switching it off does to this
// window's dim set. The view renders entries; it decides nothing about them,
// and a fourth kind of entry is one more subclass rather than a fourth branch
// in the panel.
//
// ONE RULE ties the three things a row does together: the shapes an entry
// MATCHES are exactly the shapes its eye switches off. A count that said one
// thing and a toggle that did another would be a window lying about its own
// picture, so both go through the same predicate.

/** The mark drawn beside a row: a filled swatch for a box class, a line for
 *  an arrow class. Which one it is, is the entry's to say and not the view's
 *  to guess, so it is asked rather than inferred from the fields. */
export class LegendSample {
  private constructor(
    /** The emitted fill of a box class. */
    readonly fill: string | undefined,
    /** The emitted colour of an arrow class. */
    readonly color: string | undefined,
    /** The emitted line style of an arrow class: solid, dashed or dotted. */
    readonly style: string | undefined,
  ) {}

  static box(fill: string): LegendSample {
    return new LegendSample(fill, undefined, undefined);
  }

  static line(color: string, style: string): LegendSample {
    return new LegendSample(undefined, color, style);
  }

  /** Whether this sample is drawn as a line rather than as a swatch. */
  get isLine(): boolean {
    return this.color !== undefined;
  }
}

/** One class the picture draws, as the legend offers it to the reader. */
export abstract class LegendEntry {
  protected constructor(
    /** This entry's stable identity: the React key, the `data-entry`
     *  attribute, and what the flash stamp names. It survives a rebuild
     *  because it is made of emitted names and nothing else. */
    readonly key: string,
    /** What the row is called, as the emitted names spell it. */
    readonly label: string,
    readonly sample: LegendSample,
    /** The DOCSTRING of the definition behind this class, when the host
     *  emitted one. Absent on a bundle emitted before `doc` existed, and the
     *  row then shows the app's own sentence alone. */
    readonly doc: string | undefined,
    /** What it means for the owner, in this app's words (`help/graphHelp`).
     *  Empty for a class this app has no sentence for. */
    readonly says: string,
  ) {}

  /** Whether this drawn box belongs to this entry. */
  abstract matchesNode(node: LensNode): boolean;

  /** Whether this drawn arrow belongs to this entry. Structural, so it
   *  answers for an emitted edge and for a scene edge alike. */
  abstract matchesEdge(edge: { relation: string }): boolean;

  /** Whether this window has switched this class off. */
  abstract isOff(dimmed: GyldDimmed): boolean;

  /** Switch it off, or on again. The omission strip follows from the dim set,
   *  so a class switched off here says so under the picture without this
   *  entry knowing anything about omissions. */
  abstract toggle(dimmed: GyldDimmed): GyldDimmed;
}

/** One drawn RELATION. Its eye is the relation toggle the legend has always
 *  had; nothing about what it does to the picture changes here. */
export class ArrowEntry extends LegendEntry {
  constructor(readonly relation: string, color: string, style: string, doc: string | undefined) {
    super(
      `relation/${relation}`,
      relation,
      LegendSample.line(color, style),
      doc,
      relationSays(relation),
    );
  }

  override matchesEdge(edge: { relation: string }): boolean {
    return edge.relation === this.relation;
  }

  /** No box belongs to a relation. */
  override matchesNode(): boolean {
    return false;
  }

  override isOff(dimmed: GyldDimmed): boolean {
    return dimmed.relations.includes(this.relation);
  }

  override toggle(dimmed: GyldDimmed): GyldDimmed {
    return toggleRelation(dimmed, this.relation);
  }
}

/**
 * One drawn BOX class: a kind with a status, a kind with a classification, or
 * a kind that carries neither.
 *
 * The DIMENSION it matches and toggles on is the most specific one the emitted
 * entry carries — the status where it has one, the classification where it has
 * one, and the kind itself otherwise — which is exactly the facet the chrome's
 * per-value buttons used to toggle (`facets.ts`). So the eye here replaces
 * those buttons without changing what a switched-off class does to the picture
 * or what it writes into the omission strip.
 */
export class BoxEntry extends LegendEntry {
  constructor(
    readonly facet: NodeFacet,
    /** The value on that dimension: `Open`, `Trigger`, `IOAdapter`. */
    readonly value: string,
    key: string,
    label: string,
    fill: string,
    doc: string | undefined,
    says: string,
  ) {
    super(key, label, LegendSample.box(fill), doc, says);
  }

  override matchesNode(node: LensNode): boolean {
    return this.facet.valueOf(node) === this.value;
  }

  /** No arrow belongs to a box class. */
  override matchesEdge(): boolean {
    return false;
  }

  override isOff(dimmed: GyldDimmed): boolean {
    return this.facet.isOff(dimmed, this.value);
  }

  override toggle(dimmed: GyldDimmed): GyldDimmed {
    return this.facet.toggle(dimmed, this.value);
  }
}

function arrowEntry(entry: LensLegendEdge): ArrowEntry {
  return new ArrowEntry(entry.relation, entry.color, entry.style, entry.doc);
}

function boxEntry(entry: LensLegendNode): BoxEntry {
  const key = `node/${entry.kind}/${entry.status ?? ''}/${entry.classification ?? ''}`;
  const label = [entry.kind, entry.status, entry.classification]
    .filter((part) => part !== undefined && part !== '')
    .join(' · ');
  if (entry.status !== undefined) {
    return new BoxEntry(
      NodeFacet.STATUS, entry.status, key, label, entry.fill, entry.doc,
      statusSays(entry.status),
    );
  }
  if (entry.classification !== undefined) {
    return new BoxEntry(
      NodeFacet.CLASSIFICATION, entry.classification, key, label, entry.fill, entry.doc,
      // The architecture lenses' own vocabulary. This app has no sentence for
      // one, and says nothing rather than inventing one.
      '',
    );
  }
  return new BoxEntry(
    NodeFacet.KIND, entry.kind, key, label, entry.fill, entry.doc, kindSays(entry.kind),
  );
}

/**
 * Every entry of one lens's EMITTED legend, in the order the host emitted it:
 * the arrows, then the boxes.
 *
 * The window offers a row for what the file says it drew, never for a class it
 * imagined the graph might have.
 */
export function legendEntriesOf(lens: GyldLens): LegendEntry[] {
  return [
    ...lens.legend.edges.map(arrowEntry),
    ...lens.legend.nodes.map(boxEntry),
  ];
}
