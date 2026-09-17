import { describe, it, expect } from 'vitest';
import {
  createAtomValueTap, type AtomTapHandle, type Drip, type Grip,
} from '@owebeeone/grip-react';
import { readDecideNow, readLens, readProjection, readStream, type GyldDecideNow } from '../contract';
import {
  GYLD_ASK_STREAM, GYLD_DECIDE_NOW, GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP,
  GYLD_DEST_REF, GYLD_DEST_REF_TAP, GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP, GYLD_LENS,
  GYLD_OPS, GYLD_OPS_STATUS, GYLD_TAB_ASK_CONVERSATION, GYLD_TAB_ASK_CONVERSATION_TAP,
  GYLD_TAB_ASK_DRAFT_TAP, GYLD_TAB_ID,
} from '../grips';
import type { GyldOps } from '../ops/ops';
import { indexProjection, recordView } from '../records/records';
import { AskWindow } from './AskWindow';
import { askTabTaps, seededConversation } from './askTabTaps';
import {
  NO_CONVERSATION, conversationForTurn, mintConversation, movedOff, startConversation,
  turnConversation, type AskConversation,
} from './conversation';
import { askEnvelope, conversationId, type GyldAskContext } from './envelope';
import { AskStream, foldAskReply, type GyldAskRecord } from './reply';
import { explainSubmit } from './submit';
import { STATIC_SET, mountDesk, wireSink } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';
import type { GyldBundle, GyldLensState, GyldValue } from '../store/state';
import decisionsFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';
import decideNowFixture from '../../test/fixtures/bundle/streams/base/decide-now.json';
import projectionFixture from '../../test/fixtures/bundle/streams/base/projection.json';
import baseRecordFixture from '../../test/fixtures/bundle/streams/base/stream.json';

// Step 2.1 of GyldAskAgent.md: FOLLOW-UPS.
//
// Three things, and they are one thing: a conversation is ABOUT A RECORD, it
// lasts as long as the window is on that record, and the log of it is the
// transcript. So this file asserts the lifetime rule (section 6: one id per
// window, minted at `Ask about this`, kept across turns, replaced when the
// window is retargeted or the reader starts over), the fold over three turns
// of synthetic records — interleaved with another conversation's, with a
// REFUSED turn in the middle, because a refused turn is still a turn — and
// the window drawing those turns in order with the next question's box under
// them.
//
// Nothing here touches glade, a model or a DOM: the records are written by
// hand, the acts are called rather than clicked, and the window renders to
// static markup.

const KEY_CUSTODY = 'glade_decisions:GladeDecisions.key_custody';
const LIFECYCLE = 'glade_decisions:GladeDecisions.lifecycle_composition';
const CONVERSATION = 'conv-browser-1-key_custody-1789247615547';
const OTHER = 'conv-browser-2-key_custody-1789247615999';

const lens = readLens(decisionsFixture);
const decideNow = readDecideNow(decideNowFixture);
const records = indexProjection(readProjection(projectionFixture), 'base');
const baseBundle: GyldBundle = {
  status: 'ok',
  stream: 'base',
  perspectives: ['branch', 'decisions', 'neighbourhood-key_custody', 'status', 'tiers'],
  lenses: readStream(baseRecordFixture).lenses,
};

// ---------------------------------------------------------------------------
// The lifetime.
// ---------------------------------------------------------------------------

const on = (slot: string, stamp: number) => ({ tabId: 'browser-1', slot, stamp });

