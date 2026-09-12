import {
  atPath, readArray, readBoolean, readFinite, readIdentifier, readIdentifiers,
  readNull, readObject, readOptionalFinite, readSnapshotRef,
  readText, readTexts, type SnapshotRef,
} from './common';

// Spec sections 6.5 and 7.8: one proposal's `comparison.json`, as
// `gyld.evaluation.compare` returns it and `app.Workflow.compare` adds to it.
//
// The file carries no `format` field. Its version is `evaluator_version`, and
// this reader READS it rather than pinning it: a run written by a later
// evaluator is a run whose version the window should show, not one it should
// refuse to open. The one thing that IS pinned is the pair of fields that
// would make this a ranking: `winner` and `architecture_superiority` must be
// present and null, because the evaluator returns null for both and a window
// that rendered anything else there would be ranking proposals, which section
// 6.5 forbids it to do.
//
// Nothing is folded. The gate statuses, the obligation satisfactions, the
// eligibility, the unknown cost ids and the conditional subtotals are all the
// evaluator's own answers, read whole. In particular the reader never adds a
// cost up: `conditional_subtotals` is what the evaluator computed over the
// records it could add, and `unknown_ids` is what it refused to.

/** The version this reader was written against. Shown for comparison with the
 *  file's own; never used to reject one. */
export const EVALUATION_VERSION = 'gyld.evaluation.v3';

/** The frame's operating context: unknown is stated, never assumed. */
export interface EvalContext {
  id: string;
  platform: string;
  workload: string;
}

/** One hard gate of a frame, and the obligations it stands for. */
export interface HardGate {
  id: string;
  obligation_ids: string[];
}

export interface EvalFrame {
  id: string;
  version: string;
  context: EvalContext;
  hard_gates: HardGate[];
  obligation_ids: string[];
}

/** One gate's status on one side, with the evidence that carried it. */
export interface GateStatus {
  id: string;
  /** `pass`, `fail` or `unverified` in this evaluator, read as an open string:
   *  the vocabulary is the evaluator's and this window shows it. */
  status: string;
  evidence_ids: string[];
}

export interface ObligationStatus {
  id: string;
  retained: boolean;
  satisfaction: string;
}

export interface CostQuantity {
  unit: string;
  value: number;
}

export interface CostMultiplicity {
  basis: string;
  count: number;
  state: string;
}

export interface CostSubject {
  id: string;
  kind: string;
}

/** One cost record. `state` is `known` or `unknown` and an unknown cost has no
 *  quantity: unknown is not zero, and nothing here supplies one. */
export interface CostRecord {
  id: string;
  dimension: string;
  state: string;
  scenario_role: string;
  compatibility: string;
  context: EvalContext;
  multiplicity: CostMultiplicity;
  overlaps: string[];
  subject: CostSubject;
  version: string;
  reason?: string;
  quantity?: CostQuantity;
  /** quantity times multiplicity, present only where the evaluator could
   *  compute it, which is where both are known. */
  effective_value?: number;
}

/**
 * A subtotal the evaluator was willing to add up, with the condition under
 * which it holds and the exact records it covers. Costs outside it are outside
 * it for a stated reason: unknown, incompatible context, or overlapping.
 */
export interface CostSubtotal {
  condition: string;
  context: EvalContext;
  cost_ids: string[];
  dimension: string;
  scenario_role: string;
  unit: string;
  value: number;
}

export interface CostReport {
  records: CostRecord[];
  conditional_subtotals: CostSubtotal[];
  unknown_ids: string[];
  incompatible_ids: string[];
  overlapping_ids: string[];
}

/** The premises an evidence record was recorded under. */
export interface EvidencePremises {
  ids: string[];
  /** The recorded queries. Their shape belongs to the query language, so they
   *  are counted and carried, never interpreted here. */
  queries: unknown[];
}

export interface EvidenceRecord {
  id: string;
  gate_id: string;
  result: string;
  applicability: string;
  applicability_reason: string;
  context: EvalContext;
  context_compatibility: string;
  /** The fingerprint of the frame the evidence was taken under. */
  frame: string;
  premises: EvidencePremises;
  snapshot: SnapshotRef;
  version: string;
}

