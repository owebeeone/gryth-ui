import { describe, it, expect } from 'vitest';
import { GlialBinder, MemoryStoreEngine, type Mount } from '@owebeeone/glial-runtime';
import {
  createAtomValueTap, type AtomTapHandle, type Drip, type Grip,
} from '@owebeeone/grip-react';
import { grok } from '@grythjs/plugin-api';
import {
  readDecideNow, readLens, readProjection, readStream, type GyldDecideNow,
} from '../contract';
import {
  GYLD_ASK_CONVERSATION, GYLD_ASK_CONVERSATION_TAP, GYLD_ASK_STREAM,
  GYLD_DECIDE_NOW, GYLD_LENS, GYLD_OPS, GYLD_OPS_STATUS,
  GYLD_TAB_ASK_ANSWER, GYLD_TAB_ASK_ANSWER_TAP,
  GYLD_TAB_ASK_DRAFT, GYLD_TAB_ASK_DRAFT_TAP,
} from '../grips';
import {
  GYLD_ASK_ID, GYLD_OPS_ID, GYLD_OUTPUT_ID, GYLD_SHARE, GyldVerb, verbNamed,
  type GyldOpsRequest,
} from '../ops/verbs';
import {
  createGyldOps, type GyldExchangeOutcome, type GyldOps, type GyldOpsResponse,
  type GyldOpsResult,
} from '../ops/ops';
import { GYLD_DOMAIN, GyldSurfaces, gyldAskTap } from '../ops/surfaces';
import { indexProjection, recordView } from '../records/records';
import { AskWindow } from './AskWindow';
import { askTabTaps } from './askTabTaps';
import { askEnvelope, type GyldAskContext } from './envelope';
import {
  AskStream, NO_REPLY, compareRunIds, foldAskReply, hasReply, type GyldAskRecord,
} from './reply';
import { explainGate, explainSubmit } from './submit';
import { mountDesk, STATIC_SET } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';
import type { GyldBundle, GyldLensState, GyldValue } from '../store/state';
import decisionsFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';
import decideNowFixture from '../../test/fixtures/bundle/streams/base/decide-now.json';
import projectionFixture from '../../test/fixtures/bundle/streams/base/projection.json';
import baseRecordFixture from '../../test/fixtures/bundle/streams/base/stream.json';

// Step 1.5 of GyldAskAgent.md: submit the `explain` verb, and render the
// streamed, cited reply.
//
// Everything here runs against a FAKE WIRE and hand-written records. Nothing
// touches glade, a network, a model or a DOM: the exchange is a recording
// double, the reply surface is a local glial binder with no connectivity, and
// the window renders to static markup as every window test in this package
// does. What is asserted is the envelope that goes out, the fold that comes
// back, and the words a reader sees — including each of section 4's four
// refusals, which are DATA and are drawn as data.

const KEY_CUSTODY = 'glade_decisions:GladeDecisions.key_custody';
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

/** The very envelope the window composes for `key_custody` on `base`. */
const envelope = (question = 'why is this blocked?'): GyldAskContext => askEnvelope({
  stream: 'base',
  perspective: 'decisions',
  slot: KEY_CUSTODY,
  lens,
  decideNow,
  records,
  record: recordView(records, KEY_CUSTODY, decideNow),
  bundle: baseBundle,
  principal: 'gianni',
  conversation: CONVERSATION,
  question,
});

const decoder = new TextDecoder();

interface Sent { share: string; gladeId: string; request: GyldOpsRequest }

/** The exchange, subscribe and atom writes one handle made, with whatever it
 *  was told to answer. Nothing is mocked beyond the wire itself. */
function fakeWire(answer: GyldExchangeOutcome) {
  const sent: Sent[] = [];
  const subscribed: { share: string; gladeId: string; key: string }[] = [];
  const results: GyldOpsResult[] = [];
  const runIds: string[] = [];
  const conversations: string[] = [];
  const built: GyldOpsResponse[] = [];
  const ops = createGyldOps({
    principal: 'gianni',
    async exchange(share: string, gladeId: string, payload: Uint8Array) {
      sent.push({
        share, gladeId, request: JSON.parse(decoder.decode(payload)) as GyldOpsRequest,
      });
      return answer;
    },
    async subscribe(share: string, gladeId: string, key: string) {
      subscribed.push({ share, gladeId, key });
    },
    onResult: (result) => { results.push(result); },
    onRunId: (runId) => { runIds.push(runId); },
    onConversation: (conversation) => { conversations.push(conversation); },
    onBuilt: (response) => { built.push(response); },
  });
  return { ops, sent, subscribed, results, runIds, conversations, built };
}

