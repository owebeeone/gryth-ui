import {
  atPath, readArray, readBoolean, readCount, readEnvelope, readIdentifier,
  readIdentifiers, readObject, readOptionalIdentifier, readSnapshotRef, readTexts,
  type QualifiedSlot, type SnapshotRef,
} from './common';

// Spec section 7.6: `diffs/<left>..<right>.json`.

export const STREAM_DIFF_FORMAT = 'gyld.stream-diff.v1';

export interface DiffSide {
  stream: string;
  snapshot: SnapshotRef;
}

export interface OccurrenceDiff {
  added: QualifiedSlot[];
  removed: QualifiedSlot[];
  changed_definition: QualifiedSlot[];
  unchanged: number;
}

export interface AssertionDiffEntry {
  slot: QualifiedSlot;
  relation: string;
  owner: QualifiedSlot;
  refs: QualifiedSlot[];
}

export interface AssertionDiff {
  added: AssertionDiffEntry[];
  removed: AssertionDiffEntry[];
  unchanged: number;
}

export interface EffectiveStatusChange {
  slot: QualifiedSlot;
  left: string;
  right: string;
  /** The ruling that produced the right-hand status; absent when none did. */
  ruling?: QualifiedSlot;
}

/** A question whose SELECTED alternative differs across the two streams. Both
 *  sides are absent when that side selected nothing. */
export interface SelectionChange {
  slot: QualifiedSlot;
  left?: QualifiedSlot;
  right?: QualifiedSlot;
}

/** The questions each side carries, by qualified slot. */
export interface QuestionDiff {
  added: QualifiedSlot[];
  removed: QualifiedSlot[];
  unchanged: number;
}

/** One ruling of a side, as the diff names it. The same fields the decide-now
 *  list carries for a ruling, minus its prose. */
export interface RulingDiffEntry {
  slot: QualifiedSlot;
  stream: string;
  live: boolean;
  occurred: QualifiedSlot[];
  decides?: QualifiedSlot;
  selects?: QualifiedSlot;
  reopens?: QualifiedSlot;
}

/**
 * What the two streams' rulings do differently. `retired` and `restored` are
 * the rulings BOTH streams carry whose standing changed: a ruling the right
 * stream reopened is retired, not removed, because it is still in the chain.
 */
export interface RulingDiff {
  added: RulingDiffEntry[];
  removed: RulingDiffEntry[];
  retired: QualifiedSlot[];
  restored: QualifiedSlot[];
}

/** The triggers each side records as having occurred. */
export interface OccurredDiff {
  added: QualifiedSlot[];
  removed: QualifiedSlot[];
}

/** One drawn edge of a lens, named by slots rather than by the per-stream ids
 *  that do not survive a restream (R1). */
export interface LensEdgeRef {
  slot: QualifiedSlot;
  relation: string;
  tail: QualifiedSlot;
  head: QualifiedSlot;
}

/** What one perspective gained and lost between the two streams. Keyed by
 *  perspective; a perspective only one side carries is not compared. */
export interface LensDiff {
  nodes: { added: QualifiedSlot[]; removed: QualifiedSlot[]; unchanged: number };
  edges: { added: LensEdgeRef[]; removed: LensEdgeRef[]; unchanged: number };
}

export interface GyldStreamDiff {
  format: typeof STREAM_DIFF_FORMAT;
  left: DiffSide;
  right: DiffSide;
  /** R1 pins this to `qualified_slot` today. Read as an open string so a later
   *  correspondence kind is reported rather than rejected by a stale reader. */
  correspondence: string;
  occurrences: OccurrenceDiff;
  assertions: AssertionDiff;
  effective_status: EffectiveStatusChange[];
  omissions: string[];
  /** The sections the diff host writes beside the three section 7.6 names.
   *  Each is read when present and left absent otherwise: section 7.6 does not
   *  name them, so a host that writes none is not in violation. */
  selections?: SelectionChange[];
  questions?: QuestionDiff;
  rulings?: RulingDiff;
  occurred?: OccurredDiff;
  /** Per perspective, what the picture gained and lost. */
  lenses?: Record<string, LensDiff>;
}

export const CORRESPONDENCE_BY_QUALIFIED_SLOT = 'qualified_slot';