/** Why a piece of evidence was not applied. */
export interface EvaluationDiagnostic {
  code: string;
  evidence_id: string;
  reason: string;
}

/** One side of the comparison, baseline or candidate, evaluated whole. */
export interface EvaluationSide {
  evaluator_version: string;
  frame: EvalFrame;
  snapshot: SnapshotRef;
  evidence: EvidenceRecord[];
  gates: GateStatus[];
  obligations: ObligationStatus[];
  costs: CostReport;
  eligible: boolean;
  diagnostics: EvaluationDiagnostic[];
}

/** A future carries no probability and no authority: `state` is `unknown` with
 *  the host's reason, and `authority` says the future evaluates and operates
 *  nothing. */
export interface FutureProbability {
  state: string;
  reason: string;
}

export interface EvaluationFuture {
  id: string;
  version: string;
  frame: EvalFrame;
  probability: FutureProbability;
  baseline: EvaluationSide;
  candidate: EvaluationSide;
  authority: string;
}

/** What applying the proposal's operations changed, as the applier recorded
 *  it. `complete` is the applier's own answer about its own coverage. */
export interface StructuralImpact {
  added_ids: string[];
  changed_ids: string[];
  changed_scopes: string[];
  complete: boolean;
}

/** What a future's relaxed frame gives up, keyed by that future's id. */
export interface RelaxationNote {
  reason: string;
  dropped_gates: string[];
  dropped_obligations: string[];
  /** Gates lifted while their obligation is kept. */
  ungated_policy: string[];
}

/** Where one evidence record's result was read from. */
export interface EvidenceProvenance {
  basis: string;
  review: string;
}

/** The summary table, exactly as emitted: the rows carry counts and booleans
 *  and are rendered as written, never re-counted from anything here. */
export interface ComparisonSummary {
  columns: string[];
  narrative: string;
  rows: (string | number | boolean)[][];
}

export interface GyldComparison {
  evaluator_version: string;
  frame: EvalFrame;
  baseline: EvaluationSide;
  candidate: EvaluationSide;
  futures: EvaluationFuture[];
  /** Always null, and required to be: see the note at the top of this file. */
  winner: null;
  winner_reason: string;
  architecture_superiority: null;
  impact?: StructuralImpact;
  structural_impact?: StructuralImpact;
  summary?: ComparisonSummary;
  evidence_provenance?: Record<string, EvidenceProvenance>;
  relaxation_notes?: Record<string, RelaxationNote>;
}

function readContext(value: unknown, path: string): EvalContext {
  const raw = readObject(value, path);
  return {
    id: readIdentifier(raw.id, atPath(path, 'id')),
    platform: readIdentifier(raw.platform, atPath(path, 'platform')),
    workload: readIdentifier(raw.workload, atPath(path, 'workload')),
  };
}

function readFrame(value: unknown, path: string): EvalFrame {
  const raw = readObject(value, path);
  const gatesPath = atPath(path, 'hard_gates');
  return {
    id: readIdentifier(raw.id, atPath(path, 'id')),
    version: readIdentifier(raw.version, atPath(path, 'version')),
    context: readContext(raw.context, atPath(path, 'context')),
    hard_gates: readArray(raw.hard_gates, gatesPath).map((item, i) => {
      const at = atPath(gatesPath, i);
      const gate = readObject(item, at);
      return {
        id: readIdentifier(gate.id, atPath(at, 'id')),
        obligation_ids: readIdentifiers(gate.obligation_ids, atPath(at, 'obligation_ids')),
      };
    }),
    obligation_ids: readIdentifiers(raw.obligation_ids, atPath(path, 'obligation_ids')),
  };
}