function payload(body: unknown): GyldExchangeOutcome {
  return { ok: true, payload: new TextEncoder().encode(JSON.stringify(body)) };
}

const ACCEPTED = payload({ ok: true, run_id: 'run-7', done: false, attributed_to: 'gianni' });

describe('explain is a verb of the supplier, and not the ask verb', () => {
  it('is on the allow-list under its own name, with its own two flags', () => {
    expect(verbNamed('explain')).toBe(GyldVerb.EXPLAIN);
    expect(GyldVerb.EXPLAIN.name).toBe('explain');
    // `ask` still means "append a QUESTION to the overlay and rebuild": the
    // two are different verbs and neither is reachable by the other's name
    expect(GyldVerb.ASK.name).toBe('ask');
    expect(GyldVerb.EXPLAIN).not.toBe(GyldVerb.ASK);
    // it BUILDS NOTHING and STREAMS: the one verb whose two flags differ
    expect(GyldVerb.EXPLAIN.builds).toBe(false);
    expect(GyldVerb.EXPLAIN.streams).toBe(true);
    expect(GyldVerb.EXPLAIN.touchesBundle).toBe(false);
    expect(GYLD_ASK_ID).toBe('gyld.ask');
  });

  it('sends the envelope whole, with the question pressed with, streaming', async () => {
    const held = fakeWire(ACCEPTED);
    await held.ops.explain(envelope(''), 'why is this blocked?');
    expect(held.sent).toHaveLength(1);
    expect(held.sent[0].share).toBe(GYLD_SHARE);
    expect(held.sent[0].gladeId).toBe(GYLD_OPS_ID);
    const request = held.sent[0].request;
    expect(request.verb).toBe('explain');
    expect(request.stream_output).toBe(true);
    // attributed as every verb is (owner ruling O6)
    expect(request.principal).toBe('gianni');
    // the envelope, whole, and nothing beside it
    expect(Object.keys(request.args)).toEqual(['context']);
    expect(request.args.context).toEqual({ ...envelope(''), question: 'why is this blocked?' });
    expect(request.args.context?.conversation).toBe(CONVERSATION);
  });

  it('follows the reply on gyld.ask, keyed by the CONVERSATION, not the run', async () => {
    const held = fakeWire(ACCEPTED);
    await held.ops.explain(envelope(), 'why is this blocked?');
    // subscribed BEFORE the mount is pointed at the key, so the node's replay
    // is not raced by the first delta
    expect(held.subscribed).toEqual([{
      share: GYLD_SHARE, gladeId: GYLD_ASK_ID, key: CONVERSATION,
    }]);
    expect(held.conversations).toEqual([CONVERSATION]);
    // the RUN mount is left where it was: this run's records are not on
    // gyld.output at all
    expect(held.runIds).toEqual([]);
    expect(held.subscribed.some((s) => s.gladeId === GYLD_OUTPUT_ID)).toBe(false);
  });

  it('asks nothing to be read again, because it wrote nothing', async () => {
    const held = fakeWire(ACCEPTED);
    await held.ops.explain(envelope(), 'why is this blocked?');
    expect(held.built).toEqual([]);
    // a build, by contrast, is exactly the thing that moves the shares
    const building = fakeWire(payload({ ok: true, run_id: 'run-8', done: false }));
    await building.ops.rebuild();
    expect(building.built).toHaveLength(1);
  });

  it('sends nothing at all without a conversation or a question', async () => {
    const held = fakeWire(ACCEPTED);
    expect(await explainSubmit(held.ops, envelope(''), '   ')).toBeUndefined();
    expect(await explainSubmit(held.ops, { ...envelope(), conversation: '' }, 'why?'))
      .toBeUndefined();
    expect(await explainSubmit(undefined, envelope(), 'why?')).toBeUndefined();
    expect(held.sent).toEqual([]);
  });

  it('says why the Ask button cannot be pressed, in the window\'s own words', () => {
    const { ops } = fakeWire(ACCEPTED);
    expect(explainGate(undefined, 'live', CONVERSATION, 'why?').reason).toContain('no glade node');
    expect(explainGate(ops, 'offline', CONVERSATION, 'why?').reason).toContain('offline');
    expect(explainGate(ops, 'live', '', 'why?').reason).toContain('no conversation');
    expect(explainGate(ops, 'live', CONVERSATION, '  ').reason).toContain('type a question');
    expect(explainGate(ops, 'live', CONVERSATION, 'why?')).toEqual({ ready: true, reason: '' });
  });
});

