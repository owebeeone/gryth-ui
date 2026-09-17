import { describe, it, expect } from 'vitest';
import type { GyldOps, GyldOpsResponse } from '../ops/ops';
import { AskPhase, conversationBusy, turnInFlight } from './busy';
import { foldAskReply, type GyldAskRecord } from './reply';
import { explainGate } from './submit';

// THAT A TURN IS IN FLIGHT, and what of it has arrived (`./busy.ts`).
//
// Every case here is the fold over records written by hand and the accept the
// supplier gave, because that is all the derivation reads: no desk, no timer,
// no DOM. So the indicator a reader sees is asserted at the one place it is
// decided, and the six shapes a turn can be in — accepted, questioned,
// answering, citing, ended, refused — are six calls to one function.

const CONVERSATION = 'conv-browser-1-key_custody-1789247615547';

const on = (
  seq: number, stream: string, rest: Partial<GyldAskRecord> = {},
): GyldAskRecord => ({
  run_id: 'run-7', seq, principal: 'gianni', conversation: CONVERSATION, stream, ...rest,
});

// One turn's records, in the order the supplier writes them: the question,
// then the sources it grounded on, then the prose, then the close.
const QUESTION = on(1, 'question', { line: 'why is this blocked?' });
const CITATION = on(2, 'citation', {
  record: { tag: 'Q11', cites: 'record', resolved: true, passage: '| Q11 |' },
});
const ANSWER = on(3, 'answer', { line: 'key_custody is blocked by scope_model.' });
const END = on(4, 'end', { done: true, exit: 0 });
/** Section 4's refusal that stops a turn MID-STREAM: a line saying why, and a
 *  non-zero exit on the `end` record. The partial prose is kept. */
const STOPPED = on(4, 'end', { done: true, exit: 1, line: 'the model stopped: rate limited' });

/** The accept a streaming `explain` answers with (`ops/ops.ts`). */
const ACCEPTED: GyldOpsResponse = {
  ok: true, run_id: 'run-7', done: false, attributed_to: 'gianni',
};
/** One of the three refusals that arrive BEFORE a run starts, so with no run
 *  id and nothing ever on the log. */
const REFUSED: GyldOpsResponse = {
  ok: false,
  error: 'no model key: set ANTHROPIC_API_KEY in the supplier\'s environment',
};

/** The phase this window is in with these records on the log. */
function phase(
  records: GyldAskRecord[], answer: GyldOpsResponse | null = ACCEPTED,
): AskPhase | undefined {
  return conversationBusy(foldAskReply(records, CONVERSATION), answer);
}

describe('a turn is in flight until its end record closes it', () => {
  it('reads the end record and never the exit: a refused close is a close', () => {
    const open = foldAskReply([QUESTION, ANSWER], CONVERSATION).turns[0];
    expect(turnInFlight(open)).toBe(true);
    expect(turnInFlight(foldAskReply([QUESTION, ANSWER, END], CONVERSATION).turns[0]))
      .toBe(false);
    // stopped mid-stream: closed, with the partial prose kept
    const stopped = foldAskReply([QUESTION, ANSWER, STOPPED], CONVERSATION).turns[0];
    expect(turnInFlight(stopped)).toBe(false);
    expect(stopped.exit).toBe(1);
    expect(stopped.prose).toBe('key_custody is blocked by scope_model.');
    expect(stopped.said.map((line) => line.text))
      .toEqual(['the model stopped: rate limited']);
  });
});

