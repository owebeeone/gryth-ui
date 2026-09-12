import {
  atPath, readArray, readBoolean, readEnvelope, readIdentifier, readIdentifiers,
  readObject, readOneOf, readOptionalIdentifier, readOptionalIdentifiers,
  readSnapshotRef, readText, requireKnown, type QualifiedSlot, type SnapshotRef,
} from './common';

// Spec sections 7.1 and 7.2 (shapes) and 4.3 and 4.4 (meaning).

export const STREAMS_FORMAT = 'gyld.streams.v1';
export const STREAM_FORMAT = 'gyld.stream.v1';

/** Spec 7.2: "`status` is `ok` or `invalid`". A closed set, written down. */
export const STREAM_STATUSES = ['ok', 'invalid'] as const;
export type StreamStatus = (typeof STREAM_STATUSES)[number];

/**
 * One emitted answer about a question of this stream. Spec section 4.3 does
 * not name these; `emit_decision_streams.py` writes them beside the record so
 * a stream manager does not have to open `decide-now.json` to list a stream.
 * Every field is read, never folded: `effective_status` and `tier` are the
 * capture host's answers (spec section 3.5).
 */
export interface StreamQuestion {
  slot: QualifiedSlot;
  label: string;
  declared_status: string;
  effective_status: string;
  tier: string;
  preferred?: QualifiedSlot;
}

/** Tier name to the questions the host placed in it, for example `anchors`. */
export type StreamTiers = Record<string, QualifiedSlot[]>;

/**
 * One perspective of a stream, as the host's own manifest names it. This is
 * the ONLY enumeration of a stream's lenses there is: a static host cannot be
 * asked for a directory listing, and the UI must never guess a perspective.
 *
 * An entry with `emitted: false` is the host stating that a perspective of the
 * design exists and this bundle does not carry it, with the `reason` in its
 * own words. That is the "not emitted, with the omission list" the UI is
 * required to show (spec section 3.5), so it is read, not filtered out.
 */
export interface StreamLens {
  perspective: string;
  emitted: boolean;
  /** The bundle-relative path, when the lens was emitted. */
  file?: string;
  /** The stream that overlays the snapshot for this lens, when one does. */
  stream?: string;
  relations?: string[];
  reason?: string;
}

/** The overlay module a stream's rulings and new questions live in (spec 4.2). */
export interface StreamOverlay {
  module: string;
  root: string;
  text_fingerprint: string;
}

/**
 * One stream record. `kind` is deliberately an open string: spec 4.4 names
 * `fork` and `link` and 7.1 carries the base stream in the same index, so
 * pinning the set here would reject valid Gyld output the day a third kind
 * appears. `status` IS pinned, because 7.2 states its two values.
 */
export interface GyldStream {
  id: string;
  kind: string;
  lineage: string;
  revision: string;
  snapshot: SnapshotRef;
  chain: string[];
  built: string;
  status: StreamStatus;
  parent?: string;
  parent_snapshot?: SnapshotRef;
  overlay?: StreamOverlay;
  principal?: string;
  note?: string;
  questions?: StreamQuestion[];
  roots?: QualifiedSlot[];
  tiers?: StreamTiers;
  lenses?: StreamLens[];
}

function readStreamLens(value: unknown, path: string): StreamLens {
  const raw = readObject(value, path);
  const lens: StreamLens = {
    perspective: readIdentifier(raw.perspective, atPath(path, 'perspective')),
    emitted: readBoolean(raw.emitted, atPath(path, 'emitted')),
  };
  const file = readOptionalIdentifier(raw.file, atPath(path, 'file'));
  if (file !== undefined) {
    lens.file = file;
  }
  const stream = readOptionalIdentifier(raw.stream, atPath(path, 'stream'));
  if (stream !== undefined) {
    lens.stream = stream;
  }
  const relations = readOptionalIdentifiers(raw.relations, atPath(path, 'relations'));
  if (relations !== undefined) {
    lens.relations = relations;
  }
  if (raw.reason !== null && raw.reason !== undefined) {
    lens.reason = readText(raw.reason, atPath(path, 'reason'));
  }
  return lens;
}

function readStreamQuestion(value: unknown, path: string): StreamQuestion {
  const raw = readObject(value, path);
  const question: StreamQuestion = {
    slot: readIdentifier(raw.slot, atPath(path, 'slot')),
    label: readIdentifier(raw.label, atPath(path, 'label')),
    declared_status: readIdentifier(raw.declared_status, atPath(path, 'declared_status')),
    effective_status: readIdentifier(raw.effective_status, atPath(path, 'effective_status')),
    tier: readIdentifier(raw.tier, atPath(path, 'tier')),
  };
  const preferred = readOptionalIdentifier(raw.preferred, atPath(path, 'preferred'));
  if (preferred !== undefined) {
    question.preferred = preferred;
  }
  return question;
}

function readTiers(value: unknown, path: string): StreamTiers | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const raw = readObject(value, path);
  const tiers: StreamTiers = {};
  for (const tier of Object.keys(raw)) {
    tiers[tier] = readIdentifiers(raw[tier], atPath(path, tier));
  }
  return tiers;
}

