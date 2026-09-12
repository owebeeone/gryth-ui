import type {
  EvaluationSide, GyldComparison, RunProposal, SnapshotRef,
} from '../contract';

// The two sides of one evaluator comparison, as OBJECTS rather than the
// strings 'baseline' and 'candidate' passed around (AGENTS.md: no magic
// strings where the concept has semantics).
//
// A side owns which lens file of the proposal is its own, which snapshot the
// proposal says it was evaluated on, and which half of the comparison record
// belongs to it. The window then maps over two sides instead of branching on a
// name at every point, and the store tap resolves a lens path by asking the
// side rather than by spelling a file name.
//
// Only the NAME travels as data, in `Gyld.Dest.Side`, because a grip carries
// serializable values and a tap reads it as a destination parameter.

export class CompareSide {
  private constructor(
    readonly name: string,
    readonly title: string,
    /** This side's lens file, as the run's own index names it. */
    readonly lensFile: (proposal: RunProposal) => string,
    /** The snapshot the run says this side was evaluated on. */
    readonly snapshot: (proposal: RunProposal) => SnapshotRef,
    /** This side's half of the comparison record, and of a future. */
    readonly of: (comparison: Pick<GyldComparison, 'baseline' | 'candidate'>) => EvaluationSide,
  ) {}

  static readonly BASELINE = new CompareSide(
    'baseline',
    'Baseline',
    (proposal) => proposal.files.baseline_lens,
    (proposal) => proposal.baseline,
    (comparison) => comparison.baseline,
  );

  static readonly CANDIDATE = new CompareSide(
    'candidate',
    'Candidate',
    (proposal) => proposal.files.candidate_lens,
    (proposal) => proposal.candidate,
    (comparison) => comparison.candidate,
  );

  /** The side one `Gyld.Dest.Side` names, or undefined for a context that
   *  names none, which is every context that is not one of the two panes. */
  static byName(name: string): CompareSide | undefined {
    return COMPARE_SIDES.find((side) => side.name === name);
  }

  /** The key of this side's child context under one tab. */
  contextKey(tabId: string): string {
    return `gyld-compare:${tabId}:${this.name}`;
  }
}

export const COMPARE_SIDES: readonly CompareSide[] = Object.freeze([
  CompareSide.BASELINE, CompareSide.CANDIDATE,
]);
