import { describe, it, expect } from 'vitest';
import {
  GyldContractError, GyldContractViolation, attempt, readComparison, readEvaluatorRun,
  readLens, EVALUATION_VERSION, EVALUATOR_RUN_FORMAT,
} from './index';
import runFixture from '../../test/fixtures/evaluator/run.json';
import carrierFixture from '../../test/fixtures/evaluator/carrier/comparison.json';
import gossipFixture from '../../test/fixtures/evaluator/gossip/comparison.json';
import baselineLensFixture from '../../test/fixtures/evaluator/carrier/baseline.lens.json';
import candidateLensFixture from '../../test/fixtures/evaluator/carrier/candidate.lens.json';

// Step 3.2: the evaluator run contract (spec sections 6.5 and 7.8). Every
// fixture under `evaluator/` is REAL output of the iroh-integration-v2 run,
// copied verbatim (test/fixtures/README.md). Nothing below asserts a number
// this package computed: each one is IN the file.

type Json = Record<string, unknown>;

function copy<T>(value: T): T {
  return structuredClone(value);
}

function owner(root: Json, path: string): { parent: Json; key: string } {
  const parts = path.split('.');
  let node: Json = root;
  for (const part of parts.slice(0, -1)) {
    node = node[part] as Json;
  }
  return { parent: node, key: parts[parts.length - 1] };
}

function mutate<T>(fixture: T, path: string, value: unknown): T {
  const next = copy(fixture) as unknown as Json;
  const { parent, key } = owner(next, path);
  parent[key] = value;
  return next as unknown as T;
}

function drop<T>(fixture: T, path: string): T {
  const next = copy(fixture) as unknown as Json;
  const { parent, key } = owner(next, path);
  delete parent[key];
  return next as unknown as T;
}

function rejects(read: () => unknown, violation: GyldContractViolation, path: string) {
  const result = attempt(read);
  expect(result.ok, `expected ${violation.code} at ${path}, but the read succeeded`).toBe(false);
  const error = (result as { ok: false; error: GyldContractError }).error;
  expect(error.violation).toBe(violation);
  expect(error.path).toBe(path);
}

describe('gyld.evaluator-run.v1', () => {
  it('reads the emitted run index whole', () => {
    const run = readEvaluatorRun(runFixture);
    expect(run.format).toBe(EVALUATOR_RUN_FORMAT);
    expect(run.run).toBe('iroh-integration-v2');
    expect(run.evaluator_version).toBe(EVALUATION_VERSION);
    expect(run.base).toEqual(runFixture.base);
    expect(run.proposals.map((proposal) => proposal.id))
      .toEqual(runFixture.proposals.map((proposal) => proposal.id));
    expect(run.limits).toEqual(runFixture.limits);
    // the lens block says what the two pictures of each proposal are
    expect(run.lens.perspective).toBe('allocation');
    expect(run.lens.stream).toBeUndefined();
    expect(run.lens.omissions).toEqual(runFixture.lens.omissions);
  });

  it('carries each proposal own files, snapshots and what it introduced', () => {
    const run = readEvaluatorRun(runFixture);
    const carrier = run.proposals.find((proposal) => proposal.id === 'carrier')!;
    expect(carrier.files.comparison).toBe('carrier/comparison.json');
    expect(carrier.files.baseline_lens).toBe('carrier/baseline.lens.json');
    expect(carrier.files.candidate_lens).toBe('carrier/candidate.lens.json');
    // this run emitted no report, so the path is absent rather than guessed
    expect(carrier.files.report_html).toBeUndefined();
    // a configuration-only proposal: the host says the candidate IS the base
    expect(carrier.candidate_equals_base).toBe(true);
    expect(carrier.introduced).toBeUndefined();
    expect(carrier.baseline).toEqual(carrier.candidate);
    const docs = run.proposals.find((proposal) => proposal.id === 'docs')!;
    expect(docs.candidate_equals_base).toBe(false);
    expect(docs.introduced).toBe('proposal:iroh-docs-record-substrate');
    expect(docs.moved).toEqual(['retain_replica', 'reconcile_metadata']);
  });

  it('says the report is elsewhere rather than pretending there is none', () => {
    const run = readEvaluatorRun(runFixture);
    expect(run.reports.emitted).toBe(false);
    expect(run.reports.run).toBe('artifacts/iroh-integration-v1');
    expect(run.reports.note).toContain('the same document for the same evaluation inputs');
  });

  it('refuses a document that is not this format, and a run with no proposals', () => {
    rejects(
      () => readEvaluatorRun(mutate(runFixture, 'format', 'gyld.evaluator-run.v2')),
      GyldContractViolation.WrongFormat, 'gyld.evaluator-run.v1.format',
    );
    rejects(
      () => readEvaluatorRun(drop(runFixture, 'proposals')),
      GyldContractViolation.MissingField, 'gyld.evaluator-run.v1.proposals',
    );
    rejects(
      () => readEvaluatorRun(drop(runFixture, 'proposals.0.files.baseline_lens')),
      GyldContractViolation.MissingField, 'gyld.evaluator-run.v1.proposals[0].files.baseline_lens',
    );
  });
});

