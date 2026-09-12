import {
  atPath, readArray, readCount, readEnvelope, readIdentifier, readIdentifiers,
  readObject, readOptionalIdentifier, readSnapshotRef, readTexts,
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
  return {
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
}
