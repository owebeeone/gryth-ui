import type {
  DecideNowQuestion, DecideNowRuling, GyldDecideNow, GyldLens, ProjectionDefinition,
  SnapshotRef, StreamLens,
} from '../contract';
import { blockedSays } from '../browser/card';
import { emittedMemberFor, perspectiveOptions } from '../browser/perspectives';
import { PreviewPerspective } from '../preview/neighbourhood';
import { slotLabel, type GyldRecordView, type GyldRecords } from '../records/records';
import type { GyldBundle } from '../store/state';

// The ASK CONTEXT ENVELOPE, format `gyld.ask-context.v1`
// (gyld-wz/dev-docs/ui/GyldAskAgent.md section 3).
//
// It is NOT in `src/contract/`, and deliberately: everything there READS a
// file Gyld emitted, and this is the one document this package WRITES. It is
// what `explain`'s `args.context` carries.
//
// `askEnvelope()` is a pure function over grip values and nothing else — no
// grip, no DOM, no fetch, no clock — exactly as `cardFor` and `pickOutcome`
// are, so a golden envelope is asserted without a desk.
//
// Three properties hold BY CONSTRUCTION (section 3):
//
//  - Every field is a READ of an emitted value joined by an emitted id, which
//    is what GyldGrythPlugins.md 3.5 permits by name.
//  - Nothing is computed. A stream with no decide-now list yields a status
//    block that SAYS so (`emitted: false`) rather than one with a guessed
//    status, and a record that list does not carry says that instead
//    (`listed: false`).
//  - The big things travel as POINTERS. The neighbourhood lens is a path, a
//    perspective and, where a published pointer gave them, a digest and a
//    byte count — never geometry.

export const ASK_CONTEXT_FORMAT = 'gyld.ask-context.v1';

/** The record the reader asked about, as this stream drew and declared it. */
export interface AskContextRecord {
  /** The qualified slot: the identity that survives a restream (R1). */
  slot: string;
  /** The decide-now row's own emitted member name, or what the projection
   *  calls the record when this stream lists no row for it. */
  label: string;
  /** The question's own text, as the host DREW it inside the box. */
  lines: string[];
  /** The declared definition's `kind`, `label` and `description`. Empty when
   *  this stream's projection carries no record for the slot. */
  kind: string;
  definition: string;
  description: string;
}

/**
 * The emitted status block.
 *
 * `emitted` and `listed` are the two absences section 3 insists are said
 * rather than filled in: a stream that emitted no `decide-now.json` at all,
 * and a list that carries no row for this record, are different facts and
 * neither is a status.
 */
export interface AskContextStatus {
  /** Whether this stream emitted a decide-now list at all. */
  emitted: boolean;
  /** Whether that list carries a row for this record. */
  listed: boolean;
  declared: string;
  effective: string;
  tier: string;
  answerable_now: boolean;
  /** The ONE emitted reason it is not answerable now, through `blockedSays`.
   *  Empty when it is answerable, and empty when there is no row to ask. */
  reason: string;
}

export interface AskContextAlternative {
  slot: string;
  label: string;
  /** The alternative's own declared definition description. */
  description: string;
  /** True when the question's own emitted `preferred` names this one. */
  preferred: boolean;
}

/** The ruling that decided this question, as the chain emitted it. */
export interface AskContextRuling {
  slot: string;
  text: string;
  sources: string[];
  /** The stage-one principal stub, carried as data (owner ruling O6). Empty
   *  when the record carried none. */
  principal: string;
  stamp: string;
  /** Whether this ruling still stands in this stream's chain. Read, never
   *  folded: a ruling an ancestor made that a child reopened is carried with
   *  `live: false` rather than dropped. */
  live: boolean;
}

/**
 * One source tag this record or its ruling cites, and what this build's index
 * made of it.
 *
 * An unresolved tag is SAID, never hidden (section 5): it travels with
 * `resolved: false` and the reason, so the agent is told the citation exists
 * and resolves to nothing rather than never hearing of it.
 */