describe('one conversation per window, from the first Ask about this', () => {
  it('keeps its id across every turn on the record it is on', () => {
    const opened = mintConversation(on(KEY_CUSTODY, 1789247615547));
    expect(opened.id).toBe(conversationId('browser-1', KEY_CUSTODY, 1789247615547));
    // A follow-up is the SAME conversation: same id, and the same object, so
    // nothing downstream sees a change at all.
    expect(conversationForTurn(opened, on(KEY_CUSTODY, 1789247699999))).toBe(opened);
    expect(conversationForTurn(opened, on(KEY_CUSTODY, 1789247700000)).id).toBe(opened.id);
  });

  it('binds a wired window`s conversation to the record its first turn asks about', () => {
    // The opening link of a WIRED window carries the id and no record: it
    // follows the browser's, so the conversation binds when it is first used.
    const seeded = seededConversation({ conversation: CONVERSATION });
    expect(seeded).toEqual({ id: CONVERSATION, slot: '' });
    const bound = conversationForTurn(seeded, on(KEY_CUSTODY, 1));
    expect(bound).toEqual({ id: CONVERSATION, slot: KEY_CUSTODY });
    // and it is then kept, turn after turn
    expect(conversationForTurn(bound, on(KEY_CUSTODY, 2))).toBe(bound);
  });

  it('opens a NEW one when the window has been retargeted to another record', () => {
    const held: AskConversation = { id: CONVERSATION, slot: KEY_CUSTODY };
    expect(movedOff(held, LIFECYCLE)).toBe(true);
    const next = conversationForTurn(held, on(LIFECYCLE, 1789247800000));
    expect(next.id).not.toBe(CONVERSATION);
    expect(next).toEqual({
      id: conversationId('browser-1', LIFECYCLE, 1789247800000), slot: LIFECYCLE,
    });
    // A window that has not moved has not moved, whatever it is asked about.
    expect(movedOff(held, KEY_CUSTODY)).toBe(false);
    expect(movedOff(NO_CONVERSATION, KEY_CUSTODY)).toBe(false);
    expect(movedOff({ id: CONVERSATION, slot: '' }, KEY_CUSTODY)).toBe(false);
  });

  it('mints one for a window that has none, and none for a window with no record', () => {
    expect(conversationForTurn(NO_CONVERSATION, on(KEY_CUSTODY, 5)))
      .toEqual({ id: conversationId('browser-1', KEY_CUSTODY, 5), slot: KEY_CUSTODY });
    // No record is no envelope and nothing to be about, which the window says
    // rather than minting a conversation on nothing.
    expect(conversationForTurn(NO_CONVERSATION, on('', 5))).toBe(NO_CONVERSATION);
  });

  it('reads the opening link the two ways a window is opened', () => {
    expect(seededConversation({ conversation: CONVERSATION, ref: KEY_CUSTODY }))
      .toEqual({ id: CONVERSATION, slot: KEY_CUSTODY });
    expect(seededConversation({ ref: KEY_CUSTODY })).toBe(NO_CONVERSATION);
    expect(seededConversation()).toBe(NO_CONVERSATION);
  });

  it('writes what it settled through the atom`s own handle', () => {
    let value: AskConversation = NO_CONVERSATION;
    const writes: AskConversation[] = [];
    const handle = {
      get: () => value,
      set: (next: AskConversation) => { value = next; writes.push(next); },
    } as unknown as AtomTapHandle<AskConversation>;
    const first = turnConversation(handle, on(KEY_CUSTODY, 11));
    expect(first.slot).toBe(KEY_CUSTODY);
    expect(writes).toEqual([first]);
    // a follow-up writes NOTHING: the conversation did not change
    expect(turnConversation(handle, on(KEY_CUSTODY, 12))).toBe(first);
    expect(writes).toHaveLength(1);
    // the reader moves on, and the next turn is a new conversation
    const moved = turnConversation(handle, on(LIFECYCLE, 13));
    expect(moved.id).not.toBe(first.id);
    expect(writes).toEqual([first, moved]);
    // and starting over mints one whatever the window was in
    const over = startConversation(handle, on(LIFECYCLE, 14));
    expect(over.id).not.toBe(moved.id);
    expect(over.slot).toBe(LIFECYCLE);
    expect(writes).toEqual([first, moved, over]);
    // a window with no handle to write settles the same value and writes none
    expect(turnConversation(undefined, on(KEY_CUSTODY, 15), first)).toBe(first);
  });
});

// ---------------------------------------------------------------------------
// The fold: three turns, in the order they were asked.
// ---------------------------------------------------------------------------

const record = (
  run: string,
  seq: number,
  stream: string,
  rest: Partial<GyldAskRecord> = {},
  conversation = CONVERSATION,
): GyldAskRecord => ({
  run_id: run, seq, principal: 'gianni', conversation, stream, ...rest,
});