function readCost(value: unknown, path: string): CostRecord {
  const raw = readObject(value, path);
  const multiplicityPath = atPath(path, 'multiplicity');
  const multiplicity = readObject(raw.multiplicity, multiplicityPath);
  const subjectPath = atPath(path, 'subject');
  const subject = readObject(raw.subject, subjectPath);
  const record: CostRecord = {
    id: readIdentifier(raw.id, atPath(path, 'id')),
    dimension: readIdentifier(raw.dimension, atPath(path, 'dimension')),
    state: readIdentifier(raw.state, atPath(path, 'state')),
    scenario_role: readIdentifier(raw.scenario_role, atPath(path, 'scenario_role')),
    compatibility: readIdentifier(raw.compatibility, atPath(path, 'compatibility')),
    context: readContext(raw.context, atPath(path, 'context')),
    multiplicity: {
      basis: readText(multiplicity.basis, atPath(multiplicityPath, 'basis')),
      count: readFinite(multiplicity.count, atPath(multiplicityPath, 'count')),
      state: readIdentifier(multiplicity.state, atPath(multiplicityPath, 'state')),
    },
    overlaps: readIdentifiers(raw.overlaps, atPath(path, 'overlaps')),
    subject: {
      id: readIdentifier(subject.id, atPath(subjectPath, 'id')),
      kind: readIdentifier(subject.kind, atPath(subjectPath, 'kind')),
    },
    version: readIdentifier(raw.version, atPath(path, 'version')),
  };
  if (raw.reason !== null && raw.reason !== undefined) {
    record.reason = readText(raw.reason, atPath(path, 'reason'));
  }
  if (raw.quantity !== null && raw.quantity !== undefined) {
    const quantityPath = atPath(path, 'quantity');
    const quantity = readObject(raw.quantity, quantityPath);
    record.quantity = {
      unit: readIdentifier(quantity.unit, atPath(quantityPath, 'unit')),
      value: readFinite(quantity.value, atPath(quantityPath, 'value')),
    };
  }
  const effective = readOptionalFinite(raw.effective_value, atPath(path, 'effective_value'));
  if (effective !== undefined) {
    record.effective_value = effective;
  }
  return record;
}

function readCostReport(value: unknown, path: string): CostReport {
  const raw = readObject(value, path);
  const recordsPath = atPath(path, 'records');
  const subtotalsPath = atPath(path, 'conditional_subtotals');
  return {
    records: readArray(raw.records, recordsPath).map(
      (item, i) => readCost(item, atPath(recordsPath, i)),
    ),
    conditional_subtotals: readArray(raw.conditional_subtotals, subtotalsPath).map((item, i) => {
      const at = atPath(subtotalsPath, i);
      const subtotal = readObject(item, at);
      return {
        condition: readIdentifier(subtotal.condition, atPath(at, 'condition')),
        context: readContext(subtotal.context, atPath(at, 'context')),
        cost_ids: readIdentifiers(subtotal.cost_ids, atPath(at, 'cost_ids')),
        dimension: readIdentifier(subtotal.dimension, atPath(at, 'dimension')),
        scenario_role: readIdentifier(subtotal.scenario_role, atPath(at, 'scenario_role')),
        unit: readIdentifier(subtotal.unit, atPath(at, 'unit')),
        value: readFinite(subtotal.value, atPath(at, 'value')),
      };
    }),
    unknown_ids: readIdentifiers(raw.unknown_ids, atPath(path, 'unknown_ids')),
    incompatible_ids: readIdentifiers(raw.incompatible_ids, atPath(path, 'incompatible_ids')),
    overlapping_ids: readIdentifiers(raw.overlapping_ids, atPath(path, 'overlapping_ids')),
  };
}

function readEvidence(value: unknown, path: string): EvidenceRecord {
  const raw = readObject(value, path);
  const premisesPath = atPath(path, 'premises');
  const premises = readObject(raw.premises, premisesPath);
  return {
    id: readIdentifier(raw.id, atPath(path, 'id')),
    gate_id: readIdentifier(raw.gate_id, atPath(path, 'gate_id')),
    result: readIdentifier(raw.result, atPath(path, 'result')),
    applicability: readIdentifier(raw.applicability, atPath(path, 'applicability')),
    applicability_reason: readIdentifier(
      raw.applicability_reason, atPath(path, 'applicability_reason'),
    ),
    context: readContext(raw.context, atPath(path, 'context')),
    context_compatibility: readIdentifier(
      raw.context_compatibility, atPath(path, 'context_compatibility'),
    ),
    frame: readIdentifier(raw.frame, atPath(path, 'frame')),
    premises: {
      ids: readIdentifiers(premises.ids, atPath(premisesPath, 'ids')),
      queries: readArray(premises.queries, atPath(premisesPath, 'queries')),
    },
    snapshot: readSnapshotRef(raw.snapshot, atPath(path, 'snapshot')),
    version: readIdentifier(raw.version, atPath(path, 'version')),
  };
}