describe('the comparison record of one proposal', () => {
  const carrier = readComparison(carrierFixture);
  const gossip = readComparison(gossipFixture);

  it('reads the frame, the gates and the obligations of both sides whole', () => {
    expect(carrier.frame.id).toBe('iroh-carrier-frame');
    expect(carrier.frame.hard_gates.map((gate) => gate.id))
      .toEqual(carrierFixture.frame.hard_gates.map((gate) => gate.id));
    expect(carrier.frame.obligation_ids).toHaveLength(18);
    for (const side of [carrier.baseline, carrier.candidate] as const) {
      expect(side.gates).toHaveLength(4);
      expect(side.obligations).toHaveLength(18);
      // every gate of the frame has a status on every side, and each status
      // is the evaluator's own word
      expect(side.gates.map((gate) => gate.id))
        .toEqual(carrier.frame.hard_gates.map((gate) => gate.id));
      expect(side.eligible).toBe(false);
    }
    expect(carrier.baseline.gates.map((gate) => gate.status))
      .toEqual(['unverified', 'fail', 'unverified', 'pass']);
    expect(carrier.candidate.gates.map((gate) => gate.status))
      .toEqual(['unverified', 'pass', 'pass', 'pass']);
  });

  it('keeps an unknown cost out of every subtotal, and says which ones', () => {
    const costs = carrier.candidate.costs;
    expect(costs.unknown_ids).toEqual(['candidate-effort', 'candidate-integration']);
    expect(costs.conditional_subtotals).toEqual([]);
    for (const record of costs.records) {
      expect(record.state).toBe('unknown');
      // unknown is not zero: no quantity, and no effective value
      expect(record.quantity).toBeUndefined();
      expect(record.effective_value).toBeUndefined();
    }
    // the one subtotal this run does carry names its condition and the exact
    // records it covers, and every unknown id stays outside it
    const future = carrier.futures.find((item) => item.id === 'iroh-services-pro')!;
    const subtotals = future.candidate.costs.conditional_subtotals;
    expect(subtotals).toHaveLength(1);
    expect(subtotals[0].value).toBe(19);
    expect(subtotals[0].unit).toBe('usd_per_month');
    expect(subtotals[0].condition).toBe('same_dimension_context_unit_and_non_overlapping');
    expect(subtotals[0].cost_ids).toEqual(['iroh-services-pro-hosting']);
    for (const id of future.candidate.costs.unknown_ids) {
      expect(subtotals[0].cost_ids).not.toContain(id);
    }
  });

  it('reads futures with their own frames, gates and relaxation notes', () => {
    expect(carrier.futures.map((future) => future.id))
      .toEqual(['self-hosted-relay', 'iroh-services-pro']);
    for (const future of carrier.futures) {
      expect(future.authority).toBe('evaluation_only_no_operations');
      expect(future.probability.state).toBe('unknown');
      expect(future.candidate.eligible).toBe(false);
    }
    // the relaxation note is on the proposal that relaxes something
    expect(carrier.relaxation_notes).toEqual({});
    const note = gossip.relaxation_notes!['accept-pinned-0x-behind-port'];
    expect(note.ungated_policy).toEqual(['documented-1x-wire-stability']);
    expect(note.dropped_gates).toEqual([]);
    expect(note.dropped_obligations).toEqual([]);
    expect(note.reason.length).toBeGreaterThan(0);
  });

  it('reads the structural impact and the summary rows as written', () => {
    expect(carrier.structural_impact).toEqual({
      added_ids: [], changed_ids: [], changed_scopes: [], complete: true,
    });
    expect(gossip.structural_impact!.added_ids).toEqual(['proposal:iroh-gossip-overlay']);
    expect(carrier.summary!.columns).toEqual(['Captured fact', 'Baseline', 'Candidate']);
    expect(carrier.summary!.rows).toEqual(carrierFixture.summary.rows);
    expect(carrier.summary!.narrative).toContain('No winner is selected');
  });

  it('keeps every evidence record with its applicability and provenance', () => {
    const evidence = carrier.candidate.evidence;
    expect(evidence).toHaveLength(3);
    for (const record of evidence) {
      expect(record.applicability).toBe('reusable_under_recorded_premises');
      expect(record.context_compatibility).toBe('compatible');
      expect(record.premises.ids.length).toBeGreaterThan(0);
      const provenance = carrier.evidence_provenance![record.id];
      expect(provenance.review).toContain('IrohReview.md');
      expect(provenance.basis.length).toBeGreaterThan(0);
    }
  });

  it('requires the winner to be null, and refuses a file that names one', () => {
    expect(carrier.winner).toBeNull();
    expect(carrier.architecture_superiority).toBeNull();
    expect(carrier.winner_reason).toBe('not_defined_for_multidimensional_evaluation');
    rejects(
      () => readComparison(mutate(carrierFixture, 'winner', 'candidate')),
      GyldContractViolation.UnknownValue, 'comparison.winner',
    );
    rejects(
      () => readComparison(mutate(carrierFixture, 'architecture_superiority', true)),
      GyldContractViolation.UnknownValue, 'comparison.architecture_superiority',
    );
    rejects(
      () => readComparison(drop(carrierFixture, 'winner')),
      GyldContractViolation.MissingField, 'comparison.winner',
    );
  });

  it('refuses a comparison whose gates or costs are the wrong shape', () => {
    rejects(
      () => readComparison(mutate(carrierFixture, 'candidate.gates', {})),
      GyldContractViolation.WrongType, 'comparison.candidate.gates',
    );
    rejects(
      () => readComparison(drop(carrierFixture, 'candidate.costs.unknown_ids')),
      GyldContractViolation.MissingField, 'comparison.candidate.costs.unknown_ids',
    );
    rejects(
      () => readComparison(mutate(carrierFixture, 'baseline.eligible', 'no')),
      GyldContractViolation.WrongType, 'comparison.baseline.eligible',
    );
  });
});

describe('the baseline and candidate pictures of one proposal', () => {
  it('reads both as ordinary lens documents, and names what they omit', () => {
    const baseline = readLens(baselineLensFixture);
    const candidate = readLens(candidateLensFixture);
    for (const lens of [baseline, candidate]) {
      expect(lens.perspective).toBe('allocation');
      // an evaluator run compares SNAPSHOTS, so no stream overlays either
      expect(lens.stream).toBeUndefined();
      expect(lens.counts.nodes).toBe(40);
      expect(lens.counts.edges).toBe(24);
      expect(lens.nodes).toHaveLength(40);
      expect(lens.omissions).toContain('gates and their evidence');
      expect(lens.omissions).toContain('the saved operations that produced the candidate');
    }
    // this proposal changes configuration only, so the two pictures agree and
    // the run says so itself rather than the window comparing them
    expect(candidate.counts).toEqual(baseline.counts);
    const run = readEvaluatorRun(runFixture);
    expect(run.proposals.find((proposal) => proposal.id === 'carrier')!.candidate_equals_base)
      .toBe(true);
  });
});