export interface AskContextSource {
  tag: string;
  /** Where the citation came from: the ruling's own `sources`, or the source
   *  index's `cited_by` for this record. */
  cites: string;
  resolved: boolean;
  document?: string;
  heading?: string;
  lines?: [number, number];
  passage?: string;
  digest?: string;
  /** Why it resolved to nothing, when it did not. */
  reason?: string;
}

/** Which citation list a tag came from. Two names, said once. */
export const CITED_BY_RULING = 'ruling';
export const CITED_BY_RECORD = 'record';

/**
 * The neighbourhood lens, as a POINTER.
 *
 * `digest` and `bytes` come from the published `gyld.lens` pointer. A desk
 * reading a STATIC root has no published pointer, so they are absent rather
 * than invented: the supplier resolves the file the `path` names out of the
 * build `latest.json` names, which is the same question every other verb asks.
 */
export interface AskContextNeighbourhood {
  stream: string;
  perspective: string;
  /** The bundle-relative path the stream's own lens manifest gave. */
  path: string;
  digest?: string;
  bytes?: number;
  /** True when this is the emitted `neighbourhood` member OF this question,
   *  false when the stream emitted none and this is the `decisions` lens the
   *  members are restricted out of. */
  member: boolean;
}

export interface GyldAskContext {
  format: typeof ASK_CONTEXT_FORMAT;
  stream: string;
  perspective: string;
  /** The identity the decide-now list was built from. Null when this stream
   *  emitted no list, because the snapshot is that file's own field. */
  snapshot: SnapshotRef | null;
  record: AskContextRecord;
  status: AskContextStatus;
  alternatives: AskContextAlternative[];
  /** The recorded lean, or null. */
  lean: string | null;
  ruling: AskContextRuling | null;
  sources: AskContextSource[];
  /** The questions this one waits on. */
  requires: string[];
  /** The questions that wait on this one. */
  unlocks: string[];
  /** The triggers it waits on. */
  gates: string[];
  neighbourhood: AskContextNeighbourhood | null;
  /** The desk principal the run is attributed to. Empty on a composition with
   *  no supplier attached, which is a rendered state and not a default. */
  principal: string;
  conversation: string;
  /** What the reader typed. Empty until they type. */
  question: string;
}

/** Everything the envelope is composed from: grip values, already resolved by
 *  the window, and nothing else. */
export interface AskEnvelopeInput {
  /** `Gyld.Dest.Stream`. */
  stream: string;
  /** `Gyld.Dest.Perspective`. */
  perspective: string;
  /** The picked `SceneNode.slot`, which is also `Gyld.Dest.Ref`. */
  slot: string;
  /** `Gyld.Lens`, for the question's own drawn text. */
  lens?: GyldLens;
  /** `Gyld.DecideNow`. Absent means this stream emitted no list. */
  decideNow?: GyldDecideNow;
  /** `Gyld.Records`, the index over the emitted projection. */
  records?: GyldRecords;
  /** `Gyld.Record`, this window's record view. */
  record?: GyldRecordView;
  /** `Gyld.Bundle`, for the stream's own lens manifest. */
  bundle?: GyldBundle;
  /** `Gyld.Ops` → `wire.principal`. */
  principal?: string;
  /** `Gyld.Tab.Ask.Conversation`. */
  conversation?: string;
  /** `Gyld.Tab.Ask.Draft`. */
  question?: string;
}

/** The relation whose emitted adjacency `requires` and `unlocks` are the two
 *  readings of. Named once, here, rather than spelled at two call sites. */
const REQUIRES = 'Requires';

/** The role of a `Requires` assertion that names the PREREQUISITES. The owner
 *  is the dependent question; the role holds what it waits on. */
const REQUIRES_ROLE = 'questions';