function readSide(value: unknown, path: string): EvaluationSide {
  const raw = readObject(value, path);
  const evidencePath = atPath(path, 'evidence');
  const gatesPath = atPath(path, 'gates');
  const obligationsPath = atPath(path, 'obligations');
  const diagnosticsPath = atPath(path, 'diagnostics');
  return {
    evaluator_version: readIdentifier(
      raw.evaluator_version, atPath(path, 'evaluator_version'),
    ),
    frame: readFrame(raw.frame, atPath(path, 'frame')),
    snapshot: readSnapshotRef(raw.snapshot, atPath(path, 'snapshot')),
    evidence: readArray(raw.evidence, evidencePath).map(
      (item, i) => readEvidence(item, atPath(evidencePath, i)),
    ),
    gates: readArray(raw.gates, gatesPath).map((item, i) => {
      const at = atPath(gatesPath, i);
      const gate = readObject(item, at);
      return {
        id: readIdentifier(gate.id, atPath(at, 'id')),
        status: readIdentifier(gate.status, atPath(at, 'status')),
        evidence_ids: readIdentifiers(gate.evidence_ids, atPath(at, 'evidence_ids')),
      };
    }),
    obligations: readArray(raw.obligations, obligationsPath).map((item, i) => {
      const at = atPath(obligationsPath, i);
      const obligation = readObject(item, at);
      return {
        id: readIdentifier(obligation.id, atPath(at, 'id')),
        retained: readBoolean(obligation.retained, atPath(at, 'retained')),
        satisfaction: readIdentifier(obligation.satisfaction, atPath(at, 'satisfaction')),
      };
    }),
    costs: readCostReport(raw.costs, atPath(path, 'costs')),
    eligible: readBoolean(raw.eligible, atPath(path, 'eligible')),
    diagnostics: readArray(raw.diagnostics, diagnosticsPath).map((item, i) => {
      const at = atPath(diagnosticsPath, i);
      const diagnostic = readObject(item, at);
      return {
        code: readIdentifier(diagnostic.code, atPath(at, 'code')),
        evidence_id: readIdentifier(diagnostic.evidence_id, atPath(at, 'evidence_id')),
        reason: readIdentifier(diagnostic.reason, atPath(at, 'reason')),
      };
    }),
  };
}

function readFuture(value: unknown, path: string): EvaluationFuture {
  const raw = readObject(value, path);
  const probabilityPath = atPath(path, 'probability');
  const probability = readObject(raw.probability, probabilityPath);
  return {
    id: readIdentifier(raw.id, atPath(path, 'id')),
    version: readIdentifier(raw.version, atPath(path, 'version')),
    frame: readFrame(raw.frame, atPath(path, 'frame')),
    probability: {
      state: readIdentifier(probability.state, atPath(probabilityPath, 'state')),
      reason: readText(probability.reason, atPath(probabilityPath, 'reason')),
    },
    baseline: readSide(raw.baseline, atPath(path, 'baseline')),
    candidate: readSide(raw.candidate, atPath(path, 'candidate')),
    authority: readIdentifier(raw.authority, atPath(path, 'authority')),
  };
}

function readImpact(value: unknown, path: string): StructuralImpact | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const raw = readObject(value, path);
  return {
    added_ids: readIdentifiers(raw.added_ids, atPath(path, 'added_ids')),
    changed_ids: readIdentifiers(raw.changed_ids, atPath(path, 'changed_ids')),
    changed_scopes: readIdentifiers(raw.changed_scopes, atPath(path, 'changed_scopes')),
    complete: readBoolean(raw.complete, atPath(path, 'complete')),
  };
}

