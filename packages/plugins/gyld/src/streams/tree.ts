import { snapshotRefMatches } from '../contract';
import type { CensusStream, GyldStreamsCensus } from '../store/state';

// The stream tree, as a PURE function of the census (spec section 2: "the
// stream tree (base, forks, links), each with revision, digest, parent digest,
// built-against status").
//
// Every fact here is in `streams.json`. The tree is the `parent` each record
// carries, the depth is how many parents that walk crossed, and "parent moved
// since build" is the one comparison section 4.3 defines: the digest a stream
// was built against against the digest its parent carries now. Nothing is
// derived beyond those: no stream is reordered, none is hidden, and none is
// invented.

export interface StreamRow {
  id: string;
  /** How many parents lie between this stream and its root, for indenting. */
  depth: number;
  entry: CensusStream;
  /**
   * True when this stream pins a parent snapshot and the parent's current
   * snapshot is a different one. Section 4.3: "when the parent's current
   * digest differs, the stream manager shows parent moved since build and
   * offers a rebuild". It is reported, never repaired.
   */
  parentMoved: boolean;
  /** True when the record names a parent the census does not carry, so this
   *  stream is drawn at the top with its parent named as missing rather than
   *  quietly rehomed. */
  parentMissing: boolean;
}

/**
 * The census as depth-ordered rows: each root, then its children, in census
 * order at every level.
 *
 * A stream whose `parent` the census does not carry is a root here too, with
 * `parentMissing` set. That can only happen across roots of a SET, where two
 * directories each hold part of a chain; it is said rather than hidden.
 */
export function streamRows(census: GyldStreamsCensus | undefined): StreamRow[] {
  if (census === undefined || census.status !== 'ready') {
    return [];
  }
  const byId = new Map(census.streams.map((entry) => [entry.id, entry]));
  const children = new Map<string, CensusStream[]>();
  const roots: CensusStream[] = [];
  for (const entry of census.streams) {
    const parent = entry.record.parent;
    if (parent === undefined || !byId.has(parent)) {
      roots.push(entry);
      continue;
    }
    const held = children.get(parent);
    if (held === undefined) {
      children.set(parent, [entry]);
    } else {
      held.push(entry);
    }
  }
  const rows: StreamRow[] = [];
  const walk = (entry: CensusStream, depth: number, seen: Set<string>): void => {
    if (seen.has(entry.id)) {
      // A cycle cannot happen in emitted output, and if one ever did the
      // window must still draw rather than hang.
      return;
    }
    seen.add(entry.id);
    rows.push({
      id: entry.id,
      depth,
      entry,
      parentMoved: parentMoved(entry, byId),
      parentMissing: entry.record.parent !== undefined && !byId.has(entry.record.parent),
    });
    for (const child of children.get(entry.id) ?? []) {
      walk(child, depth + 1, seen);
    }
  };
  for (const root of roots) {
    walk(root, 0, new Set());
  }
  return rows;
}

/** The section 4.3 comparison: what this stream was built against, against
 *  what its parent is now. Absent on either side means there is nothing to
 *  compare, which is not a move. */
function parentMoved(entry: CensusStream, byId: Map<string, CensusStream>): boolean {
  const pinned = entry.record.parent_snapshot;
  const parent = entry.record.parent === undefined ? undefined : byId.get(entry.record.parent);
  if (pinned === undefined || parent === undefined) {
    return false;
  }
  return !snapshotRefMatches(pinned, parent.record.snapshot);
}

/** The stream ids a parent picker offers: every stream the census carries, in
 *  census order. A stream that is not there cannot be a parent, and the window
 *  never offers one it has not seen. */
export function parentChoices(census: GyldStreamsCensus | undefined): string[] {
  return census === undefined || census.status !== 'ready'
    ? []
    : census.streams.map((entry) => entry.id);
}
