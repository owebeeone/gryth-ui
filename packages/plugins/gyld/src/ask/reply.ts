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
 * One ruling the agent DRAFTED, as the `draft` record carries it
 * (GyldAskAgent.md section 8; `glade-gyld/src/ask.rs`, `AskDraft`).
 *
 * It is an OFFER and nothing else. `drafted_by` is the model id, so a draft
 * can never be mistaken for a person's text; `alternative` is the model's own
 * string, verbatim and never corrected, and `alternative_slot` is the
 * envelope's qualified slot for it, which is present only when the envelope
 * actually offers it. A draft naming an alternative the envelope does not
 * offer arrives with `resolved: false` and the reason, and is drawn as one.
 */
export interface GyldAskDraft {
  /** The record it rules on: the ENVELOPE's own slot, never a name the model
   *  chose. */
  slot?: string;
  /** The alternative the model named, verbatim. */
  alternative?: string;
  /** The envelope's qualified slot for that alternative, when it offers one. */
  alternative_slot?: string;
  /** The one-sentence ruling, in the form the overlays use. */
  ruling_text?: string;
  /** The source tags the draft leans on, as the model named them. */
  sources?: string[];
  /** The model id that drafted it. */
  drafted_by?: string;
  /** Whether the envelope offers the alternative it names. */
  resolved?: boolean;
  /** Why it does not, when it does not. */
  reason?: string;
}

/**
 * One tool the agent reached for, as the `tool_call` record carries it
 * (GyldAskAgent.md 11.4; `glade-gyld/src/tools.rs`, `call_record`).
 *
 * `id` is the API's own `tool_use_id`, which is how a result is paired with
 * its call — by identity and never by position, because one turn may call two
 * tools at once.
 */
export interface GyldAskToolCall {
  id?: string;
  name?: string;
  /** The input the model composed, whole and uninterpreted. */
  input?: unknown;
}

/**
 * What one call answered with, as the `tool_result` record carries it
 * (`glade-gyld/src/tools.rs`, `ToolAnswer::record`).
 *
 * A tool that refused is `ok: false` with the reason in `summary`: a refusal
 * is data here as everywhere, and it is drawn rather than dropped.
 */
export interface GyldAskToolResult {
  id?: string;
  name?: string;
  ok?: boolean;
  /** The result text, already cut at the supplier's byte budget. */
  summary?: string;
  /** What it was BEFORE the cut. */
  bytes?: number;
  /** True when the budget cut it, so what is shown is a prefix. */
  truncated?: boolean;
}

/**
 * One tool step of a turn: the call, and the result when it has come back.
 *
 * A step with no `result` is a call still in flight, which is exactly what the
 * status line reads (`./busy.ts`). Nothing is invented for it: an open call is
 * drawn as an open call.
 */
export interface AskToolStep {
  /** The `tool_use_id` the two records share, or '' when the record carried
   *  none — in which case the pairing falls back to arrival order. */
  id: string;
  /** The tool's name, as the call gave it. */
  name: string;
  call: GyldAskToolCall;
  result?: GyldAskToolResult;
}

/**
 * One record on the `gyld.ask` log.
 *
 * It is the `gwz.output` field shape plus two fields (section 4, "The reply"),
 * so one consumer folds this surface and `gyld.output`: the CONVERSATION this
 * turn belongs to, which is also the log's key, and the RECORD a `citation`
 * or a `draft` carries.
 */
export interface GyldAskRecord extends GyldOutputRecord {
  conversation?: string;
  record?: GyldAskCitation | GyldAskDraft | GyldAskToolCall | GyldAskToolResult;
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

  /** A ruling the agent drafted, in `record`: an offer a human takes, edits
   *  or discards (section 8), never prose and never a ruling. */
  static readonly DRAFT = new AskStream('draft');