function readSummary(value: unknown, path: string): ComparisonSummary | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const raw = readObject(value, path);
  const rowsPath = atPath(path, 'rows');
  return {
    columns: readTexts(raw.columns, atPath(path, 'columns')),
    narrative: readText(raw.narrative, atPath(path, 'narrative')),
    rows: readArray(raw.rows, rowsPath).map((row, i) => {
      const at = atPath(rowsPath, i);
      return readArray(row, at).map((cell, j) => {
        // A summary cell is a captured count, a captured flag or a label. It
        // is rendered as written; nothing here re-counts or re-derives one.
        if (typeof cell === 'string' || typeof cell === 'boolean') {
          return cell;
        }
        return readFinite(cell, atPath(at, j));
      });
    }),
  };
}

function readProvenance(
  value: unknown,
  path: string,
): Record<string, EvidenceProvenance> | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const raw = readObject(value, path);
  const provenance: Record<string, EvidenceProvenance> = {};
  for (const id of Object.keys(raw)) {
    const at = atPath(path, id);
    const entry = readObject(raw[id], at);
    provenance[id] = {
      basis: readText(entry.basis, atPath(at, 'basis')),
      review: readText(entry.review, atPath(at, 'review')),
    };
  }
  return provenance;
}

function readNotes(value: unknown, path: string): Record<string, RelaxationNote> | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const raw = readObject(value, path);
  const notes: Record<string, RelaxationNote> = {};
  for (const id of Object.keys(raw)) {
    const at = atPath(path, id);
    const entry = readObject(raw[id], at);
    notes[id] = {
      reason: readText(entry.reason, atPath(at, 'reason')),
      dropped_gates: readIdentifiers(entry.dropped_gates, atPath(at, 'dropped_gates')),
      dropped_obligations: readTexts(
        entry.dropped_obligations, atPath(at, 'dropped_obligations'),
      ),
      ungated_policy: readIdentifiers(entry.ungated_policy, atPath(at, 'ungated_policy')),
    };
  }
  return notes;
}

export function readComparison(value: unknown, path = 'comparison'): GyldComparison {
  const raw = readObject(value, path);
  const futuresPath = atPath(path, 'futures');
  const comparison: GyldComparison = {
    evaluator_version: readIdentifier(
      raw.evaluator_version, atPath(path, 'evaluator_version'),
    ),
    frame: readFrame(raw.frame, atPath(path, 'frame')),
    baseline: readSide(raw.baseline, atPath(path, 'baseline')),
    candidate: readSide(raw.candidate, atPath(path, 'candidate')),
    futures: readArray(raw.futures, futuresPath).map(
      (item, i) => readFuture(item, atPath(futuresPath, i)),
    ),
    winner: readNull(raw.winner, atPath(path, 'winner')),
    winner_reason: readIdentifier(raw.winner_reason, atPath(path, 'winner_reason')),
    architecture_superiority: readNull(
      raw.architecture_superiority, atPath(path, 'architecture_superiority'),
    ),
  };
  const impact = readImpact(raw.impact, atPath(path, 'impact'));
  if (impact !== undefined) {
    comparison.impact = impact;
  }
  const structural = readImpact(raw.structural_impact, atPath(path, 'structural_impact'));
  if (structural !== undefined) {
    comparison.structural_impact = structural;
  }
  const summary = readSummary(raw.summary, atPath(path, 'summary'));
  if (summary !== undefined) {
    comparison.summary = summary;
  }
  const provenance = readProvenance(
    raw.evidence_provenance, atPath(path, 'evidence_provenance'),
  );
  if (provenance !== undefined) {
    comparison.evidence_provenance = provenance;
  }
  const notes = readNotes(raw.relaxation_notes, atPath(path, 'relaxation_notes'));
  if (notes !== undefined) {
    comparison.relaxation_notes = notes;
  }
  // `operation_history` is deliberately not read: it is the saved operation
  // list the applier replayed, it is the largest thing in the file by far, and
  // no part of this window shows it. The run's own limits say the same thing
  // in words ("the saved operations that produced the candidate" is on the
  // lens omission list), so its absence here is stated, not silent.
  return comparison;
}