function definitionFor(
  records: GyldRecords | undefined,
  slot: string,
): ProjectionDefinition | undefined {
  const id = records?.occurrenceBySlot.get(slot);
  const occurrence = id === undefined ? undefined : records?.occurrences.get(id);
  return occurrence === undefined ? undefined : records?.definitions.get(occurrence.definition);
}

/** The declared definition of the record the window is on: the view's own when
 *  the ref names a definition, and the occurrence's declared one otherwise. */
function recordDefinition(
  records: GyldRecords | undefined,
  view: GyldRecordView | undefined,
  slot: string,
): ProjectionDefinition | undefined {
  return view?.definition ?? definitionFor(records, slot);
}

/** The drawn lines of one box, from the lens this window is on. A slot this
 *  picture does not draw has no drawn text, which is an empty list and not a
 *  substitute. */
function drawnLines(lens: GyldLens | undefined, slot: string): string[] {
  return lens?.nodes.find((node) => node.slot === slot)?.text ?? [];
}

/** Every emitted `Requires` assertion, as `{dependent slot, prerequisite
 *  slots}` pairs. One walk, read both ways by the two callers below. */
function requiresEdges(
  records: GyldRecords | undefined,
): { dependent: string; prerequisites: string[] }[] {
  if (records === undefined) {
    return [];
  }
  const edges: { dependent: string; prerequisites: string[] }[] = [];
  for (const assertion of records.assertions.values()) {
    if (records.definitions.get(assertion.relation)?.label !== REQUIRES) {
      continue;
    }
    const owner = records.occurrences.get(assertion.owner.occurrence);
    if (owner === undefined) {
      continue;
    }
    const prerequisites: string[] = [];
    for (const ref of assertion.roles[REQUIRES_ROLE]?.refs ?? []) {
      const held = records.occurrences.get(ref.occurrence);
      if (held !== undefined) {
        prerequisites.push(held.source.qualified_slot);
      }
    }
    edges.push({ dependent: owner.source.qualified_slot, prerequisites });
  }
  return edges;
}

/** The list, in the order the first source gave, with nothing repeated. */
function united(...lists: readonly string[][]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (item !== '' && !out.includes(item)) {
        out.push(item);
      }
    }
  }
  return out;
}

function statusOf(
  decideNow: GyldDecideNow | undefined,
  question: DecideNowQuestion | undefined,
): AskContextStatus {
  if (question === undefined) {
    return {
      emitted: decideNow !== undefined,
      listed: false,
      declared: '',
      effective: '',
      tier: '',
      answerable_now: false,
      reason: '',
    };
  }
  return {
    emitted: true,
    listed: true,
    declared: question.declared_status,
    effective: question.effective_status,
    tier: question.tier,
    answerable_now: question.answerable_now,
    reason: blockedSays(question),
  };
}

/**
 * The ruling that decided this question, by the EMITTED join first.
 *
 * The row's own `ruling` field names the ruling that decided it, so that is
 * the join used when there is one; `decides` is the fallback for a record the
 * list carries no row for. Nothing folds the chain: which rulings stand is
 * `live` as Gyld wrote it.
 */
function rulingFor(
  decideNow: GyldDecideNow | undefined,
  question: DecideNowQuestion | undefined,
  slot: string,
): DecideNowRuling | undefined {
  if (decideNow === undefined) {
    return undefined;
  }
  if (question?.ruling !== undefined) {
    const named = decideNow.rulings.find((row) => row.slot === question.ruling);
    if (named !== undefined) {
      return named;
    }
  }
  return decideNow.rulings.find((row) => row.decides === slot);
}

