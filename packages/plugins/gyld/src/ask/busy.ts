import type { GyldOpsResponse } from '../ops/ops';
import type { AskReply, AskTurn } from './reply';

// WHETHER A TURN IS STILL RUNNING, and what it is doing while it runs
// (GyldAskAgent.md section 6; step 1.5's reply, `./reply.ts`).
//
// Everything here is PURE and lives in the fold, not in the window: the
// indicator the reader sees is a function of the accept the supplier gave and
// the records that have actually landed, so every state of it is asserted
// against hand-written records with no desk, no clock and no DOM — the same
// way the reply itself is.
//
// Two rules, and each is one the reply is already written to:
//
//  - NOTHING IS GUESSED. The phase is what has ARRIVED, never how long it has
//    been since the press: "answering" means an answer chunk is on the log,
//    not that one is expected. A window that cannot tell says the weakest
//    thing it knows.
//  - A REFUSAL IS A CLOSE. The three refusals that arrive before a run starts
//    are the accept's own `ok: false`, and one that stops a turn mid-stream is
//    an `end` record with a non-zero exit (section 4). Both end the flight, so
//    neither leaves an indicator spinning over a turn that is over.

/**
 * What a turn in flight is doing, as far as what has landed can say.
 *
 * An object per phase rather than a label branched on at each render site
 * (AGENTS.md, "no magic strings when the concept has semantics"), and the
 * same shape `AskStream` uses for the streams these are read from.
 */
export class AskPhase {
  private constructor(
    /** The word the window shows. */
    readonly name: string,
    /** What that word is read OFF, for the reader who hovers it. */
    readonly means: string,
  ) {}

  /** The accept came back and not one record of the turn has landed yet. */
  static readonly ASKING = new AskPhase(
    'asking',
    'the supplier accepted the turn; nothing of it has come back yet',
  );

  /** Records have landed, but no answer chunk: the question is on the log and
   *  the model has not begun to stream. */
  static readonly THINKING = new AskPhase(
    'thinking',
    'the question is on the log; no answer has begun to stream',
  );

  /** At least one `answer` chunk has landed. */
  static readonly ANSWERING = new AskPhase(
    'answering',
    'the answer is streaming in, chunk by chunk',
  );

  /** At least one `citation` record has landed. */
  static readonly CITING = new AskPhase(
    'citing',
    'the supplier is resolving the sources the answer leans on',
  );

  static readonly ALL: readonly AskPhase[] = Object.freeze([
    AskPhase.ASKING, AskPhase.THINKING, AskPhase.ANSWERING, AskPhase.CITING,
  ]);

  static byName(name: string): AskPhase | undefined {
    return AskPhase.ALL.find((phase) => phase.name === name);
  }
}

/**
 * Whether this turn is still running.
 *
 * The `end` record is the ONLY close (section 4): a turn the supplier refused
 * mid-stream closes with a line and a non-zero exit, and one that finished
 * closes with exit 0, so the exit is not read here at all. A turn with no
 * `end` yet is in flight however much or little of it has arrived.
 */
export function turnInFlight(turn: AskTurn): boolean {
  return !turn.ended;
}

/**
 * The turn an accept named, out of the fold.
 *
 * An accept always carries a run id (`ops/ops.ts`, `GyldOpsResponse.run_id`:
 * "Every answer carries one"), and it is matched exactly. One that carries
 * none is not an error and is not invented into a run id either: the fold's
 * LAST turn is this conversation's most recent, which is the only turn such an
 * accept could be about.
 */
function turnOf(reply: AskReply, runId: string): AskTurn | undefined {
  if (runId === '') {
    return reply.turns.length === 0
      ? undefined
      : reply.turns[reply.turns.length - 1];
  }
  return reply.turns.find((turn) => turn.runId === runId);
}

/**
 * Whether the accept line is drawn at all.
 *
 * "explain: accepted, run run-13" is a fact about a PRESS, and it is worth a
 * line for exactly as long as it is the only thing this window knows: between
 * the press and the first record of the turn. Once the reply exists, the same
 * run is named by the reply's own footer line and the phase is named by the
 * indicator, so the accept line is three ways of saying what the window is
 * already showing — and it pushed the answer up the screen to say it.
 *
 * A REFUSAL is the other half and does not move. The three refusals that
 * arrive before any run starts (no model key, no source index, an envelope
 * that did not decode) are this window's only word on the turn, so they stay
 * the prominent system row they are today (section 4).
 */
export function acceptShown(
  answer: GyldOpsResponse | null, reply: AskReply,
): boolean {
  if (answer === null) {
    return false;
  }
  if (!answer.ok) {
    return true;
  }
  if (answer.done === true) {
    // A verb the supplier answered outright rather than streaming: there is no
    // turn coming, so there is nothing for this line to be the only word on.
    return false;
  }
  return turnOf(reply, answer.run_id ?? '') === undefined;
}

/**
 * The phase this conversation is in, or `undefined` when nothing is in flight.
 *
 * It reads the fold AND the accept, because the two answer different halves of
 * one question and neither answers it alone. The FOLD says what has arrived,
 * which is every phase after the first; the ACCEPT covers the gap the fold
 * cannot see — between a press the supplier took and the first record of it
 * reaching the log, the conversation is busy and its own log is still empty.
 * That gap is the whole reason this indicator exists, so it is not derivable
 * from `reply` on its own.
 *
 * The accept is this window's last, held in `Gyld.Tab.Ask.Answer`.
 */
export function conversationBusy(
  reply: AskReply,
  answer: GyldOpsResponse | null,
): AskPhase | undefined {
  if (answer === null || !answer.ok || answer.done === true) {
    // Nothing pressed yet, a refusal that arrived before any run started, or a
    // verb the supplier answered outright rather than streaming. None of the
    // three has a turn to wait on.
    return undefined;
  }
  const turn = turnOf(reply, answer.run_id ?? '');
  if (turn === undefined) {
    return AskPhase.ASKING;
  }
  if (!turnInFlight(turn)) {
    return undefined;
  }
  // Read in ARRIVAL order, latest first. The supplier sends the citations
  // BEFORE the prose — "the citations first, so a reader sees what the answer
  // is grounded in before the prose arrives" (`glade-gyld/src/supplier.rs`) —
  // so prose is the later fact and outranks them. Reading them the other way
  // round would leave a window saying "citing" for the whole of a streaming
  // answer, which is a true fact about the turn and the wrong one about now.
  if (turn.prose !== '') {
    return AskPhase.ANSWERING;
  }
  if (turn.citations.length > 0) {
    return AskPhase.CITING;
  }
  return AskPhase.THINKING;
}