const asked = (run: string, line: string, conversation = CONVERSATION): GyldAskRecord =>
  record(run, 1, 'question', { line }, conversation);

const Q11 = {
  tag: 'Q11',
  cites: 'record',
  resolved: true,
  document: 'GladeBuyBuildMatrix',
  path: 'gyld-wz/dev-docs/GladeBuyBuildMatrix.md',
  heading: 'The matrix',
  lines: [211, 213],
  passage: '| Q11 | key custody | owner-held keys are the default |',
};

/**
 * Three turns of one conversation, and another conversation's turn between
 * them on the same records.
 *
 * `run-2`, `run-9`, `run-10`: a plain text order would read `run-10` as the
 * earliest of the three, so the ordering is the supplier's counter and not
 * the spelling of its ids.
 */
const TURNS: GyldAskRecord[] = [
  asked('run-2', 'why is this blocked?'),
  record('run-2', 2, 'answer', { line: 'key_custody is blocked ' }),
  record('run-2', 3, 'answer', { line: 'by scope_model.' }),
  record('run-2', 4, 'citation', { record: Q11 }),
  record('run-2', 5, 'end', { done: true, exit: 0 }),
  // Another window, another conversation, on the same mount's records.
  asked('run-3', 'and what does architecture say?', OTHER),
  record('run-3', 2, 'answer', { line: 'another window asked this' }, OTHER),
  record('run-3', 3, 'end', { done: true, exit: 0 }, OTHER),
  // The REFUSED turn, in the middle: a turn with its question and its reason.
  asked('run-9', 'so who decides it?'),
  record('run-9', 2, 'end', {
    done: true,
    exit: 1,
    line: 'no model key: set ANTHROPIC_API_KEY in the supplier\'s environment',
  }),
  asked('run-10', 'which passage says so?'),
  record('run-10', 2, 'answer', { line: 'the Q11 row does.' }),
  record('run-10', 3, 'end', { done: true, exit: 0 }),
];

describe('three turns fold in the order they were asked', () => {
  const reply = foldAskReply(TURNS, CONVERSATION);

  it('is one turn per run, in the supplier`s own order', () => {
    expect(reply.turns.map((turn) => turn.runId)).toEqual(['run-2', 'run-9', 'run-10']);
    expect(reply.records).toBe(TURNS.filter((r) => r.conversation === CONVERSATION).length);
  });

  it('carries each turn`s own question, as the log recorded it being asked', () => {
    expect(reply.turns.map((turn) => turn.question)).toEqual([
      'why is this blocked?', 'so who decides it?', 'which passage says so?',
    ]);
    expect(AskStream.byName('question')).toBe(AskStream.QUESTION);
  });

  it('carries each turn`s prose, citations and close', () => {
    expect(reply.turns[0].prose).toBe('key_custody is blocked by scope_model.');
    expect(reply.turns[0].citations.map((cited) => cited.tag)).toEqual(['Q11']);
    expect(reply.turns[0].ended).toBe(true);
    expect(reply.turns[0].exit).toBe(0);
    expect(reply.turns[0].principal).toBe('gianni');
    expect(reply.turns[2].prose).toBe('the Q11 row does.');
    expect(reply.turns[2].citations).toEqual([]);
  });

  it('keeps the REFUSED turn in the middle, with its question and its reason', () => {
    const refused = reply.turns[1];
    expect(refused.question).toBe('so who decides it?');
    expect(refused.prose).toBe('');
    expect(refused.citations).toEqual([]);
    expect(refused.said).toEqual([{
      stream: 'end',
      text: 'no model key: set ANTHROPIC_API_KEY in the supplier\'s environment',
    }]);
    expect(refused.exit).toBe(1);
    expect(refused.ended).toBe(true);
    // and the conversation goes on: a refused turn closes a turn, not a
    // conversation (section 6).
    expect(reply.turns[2].ended).toBe(true);
  });

  it('folds the other conversation`s turn into the other conversation', () => {
    expect(reply.turns.some((turn) => turn.prose.includes('another window'))).toBe(false);
    const theirs = foldAskReply(TURNS, OTHER);
    expect(theirs.turns.map((turn) => turn.runId)).toEqual(['run-3']);
    expect(theirs.turns[0].question).toBe('and what does architecture say?');
  });

  it('orders the turns however the records arrived', () => {
    const shuffled = [...TURNS].reverse();
    expect(foldAskReply(shuffled, CONVERSATION).turns.map((turn) => turn.runId))
      .toEqual(['run-2', 'run-9', 'run-10']);
    expect(foldAskReply(shuffled, CONVERSATION).turns[0].prose)
      .toBe('key_custody is blocked by scope_model.');
  });
});