function readSide(value: unknown, path: string): DiffSide {
  const raw = readObject(value, path);
  return {
    stream: readIdentifier(raw.stream, atPath(path, 'stream')),
    snapshot: readSnapshotRef(raw.snapshot, atPath(path, 'snapshot')),
  };
}

function readAssertionEntry(value: unknown, path: string): AssertionDiffEntry {
  const raw = readObject(value, path);
  return {
    slot: readIdentifier(raw.slot, atPath(path, 'slot')),
    relation: readIdentifier(raw.relation, atPath(path, 'relation')),
    owner: readIdentifier(raw.owner, atPath(path, 'owner')),
    refs: readIdentifiers(raw.refs, atPath(path, 'refs')),
  };
}

function readStatusChange(value: unknown, path: string): EffectiveStatusChange {
  const raw = readObject(value, path);
  const change: EffectiveStatusChange = {
    slot: readIdentifier(raw.slot, atPath(path, 'slot')),
    left: readIdentifier(raw.left, atPath(path, 'left')),
    right: readIdentifier(raw.right, atPath(path, 'right')),
  };
  const ruling = readOptionalIdentifier(raw.ruling, atPath(path, 'ruling'));
  if (ruling !== undefined) {
    change.ruling = ruling;
  }
  return change;
}

function readSelection(value: unknown, path: string): SelectionChange {
  const raw = readObject(value, path);
  const change: SelectionChange = { slot: readIdentifier(raw.slot, atPath(path, 'slot')) };
  const left = readOptionalIdentifier(raw.left, atPath(path, 'left'));
  if (left !== undefined) {
    change.left = left;
  }
  const right = readOptionalIdentifier(raw.right, atPath(path, 'right'));
  if (right !== undefined) {
    change.right = right;
  }
  return change;
}

function readQuestions(value: unknown, path: string): QuestionDiff | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const raw = readObject(value, path);
  return {
    added: readIdentifiers(raw.added, atPath(path, 'added')),
    removed: readIdentifiers(raw.removed, atPath(path, 'removed')),
    unchanged: readCount(raw.unchanged, atPath(path, 'unchanged')),
  };
}

function readRulingEntry(value: unknown, path: string): RulingDiffEntry {
  const raw = readObject(value, path);
  const entry: RulingDiffEntry = {
    slot: readIdentifier(raw.slot, atPath(path, 'slot')),
    stream: readIdentifier(raw.stream, atPath(path, 'stream')),
    live: readBoolean(raw.live, atPath(path, 'live')),
    occurred: readIdentifiers(raw.occurred, atPath(path, 'occurred')),
  };
  for (const key of ['decides', 'selects', 'reopens'] as const) {
    const slot = readOptionalIdentifier(raw[key], atPath(path, key));
    if (slot !== undefined) {
      entry[key] = slot;
    }
  }
  return entry;
}

function readRulings(value: unknown, path: string): RulingDiff | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const raw = readObject(value, path);
  const addedPath = atPath(path, 'added');
  const removedPath = atPath(path, 'removed');
  return {
    added: readArray(raw.added, addedPath).map(
      (item, i) => readRulingEntry(item, atPath(addedPath, i)),
    ),
    removed: readArray(raw.removed, removedPath).map(
      (item, i) => readRulingEntry(item, atPath(removedPath, i)),
    ),
    retired: readIdentifiers(raw.retired, atPath(path, 'retired')),
    restored: readIdentifiers(raw.restored, atPath(path, 'restored')),
  };
}

function readOccurred(value: unknown, path: string): OccurredDiff | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const raw = readObject(value, path);
  return {
    added: readIdentifiers(raw.added, atPath(path, 'added')),
    removed: readIdentifiers(raw.removed, atPath(path, 'removed')),
  };
}

function readLensEdge(value: unknown, path: string): LensEdgeRef {
  const raw = readObject(value, path);
  return {
    slot: readIdentifier(raw.slot, atPath(path, 'slot')),
    relation: readIdentifier(raw.relation, atPath(path, 'relation')),
    tail: readIdentifier(raw.tail, atPath(path, 'tail')),
    head: readIdentifier(raw.head, atPath(path, 'head')),
  };
}