describe('every refusal of section 4 comes back as data, and nothing is followed', () => {
  /** The supplier's own sentences (`glade-gyld/src/ask.rs`, `AskRefusal`).
   *  Each is answered synchronously, before a run id exists. */
  const REFUSALS = [
    ['no key configured', 'no model key: set ANTHROPIC_API_KEY in the supplier\'s '
      + 'environment, or write /b/agent/api-key'],
    ['no source index', 'this build emitted no source index: '
      + '/b/builds/build-1/sources.json is absent, so nothing can be cited. Rebuild with '
      + 'emit_decision_streams.py --sources-root <the cited workzone>'],
    ['a budget refused before the call',
      'this turn counts 412000 input tokens; the per-run budget is 200000, so nothing was sent'],
    ['a malformed envelope',
      'the ask envelope says "gyld.ask-context.v0"; this verb reads gyld.ask-context.v1'],
  ] as const;

  for (const [what, says] of REFUSALS) {
    it(`carries ${what} as the answer, with no mount pointed at anything`, async () => {
      const held = fakeWire(payload({ ok: false, error: says, attributed_to: 'gianni' }));
      const response = await held.ops.explain(envelope(), 'why is this blocked?');
      expect(response.ok).toBe(false);
      expect(response.error).toBe(says);
      // nothing threw, nothing hung, and nothing was followed
      expect(held.subscribed).toEqual([]);
      expect(held.conversations).toEqual([]);
      expect(held.results).toEqual([{ verb: 'explain', response }]);
    });
  }

  it('reports a wire with no supplier behind it as the answer too', async () => {
    const held = fakeWire({ ok: false, error: 'no route to ws-razel' });
    const response = await held.ops.explain(envelope(), 'why?');
    expect(response.ok).toBe(false);
    expect(response.error).toBe('no route to ws-razel');
    expect(held.conversations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The fold: a conversation's log, as the window draws it.
// ---------------------------------------------------------------------------

const answerLine = (run: string, seq: number, line: string): GyldAskRecord => ({
  run_id: run, seq, principal: 'gianni', conversation: CONVERSATION, stream: 'answer', line,
});

const citation = (run: string, seq: number, record: GyldAskRecord['record']): GyldAskRecord => ({
  run_id: run, seq, principal: 'gianni', conversation: CONVERSATION, stream: 'citation', record,
});

const end = (run: string, seq: number, exit: number, line?: string): GyldAskRecord => ({
  run_id: run,
  seq,
  principal: 'gianni',
  conversation: CONVERSATION,
  stream: 'end',
  done: true,
  exit,
  ...(line === undefined ? {} : { line }),
});

const Q11 = {
  tag: 'Q11',
  cites: 'record',
  resolved: true,
  document: 'GladeBuyBuildMatrix',
  path: 'gyld-wz/dev-docs/GladeBuyBuildMatrix.md',
  heading: 'The matrix',
  lines: [211, 213],
  passage: '| Q11 | key custody | owner-held keys are the default |',
  digest: 'ab'.repeat(32),
  truncated: false,
};

const AZ7 = {
  tag: 'AZ-7',
  cites: 'ruling',
  resolved: false,
  reason: "this build's index does not list this tag",
};

/** One ordinary turn: prose in three chunks, two citations, a clean close. */
const TURN = [
  answerLine('run-7', 1, 'key_custody is blocked '),
  answerLine('run-7', 2, 'by scope_model, '),
  citation('run-7', 3, Q11),
  answerLine('run-7', 4, 'which this stream has not ruled on.'),
  citation('run-7', 5, AZ7),
  end('run-7', 6, 0),
];

describe('the reply folds into what the window draws', () => {
  it('joins the prose in sequence order and keeps the citations in theirs', () => {
    const reply = foldAskReply(TURN, CONVERSATION);
    expect(reply.turns).toHaveLength(1);
    const turn = reply.turns[0];
    expect(turn.runId).toBe('run-7');
    expect(turn.principal).toBe('gianni');
    // verbatim: the chunks joined with NOTHING between them
    expect(turn.prose)
      .toBe('key_custody is blocked by scope_model, which this stream has not ruled on.');
    expect(turn.citations.map((cited) => cited.tag)).toEqual(['Q11', 'AZ-7']);
    expect(turn.citations[0].passage).toBe(Q11.passage);
    expect(turn.citations[0].path).toBe(Q11.path);
    expect(turn.ended).toBe(true);
    expect(turn.exit).toBe(0);
    expect(turn.said).toEqual([]);
    expect(hasReply(reply)).toBe(true);
  });

  it('draws what has arrived while the turn is still open', () => {
    const reply = foldAskReply(TURN.slice(0, 3), CONVERSATION);
    expect(reply.turns[0].ended).toBe(false);
    expect(reply.turns[0].exit).toBeUndefined();
    expect(reply.turns[0].prose).toBe('key_custody is blocked by scope_model, ');
  });

  it('ignores the records of another conversation, whatever mount they came on', () => {
    const mixed: GyldAskRecord[] = [
      ...TURN,
      { ...answerLine('run-9', 1, 'a different question entirely'), conversation: OTHER },
      { ...end('run-9', 2, 0), conversation: OTHER },
    ];
    const reply = foldAskReply(mixed, CONVERSATION);
    expect(reply.turns.map((turn) => turn.runId)).toEqual(['run-7']);
    expect(reply.records).toBe(TURN.length);
    expect(reply.turns[0].prose).not.toContain('different question');
    // and the other window folds only its own, out of the same records
    expect(foldAskReply(mixed, OTHER).turns.map((turn) => turn.runId)).toEqual(['run-9']);
  });

  it('orders by run id and then by sequence, however the records arrived', () => {
    const shuffled: GyldAskRecord[] = [
      end('run-10', 2, 0),
      answerLine('run-2', 2, 'second '),
      answerLine('run-10', 1, 'later turn'),
      end('run-2', 3, 0),
      answerLine('run-2', 1, 'first '),
    ];
    const reply = foldAskReply(shuffled, CONVERSATION);
    // run-2 before run-10: a plain text order would read `run-10` as earlier
    expect(reply.turns.map((turn) => turn.runId)).toEqual(['run-2', 'run-10']);
    expect(reply.turns[0].prose).toBe('first second ');
    expect(compareRunIds('run-2', 'run-10')).toBeLessThan(0);
    expect(compareRunIds('first-build', 'run-1')).toBeLessThan(0);
    expect(compareRunIds('run-3', 'run-3')).toBe(0);
  });

  it('keeps the partial answer of a turn a budget stopped, and says the reason', () => {
    const stopped: GyldAskRecord[] = [
      answerLine('run-7', 1, 'the ruling turns on '),
      {
        run_id: 'run-7',
        seq: 2,
        principal: 'gianni',
        conversation: CONVERSATION,
        stream: 'stderr',
        line: 'the answer stopped at the output budget of 4096 tokens and is partial',
      },
      end('run-7', 3, 1),
    ];
    const turn = foldAskReply(stopped, CONVERSATION).turns[0];
    // half an answer that SAYS it is half an answer is data
    expect(turn.prose).toBe('the ruling turns on ');
    expect(turn.said).toEqual([{
      stream: 'stderr',
      text: 'the answer stopped at the output budget of 4096 tokens and is partial',
    }]);
    expect(turn.exit).toBe(1);
  });

  it('carries a refusal said on the end record itself', () => {
    const refused = [end('run-7', 1, 1, 'no model key: set ANTHROPIC_API_KEY …')];
    const turn = foldAskReply(refused, CONVERSATION).turns[0];
    expect(turn.said[0].text).toContain('no model key');
    expect(turn.exit).toBe(1);
    expect(turn.prose).toBe('');
  });

  it('draws nothing for a record it has no line for, and never a blank one', () => {
    const later: GyldAskRecord[] = [
      answerLine('run-7', 1, 'prose'),
      // A draft, which step 3.2 renders as an OFFER of its own, and a stream
      // no version has ever emitted, which draws nothing at all.
      {
        run_id: 'run-7',
        seq: 2,
        conversation: CONVERSATION,
        stream: 'draft',
        record: { alternative: 'recovery_keys', ruling_text: 'hold them' },
      },
      { run_id: 'run-7', seq: 3, conversation: CONVERSATION, stream: 'telemetry' },
      end('run-7', 4, 0),
    ];
    const turn = foldAskReply(later, CONVERSATION).turns[0];
    expect(turn.prose).toBe('prose');
    expect(turn.citations).toEqual([]);
    expect(turn.said).toEqual([]);
    // the draft is on its own list, never folded into the prose or the
    // citations: it is an offer, not an answer
    expect(turn.drafts).toEqual([{ alternative: 'recovery_keys', ruling_text: 'hold them' }]);
    expect(AskStream.byName('draft')).toBe(AskStream.DRAFT);
    expect(AskStream.byName('telemetry')).toBeUndefined();
  });

  it('folds nothing at all before a conversation, or before a record', () => {
    expect(foldAskReply(TURN, '')).toBe(NO_REPLY);
    expect(foldAskReply(undefined, CONVERSATION)).toBe(NO_REPLY);
    expect(foldAskReply([], CONVERSATION)).toBe(NO_REPLY);
    expect(hasReply(NO_REPLY)).toBe(false);
  });
});

describe('the gyld.ask mount is keyed by the conversation', () => {
  const ASK_STREAM = GYLD_ASK_STREAM as unknown as Grip<GyldAskRecord[]>;
  /** The graph holds contexts and drips by WeakRef, so what a test mounts is
   *  held for the life of the FILE (test/mount.tsx states the rule). */
  const mounted: unknown[] = [];

  function mountAsk(name: string) {
    const binder = new GlialBinder(new MemoryStoreEngine(), `gyld-ask-${name}`);
    const ctx = grok.mainPresentationContext.getOrCreateMatchingContext(`gyld-ask-${name}`);
    const home = ctx.getGripHomeContext();
    const conversation = createAtomValueTap(GYLD_ASK_CONVERSATION, {
      initial: '', handleGrip: GYLD_ASK_CONVERSATION_TAP,
    });
    home.registerTap(conversation);
    home.registerTap(gyldAskTap(binder));
    const consumer = ctx.getGripConsumerContext();
    const held = consumer.getOrCreateConsumer(ASK_STREAM);
    held.subscribe(() => {});
    const writers = new Map<string, Mount>();
    mounted.push(ctx, home, held, conversation, writers);
    return {
      records: held,
      follow: (id: string) => conversation.set(id),
      append: (id: string, record: GyldAskRecord) => {
        let mount = writers.get(id);
        if (mount === undefined) {
          mount = binder.mount(GyldSurfaces.ask, { domain: GYLD_DOMAIN, key: id });
          writers.set(id, mount);
        }
        mount.instance.write(new TextEncoder().encode(JSON.stringify(record)));
      },
    };
  }

  it('folds one conversation\'s turns, and another conversation is another fold', async () => {
    const out = mountAsk('keys');
    out.follow(CONVERSATION);
    for (const record of TURN) {
      out.append(CONVERSATION, record);
    }
    await expect.poll(() => out.records.get()?.length).toBe(TURN.length);
    expect(foldAskReply(out.records.get(), CONVERSATION).turns[0].prose)
      .toBe('key_custody is blocked by scope_model, which this stream has not ruled on.');

    out.append(OTHER, { ...answerLine('run-9', 1, 'elsewhere'), conversation: OTHER });
    out.follow(OTHER);
    await expect.poll(() => out.records.get()?.map((record) => record.line)).toEqual(['elsewhere']);
  });

  it('holds one mount across the turns of a conversation', async () => {
    const out = mountAsk('turns');
    out.follow(CONVERSATION);
    for (const record of TURN) {
      out.append(CONVERSATION, record);
    }
    await expect.poll(() => out.records.get()?.length).toBe(TURN.length);
    // a SECOND turn of the same conversation lands on the same fold: the key
    // did not change, so nothing remounted
    out.append(CONVERSATION, answerLine('run-8', 1, 'and a follow-up'));
    out.append(CONVERSATION, end('run-8', 2, 0));
    await expect.poll(() => out.records.get()?.length).toBe(TURN.length + 2);
    const reply = foldAskReply(out.records.get(), CONVERSATION);
    expect(reply.turns.map((turn) => turn.runId)).toEqual(['run-7', 'run-8']);
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
function fakeOps(answer: GyldOpsResponse = { ok: true, run_id: 'run-7', done: false }) {
  const calls: { envelope: GyldAskContext; question: string }[] = [];
  return {
    calls,
    ops: {
      principal: 'gianni',
      explain: async (context: GyldAskContext, question: string) => {
        calls.push({ envelope: context, question });
        return answer;
      },
    } as unknown as GyldOps,
  };
}

/** An ask window on `key_custody`, with the reply records this test seeds. */
async function askWindow(name: string, options: {
  conversation?: string;
  stream?: GyldAskRecord[];
  ops?: GyldOps;
  status?: string;
} = {}) {
  const desk = mountDesk(STATIC_SET, image);
  const home = desk.ctx.getGripHomeContext();
  home.registerTap(createAtomValueTap<GyldOps>(GYLD_OPS, {
    initial: options.ops ?? fakeOps().ops,
  }));
  home.registerTap(createAtomValueTap(GYLD_OPS_STATUS, { initial: options.status ?? 'live' }));
  home.registerTap(createAtomValueTap(GYLD_ASK_STREAM, {
    initial: (options.stream ?? []) as never,
  }));
  const tab = desk.tab(name, askTabTaps(name, {
    stream: 'base',
    perspective: 'decisions',
    ref: KEY_CUSTODY,
    conversation: options.conversation ?? CONVERSATION,
  }));
  await settled(
    () => tab.read(GYLD_LENS).get() as GyldLensState,
    (state) => state?.status === 'ok',
  );
  await settled(
    () => tab.read(GYLD_DECIDE_NOW).get() as GyldValue<GyldDecideNow> | undefined,
    (value) => value !== undefined && value.status !== 'unset' && value.status !== 'loading',
  );
  return { desk, tab, markup: () => tab.render(<AskWindow />) };
}

describe('the ask window submits, and draws what comes back', () => {
  it('offers an Ask button beside the envelope and says what it would send', async () => {
    const on = await askWindow('ask-send');
    const markup = on.markup();
    expect(markup).toContain('gyld-ask-send');
    expect(markup).toContain('your question');
    // step 0.3's "nothing is sent yet" is gone: there IS a verb behind it now
    expect(markup).not.toContain('gyld-ask-nosubmit');
    expect(markup).toContain('nothing has been asked from this window yet');
    // the envelope is open while no reply exists
    expect(markup).toContain('<details class="gyld-ask-envelope-fold" open=""');
    expect(markup).toContain('gyld.ask-context.v1');
  });

  it('cannot be pressed without a question, and says so', async () => {
    const on = await askWindow('ask-empty');
    expect(/<button[^>]*class="gyld-ask-send"[^>]*disabled/.test(on.markup())).toBe(true);
    expect(on.markup()).toContain('type a question first');
  });

  it('sends the composed envelope and the typed question, and holds the answer', async () => {
    const held = fakeOps({ ok: true, run_id: 'run-7', done: false, attributed_to: 'gianni' });
    const on = await askWindow('ask-press', { ops: held.ops });
    const draft = on.tab.read(GYLD_TAB_ASK_DRAFT_TAP).get() as AtomTapHandle<string>;
    draft.set('why is this blocked?');
    await expect.poll(() => on.tab.read(GYLD_TAB_ASK_DRAFT).get()).toBe('why is this blocked?');
    expect(/<button[^>]*class="gyld-ask-send"[^>]*disabled/.test(on.markup())).toBe(false);

    // the press, as this package asserts every press: by calling the act
    const response = await explainSubmit(
      on.tab.read(GYLD_OPS).get(),
      askEnvelopeOf(on.tab),
      'why is this blocked?',
    );
    expect(held.calls).toHaveLength(1);
    expect(held.calls[0].envelope.conversation).toBe(CONVERSATION);
    expect(held.calls[0].envelope.record.slot).toBe(KEY_CUSTODY);
    expect(held.calls[0].question).toBe('why is this blocked?');

    (on.tab.read(GYLD_TAB_ASK_ANSWER_TAP).get() as AtomTapHandle<GyldOpsResponse | null>)
      .set(response!);
    await expect.poll(() => on.tab.read(GYLD_TAB_ASK_ANSWER).get()?.run_id).toBe('run-7');
    const markup = on.markup();
    expect(markup).toContain('explain: accepted, run run-7, attributed to gianni');
  });

  it('draws the prose, the passages it cited and the run\'s close', async () => {
    const on = await askWindow('ask-reply', { stream: TURN });
    const markup = on.markup();
    expect(markup).toContain('gyld-ask-reply');
    expect(markup).toContain('data-run="run-7"');
    expect(markup).toContain(
      'key_custody is blocked by scope_model, which this stream has not ruled on.',
    );
    // the citation: its tag, the file it is in, and the passage itself
    expect(markup).toContain('data-tag="Q11"');
    expect(markup).toContain('gyld-wz/dev-docs/GladeBuyBuildMatrix.md');
    expect(markup).toContain('The matrix');
    expect(markup).toContain('lines 211-213');
    expect(markup).toContain('key custody | owner-held keys are the default');
    // the tag the answer cited and the index resolved to nothing is SAID
    expect(markup).toContain('data-tag="AZ-7"');
    expect(markup).toContain('data-resolved="no"');
    expect(markup).toContain("this build&#x27;s index does not list this tag");
    expect(markup).toContain('end, exit 0');
    // and the envelope stays, folded away, now that there is a reply
    expect(markup).toContain('<details class="gyld-ask-envelope-fold"');
    expect(markup).not.toContain('<details class="gyld-ask-envelope-fold" open=""');
    expect(markup).toContain('gyld.ask-context.v1');
  });

  it('says a turn is still answering until its end record lands', async () => {
    const on = await askWindow('ask-open', { stream: TURN.slice(0, 2) });
    expect(on.markup()).toContain('answering');
    expect(on.markup()).not.toContain('end, exit');
  });

  // A turn in flight is SHOWN to be one: the gear turns beside the word for
  // what has actually arrived, and the Ask button is closed while it does.
  // The derivation is `./busy.ts` and is asserted there, over hand-written
  // records; what is asserted here is that the window draws it.
  describe('a turn in flight turns, and says what of it has arrived', () => {
    const asked: GyldAskRecord = {
      run_id: 'run-7',
      seq: 0,
      principal: 'gianni',
      conversation: CONVERSATION,
      stream: 'question',
      line: 'why is this blocked?',
    };
    const ACCEPT: GyldOpsResponse = {
      ok: true, run_id: 'run-7', done: false, attributed_to: 'gianni',
    };

    /** This window with those records on the log, and the accept a press wrote
     *  into its own atom. */
    async function inFlight(name: string, stream: GyldAskRecord[]) {
      const on = await askWindow(name, { stream });
      (on.tab.read(GYLD_TAB_ASK_ANSWER_TAP).get() as AtomTapHandle<GyldOpsResponse | null>)
        .set(ACCEPT);
      await expect.poll(() => on.tab.read(GYLD_TAB_ASK_ANSWER).get()?.run_id).toBe('run-7');
      return on;
    }

    // In the order the supplier writes one turn: the question, then the
    // sources it grounded on, then the prose (`glade-gyld/src/supplier.rs`).
    const STEPS: [string, GyldAskRecord[]][] = [
      ['asking', []],
      ['thinking', [asked]],
      ['citing', [asked, citation('run-7', 1, Q11)]],
      ['answering', [asked, citation('run-7', 1, Q11),
        answerLine('run-7', 2, 'key_custody is blocked ')]],
    ];

    it.each(STEPS)('shows the gear and says %s', async (word, stream) => {
      const markup = (await inFlight(`ask-flight-${word}`, stream)).markup();
      expect(markup).toContain('class="gyld-ask-working"');
      expect(markup).toContain(`data-phase="${word}"`);
      // the animation itself, and its own first frame for a reader who has
      // asked for stillness — one picture, two ways, no second code path
      expect(markup).toContain('gyld-ask-working-turn');
      expect(markup).toContain('working-96.gif');
      expect(markup).toContain('media="(prefers-reduced-motion: reduce)"');
      expect(markup).toContain('working-96-still.png');
      // the word is the load-bearing half, and it is a live region
      expect(markup).toContain(`role="status"`);
      expect(markup).toContain(`>${word}</span>`);
      // nothing can be asked on top of a turn already in flight, and the box
      // the next question is typed into says why
      expect(/<button[^>]*class="gyld-ask-send"[^>]*disabled/.test(markup)).toBe(true);
      expect(markup).toContain('one turn is in flight');
      expect(markup).toContain(`${word}… the next question can be asked once this turn closes`);
    });

    it('takes the gear and the word away when the end record lands', async () => {
      const on = await inFlight('ask-flight-end', [asked, ...TURN]);
      const markup = on.markup();
      expect(markup).not.toContain('gyld-ask-working');
      expect(markup).not.toContain('one turn is in flight');
      // the turn is drawn, closed, exactly as it was before any of this
      expect(markup).toContain('end, exit 0');
      expect(markup).toContain('your follow-up');
    });

    it('takes them away on a refusal that arrived before any run started', async () => {
      const on = await askWindow('ask-flight-refused');
      (on.tab.read(GYLD_TAB_ASK_ANSWER_TAP).get() as AtomTapHandle<GyldOpsResponse | null>)
        .set({ ok: false, error: 'no model key: set ANTHROPIC_API_KEY' });
      await expect.poll(() => on.tab.read(GYLD_TAB_ASK_ANSWER).get()?.ok).toBe(false);
      const markup = on.markup();
      expect(markup).not.toContain('gyld-ask-working');
      // and the refusal is drawn as the data it is
      expect(markup).toContain('explain: refused');
      expect(markup).toContain('no model key');
    });
  });

  it('draws no other conversation\'s reply, however the records arrive', async () => {
    const on = await askWindow('ask-mine', {
      stream: [
        { ...answerLine('run-9', 1, 'another window asked this'), conversation: OTHER },
        { ...end('run-9', 2, 0), conversation: OTHER },
      ],
    });
    const markup = on.markup();
    expect(markup).not.toContain('another window asked this');
    expect(markup).not.toContain('gyld-ask-reply');
  });

  it('renders each refusal as the data it is, in the window', async () => {
    const says = {
      key: 'no model key: set ANTHROPIC_API_KEY in the supplier\'s environment, '
        + 'or write /b/agent/api-key',
      index: 'this build emitted no source index: /b/builds/build-1/sources.json is absent, '
        + 'so nothing can be cited',
      envelope: 'the ask envelope carries no `question`',
      budget: 'this turn counts 412000 input tokens; the per-run budget is 200000, '
        + 'so nothing was sent',
    };
    for (const [name, error] of Object.entries(says)) {
      const on = await askWindow(`ask-refused-${name}`);
      (on.tab.read(GYLD_TAB_ASK_ANSWER_TAP).get() as AtomTapHandle<GyldOpsResponse | null>)
        .set({ ok: false, error, attributed_to: 'gianni' });
      await expect.poll(() => on.tab.read(GYLD_TAB_ASK_ANSWER).get()?.ok).toBe(false);
      const markup = on.markup();
      expect(markup).toContain('explain: refused');
      expect(markup).toContain('gyld-ask-refusal');
      // the supplier's own sentence, whole — not a toast, not a summary
      for (const word of error.split(' ').slice(0, 4)) {
        expect(markup).toContain(word.replace(/'/g, '&#x27;'));
      }
    }
  });

  it('keeps the partial answer of a turn stopped mid-stream, with its reason', async () => {
    const on = await askWindow('ask-stopped', {
      stream: [
        answerLine('run-7', 1, 'the ruling turns on '),
        {
          run_id: 'run-7',
          seq: 2,
          conversation: CONVERSATION,
          stream: 'stderr',
          line: 'the answer stopped at the output budget of 4096 tokens and is partial',
        },
        end('run-7', 3, 1),
      ],
    });
    const markup = on.markup();
    expect(markup).toContain('the ruling turns on');
    expect(markup).toContain('the answer stopped at the output budget');
    expect(markup).toContain('gyld-fault gyld-ask-said');
    expect(markup).toContain('end, exit 1');
  });
});

/** The envelope THIS window composes, read back off its own grips — the same
 *  read `AskWindow` does, so a test presses with the document the reader sees. */
function askEnvelopeOf(tab: { read<T>(grip: Grip<T>): Drip<T> }): GyldAskContext {
  const lensState = tab.read(GYLD_LENS).get() as GyldLensState;
  const list = tab.read(GYLD_DECIDE_NOW).get() as GyldValue<GyldDecideNow>;
  return askEnvelope({
    stream: 'base',
    perspective: 'decisions',
    slot: KEY_CUSTODY,
    lens: lensState.status === 'ok' ? lensState.value : undefined,
    decideNow: list.status === 'ok' ? list.value : undefined,
    records,
    record: recordView(records, KEY_CUSTODY, decideNow),
    bundle: baseBundle,
    principal: 'gianni',
    conversation: CONVERSATION,
    question: 'why is this blocked?',
  });
}