// ---------------------------------------------------------------------------
// The window.
// ---------------------------------------------------------------------------

const settled = async <T,>(read: () => T, done: (value: T) => boolean): Promise<T> => {
  await expect.poll(() => done(read())).toBe(true);
  return read();
};

const image = new FakeBundle();

/** A recording ops handle, so a press is asserted without a click. */
function fakeOps() {
  const calls: { envelope: GyldAskContext; question: string }[] = [];
  return {
    calls,
    ops: {
      principal: 'gianni',
      explain: async (context: GyldAskContext, question: string) => {
        calls.push({ envelope: context, question });
        return { ok: true, run_id: 'run-11', done: false };
      },
    } as unknown as GyldOps,
  };
}

/**
 * An ask window WIRED to a browser, as the menu opens one: the source seeds
 * the destination and its own tab id, and the sink seeds only its own
 * conversation, so it follows whichever record the browser is on.
 */
async function wiredWindow(name: string, options: {
  conversation?: string;
  stream?: GyldAskRecord[];
  ops?: GyldOps;
} = {}) {
  const desk = mountDesk(STATIC_SET, image);
  const home = desk.ctx.getGripHomeContext();
  home.registerTap(createAtomValueTap<GyldOps>(GYLD_OPS, {
    initial: options.ops ?? fakeOps().ops,
  }));
  home.registerTap(createAtomValueTap(GYLD_OPS_STATUS, { initial: 'live' }));
  home.registerTap(createAtomValueTap(GYLD_ASK_STREAM, {
    initial: (options.stream ?? []) as never,
  }));
  const browser = desk.tab(name, [
    createAtomValueTap(GYLD_DEST_STREAM, { initial: 'base', handleGrip: GYLD_DEST_STREAM_TAP }),
    createAtomValueTap(GYLD_DEST_PERSPECTIVE, {
      initial: 'decisions', handleGrip: GYLD_DEST_PERSPECTIVE_TAP,
    }),
    createAtomValueTap(GYLD_DEST_REF, {
      initial: KEY_CUSTODY, handleGrip: GYLD_DEST_REF_TAP,
    }),
    createAtomValueTap(GYLD_TAB_ID, { initial: name }),
  ]);
  const tab = wireSink(browser, `${name}-ask`, askTabTaps(`${name}-ask`, {
    ...(options.conversation === undefined ? {} : { conversation: options.conversation }),
  }));
  await settled(
    () => tab.read(GYLD_LENS).get() as GyldLensState,
    (state) => state?.status === 'ok',
  );
  await settled(
    () => tab.read(GYLD_DECIDE_NOW).get() as GyldValue<GyldDecideNow> | undefined,
    (value) => value !== undefined && value.status !== 'unset' && value.status !== 'loading',
  );
  return {
    browser,
    tab,
    markup: () => tab.render(<AskWindow />),
    ref: () => browser.read(GYLD_DEST_REF_TAP).get() as AtomTapHandle<string>,
    conversation: () => tab.read(GYLD_TAB_ASK_CONVERSATION_TAP)
      .get() as AtomTapHandle<AskConversation>,
  };
}

