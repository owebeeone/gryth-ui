import type {
  GyldProjection, ProjectionAssertion, ProjectionDefinition, ProjectionOccurrence,
  QualifiedSlot,
} from '../contract';
import type { DecideNowQuestion, GyldDecideNow } from '../contract';
import type { GyldBundle, GyldFault, GyldLoadStatus } from '../store/state';

// Step 1.2: the index and the record view, as PURE functions over the emitted
// bundle. Two taps wrap them; nothing here touches a grip, a clock or the DOM.
//
// THE RULE (spec section 3.5): indexing only. Every value below is a record
// that Gyld emitted, or a map or a list OF those records keyed by an id or a
// slot that Gyld emitted. Nothing is folded: a question's status, its tier and
// whether it is answerable now are read out of `decide-now.json`, never
// computed here, and an id that does not resolve is reported as unresolved
// rather than guessed at.

/** A record's sort, as `query.inspect` names it. */
export type RecordSort = 'occurrence' | 'assertion' | 'definition';

export interface SlotCollision {
  slot: QualifiedSlot;
  ids: string[];
}

export interface GyldRecords {
  status: GyldLoadStatus;
  stream: string;
  occurrences: ReadonlyMap<string, ProjectionOccurrence>;
  assertions: ReadonlyMap<string, ProjectionAssertion>;
  definitions: ReadonlyMap<string, ProjectionDefinition>;
  /** Qualified slot to occurrence id: the cross-stream identity join (R1). */
  occurrenceBySlot: ReadonlyMap<QualifiedSlot, string>;
  /** Qualified slot to assertion id, the same join for assertions. */
  assertionBySlot: ReadonlyMap<QualifiedSlot, string>;
  /** Occurrence id to the assertions it OWNS, in emitted order. */
  owned: ReadonlyMap<string, string[]>;
  /** Occurrence id to every assertion that references it in any role or as
   *  owner: the incidence `query.inspect` uses, built from emitted refs only. */
  incident: ReadonlyMap<string, string[]>;
  /** Occurrence id to its child occurrences, from the emitted parent chain. */
  children: ReadonlyMap<string, string[]>;
  /** Two records that claim one slot. Reported, never resolved by choosing. */
  collisions: SlotCollision[];
  counts: { occurrences: number; assertions: number; definitions: number };
}

const NO_RECORDS: GyldRecords = Object.freeze({
  status: 'unset',
  stream: '',
  occurrences: new Map(),
  assertions: new Map(),
  definitions: new Map(),
  occurrenceBySlot: new Map(),
  assertionBySlot: new Map(),
  owned: new Map(),
  incident: new Map(),
  children: new Map(),
  collisions: [],
  counts: { occurrences: 0, assertions: 0, definitions: 0 },
});

export const RECORDS_UNSET = NO_RECORDS;

function push(index: Map<string, string[]>, key: string, value: string): void {
  const held = index.get(key);
  if (held) {
    held.push(value);
    return;
  }
  index.set(key, [value]);
}

function claim(
  index: Map<string, string>,
  collisions: Map<string, string[]>,
  slot: string,
  id: string,
): void {
  const held = index.get(slot);
  if (held === undefined) {
    index.set(slot, id);
    return;
  }
  if (held === id) {
    return;
  }
  const known = collisions.get(slot);
  if (known) {
    known.push(id);
    return;
  }
  collisions.set(slot, [held, id]);
}

/** Every occurrence one assertion names, as owner or in any role. */
export function referencedOccurrences(assertion: ProjectionAssertion): string[] {
  const ids = [assertion.owner.occurrence];
  for (const role of Object.values(assertion.roles)) {
    for (const ref of role.refs) {
      ids.push(ref.occurrence);
    }
  }
  return ids;
}