export interface GyldStreamsIndex {
  format: typeof STREAMS_FORMAT;
  /** The index's own lineage. One directory can hold several (a decision
   *  graph and an architecture graph), and then `lineages` names them all. */
  lineage: string;
  streams: GyldStream[];
  written: string;
  lineages?: string[];
}

function readOverlay(value: unknown, path: string): StreamOverlay | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const raw = readObject(value, path);
  return {
    module: readIdentifier(raw.module, atPath(path, 'module')),
    root: readIdentifier(raw.root, atPath(path, 'root')),
    text_fingerprint: readIdentifier(raw.text_fingerprint, atPath(path, 'text_fingerprint')),
  };
}

/**
 * Read one stream record. Inside `streams.json` the records carry no `format`
 * field (spec 7.1 says "without the format field"), so the envelope gate is
 * applied only to a standalone `stream.json`.
 */
export function readStreamRecord(value: unknown, path: string): GyldStream {
  const raw = readObject(value, path);
  const stream: GyldStream = {
    id: readIdentifier(raw.id, atPath(path, 'id')),
    kind: readIdentifier(raw.kind, atPath(path, 'kind')),
    lineage: readIdentifier(raw.lineage, atPath(path, 'lineage')),
    revision: readIdentifier(raw.revision, atPath(path, 'revision')),
    snapshot: readSnapshotRef(raw.snapshot, atPath(path, 'snapshot')),
    chain: readIdentifiers(raw.chain, atPath(path, 'chain')),
    built: readIdentifier(raw.built, atPath(path, 'built')),
    status: readOneOf(raw.status, atPath(path, 'status'), STREAM_STATUSES),
  };
  const parent = readOptionalIdentifier(raw.parent, atPath(path, 'parent'));
  if (parent !== undefined) {
    stream.parent = parent;
  }
  if (raw.parent_snapshot !== null && raw.parent_snapshot !== undefined) {
    stream.parent_snapshot = readSnapshotRef(raw.parent_snapshot, atPath(path, 'parent_snapshot'));
  }
  const overlay = readOverlay(raw.overlay, atPath(path, 'overlay'));
  if (overlay !== undefined) {
    stream.overlay = overlay;
  }
  const principal = readOptionalIdentifier(raw.principal, atPath(path, 'principal'));
  if (principal !== undefined) {
    stream.principal = principal;
  }
  if (raw.note !== null && raw.note !== undefined) {
    stream.note = readText(raw.note, atPath(path, 'note'));
  }
  if (raw.questions !== null && raw.questions !== undefined) {
    const questionsPath = atPath(path, 'questions');
    stream.questions = readArray(raw.questions, questionsPath).map(
      (item, i) => readStreamQuestion(item, atPath(questionsPath, i)),
    );
  }
  const roots = readOptionalIdentifiers(raw.roots, atPath(path, 'roots'));
  if (roots !== undefined) {
    stream.roots = roots;
  }
  const tiers = readTiers(raw.tiers, atPath(path, 'tiers'));
  if (tiers !== undefined) {
    stream.tiers = tiers;
  }
  if (raw.lenses !== null && raw.lenses !== undefined) {
    const lensesPath = atPath(path, 'lenses');
    stream.lenses = readArray(raw.lenses, lensesPath).map(
      (item, i) => readStreamLens(item, atPath(lensesPath, i)),
    );
  }
  return stream;
}

/** `stream.json`: the same record behind the `gyld.stream.v1` envelope gate. */
export function readStream(value: unknown): GyldStream {
  readEnvelope(value, STREAM_FORMAT);
  return readStreamRecord(value, STREAM_FORMAT);
}

/**
 * `streams.json`. The referential check is the one spec 4.4 states: deleting a
 * stream with children is refused because the children would lose their import
 * chain, so a `parent` named in the index must be an id the index carries.
 * Nothing else is cross-checked: the index is a census, not a derivation.
 */
export function readStreamsIndex(value: unknown): GyldStreamsIndex {
  const raw = readEnvelope(value, STREAMS_FORMAT);
  const path = STREAMS_FORMAT;
  const index: GyldStreamsIndex = {
    format: STREAMS_FORMAT,
    lineage: readIdentifier(raw.lineage, atPath(path, 'lineage')),
    streams: readArray(raw.streams, atPath(path, 'streams')).map(
      (item, i) => readStreamRecord(item, atPath(atPath(path, 'streams'), i)),
    ),
    written: readIdentifier(raw.written, atPath(path, 'written')),
  };
  const lineages = readOptionalIdentifiers(raw.lineages, atPath(path, 'lineages'));
  if (lineages !== undefined) {
    index.lineages = lineages;
  }
  const ids = new Set(index.streams.map((s) => s.id));
  index.streams.forEach((stream, i) => {
    if (stream.parent !== undefined) {
      requireKnown(
        stream.parent, ids, 'a stream in this index',
        atPath(atPath(atPath(path, 'streams'), i), 'parent'),
      );
    }
  });
  return index;
}
