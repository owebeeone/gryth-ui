import { describe, it, expect } from 'vitest';
import { createAtomValueTap, type AtomTapHandle } from '@owebeeone/grip-react';
import {
  GYLD_ASK_STREAM, GYLD_DECIDE_NOW, GYLD_LENS, GYLD_OPS, GYLD_OPS_STATUS,
  GYLD_TAB_ASK_CITES, GYLD_TAB_ASK_CITES_TAP,
} from '../grips';
import type { GyldDecideNow } from '../contract';
import type { GyldOps, GyldOpsResponse } from '../ops/ops';
import type { GyldLensState, GyldValue } from '../store/state';
import { AskWindow } from './AskWindow';
import { askTabTaps } from './askTabTaps';
import { AskPhase, conversationBusy } from './busy';
import { boxKey, toggleBox, type AskCitationsOpen } from './citations';
import {
  AskStream, SAYS_CHARS, foldAskReply, openStep, stepOpen, stepSays,
  type GyldAskRecord,
} from './reply';
import { mountDesk, STATIC_SET } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';

// THE TOOL CARDS (GyldAskAgent.md section 11.4, plan step A.3).
//
// A turn is a LOOP in the supplier now: it may reach for `read_source` or
// `gyld_query`, and the two records it appends for each call — `tool_call`
// before it runs, `tool_result` after — are what this window folds into a card
// the reader can open.
//
// Everything here is the fold over records written by hand and the window
// rendered to static markup, the way this package asserts everything else. No
// desk of the owner's, no supplier, no DOM event: the acts a press calls are
// CALLED, and what a reader sees is the markup.
//
// Three rules the fold is written to, each from the design:
//
//  - IN ORDER. A turn that called two tools called one of them first, and the
//    cards are in that order. A result is paired with its call by the
//    `tool_use_id` the two records share — never by position, because one turn
//    may call two tools at once.
//  - NOTHING IS INTERPRETED. The result text is the supplier's own `summary`,
//    cut where the supplier cut it and marked as cut where the record says so.
//  - NOTHING IS HIDDEN. A refusal is drawn as a refusal, a call still in
//    flight is drawn as open, and a result whose call never arrived is its own
//    card rather than a record quietly dropped (6.7, MDV-7).

const KEY_CUSTODY = 'glade_decisions:GladeDecisions.key_custody';
const CONVERSATION = 'conv-browser-1-key_custody-1789247615547';
const RUN = 'run-21';

const on = (
  seq: number, stream: string, rest: Partial<GyldAskRecord> = {},
): GyldAskRecord => ({
  run_id: RUN, seq, principal: 'gianni', conversation: CONVERSATION, stream, ...rest,
});

const QUESTION = on(1, 'question', {
  line: 'what did stream-a decide about the version pin?',
});
const READING = on(2, 'tool_call', {
  record: { id: 'toolu_1', name: 'read_source', input: { tag: 'Q11' } },
});
const READ = on(3, 'tool_result', {
  record: {
    id: 'toolu_1',
    name: 'read_source',
    ok: true,
    summary: '## Q11 — GladeBuyBuildMatrix\n\n| Q11 | Key custody | buy |',
    bytes: 58,
    truncated: false,
  },
});
const QUERYING = on(4, 'tool_call', {
  record: {
    id: 'toolu_2',
    name: 'gyld_query',
    input: { kind: 'rulings', slot: 'glade_decisions:GladeDecisions.version_pin' },
  },
});
const QUERIED = on(5, 'tool_result', {
  record: {
    id: 'toolu_2',
    name: 'gyld_query',
    ok: true,
    summary: '{"kind":"rulings","rules_it":[{"in_stream":"stream-a"}]}',
    bytes: 56,
    truncated: false,
  },
});
const ANSWER = on(6, 'answer', {
  line: 'stream-a ruled the version pin: take iroh 1.2.0 now.',
});
const END = on(7, 'end', { done: true, exit: 0 });

/** One whole turn that used both tools. */
const TURN: GyldAskRecord[] = [QUESTION, READING, READ, QUERYING, QUERIED, ANSWER, END];

const folded = (records: GyldAskRecord[] = TURN) => foldAskReply(records, CONVERSATION);