describe('the ask window draws the turns and asks the next question under them', () => {
  it('draws every turn in order, each with its question and its run id', async () => {
    const win = await wiredWindow('fold', { conversation: CONVERSATION, stream: TURNS });
    const markup = win.markup();
    for (const run of ['run-2', 'run-9', 'run-10']) {
      expect(markup).toContain(`data-run="${run}"`);
    }
    expect(markup.indexOf('data-run="run-2"')).toBeLessThan(markup.indexOf('data-run="run-9"'));
    expect(markup.indexOf('data-run="run-9"')).toBeLessThan(markup.indexOf('data-run="run-10"'));
    // each turn's own question, drawn as the reader's half of the turn
    expect(markup).toContain('why is this blocked?');
    expect(markup).toContain('so who decides it?');
    expect(markup).toContain('which passage says so?');
    expect(markup).toContain('gyld-ask-asked');
    // the refused turn is a turn, with its reason and its exit — the exit on
    // the one muted footer line each reply now carries
    expect(markup).toContain('no model key');
    expect(markup).toContain('run-9 · failed');
    expect(markup).toContain('run-2 · done');
    expect(markup).toContain('title="exit 1 · attributed to gianni"');
    // and no other conversation's turn is drawn here
    expect(markup).not.toContain('another window asked this');
  });

  it('puts every turn in the scrolling transcript, and the composer under it',
    async () => {
      const win = await wiredWindow('under', { conversation: CONVERSATION, stream: TURNS });
      const markup = win.markup();
      // header, then the transcript, then the one composer: the layout every
      // chat is read in, and the order the markup is in.
      expect(markup.indexOf('gyld-ask-head'))
        .toBeLessThan(markup.indexOf('gyld-ask-transcript'));
      expect(markup.indexOf('gyld-ask-transcript'))
        .toBeLessThan(markup.indexOf('data-run="run-2"'));
      expect(markup.lastIndexOf('gyld-ask-turn'))
        .toBeLessThan(markup.indexOf('gyld-ask-composer'));
      // and ONE box, for the first question and every follow-up alike
      expect(markup.match(/<textarea/g)).toHaveLength(1);
      expect(markup).toContain('ask a follow-up — Enter sends, Shift+Enter for a new line');
    });

  it('asks the first question from the same box, at the bottom of an empty window',
    async () => {
      const win = await wiredWindow('first', { conversation: CONVERSATION });
      const markup = win.markup();
      expect(markup).toContain('ask about this record — Enter sends, Shift+Enter for a new line');
      expect(markup.match(/<textarea/g)).toHaveLength(1);
      expect(markup).not.toContain('gyld-ask-reply');
      expect(markup).toContain(`conversation ${CONVERSATION}`);
      // the transcript is above the composer whether or not it has anything in it
      expect(markup.indexOf('gyld-ask-transcript'))
        .toBeLessThan(markup.indexOf('gyld-ask-composer'));
    });

  it('folds the context away, closed, and keeps the envelope inside it', async () => {
    const win = await wiredWindow('context', { conversation: CONVERSATION, stream: TURNS });
    const markup = win.markup();
    expect(markup).toContain('<details class="gyld-ask-context">');
    expect(markup).not.toContain('<details class="gyld-ask-context" open=""');
    expect(markup).toContain('<summary>context</summary>');
    expect(markup).toContain('gyld.ask-context.v1');
    expect(markup.indexOf('gyld-ask-context'))
      .toBeLessThan(markup.indexOf('gyld-ask-transcript'));
  });

  it('draws each turn as the question and then the reply, in that order', async () => {
    const win = await wiredWindow('rows', { conversation: CONVERSATION, stream: TURNS });
    const markup = win.markup();
    const turn = markup.slice(
      markup.indexOf('data-run="run-2"'), markup.indexOf('data-run="run-9"'),
    );
    expect(turn.indexOf('gyld-ask-row-asked')).toBeLessThan(turn.indexOf('gyld-ask-row-reply'));
    expect(turn.indexOf('gyld-ask-asked')).toBeLessThan(turn.indexOf('gyld-ask-prose'));
    // the run's own close is the reply's footer, inside the reply's bubble
    expect(turn.indexOf('gyld-ask-bubble')).toBeLessThan(turn.indexOf('gyld-ask-end'));
  });

  it('offers Start over, and one on a window that has no conversation at all', async () => {
    const held = await wiredWindow('over', { conversation: CONVERSATION });
    expect(held.markup()).toContain('gyld-ask-restart');
    expect(held.markup()).toContain('>Start over<');
    const bare = await wiredWindow('bare');
    expect(bare.markup()).toContain('no conversation on this window yet');
    expect(bare.markup()).toContain('>Start a conversation<');
    // and the act mints one on the record the window is on
    const minted = startConversation(bare.conversation(), {
      tabId: 'bare', slot: KEY_CUSTODY, stamp: 1789247615547,
    });
    await expect.poll(() => bare.tab.read(GYLD_TAB_ASK_CONVERSATION).get()?.id)
      .toBe(minted.id);
    expect(bare.markup()).toContain(`conversation ${minted.id}`);
  });

  it('keeps one conversation across turns, and opens a new one when moved', async () => {
    const held = fakeOps();
    const win = await wiredWindow('moved', { conversation: CONVERSATION, ops: held.ops });
    const ask = (slot: string, stamp: number, question: string) => {
      const settledOn = turnConversation(win.conversation(), {
        tabId: 'moved', slot, stamp,
      });
      return explainSubmit(
        win.tab.read(GYLD_OPS).get(),
        { ...envelopeOn(slot), conversation: settledOn.id },
        question,
      );
    };
    await ask(KEY_CUSTODY, 1, 'why is this blocked?');
    await ask(KEY_CUSTODY, 2, 'and what does that turn on?');
    // two turns, one conversation: the follow-up is the same id
    expect(held.calls.map((call) => call.envelope.conversation))
      .toEqual([CONVERSATION, CONVERSATION]);
    expect(held.calls.map((call) => call.question)).toEqual([
      'why is this blocked?', 'and what does that turn on?',
    ]);

    // the reader picks another box in the browser, and this window follows it
    win.ref().set(LIFECYCLE);
    await expect.poll(() => win.tab.read(GYLD_DEST_REF).get()).toBe(LIFECYCLE);
    const markup = win.markup();
    expect(markup).toContain('gyld-ask-moved');
    expect(markup).toContain(`this conversation was opened on ${KEY_CUSTODY}`);

    await ask(LIFECYCLE, 3, 'and this one?');
    const opened = held.calls[2].envelope.conversation;
    expect(opened).not.toBe(CONVERSATION);
    expect(await settledConversation(win)).toEqual({ id: opened, slot: LIFECYCLE });
    // the window now folds THAT conversation, and the first one's turns are
    // where they were asked rather than drawn under a question they are not
    // answers to.
    expect(foldAskReply(TURNS, opened).turns).toEqual([]);
  });
});

