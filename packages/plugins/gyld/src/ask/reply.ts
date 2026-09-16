import type { GyldOutputRecord } from '../ops/ops';

// THE REPLY, as the `gyld.ask` log carries it (GyldAskAgent.md section 4, "The
// reply", step 1.5).
//
// Everything here is PURE: a record shape, the streams a record can be on, and
// one fold from a conversation's log to what the window draws. No grip, no
// DOM, no clock — so a streamed answer, a citation and every refusal are
// asserted against records written by hand.
//
// Three rules the fold is written to, each from the design:
//
//  - ABSENT RECORDS ARE ABSENT LINES, never blank ones (`src/ops/ops.ts`). A
//    record on a stream this consumer has never heard of draws nothing where
//    it carries nothing, and its own line where it carries one: a `draft`
//    record, which Phase 3 owns, is not an error here and is not invented
//    into one either.
//  - NOTHING IS REPAIRED. The prose is the chunks the model streamed, joined
//    in sequence order and otherwise verbatim; a citation is the passage the
//    supplier resolved; the exit is the run's own.
//  - A REFUSAL IS DATA. The four refusals of section 4 arrive either as the
//    exchange's own `ok: false` (the window prints it beside the run) or, for
//    one stopped mid-stream, as a line and an `end` record with a non-zero
//    exit — with the partial text KEPT, because half an answer that says it is
//    half an answer is data.

/**
 * One source the supplier resolved and the answer cited, as the `citation`
 * record carries it (`glade-gyld/src/sources.rs`, `ResolvedSource`).
 *
 * `resolved: false` is a first-class value, not a missing entry: the record
 * cites the tag, this build's index resolves it to nothing, and the reason is
 * said (MDV-7).
 */
export interface GyldAskCitation {
  tag: string;
  /** Which citation list named it: `record`, `ruling`, or the index's own
   *  field name when the envelope did not carry the tag at all. */
  cites?: string;
  resolved?: boolean;
  /** The `id` of the index document that declares it. */
  document?: string;
  /** That document's path, relative to the index's own root. */
  path?: string;
  heading?: string;
  /** The inclusive first and last line of the passage, 1-based. */
  lines?: number[];
  passage?: string;
  digest?: string;
  /** True when the index capped the passage, so it is a prefix. */
  truncated?: boolean;
  /** Why it resolved to nothing, when it did not. */
  reason?: string;
}

/**
 * One record on the `gyld.ask` log.
 *
 * It is the `gwz.output` field shape plus two fields (section 4, "The reply"),
 * so one consumer folds this surface and `gyld.output`: the CONVERSATION this
 * turn belongs to, which is also the log's key, and the RECORD a `citation`
 * (and, from Phase 3, a `draft`) carries.
 */
export interface GyldAskRecord extends GyldOutputRecord {
  conversation?: string;
  record?: GyldAskCitation;
}

/**
 * The streams a reply record can be on.
 *
 * An object, not a label branched on at each render site (AGENTS.md, "no magic
 * strings when the concept has semantics"). A stream not named here is not an
 * error: it is a record this consumer has nothing to draw for, which is
 * exactly what section 4 says a `citation` looks like to an older consumer.
 */
export class AskStream {
  private constructor(readonly name: string) {}

  /**
   * The reader's own question, as they typed it and before anything is asked
   * of a model (`glade-gyld/src/envelope.rs`, `ASK_QUESTION`).
   *
   * Section 6 says the transcript IS the log share, and this is the half of a
   * turn the reader wrote: it opens the turn, so a conversation reads as
   * questions and answers rather than as answers to questions nobody kept —
   * and a turn the model then refused is still a turn, with its question on
   * it. The window never draws the question out of its own draft box, because
   * what a reader typed is not what was asked until the supplier says so.
   */
  static readonly QUESTION = new AskStream('question');

  /** One text chunk, as the model streamed it. */
  static readonly ANSWER = new AskStream('answer');

  /** One resolved (or unresolved) source, in `record`. */
  static readonly CITATION = new AskStream('citation');

  /** A ruling the agent drafted, in `record`. Phase 3 renders it; step 1.5
   *  draws nothing for it rather than pretending it is prose. */
  static readonly DRAFT = new AskStream('draft');

  /** The turn's close: `done`, the exit, and on a refusal a line saying why. */
  static readonly END = new AskStream('end');

  static readonly ALL: readonly AskStream[] = Object.freeze([
    AskStream.QUESTION, AskStream.ANSWER, AskStream.CITATION, AskStream.DRAFT,
    AskStream.END,
  ]);

  static byName(name: string): AskStream | undefined {
    return AskStream.ALL.find((stream) => stream.name === name);
  }
}

/** One thing said on a turn that is not the answer's prose: the supplier's own
 *  `stderr`, and the reason an `end` record closed a refused turn. */
export interface AskSaid {
  /** The stream it arrived on, so the window can mark a fault as one. */
  stream: string;
  text: string;
}

/** One turn of the conversation: one `explain` run, from its first chunk to
 *  its `end`. */