describe('the fold folds a turn\'s tool records into ordered steps', () => {
  it('names the two streams, so a record on one is never a guess', () => {
    expect(AskStream.byName('tool_call')).toBe(AskStream.TOOL_CALL);
    expect(AskStream.byName('tool_result')).toBe(AskStream.TOOL_RESULT);
    expect(AskStream.ALL).toContain(AskStream.TOOL_CALL);
  });

  it('pairs each result with its call, in the order the calls happened', () => {
    const turn = folded().turns[0];
    expect(turn.steps.map((step) => step.name)).toEqual(['read_source', 'gyld_query']);
    expect(turn.steps.map((step) => step.id)).toEqual(['toolu_1', 'toolu_2']);
    expect(turn.steps[0].call.input).toEqual({ tag: 'Q11' });
    expect(turn.steps[0].result?.summary).toContain('Key custody');
    expect(turn.steps[1].result?.summary).toContain('stream-a');
    expect(turn.steps.every((step) => !stepOpen(step))).toBe(true);
    // The prose and the citations are untouched by any of it.
    expect(turn.prose).toBe('stream-a ruled the version pin: take iroh 1.2.0 now.');
    expect(turn.citations).toEqual([]);
    expect(turn.ended).toBe(true);
  });

  it('pairs by the id the two records share, not by the order they land in', () => {
    // Two calls at once, and the results back the other way round — which is
    // exactly what a parallel tool call looks like.
    const turn = folded([
      QUESTION, READING, QUERYING, QUERIED, READ, END,
    ]).turns[0];
    expect(turn.steps.map((step) => step.id)).toEqual(['toolu_1', 'toolu_2']);
    expect(turn.steps[0].result?.name).toBe('read_source');
    expect(turn.steps[1].result?.name).toBe('gyld_query');
  });

  it('draws a call with no result yet as an open call', () => {
    const turn = folded([QUESTION, READING]).turns[0];
    expect(turn.steps).toHaveLength(1);
    expect(stepOpen(turn.steps[0])).toBe(true);
    expect(openStep(turn)?.name).toBe('read_source');
    expect(openStep(folded().turns[0])).toBeUndefined();
  });

  it('keeps a result whose call never arrived rather than dropping it', () => {
    const turn = folded([QUESTION, READ, END]).turns[0];
    expect(turn.steps).toHaveLength(1);
    expect(turn.steps[0].name).toBe('read_source');
    expect(turn.steps[0].call.input).toBeUndefined();
    expect(turn.steps[0].result?.ok).toBe(true);
  });

  it('says a folded card\'s one line of input, bounded', () => {
    const turn = folded().turns[0];
    expect(stepSays(turn.steps[0])).toBe('{"tag":"Q11"}');
    expect(stepSays(turn.steps[1])).toContain('"kind":"rulings"');
    // A long input is cut, because a folded card is one line of a narrow
    // window and opening it is what the whole input is for.
    const long = folded([
      QUESTION,
      on(2, 'tool_call', {
        record: { id: 'x', name: 'gyld_query', input: { slot: 'q'.repeat(400) } },
      }),
    ]).turns[0];
    expect(stepSays(long.steps[0]).length).toBe(SAYS_CHARS + 1);
    expect(stepSays(long.steps[0]).endsWith('…')).toBe(true);
    // A call that carried no input says nothing rather than saying "{}".
    const bare = folded([QUESTION, on(2, 'tool_call', { record: { id: 'y', name: 'z' } })]);
    expect(stepSays(bare.turns[0].steps[0])).toBe('');
  });

  it('leaves a turn that used no tool exactly as it was', () => {
    const turn = folded([QUESTION, ANSWER, END]).turns[0];
    expect(turn.steps).toEqual([]);
    expect(turn.prose).toBe('stream-a ruled the version pin: take iroh 1.2.0 now.');
  });
});