/** Build the id and slot index over one emitted projection. */
export function indexProjection(
  projection: GyldProjection,
  stream: string,
  status: GyldLoadStatus = 'ok',
): GyldRecords {
  const occurrences = new Map<string, ProjectionOccurrence>();
  const assertions = new Map<string, ProjectionAssertion>();
  const definitions = new Map<string, ProjectionDefinition>();
  const occurrenceBySlot = new Map<string, string>();
  const assertionBySlot = new Map<string, string>();
  const owned = new Map<string, string[]>();
  const incident = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const collided = new Map<string, string[]>();

  for (const occurrence of projection.occurrences) {
    occurrences.set(occurrence.id, occurrence);
    claim(occurrenceBySlot, collided, occurrence.source.qualified_slot, occurrence.id);
    if (occurrence.parent !== undefined) {
      push(children, occurrence.parent, occurrence.id);
    }
  }
  for (const assertion of projection.assertions) {
    assertions.set(assertion.id, assertion);
    claim(assertionBySlot, collided, assertion.source.qualified_slot, assertion.id);
    push(owned, assertion.owner.occurrence, assertion.id);
    const seen = new Set<string>();
    for (const id of referencedOccurrences(assertion)) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      push(incident, id, assertion.id);
    }
  }
  for (const [id, definition] of Object.entries(projection.definitions)) {
    definitions.set(id, definition);
  }
  return {
    status,
    stream,
    occurrences,
    assertions,
    definitions,
    occurrenceBySlot,
    assertionBySlot,
    owned,
    incident,
    children,
    collisions: [...collided.entries()].map(([slot, ids]) => ({ slot, ids })),
    counts: {
      occurrences: occurrences.size,
      assertions: assertions.size,
      definitions: definitions.size,
    },
  };
}

/** The index for one destination's bundle. A bundle with no projection is an
 *  index with nothing in it, carrying the bundle's own status so the window
 *  says "loading" or "absent" rather than "empty graph". */
export function recordsOf(bundle: GyldBundle): GyldRecords {
  if (bundle.projection === undefined) {
    return { ...NO_RECORDS, status: bundle.status, stream: bundle.stream };
  }
  return indexProjection(bundle.projection, bundle.stream, bundle.status);
}

// ---------------------------------------------------------------------------
// The record view: the `gyld.inspect-record.v1` shape, composed by indexing.
// ---------------------------------------------------------------------------

export interface GyldRecordView {
  status: GyldLoadStatus;
  stream: string;
  /** What was asked for: a qualified slot, or a record id. */
  ref: string;
  sort?: RecordSort;
  id?: string;
  occurrence?: ProjectionOccurrence;
  assertion?: ProjectionAssertion;
  definition?: ProjectionDefinition;
  /** Definition ids reached from this record, in `query.inspect`'s order of
   *  discovery: the seed, then its bases, owner acceptance and role
   *  acceptance, transitively. */
  definitionClosure?: string[];
  /** Every assertion incident to this record, exactly as `query.inspect`
   *  selects them: by reference for an occurrence, by relation for a
   *  definition, itself for an assertion. */
  assertions?: ProjectionAssertion[];
  /** The emitted decide-now row, when this record is a question the stream
   *  listed. Read whole; no field of it is recomputed. */
  question?: DecideNowQuestion;
  fault?: GyldFault;
}

const ACCEPTS = 'accepts';

function acceptedBy(value: unknown): string[] {
  if (value === null || typeof value !== 'object') {
    return [];
  }
  const accepted: string[] = [];
  const entry = (value as Record<string, unknown>)[ACCEPTS];
  if (typeof entry === 'string' && entry !== '') {
    accepted.push(entry);
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (nested !== null && typeof nested === 'object') {
      accepted.push(...acceptedBy(nested));
    }
  }
  return accepted;
}

/**
 * The definition closure of one seed, following only emitted references:
 * `bases`, the owner's `accepts` and each role's `accepts`. A reference that
 * this projection does not carry is skipped, exactly as `_definition_closure`
 * skips an id the catalogue does not hold.
 */
export function definitionClosure(
  definitions: ReadonlyMap<string, ProjectionDefinition>,
  seed: string,
): string[] {
  const selected: string[] = [];
  const seen = new Set<string>();
  const queue = [seed];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (seen.has(id)) {
      continue;
    }
    const definition = definitions.get(id);
    if (definition === undefined) {
      continue;
    }
    seen.add(id);
    selected.push(id);
    queue.push(...definition.bases);
    queue.push(...acceptedBy(definition.owner));
    queue.push(...acceptedBy(definition.roles));
  }
  return selected;
}