describe('the phase is what has ARRIVED, and nothing else', () => {
  it('is asking from the accept until the first record lands', () => {
    expect(phase([])).toBe(AskPhase.ASKING);
    // the run this accept names has nothing on the log yet, even though an
    // EARLIER turn of the same conversation is folded and closed
    const earlier: GyldAskRecord[] = [
      { ...QUESTION, run_id: 'run-6', seq: 1 },
      { ...END, run_id: 'run-6', seq: 2 },
    ];
    expect(phase(earlier)).toBe(AskPhase.ASKING);
  });

  it('is thinking while only the question record exists', () => {
    expect(phase([QUESTION])).toBe(AskPhase.THINKING);
  });

  it('is citing while the sources land, which the supplier sends FIRST', () => {
    // `glade-gyld/src/supplier.rs` sends every citation before the model is
    // called at all, "so a reader sees what the answer is grounded in before
    // the prose arrives"
    expect(phase([QUESTION, CITATION])).toBe(AskPhase.CITING);
  });

  it('is answering once the first answer chunk has landed, citations or not', () => {
    expect(phase([QUESTION, ANSWER])).toBe(AskPhase.ANSWERING);
    // prose is the LATER fact, so it outranks the citations that preceded it:
    // a window that kept saying "citing" through a streaming answer would be
    // saying something true about the turn and wrong about now
    expect(phase([QUESTION, CITATION, ANSWER])).toBe(AskPhase.ANSWERING);
    // and an answer with no question record before it is still answering: an
    // absent record is an absent line, never a state of its own
    expect(phase([ANSWER])).toBe(AskPhase.ANSWERING);
  });

  it('is nothing at all once the end record lands, whatever its exit', () => {
    expect(phase([QUESTION, CITATION, ANSWER, END])).toBeUndefined();
    expect(phase([QUESTION, CITATION, ANSWER, STOPPED])).toBeUndefined();
  });

  it('is nothing at all before a press, and on a refusal that never ran', () => {
    expect(phase([], null)).toBeUndefined();
    expect(phase([], REFUSED)).toBeUndefined();
    // a verb the supplier answered outright rather than streaming
    expect(phase([], { ok: true, run_id: 'run-7', done: true, exit: 0 })).toBeUndefined();
  });

  it('falls back to the conversation\'s last turn when an accept names no run', () => {
    const accept: GyldOpsResponse = { ok: true, done: false };
    expect(phase([QUESTION, ANSWER], accept)).toBe(AskPhase.ANSWERING);
    expect(phase([QUESTION, ANSWER, END], accept)).toBeUndefined();
    expect(phase([], accept)).toBe(AskPhase.ASKING);
  });
});

describe('the status line a reader is shown', () => {
  it('is the phase word, and each phase says what it is read off', () => {
    expect(AskPhase.ALL.map((it) => it.name))
      .toEqual(['asking', 'thinking', 'answering', 'citing']);
    for (const it of AskPhase.ALL) {
      expect(AskPhase.byName(it.name)).toBe(it);
      expect(it.means).not.toBe('');
    }
    expect(AskPhase.byName('working')).toBeUndefined();
  });

  it('reads the four states in turn, in the order the supplier sends them', () => {
    const landing: GyldAskRecord[] = [];
    const seen = [phase(landing)];
    // question, then every citation, then the prose, then the close — the
    // order `glade-gyld/src/supplier.rs` writes one turn in
    for (const record of [QUESTION, CITATION, ANSWER, END]) {
      landing.push(record);
      seen.push(phase(landing));
    }
    expect(seen.map((it) => it?.name))
      .toEqual(['asking', 'thinking', 'citing', 'answering', undefined]);
  });
});

describe('the Ask button is closed while a turn is in flight', () => {
  const ops = { principal: 'gianni' } as unknown as GyldOps;

  it('refuses the press, and says which phase it is waiting on', () => {
    const gate = explainGate(ops, 'live', CONVERSATION, 'why?', AskPhase.ANSWERING);
    expect(gate.ready).toBe(false);
    expect(gate.reason).toContain('answering');
    expect(gate.reason).toContain('one turn is in flight');
  });

  it('refuses BEFORE the empty question, because an accept empties the box', () => {
    // the window clears the draft on an accepted turn, so a reader waiting on
    // an answer must not be told to type one
    expect(explainGate(ops, 'live', CONVERSATION, '', AskPhase.THINKING).reason)
      .not.toContain('type a question');
    expect(explainGate(ops, 'live', CONVERSATION, '', undefined).reason)
      .toContain('type a question');
  });

  it('leaves every refusal above it where it was', () => {
    // no glade node at all outranks a turn in flight: there is nothing to wait
    // on, and the reader is told the thing that is actually true
    expect(explainGate(undefined, 'live', CONVERSATION, 'why?', AskPhase.ASKING).reason)
      .toContain('no glade node');
    expect(explainGate(ops, 'offline', CONVERSATION, 'why?', AskPhase.ASKING).reason)
      .toContain('offline');
  });

  it('opens again once the turn closes', () => {
    expect(explainGate(ops, 'live', CONVERSATION, 'why?', phase([QUESTION, ANSWER])).ready)
      .toBe(false);
    expect(explainGate(ops, 'live', CONVERSATION, 'why?', phase([QUESTION, ANSWER, END])))
      .toEqual({ ready: true, reason: '' });
  });
});