/** The envelope this window composes for one record, read off the fixtures —
 *  the same document `AskWindow` composes from its own grips. */
function envelopeOn(slot: string): GyldAskContext {
  return askEnvelope({
    stream: 'base',
    perspective: 'decisions',
    slot,
    lens,
    decideNow,
    records,
    record: recordView(records, slot, decideNow),
    bundle: baseBundle,
    principal: 'gianni',
    conversation: CONVERSATION,
  });
}

async function settledConversation(
  win: { tab: { read<T>(grip: Grip<T>): Drip<T> } },
): Promise<AskConversation | undefined> {
  await expect.poll(
    () => win.tab.read(GYLD_TAB_ASK_CONVERSATION).get()?.slot,
  ).toBe(LIFECYCLE);
  return win.tab.read(GYLD_TAB_ASK_CONVERSATION).get();
}

/** The draft box is this window's own, and an accepted turn empties it: the
 *  question it was pressed with is on the log, where the fold draws it. */
describe('the question box', () => {
  it('is disabled only when nothing seeded it, and holds what the reader typed',
    async () => {
      const win = await wiredWindow('typing', { conversation: CONVERSATION });
      const draft = win.tab.read(GYLD_TAB_ASK_DRAFT_TAP).get() as AtomTapHandle<string>;
      draft.set('why is this blocked?');
      await expect.poll(() => win.markup().includes('why is this blocked?')).toBe(true);
      expect(/<button[^>]*class="gyld-ask-send"[^>]*disabled/.test(win.markup())).toBe(false);
      draft.set('');
      await expect.poll(
        () => /<button[^>]*class="gyld-ask-send"[^>]*disabled/.test(win.markup()),
      ).toBe(true);
    });
});