function incidentAssertions(
  records: GyldRecords,
  sort: RecordSort,
  id: string,
): ProjectionAssertion[] {
  if (sort === 'assertion') {
    const assertion = records.assertions.get(id);
    return assertion === undefined ? [] : [assertion];
  }
  if (sort === 'definition') {
    return [...records.assertions.values()].filter((a) => a.relation === id);
  }
  return (records.incident.get(id) ?? [])
    .map((assertionId) => records.assertions.get(assertionId))
    .filter((a): a is ProjectionAssertion => a !== undefined);
}

/** What `ref` names, or a fault saying why nothing does. A ref is looked up as
 *  a qualified slot first, because that is the identity that survives a
 *  restream, then as a record id. */
function locate(
  records: GyldRecords,
  ref: string,
): { sort: RecordSort; id: string } | GyldFault {
  const occurrenceBySlot = records.occurrenceBySlot.get(ref);
  const assertionBySlot = records.assertionBySlot.get(ref);
  if (occurrenceBySlot !== undefined && assertionBySlot !== undefined) {
    return {
      path: ref,
      message: 'slot names both an occurrence and an assertion, so the sort must be given',
      code: 'AMBIGUOUS_REFERENCE',
    };
  }
  if (occurrenceBySlot !== undefined) {
    return { sort: 'occurrence', id: occurrenceBySlot };
  }
  if (assertionBySlot !== undefined) {
    return { sort: 'assertion', id: assertionBySlot };
  }
  const sorts: RecordSort[] = [];
  if (records.occurrences.has(ref)) {
    sorts.push('occurrence');
  }
  if (records.assertions.has(ref)) {
    sorts.push('assertion');
  }
  if (records.definitions.has(ref)) {
    sorts.push('definition');
  }
  if (sorts.length > 1) {
    return {
      path: ref,
      message: `record id names a ${sorts.join(' and a ')}, so the sort must be given`,
      code: 'AMBIGUOUS_REFERENCE',
    };
  }
  if (sorts.length === 1) {
    return { sort: sorts[0], id: ref };
  }
  return { path: ref, message: 'no record of this stream carries that slot or id', code: 'MISSING_REFERENCE' };
}

/**
 * Compose the record view for one ref.
 *
 * What it does NOT carry, because the projection does not: the snapshot's
 * `context` and `history` blocks that `query.inspect` returns, and the
 * obligations, which no emitted decision bundle has yet. A window renders
 * those as not emitted rather than as empty.
 */
export function recordView(
  records: GyldRecords,
  ref: string,
  decideNow?: GyldDecideNow,
): GyldRecordView {
  if (ref === '') {
    return { status: 'unset', stream: records.stream, ref };
  }
  if (records.status !== 'ok') {
    return { status: records.status, stream: records.stream, ref };
  }
  const found = locate(records, ref);
  if ('path' in found) {
    return { status: 'absent', stream: records.stream, ref, fault: found };
  }
  const { sort, id } = found;
  const view: GyldRecordView = { status: 'ok', stream: records.stream, ref, sort, id };
  let seed: string | undefined;
  if (sort === 'occurrence') {
    const occurrence = records.occurrences.get(id) as ProjectionOccurrence;
    view.occurrence = occurrence;
    seed = occurrence.definition;
  } else if (sort === 'assertion') {
    const assertion = records.assertions.get(id) as ProjectionAssertion;
    view.assertion = assertion;
    seed = assertion.relation;
  } else {
    view.definition = records.definitions.get(id) as ProjectionDefinition;
    seed = id;
  }
  view.definitionClosure = seed === undefined ? [] : definitionClosure(records.definitions, seed);
  view.assertions = incidentAssertions(records, sort, id);
  const slot = view.occurrence?.source.qualified_slot;
  if (slot !== undefined && decideNow !== undefined) {
    const question = decideNow.questions.find((row) => row.slot === slot);
    if (question !== undefined) {
      view.question = question;
    }
  }
  return view;
}

export const RECORD_UNSET: GyldRecordView = Object.freeze({
  status: 'unset', stream: '', ref: '',
});

/** What a qualified slot is CALLED, when this destination's projection carries
 *  the record; the slot itself when it does not. Never a name spelled out of
 *  the slot: an unindexed slot reads as the slot, which is honest. */
export function slotLabel(records: GyldRecords | undefined, slot: string): string {
  const id = records?.occurrenceBySlot.get(slot);
  const occurrence = id === undefined ? undefined : records?.occurrences.get(id);
  return occurrence?.label ?? slot;
}