export interface AskTurn {
  /** The run this turn was, kept on every record for the audit trail. */
  runId: string;
  /** Who the run was attributed to, as the records carried it. */
  principal: string;
  /** What was ASKED, as the `question` record carried it. Empty is an absent
   *  record and is drawn as nothing, never as a blank line. */
  question: string;
  /** The answer, as the `answer` records carried it: the chunks joined in
   *  sequence order, with nothing inserted between them. */
  prose: string;
  citations: GyldAskCitation[];
  said: AskSaid[];
  /** Whether an `end` record has closed this turn. */
  ended: boolean;
  /** The run's own exit, when it ended. */
  exit?: number;
}

export interface AskReply {
  turns: AskTurn[];
  /** How many records of this conversation were folded at all, so a window
   *  can tell "nothing has come back yet" from "a turn that said nothing". */
  records: number;
}

export const NO_REPLY: AskReply = Object.freeze({ turns: [], records: 0 });

/**
 * Whether one record belongs to this window's conversation.
 *
 * A record that NAMES another conversation is another conversation's and is
 * dropped, whatever mount it arrived on. A record that names none claims
 * nothing, and the mount it arrived on is keyed by the conversation, so it is
 * this one's: the surface's own key is the fact, not a guess.
 */
function ours(record: GyldAskRecord, conversation: string): boolean {
  const named = record.conversation;
  return named === undefined || named === '' || named === conversation;
}

const DIGITS = /^(.*?)(\d+)$/;

/**
 * Order two run ids.
 *
 * The supplier mints `run-<n>` from a counter (`glade-gyld/src/supplier.rs`),
 * so a plain string order would put `run-10` before `run-2` and show a
 * conversation's turns out of order. Two ids that share a prefix and end in
 * digits are ordered by those digits; anything else is ordered as text. This
 * is ORDERING, not a Gyld fact: nothing is read out of a run id.
 */
export function compareRunIds(left: string, right: string): number {
  const a = DIGITS.exec(left);
  const b = DIGITS.exec(right);
  if (a !== null && b !== null && a[1] === b[1]) {
    return Number(a[2]) - Number(b[2]);
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Records of this conversation, in turn order and, within a turn, in the
 *  order the supplier sequenced them. */
function ordered(
  records: readonly GyldAskRecord[],
  conversation: string,
): GyldAskRecord[] {
  return records
    .filter((record) => ours(record, conversation))
    .slice()
    .sort((left, right) => {
      const byRun = compareRunIds(left.run_id ?? '', right.run_id ?? '');
      return byRun !== 0 ? byRun : (left.seq ?? 0) - (right.seq ?? 0);
    });
}

/**
 * The conversation's own log, folded into the turns the window draws.
 *
 * A window folds ONLY its own conversation (section 6): the mount is keyed by
 * the conversation id, and a record that names another one is dropped here as
 * well, so two windows on one desk never draw each other's replies.
 */
export function foldAskReply(
  records: readonly GyldAskRecord[] | undefined,
  conversation: string,
): AskReply {
  if (records === undefined || records.length === 0 || conversation === '') {
    return NO_REPLY;
  }
  const mine = ordered(records, conversation);
  if (mine.length === 0) {
    return NO_REPLY;
  }
  const turns: AskTurn[] = [];
  let turn: AskTurn | undefined;
  for (const record of mine) {
    const runId = record.run_id ?? '';
    if (turn === undefined || turn.runId !== runId) {
      turn = {
        runId, principal: '', question: '', prose: '', citations: [], said: [],
        ended: false,
      };
      turns.push(turn);
    }
    if (turn.principal === '' && typeof record.principal === 'string') {
      turn.principal = record.principal;
    }
    fold(turn, record);
  }
  return { turns, records: mine.length };
}

/** One record onto its turn. Nothing is derived: each field is written where
 *  the record put it, and a record with nothing to draw draws nothing. */
function fold(turn: AskTurn, record: GyldAskRecord): void {
  const stream = AskStream.byName(record.stream ?? '');
  if (stream === AskStream.QUESTION) {
    // Joined in sequence order, like the prose and for the same reason: two
    // records are two chunks of one question, and nothing is repaired.
    turn.question += record.line ?? '';
    return;
  }
  if (stream === AskStream.ANSWER) {
    turn.prose += record.line ?? '';
    return;
  }
  if (stream === AskStream.CITATION) {
    if (record.record !== undefined) {
      turn.citations.push(record.record);
    }
    return;
  }
  if (stream === AskStream.END) {
    turn.ended = true;
    if (record.exit !== undefined) {
      turn.exit = record.exit;
    }
    // A refused turn closes with the reason ON the end record (section 4).
    said(turn, record);
    return;
  }
  if (stream === AskStream.DRAFT) {
    // Phase 3's record. Nothing is drawn for it here, and nothing is invented:
    // a consumer that has never heard of a record shows nothing for it.
    return;
  }
  // Every other stream — the supplier's own `stderr`, and whatever a later
  // version appends — is said where it carries a line and is silent where it
  // does not.
  said(turn, record);
}

function said(turn: AskTurn, record: GyldAskRecord): void {
  const text = record.line ?? '';
  if (text === '') {
    return;
  }
  turn.said.push({ stream: record.stream ?? '', text });
}

/** Whether a reply exists at all for this conversation, which is what decides
 *  the envelope's collapse (section 6: it stays visible, folded away). */
export function hasReply(reply: AskReply): boolean {
  return reply.records > 0;
}
