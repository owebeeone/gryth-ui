// The Gyld artefact contract as TypeScript: one reader per format in spec
// section 7, plus the shared envelope checks they are built from.
//
// Everything in this directory is PURE. No grip, no DOM, no fetch, no clock.
// A reader either returns the envelope typed or throws a GyldContractError
// naming the violation and the path; `attempt` turns that into failure as
// data for the store tap, which renders an invalid bundle rather than hiding
// it. No reader folds a Gyld fact, and none substitutes a default for a field
// that is absent (spec section 6.7).

export {
  GyldContractError, GyldContractViolation, attempt, reject,
  type ContractResult, type ViolationContext,
} from './errors';

export { snapshotRefMatches, type QualifiedSlot, type SnapshotRef } from './common';

export {
  EVALUATION_VERSION, readComparison,
  type ComparisonSummary, type CostMultiplicity, type CostQuantity, type CostRecord,
  type CostReport, type CostSubject, type CostSubtotal, type EvalContext, type EvalFrame,
  type EvaluationDiagnostic, type EvaluationFuture, type EvaluationSide,
  type EvidencePremises, type EvidenceProvenance, type EvidenceRecord,
  type FutureProbability, type GateStatus, type GyldComparison, type HardGate,
  type ObligationStatus, type RelaxationNote, type StructuralImpact,
} from './comparison';

export {
  EVALUATOR_RUN_FORMAT, readEvaluatorRun,
  type GyldEvaluatorRun, type ProposalFiles, type RunLens, type RunProposal,
  type RunReports,
} from './evaluatorRun';

export {
  STREAMS_FORMAT, STREAM_FORMAT, STREAM_STATUSES,
  readStream, readStreamRecord, readStreamsIndex,
  type GyldStream, type GyldStreamsIndex, type StreamLens, type StreamOverlay,
  type StreamQuestion, type StreamRebuild, type StreamStatus, type StreamTiers,
} from './streams';

export {
  LENS_FORMAT, NODE_ID_PREFIX, EDGE_ID_PREFIX, GROUP_ID_PREFIX, readLens,
  type GyldLens, type LensCounts, type LensEdge, type LensEdgeStyle,
  type LensEngine, type LensGroup, type LensLegend, type LensLegendEdge,
  type LensLegendNode, type LensNode,
} from './lens';

export {
  PROJECTION_FORMAT, readProjection,
  type AssertionRef, type AssertionRole, type GyldProjection,
  type ProjectionAssertion, type ProjectionDefinition, type ProjectionOccurrence,
  type ProjectionOmissions, type RecordSource,
} from './projection';

export {
  SOURCES_FORMAT, readSources,
  type GyldSources, type SourceCitation, type SourceDocument, type SourceTag,
  type SourcesRoot, type UnresolvedTag,
} from './sources';

export {
  DECIDE_NOW_FORMAT, readDecideNow,
  type DecideNowQuestion, type DecideNowRuling, type GyldDecideNow,
} from './decideNow';

export {
  VALIDATION_FORMAT, readValidation,
  type GyldValidation, type ValidationFinding, type ValidationLocation,
} from './validation';

export {
  STREAM_DIFF_FORMAT, CORRESPONDENCE_BY_QUALIFIED_SLOT, readStreamDiff,
  type AssertionDiff, type AssertionDiffEntry, type DiffSide, type LensDiff,
  type LensEdgeRef, type EffectiveStatusChange, type GyldStreamDiff,
  type OccurrenceDiff, type OccurredDiff, type QuestionDiff, type RulingDiff,
  type RulingDiffEntry, type SelectionChange,
} from './streamDiff';