describe('the status line says which tool a turn is waiting on', () => {
  const ACCEPTED: GyldOpsResponse = { ok: true, run_id: RUN, done: false };
  const phase = (records: GyldAskRecord[]) => conversationBusy(folded(records), ACCEPTED);

  it('says "using read_source" while that call is open', () => {
    const held = phase([QUESTION, READING]);
    expect(held?.name).toBe('using read_source');
    expect(held?.means).toContain('read_source');
    expect(held?.means).toContain('has not come back yet');
  });

  it('stops saying it the moment the result lands', () => {
    expect(phase([QUESTION, READING, READ])?.name).toBe('thinking');
    expect(phase([QUESTION, READING, READ, ANSWER])?.name).toBe('answering');
    // A second call reopens it, with its own tool's name.
    expect(phase([QUESTION, READING, READ, ANSWER, QUERYING])?.name)
      .toBe('using gyld_query');
  });

  it('outranks the prose, because an open call is what is true NOW', () => {
    expect(phase([QUESTION, ANSWER, QUERYING])?.name).toBe('using gyld_query');
  });

  it('says the weakest thing it knows when the record named no tool', () => {
    const held = phase([QUESTION, on(2, 'tool_call', { record: { id: 'toolu_9' } })]);
    expect(held?.name).toBe('using a tool');
    expect(held?.means).toContain('did not name');
  });

  it('is not a constant phase, and never ends a turn', () => {
    expect(AskPhase.byName('using read_source')).toBeUndefined();
    // A closed turn is not in flight however many calls it made.
    expect(conversationBusy(folded(), ACCEPTED)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The window.
// ---------------------------------------------------------------------------

const image = new FakeBundle();

const fakeOps = {
  principal: 'gianni',
  explain: async () => ({ ok: true, run_id: RUN, done: false }),
} as unknown as GyldOps;

/** An ask window on `key_custody`, with `stream` on its log. */
async function askWindow(name: string, stream: GyldAskRecord[] = TURN) {
  const desk = mountDesk(STATIC_SET, image);
  const home = desk.ctx.getGripHomeContext();
  home.registerTap(createAtomValueTap<GyldOps>(GYLD_OPS, { initial: fakeOps }));
  home.registerTap(createAtomValueTap(GYLD_OPS_STATUS, { initial: 'live' }));
  home.registerTap(createAtomValueTap(GYLD_ASK_STREAM, { initial: stream as never }));
  const tab = desk.tab(name, askTabTaps(name, {
    stream: 'base', perspective: 'decisions', ref: KEY_CUSTODY, conversation: CONVERSATION,
  }));
  await expect.poll(
    () => (tab.read(GYLD_LENS).get() as GyldLensState)?.status,
  ).toBe('ok');
  await expect.poll(() => {
    const list = tab.read(GYLD_DECIDE_NOW).get() as GyldValue<GyldDecideNow> | undefined;
    return list !== undefined && list.status !== 'unset' && list.status !== 'loading';
  }).toBe(true);
  const cites = tab.read(GYLD_TAB_ASK_CITES_TAP).get() as AtomTapHandle<AskCitationsOpen>;
  return { desk, tab, cites, markup: () => tab.render(<AskWindow />) };
}

/** Open the card at `at` of this turn, and wait for the atom to settle. */
async function open(
  on: Awaited<ReturnType<typeof askWindow>>, at: number,
): Promise<void> {
  toggleBox(on.cites, RUN, `tool-${at}`);
  await expect.poll(
    () => (on.tab.read(GYLD_TAB_ASK_CITES).get() as AskCitationsOpen)
      .boxes.includes(boxKey(RUN, `tool-${at}`)),
  ).toBe(true);
}

describe('the window draws each tool call as a collapsible card', () => {
  it('folds to the name and one line of the input, in the order they ran', async () => {
    const markup = (await askWindow('steps-folded')).markup();
    expect(markup).toContain('data-tool="read_source"');
    expect(markup).toContain('data-tool="gyld_query"');
    expect(markup).toContain('{&quot;tag&quot;:&quot;Q11&quot;}');
    expect(markup.indexOf('data-tool="read_source"'))
      .toBeLessThan(markup.indexOf('data-tool="gyld_query"'));
    // Folded is folded: neither the whole input nor the result is drawn.
    expect(markup).not.toContain('| Q11 | Key custody | buy |');
    expect(markup).not.toContain('rules_it');
    // And the cards sit above the answer they were used to write, which is
    // where the citations already sit.
    expect(markup.indexOf('data-tool="read_source"'))
      .toBeLessThan(markup.indexOf('stream-a ruled the version pin'));
  });

  it('opens to the whole input and the result the answer was built on', async () => {
    const held = await askWindow('steps-open');
    await open(held, 0);
    const markup = held.markup();
    expect(markup).toContain('| Q11 | Key custody | buy |');
    expect(markup).toContain('gyld-ask-step-input');
    expect(markup).toContain('gyld-ask-step-result');
    // Only the one that was opened.
    expect(markup).not.toContain('rules_it');
  });

  it('marks a result the supplier cut, and says what it was before the cut', async () => {
    const held = await askWindow('steps-cut', [
      QUESTION,
      READING,
      on(3, 'tool_result', {
        record: {
          id: 'toolu_1', name: 'read_source', ok: true,
          summary: 'the first part of it', bytes: 40_000, truncated: true,
        },
      }),
      ANSWER,
      END,
    ]);
    await open(held, 0);
    const markup = held.markup();
    expect(markup).toContain('the first part of it');
    expect(markup).toContain('what is shown is a prefix');
    expect(markup).toContain('40000 bytes');
  });

  it('draws a refused call as a refusal, with the supplier\'s own sentence', async () => {
    const held = await askWindow('steps-refused', [
      QUESTION,
      READING,
      on(3, 'tool_result', {
        record: {
          id: 'toolu_1', name: 'read_source', ok: false,
          summary: 'this build\'s index does not list the tag "ZZ-9". It lists Q11.',
          bytes: 60, truncated: false,
        },
      }),
      ANSWER,
      END,
    ]);
    expect(held.markup()).toContain('data-state="refused"');
    expect(held.markup()).toContain('>refused</span>');
    await open(held, 0);
    const markup = held.markup();
    expect(markup).toContain('does not list the tag');
    expect(markup).toContain('gyld-fault');
  });

  it('draws a call still in flight as one, and never invents a result', async () => {
    const held = await askWindow('steps-inflight', [QUESTION, READING]);
    expect(held.markup()).toContain('data-state="open-call"');
    await open(held, 0);
    expect(held.markup()).toContain('this call has not come back yet');
    expect(held.markup()).not.toContain('gyld-ask-step-result');
  });

  it('draws nothing at all for a turn that used no tool', async () => {
    const markup = (await askWindow('steps-none', [QUESTION, ANSWER, END])).markup();
    expect(markup).not.toContain('gyld-ask-steps');
    expect(markup).toContain('stream-a ruled the version pin');
  });
});