  /**
   * A tool the agent reached for, in `record` (11.4).
   *
   * It is appended BEFORE the call is run, so a window that folds it knows
   * what the turn is waiting on while it waits. A consumer that has never
   * heard of it draws nothing, which is the rule this surface already follows.
   */
  static readonly TOOL_CALL = new AskStream('tool_call');

  /** What that call answered, in `record` — including a refusal, which is
   *  data and is drawn as one. */
  static readonly TOOL_RESULT = new AskStream('tool_result');

  /**
   * One thing the call had to do differently, as one line
   * (`glade-gyld/src/envelope.rs`, `ASK_NOTE`).
   *
   * It is about the ENDPOINT, not about this turn: the output budget a local
   * model was given, a setting nobody has heard of. The same note comes back
   * on every turn of a conversation, so the window draws the LATEST one under
   * the composer rather than repeating it inside each reply.
   */
  static readonly NOTE = new AskStream('note');

  /** The turn's close: `done`, the exit, and on a refusal a line saying why. */
  static readonly END = new AskStream('end');

  static readonly ALL: readonly AskStream[] = Object.freeze([
    AskStream.QUESTION, AskStream.ANSWER, AskStream.CITATION, AskStream.DRAFT,
    AskStream.NOTE, AskStream.TOOL_CALL, AskStream.TOOL_RESULT, AskStream.END,
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
  /** The rulings this turn drafted, in the order it proposed them. An OFFER
   *  each, taken by a human or discarded (section 8); nothing here is a Gyld
   *  fact and nothing here reaches an overlay on its own. */
  drafts: GyldAskDraft[];
  /**
   * The tools this turn called, in the order it called them, each paired with
   * what it answered.
   *
   * ORDERED, because a turn is a loop (11.1) and what it did second is not
   * what it did first. Paired by the `tool_use_id` the two records share, so a
   * turn that called two tools at once still reads as two steps rather than as
   * four records in a row.
   */
  steps: AskToolStep[];
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
 * The supplier mints `run-<session>-<n>` (`glade-gyld/src/supplier.rs`), where
 * `<session>` is fixed-width base36 of that supplier process's start time and
 * `<n>` its run counter. So the ids of ONE session share a prefix and order by
 * their trailing digits — a plain string order would put `run-…-10` before
 * `run-…-2` and show a conversation's turns out of order — and the ids of
 * DIFFERENT sessions order as text, which at one tag width is time order too, so
 * an older supplier's runs still come first. Two ids that share a prefix and end
 * in digits are ordered by those digits; anything else is ordered as text. This
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
        runId, principal: '', question: '', prose: '', citations: [], drafts: [],
        steps: [], said: [], ended: false,
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
      // The `record` field carries the citation of a `citation` and the offer
      // of a `draft`: which it is, is the STREAM's own fact, so it is read
      // where the stream says and nowhere else.
      turn.citations.push(record.record as GyldAskCitation);
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
  if (stream === AskStream.TOOL_CALL) {
    if (record.record !== undefined) {
      const call = record.record as GyldAskToolCall;
      turn.steps.push({
        id: typeof call.id === 'string' ? call.id : '',
        name: typeof call.name === 'string' ? call.name : '',
        call,
      });
    }
    return;
  }
  if (stream === AskStream.TOOL_RESULT) {
    if (record.record !== undefined) {
      paired(turn, record.record as GyldAskToolResult);
    }
    return;
  }
  if (stream === AskStream.DRAFT) {
    // An OFFER on its turn, whole and uncorrected — including one the
    // supplier could not resolve, which is drawn as unresolved rather than
    // dropped (section 8, MDV-7).
    if (record.record !== undefined) {
      turn.drafts.push(record.record as GyldAskDraft);
    }
    return;
  }
  // Every other stream — the supplier's own `stderr`, and whatever a later
  // version appends — is said where it carries a line and is silent where it
  // does not.
  said(turn, record);
}

/**
 * One result onto the call it answers.
 *
 * By the `tool_use_id` the two records share — that is what the id is for, and
 * a turn that called two tools at once would otherwise pair them by luck. A
 * result whose id matches no open call is its own step, drawn with no input:
 * inventing a call for it would be the window making up a record the supplier
 * did not send, and dropping it would hide one it did (6.7, MDV-7).
 */
function paired(turn: AskTurn, result: GyldAskToolResult): void {
  const id = typeof result.id === 'string' ? result.id : '';
  const open = turn.steps.find(
    (step) => step.result === undefined && (id === '' || step.id === id),
  );
  if (open !== undefined) {
    open.result = result;
    return;
  }
  turn.steps.push({
    id,
    name: typeof result.name === 'string' ? result.name : '',
    call: {},
    result,
  });
}

/** Whether a step's call is still open: it landed and its result has not. */
export function stepOpen(step: AskToolStep): boolean {
  return step.result === undefined;
}

/** The call this turn is waiting on, or undefined when it waits on none. */
export function openStep(turn: AskTurn): AskToolStep | undefined {
  return turn.steps.find(stepOpen);
}

/**
 * The one line a folded card shows beside the tool's name: what it was asked.
 *
 * The input as JSON, on one line and bounded — a card is folded until a reader
 * opens it, and the whole of a tool's input is what opening it is for.
 */
export function stepSays(step: AskToolStep): string {
  const input = step.call.input;
  if (input === undefined) {
    return '';
  }
  const said = typeof input === 'string' ? input : JSON.stringify(input) ?? '';
  const oneLine = said.replace(/\s+/g, ' ').trim();
  return oneLine.length <= SAYS_CHARS
    ? oneLine
    : `${oneLine.slice(0, SAYS_CHARS)}…`;
}

/** How much of an input a folded card shows. One line of a narrow window. */
export const SAYS_CHARS = 72;

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

/**
 * What this turn SAID that belongs in the turn.
 *
 * Everything but the notes. A note is about the endpoint and repeats on every
 * turn of a conversation, so drawing it inside each reply is the same sentence
 * three times over the answer a reader is trying to read; it goes under the
 * composer instead, once (`latestNote`). Nothing is dropped: the two places
 * together are the whole of `said`.
 */
export function spoken(turn: AskTurn): AskSaid[] {
  return turn.said.filter((said) => said.stream !== AskStream.NOTE.name);
}

/**
 * The LATEST note of this conversation, or '' when it has none.
 *
 * The latest and not the first: a note says what the call had to do
 * differently, and the answer a reader is looking at is the last turn's.
 */
export function latestNote(reply: AskReply): string {
  for (let index = reply.turns.length - 1; index >= 0; index -= 1) {
    const notes = reply.turns[index].said
      .filter((said) => said.stream === AskStream.NOTE.name);
    if (notes.length > 0) {
      return notes[notes.length - 1].text;
    }
  }
  return '';
}

/** A turn's close, as the one small footer line the reply carries. */
export interface AskEndLine {
  /** What is drawn: the run and the state, and nothing else. */
  text: string;
  /** The exit and the attribution, for the reader who hovers it. */
  title: string;
}

/**
 * The run id and the end state, as ONE muted line.
 *
 * The whole of the metadata a finished reply carries. It was three lines —
 * the accept, the end, and the attribution — over every answer in the
 * transcript; the facts are unchanged and none is dropped, but the exit and
 * the principal ride the tooltip, because a reader reads the answer and audits
 * the run.
 */
export function endLine(turn: AskTurn): AskEndLine {
  const state = !turn.ended
    ? 'answering…'
    : (turn.exit === undefined || turn.exit === 0 ? 'done' : 'failed');
  const exit = turn.exit === undefined ? 'exit not emitted' : `exit ${turn.exit}`;
  return {
    text: `${turn.runId} · ${state}`,
    title: turn.principal === '' ? exit : `${exit} · attributed to ${turn.principal}`,
  };
}
