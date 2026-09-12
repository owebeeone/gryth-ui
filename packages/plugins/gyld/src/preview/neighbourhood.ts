import type { GyldLens, LensEdge, LensGroup, LensNode } from '../contract';

// The browser-side NEIGHBOURHOOD preview (spec step 3.1, section 5.1).
//
// A preview is a LAYOUT of emitted records and nothing else. Every node, edge
// and group below is one the emitted `decisions` lens of that stream already
// carries; this file only decides WHICH of them the closure of one question
// keeps, and it decides it the way the Gyld host does
// (gyld/scripts/emit_decision_streams.py, `neighbourhood_closure`):
//
//   the question, the questions it requires, the questions that require it,
//   the questions its own alternatives induce, and the gates any of those
//   wait on.
//
// The host walks the snapshot's assertions; this walks the drawn edges of the
// emitted lens, which are those same assertions with the same ids. The
// decisions lens draws a `Requires` edge from the prerequisite to the
// dependent, an `Implies` edge from the alternative's OWNING question to the
// question it induces, and a `GatedBy` edge from the trigger to the question
// that waits on it, so each step of the host's closure is one direction along
// one drawn relation. Nothing transitive, nothing inferred: a record the
// bundle does not carry cannot appear here.

/** One step of the closure, as a step over the emitted edges. */
interface ClosureStep {
  relation: string;
  /** Which endpoint of the edge must already be in the set. */
  from: (edge: LensEdge) => string;
  /** The endpoint the step adds. */
  add: (edge: LensEdge) => string;
}

/** The restricted lens plan: what the preview will draw, before any layout. */
export interface PreviewPlan {
  /** The member name, spelled as the host spells it: `neighbourhood-<label>`. */
  perspective: string;
  family: string;
  parameter: Record<string, string>;
  title: string;
  /** The graph label's second line, as the host's plan writes it. */
  note: string;
  /** The point size and justification the source lens drew its boxes at. Read,
   *  never chosen: the DOT must set the font the emitted picture used. */
  fontsize: number;
  justify: string;
  nodes: LensNode[];
  edges: LensEdge[];
  groups: LensGroup[];
  omissions: string[];
  /** The lens every one of the records above came from. */
  source: GyldLens;
  /** What this closure leaves out, as the emitted counts already state it. */
  omittedOccurrences: number;
  omittedAssertions: number;
}

/** The assertion a drawn edge belongs to, which is its id without the prefix
 *  and without the `#index` that counts one assertion's several references. */
function assertionOf(edge: LensEdge): string {
  const id = edge.id.slice('asn:'.length);
  const hash = id.indexOf('#');
  return hash === -1 ? id : id.slice(0, hash);
}

function distinctAssertions(edges: readonly LensEdge[]): number {
  return new Set(edges.map(assertionOf)).size;
}

/**
 * A neighbourhood preview of ONE question, named by its qualified slot.
 *
 * The slot rather than the record id, because the slot is the identity that
 * survives a restream (R1) and is what a browser window has in hand when a
 * reader picks a box.
 */
export class PreviewPerspective {
  private constructor(readonly question: string) {}

  /** The parameterised family the emitted members belong to and a preview
   *  joins. The name is the host's, read back from the emitted manifest. */
  static readonly FAMILY = 'neighbourhood';

  /** The emitted perspective a neighbourhood restricts. The host builds every
   *  member from the `decisions` plan, so a preview of any other picture would
   *  not be the same lens at all. */
  static readonly SOURCE = 'decisions';

  /**
   * What the omission strip must say about a preview. It is the one sentence
   * that distinguishes this picture from an emitted lens, and it is in the
   * DOCUMENT rather than only in the chrome, so a preview that reaches any
   * other reader still carries it.
   *
   * Phrased to follow the strip's own "omits ": what a preview leaves out is
   * the pinned layout, which is exactly and only what it leaves out.
   */
  static readonly OMISSION =
    'the pinned layout: this is a browser preview of emitted records, not an emitted lens';

  /** The three steps section 5.1 names, over the edges the decisions lens
   *  draws. `GatedBy` is applied last, over everything the first three kept. */
  private static readonly QUESTION_STEPS: readonly ClosureStep[] = Object.freeze([
    // The questions this one requires: drawn prerequisite -> dependent.
    { relation: 'Requires', from: (edge) => edge.head, add: (edge) => edge.tail },
    // The questions that require this one.
    { relation: 'Requires', from: (edge) => edge.tail, add: (edge) => edge.head },
    // The questions this one's own alternatives induce. The decisions lens
    // draws the branch from the alternative's owning question, so the tail is
    // this question and the alternative itself stays in the box text.
    { relation: 'Implies', from: (edge) => edge.tail, add: (edge) => edge.head },
  ]);

