import {
  atPath, readArray, readBoolean, readEnvelope, readIdentifier, readObject,
  readOptionalIdentifier, readSnapshotRef, readText, readTexts,
  type SnapshotRef,
} from './common';

// Spec section 7.8: an evaluator RUN, as `evaluate_iroh_integration.py` writes
// it, indexed by a `run.json` of format `gyld.evaluator-run.v1`.
//
// The index is what makes a run readable without listing a directory: it names
// every proposal, the snapshots each side was evaluated on, and the file each
// artefact of that proposal is in. Nothing here is derived. In particular the
// run says whether the inspector REPORT was emitted with it and, when it was
// not, names the run that holds the byte-identical one.

export const EVALUATOR_RUN_FORMAT = 'gyld.evaluator-run.v1';

/** What the two lens files of each proposal are, said once for the run. */
export interface RunLens {
  /** The lens format they are written in, `gyld.lens.v1`. */
  format: string;
  perspective: string;
  /** What each side's picture is of, in the host's own words. */
  baseline: string;
  candidate: string;
  omissions: string[];
  /** The stream that overlays the snapshot, when one does. Null in this run:
   *  an evaluator run compares snapshots, not streams. */
  stream?: string;
}

/**
 * Whether the inspector report was emitted with THIS run.
 *
 * `emitted: false` is not "there is no report": the report is the same
 * document for the same evaluation inputs, so a run that skipped it names the
 * run that holds it in `run`, with the host's reason in `note`.
 */
export interface RunReports {
  emitted: boolean;
  run?: string;
  note?: string;
}

/** Where each artefact of one proposal is, relative to the run directory. A
 *  path that is null is an artefact this run did not write. */
export interface ProposalFiles {
  comparison: string;
  applications: string;
  receipt: string;
  workspace: string;
  candidate_svg: string;
  candidate_full_dot: string;
  baseline_lens: string;
  candidate_lens: string;
  report_html?: string;
}

export interface RunProposal {
  id: string;
  /** The frame this proposal was evaluated under, by id. */
  frame: string;
  baseline: SnapshotRef;
  candidate: SnapshotRef;
  /** The host's own answer to "is the candidate the base again", which a
   *  configuration-only proposal legitimately is. Never compared here. */
  candidate_equals_base: boolean;
  /** The record the proposal introduces, when it introduces one. */
  introduced?: string;
  /** The allocations the proposal moved, by label, as the host named them. */
  moved: string[];
  files: ProposalFiles;
}

export interface GyldEvaluatorRun {
  format: typeof EVALUATOR_RUN_FORMAT;
  run: string;
  evaluator_version: string;
  lineage: string;
  revision: string;
  /** The document the gates were read from, with the date it was verified. */
  review: string;
  base: SnapshotRef;
  lens: RunLens;
  reports: RunReports;
  proposals: RunProposal[];
  limits: string[];
}

function readFiles(value: unknown, path: string): ProposalFiles {
  const raw = readObject(value, path);
  const files: ProposalFiles = {
    comparison: readIdentifier(raw.comparison, atPath(path, 'comparison')),
    applications: readIdentifier(raw.applications, atPath(path, 'applications')),
    receipt: readIdentifier(raw.receipt, atPath(path, 'receipt')),
    workspace: readIdentifier(raw.workspace, atPath(path, 'workspace')),
    candidate_svg: readIdentifier(raw.candidate_svg, atPath(path, 'candidate_svg')),
    candidate_full_dot: readIdentifier(
      raw.candidate_full_dot, atPath(path, 'candidate_full_dot'),
    ),
    baseline_lens: readIdentifier(raw.baseline_lens, atPath(path, 'baseline_lens')),
    candidate_lens: readIdentifier(raw.candidate_lens, atPath(path, 'candidate_lens')),
  };
  const report = readOptionalIdentifier(raw.report_html, atPath(path, 'report_html'));
  if (report !== undefined) {
    files.report_html = report;
  }
  return files;
}

function readProposal(value: unknown, path: string): RunProposal {
  const raw = readObject(value, path);
  const proposal: RunProposal = {
    id: readIdentifier(raw.id, atPath(path, 'id')),
    frame: readIdentifier(raw.frame, atPath(path, 'frame')),
    baseline: readSnapshotRef(raw.baseline, atPath(path, 'baseline')),
    candidate: readSnapshotRef(raw.candidate, atPath(path, 'candidate')),
    candidate_equals_base: readBoolean(
      raw.candidate_equals_base, atPath(path, 'candidate_equals_base'),
    ),
    moved: readTexts(raw.moved, atPath(path, 'moved')),
    files: readFiles(raw.files, atPath(path, 'files')),
  };
  const introduced = readOptionalIdentifier(raw.introduced, atPath(path, 'introduced'));
  if (introduced !== undefined) {
    proposal.introduced = introduced;
  }
  return proposal;
}

function readLens(value: unknown, path: string): RunLens {
  const raw = readObject(value, path);
  const lens: RunLens = {
    format: readIdentifier(raw.format, atPath(path, 'format')),
    perspective: readIdentifier(raw.perspective, atPath(path, 'perspective')),
    baseline: readText(raw.baseline, atPath(path, 'baseline')),
    candidate: readText(raw.candidate, atPath(path, 'candidate')),
    omissions: readTexts(raw.omissions, atPath(path, 'omissions')),
  };
  const stream = readOptionalIdentifier(raw.stream, atPath(path, 'stream'));
  if (stream !== undefined) {
    lens.stream = stream;
  }
  return lens;
}

function readReports(value: unknown, path: string): RunReports {
  const raw = readObject(value, path);
  const reports: RunReports = {
    emitted: readBoolean(raw.emitted, atPath(path, 'emitted')),
  };
  const run = readOptionalIdentifier(raw.run, atPath(path, 'run'));
  if (run !== undefined) {
    reports.run = run;
  }
  if (raw.note !== null && raw.note !== undefined) {
    reports.note = readText(raw.note, atPath(path, 'note'));
  }
  return reports;
}

export function readEvaluatorRun(value: unknown): GyldEvaluatorRun {
  const raw = readEnvelope(value, EVALUATOR_RUN_FORMAT);
  const path = EVALUATOR_RUN_FORMAT;
  const proposalsPath = atPath(path, 'proposals');
  return {
    format: EVALUATOR_RUN_FORMAT,
    run: readIdentifier(raw.run, atPath(path, 'run')),
    evaluator_version: readIdentifier(
      raw.evaluator_version, atPath(path, 'evaluator_version'),
    ),
    lineage: readIdentifier(raw.lineage, atPath(path, 'lineage')),
    revision: readIdentifier(raw.revision, atPath(path, 'revision')),
    review: readText(raw.review, atPath(path, 'review')),
    base: readSnapshotRef(raw.base, atPath(path, 'base')),
    lens: readLens(raw.lens, atPath(path, 'lens')),
    reports: readReports(raw.reports, atPath(path, 'reports')),
    proposals: readArray(raw.proposals, proposalsPath).map(
      (item, i) => readProposal(item, atPath(proposalsPath, i)),
    ),
    limits: readTexts(raw.limits, atPath(path, 'limits')),
  };
}