function readLensDiff(value: unknown, path: string): LensDiff {
  const raw = readObject(value, path);
  const nodesPath = atPath(path, 'nodes');
  const nodes = readObject(raw.nodes, nodesPath);
  const edgesPath = atPath(path, 'edges');
  const edges = readObject(raw.edges, edgesPath);
  const addedPath = atPath(edgesPath, 'added');
  const removedPath = atPath(edgesPath, 'removed');
  return {
    nodes: {
      added: readIdentifiers(nodes.added, atPath(nodesPath, 'added')),
      removed: readIdentifiers(nodes.removed, atPath(nodesPath, 'removed')),
      unchanged: readCount(nodes.unchanged, atPath(nodesPath, 'unchanged')),
    },
    edges: {
      added: readArray(edges.added, addedPath).map(
        (item, i) => readLensEdge(item, atPath(addedPath, i)),
      ),
      removed: readArray(edges.removed, removedPath).map(
        (item, i) => readLensEdge(item, atPath(removedPath, i)),
      ),
      unchanged: readCount(edges.unchanged, atPath(edgesPath, 'unchanged')),
    },
  };
}

function readLenses(value: unknown, path: string): Record<string, LensDiff> | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const raw = readObject(value, path);
  const lenses: Record<string, LensDiff> = {};
  for (const perspective of Object.keys(raw)) {
    lenses[perspective] = readLensDiff(raw[perspective], atPath(path, perspective));
  }
  return lenses;
}

/**
 * Read one stream diff. The diff is Gyld's own comparison, emitted whole: the
 * UI never recomputes a side, an added set or a status change from the two
 * bundles (spec section 6.7). The reader checks shape only.
 */
export function readStreamDiff(value: unknown): GyldStreamDiff {
  const raw = readEnvelope(value, STREAM_DIFF_FORMAT);
  const path = STREAM_DIFF_FORMAT;
  const occurrencesPath = atPath(path, 'occurrences');
  const occurrences = readObject(raw.occurrences, occurrencesPath);
  const assertionsPath = atPath(path, 'assertions');
  const assertions = readObject(raw.assertions, assertionsPath);
  const addedPath = atPath(assertionsPath, 'added');
  const removedPath = atPath(assertionsPath, 'removed');
  const statusPath = atPath(path, 'effective_status');
  const diff: GyldStreamDiff = {
    format: STREAM_DIFF_FORMAT,
    left: readSide(raw.left, atPath(path, 'left')),
    right: readSide(raw.right, atPath(path, 'right')),
    correspondence: readIdentifier(raw.correspondence, atPath(path, 'correspondence')),
    occurrences: {
      added: readIdentifiers(occurrences.added, atPath(occurrencesPath, 'added')),
      removed: readIdentifiers(occurrences.removed, atPath(occurrencesPath, 'removed')),
      changed_definition: readIdentifiers(
        occurrences.changed_definition, atPath(occurrencesPath, 'changed_definition'),
      ),
      unchanged: readCount(occurrences.unchanged, atPath(occurrencesPath, 'unchanged')),
    },
    assertions: {
      added: readArray(assertions.added, addedPath).map(
        (item, i) => readAssertionEntry(item, atPath(addedPath, i)),
      ),
      removed: readArray(assertions.removed, removedPath).map(
        (item, i) => readAssertionEntry(item, atPath(removedPath, i)),
      ),
      unchanged: readCount(assertions.unchanged, atPath(assertionsPath, 'unchanged')),
    },
    effective_status: readArray(raw.effective_status, statusPath).map(
      (item, i) => readStatusChange(item, atPath(statusPath, i)),
    ),
    omissions: readTexts(raw.omissions, atPath(path, 'omissions')),
  };
  if (raw.selections !== null && raw.selections !== undefined) {
    const selectionsPath = atPath(path, 'selections');
    diff.selections = readArray(raw.selections, selectionsPath).map(
      (item, i) => readSelection(item, atPath(selectionsPath, i)),
    );
  }
  const questions = readQuestions(raw.questions, atPath(path, 'questions'));
  if (questions !== undefined) {
    diff.questions = questions;
  }
  const rulings = readRulings(raw.rulings, atPath(path, 'rulings'));
  if (rulings !== undefined) {
    diff.rulings = rulings;
  }
  const occurred = readOccurred(raw.occurred, atPath(path, 'occurred'));
  if (occurred !== undefined) {
    diff.occurred = occurred;
  }
  const lenses = readLenses(raw.lenses, atPath(path, 'lenses'));
  if (lenses !== undefined) {
    diff.lenses = lenses;
  }
  return diff;
}