  /** The gates the closure's questions wait on: drawn trigger -> question. */
  private static readonly GATE_STEP: ClosureStep = Object.freeze<ClosureStep>({
    relation: 'GatedBy', from: (edge) => edge.head, add: (edge) => edge.tail,
  });

  /** A preview of one question, or nothing at all for an empty slot, which is
   *  what a window with no record in hand has. */
  static of(question: string): PreviewPerspective | undefined {
    return question === '' ? undefined : new PreviewPerspective(question);
  }

  get parameter(): Record<string, string> {
    return { question: this.question };
  }

  /**
   * How a preview names ITSELF in the perspective picker, before any lens has
   * been read: the family and the question it is of.
   *
   * It is not a perspective of the stream and never a file name. Nothing reads
   * a bundle by it: it is the picker's option value, and `fromOption` turns it
   * back into the question the window then asks for.
   */
  get optionValue(): string {
    return `${PreviewPerspective.FAMILY}:${this.question}`;
  }

  /** The preview one picker option value names, or nothing for an option that
   *  names an emitted perspective. */
  static fromOption(value: string): PreviewPerspective | undefined {
    const prefix = `${PreviewPerspective.FAMILY}:`;
    return value.startsWith(prefix)
      ? PreviewPerspective.of(value.slice(prefix.length))
      : undefined;
  }

  /**
   * This question's neighbourhood of the emitted `decisions` lens, or
   * `undefined` when that lens draws no box for the slot. Absence is the
   * answer, never an empty picture: a question the bundle does not draw has no
   * neighbourhood the browser is entitled to invent.
   */
  restrict(source: GyldLens): PreviewPlan | undefined {
    const question = source.nodes.find((node) => node.slot === this.question);
    if (question === undefined) {
      return undefined;
    }
    const kept = new Set<string>([question.id]);
    for (const step of PreviewPerspective.QUESTION_STEPS) {
      for (const edge of source.edges) {
        if (edge.relation === step.relation && step.from(edge) === question.id) {
          kept.add(step.add(edge));
        }
      }
    }
    const gate = PreviewPerspective.GATE_STEP;
    for (const edge of source.edges) {
      if (edge.relation === gate.relation && kept.has(gate.from(edge))) {
        kept.add(gate.add(edge));
      }
    }
    const nodes = source.nodes.filter((node) => kept.has(node.id));
    const edges = source.edges.filter((edge) => kept.has(edge.tail) && kept.has(edge.head));
    const groups = (source.groups ?? [])
      .map((group) => ({
        ...group, members: group.members.filter((member) => kept.has(member)),
      }))
      .filter((group) => group.members.length > 0);
    const label = question.label;
    // The multi-line boxes are the ones whose justification the DOT applies; a
    // one-line label is centred by Graphviz whatever the lens says, so a
    // picture of only one-line boxes has no justification to carry over.
    const justified = nodes.find((node) => node.text.length > 1) ?? nodes[0];
    return {
      perspective: `${PreviewPerspective.FAMILY}-${label}`,
      family: PreviewPerspective.FAMILY,
      parameter: this.parameter,
      title: `Glade | Neighbourhood of ${label}`,
      note: 'Solid: Requires | dashed: Implies, labelled with the branch | grey dotted:'
        + ' GatedBy. The question, its prerequisites, its dependants, the questions its'
        + ' alternatives induce and the gates those wait on\n'
        + 'Every record outside that closure is omitted and counted; positions are this'
        + " lens's own",
      fontsize: justified.fontsize,
      justify: justified.justify,
      nodes,
      edges,
      groups,
      omissions: [
        ...source.omissions,
        `every record outside the neighbourhood of ${label}`,
        PreviewPerspective.OMISSION,
      ],
      source,
      // Arithmetic over the source lens's own counts, not a new fact: the
      // snapshot holds what that lens drew plus what it omitted, and this
      // picture draws fewer of the same records.
      omittedOccurrences:
        source.counts.nodes + source.counts.omitted_occurrences - nodes.length,
      omittedAssertions: source.counts.omitted_assertions
        + distinctAssertions(source.edges) - distinctAssertions(edges),
    };
  }
}