function neighbourhoodFor(
  bundle: GyldBundle | undefined,
  stream: string,
  perspective: string,
  slot: string,
): AskContextNeighbourhood | null {
  const manifest = bundle?.lenses;
  const entryFor = (name: string): StreamLens | undefined =>
    manifest?.find((held) => held.perspective === name && held.emitted);
  // The emitted member OF this question, decided by the manifest's own
  // `family` and `parameter` and never by spelling a file name.
  const member = emittedMemberFor(perspectiveOptions(bundle, perspective), slot);
  const entry = member === undefined
    ? entryFor(PreviewPerspective.SOURCE)
    : entryFor(member.perspective);
  if (entry === undefined || entry.file === undefined) {
    return null;
  }
  return {
    stream,
    perspective: entry.perspective,
    path: entry.file,
    member: member !== undefined,
  };
}

/** The tags a ruling cites, as sources this build's index resolved nothing
 *  for. Step 0.4 fills the resolution in from `Gyld.Sources`. */
function sourcesOf(ruling: DecideNowRuling | undefined): AskContextSource[] {
  return (ruling?.sources ?? []).map((tag) => ({
    tag,
    cites: CITED_BY_RULING,
    resolved: false,
    reason: 'this build emitted no source index',
  }));
}

/**
 * Compose the envelope.
 *
 * Every branch here is an ABSENCE said as one: a stream with no decide-now
 * list, a list with no row for this record, a stream that emitted no
 * neighbourhood member, a desk with no supplier attached. None of them is
 * filled in with something else.
 */
export function askEnvelope(input: AskEnvelopeInput): GyldAskContext {
  const { decideNow, records, slot } = input;
  const question = decideNow?.questions.find((row) => row.slot === slot);
  const definition = recordDefinition(records, input.record, slot);
  const ruling = rulingFor(decideNow, question, slot);
  const edges = requiresEdges(records);
  const prerequisites = edges
    .filter((edge) => edge.dependent === slot)
    .flatMap((edge) => edge.prerequisites);
  const dependents = edges
    .filter((edge) => edge.prerequisites.includes(slot))
    .map((edge) => edge.dependent);
  return {
    format: ASK_CONTEXT_FORMAT,
    stream: input.stream,
    perspective: input.perspective,
    snapshot: decideNow?.snapshot ?? null,
    record: {
      slot,
      label: question?.label ?? slotLabel(records, slot),
      lines: drawnLines(input.lens, slot),
      kind: definition?.kind ?? '',
      definition: definition?.label ?? '',
      description: definition?.description ?? '',
    },
    status: statusOf(decideNow, question),
    // O2: a decided question KEEPS its offers, with the selected alternative
    // marked by `ruling`, so the list is composed either way.
    alternatives: (question?.offers ?? []).map((offer) => ({
      slot: offer,
      label: slotLabel(records, offer),
      description: definitionFor(records, offer)?.description ?? '',
      preferred: question?.preferred === offer,
    })),
    lean: question?.preferred ?? null,
    ruling: ruling === undefined ? null : {
      slot: ruling.slot,
      text: ruling.text,
      sources: ruling.sources,
      principal: ruling.principal ?? '',
      stamp: ruling.stamp ?? '',
      live: ruling.live,
    },
    sources: sourcesOf(ruling),
    requires: united(prerequisites, question?.blocked_by ?? []),
    unlocks: united(dependents),
    gates: question?.gated_by ?? [],
    neighbourhood: neighbourhoodFor(input.bundle, input.stream, input.perspective, slot),
    principal: input.principal ?? '',
    conversation: input.conversation ?? '',
    question: input.question ?? '',
  };
}

/**
 * The conversation id the window that opens the menu mints:
 * `conv-<tabId>-<slot>-<stamp>` (section 6).
 *
 * It rides in the envelope, so a follow-up is the SAME verb with the same id
 * and a new question rather than a second verb. Pure: the caller supplies the
 * stamp, because a clock in a render is not this package's to read.
 */
export function conversationId(tabId: string, slot: string, stamp: number): string {
  return `conv-${tabId === '' ? 'tab' : tabId}-${slot}-${stamp}`;
}
