import { describe, it, expect } from 'vitest';
import { GlialBinder, MemoryStoreEngine, type Mount } from '@owebeeone/glial-runtime';
import { createAtomValueTap, type Grip } from '@owebeeone/grip-react';
import { grok } from '@grythjs/plugin-api';
import { GYLD_OPS_RUN_ID, GYLD_OPS_RUN_ID_TAP, GYLD_OPS_STREAM } from '../grips';
import {
  GYLD_OPS_ID, GYLD_OUTPUT_ID, GYLD_SHARE, GyldVerb, encodeRequest, verbNamed,
  type GyldOpsRequest,
} from './verbs';
import {
  createGyldOps, responseFrom,
  type GyldExchangeOutcome, type GyldOpsResult, type GyldOutputRecord,
} from './ops';
import { GYLD_DOMAIN, GyldSurfaces, gyldOutputTap } from './surfaces';

// Step 4.3: the operations handle and the run-keyed output mount.
//
// Nothing here touches glade, a network or a DOM. The exchange is a recording
// double, and the log mount runs against a LOCAL glial binder with no
// connectivity at all, which is the same fold the wire drives.
//
// The envelopes are asserted against the supplier's own README
// (`glade-wz/glade-gyld/README.md`, "Command surface" and "The allow-list"):
// if that table and these expectations ever disagree, one of them is wrong and
// the UI is the one that has to move.

const decoder = new TextDecoder();

interface Sent {
  share: string;
  gladeId: string;
  request: GyldOpsRequest;
}

/** The exchange and subscribe calls one handle made, plus whatever it was told
 *  to answer with. Nothing is mocked beyond the wire itself. */
function fakeWire(answers: GyldExchangeOutcome[] | (() => Promise<GyldExchangeOutcome>)) {
  const sent: Sent[] = [];
  const subscribed: { share: string; gladeId: string; key: string }[] = [];
  const results: GyldOpsResult[] = [];
  const runIds: string[] = [];
  let at = 0;
  const wire = {
    principal: 'gianni',
    async exchange(share: string, gladeId: string, payload: Uint8Array) {
      sent.push({ share, gladeId, request: JSON.parse(decoder.decode(payload)) as GyldOpsRequest });
      if (typeof answers === 'function') {
        return answers();
      }
      const answer = answers[Math.min(at, answers.length - 1)];
      at += 1;
      return answer;
    },
    async subscribe(share: string, gladeId: string, key: string) {
      subscribed.push({ share, gladeId, key });
    },
    onResult(result: GyldOpsResult) {
      results.push(result);
    },
    onRunId(runId: string) {
      runIds.push(runId);
    },
  };
  return { wire, sent, subscribed, results, runIds, ops: createGyldOps(wire) };
}

function payload(body: unknown): GyldExchangeOutcome {
  return { ok: true, payload: new TextEncoder().encode(JSON.stringify(body)) };
}

describe('the envelope is the supplier\'s, verb for verb', () => {
  it('names the declared share and exchange surface', async () => {
    const held = fakeWire([payload({ ok: true, run_id: 'run-1', exit: 0 })]);
    await held.ops.list();
    expect(held.sent[0].share).toBe(GYLD_SHARE);
    expect(held.sent[0].gladeId).toBe(GYLD_OPS_ID);
    expect(GYLD_SHARE).toBe('ws-razel');
    expect(GYLD_OPS_ID).toBe('gyld.ops');
    expect(GYLD_OUTPUT_ID).toBe('gyld.output');
  });

  it('sends list with no arguments and no streaming', async () => {
    const held = fakeWire([payload({ ok: true, run_id: 'run-1', exit: 0, stdout: '{}' })]);
    await held.ops.list();
    expect(held.sent[0].request).toEqual({
      verb: 'list', args: {}, stream_output: false, principal: 'gianni',
    });
  });

  it('sends answer as the stream and the overlay text, verbatim, streaming', async () => {
    const overlay = '"""Stream keys."""\n\nfrom gyld import model, use\n';
    const held = fakeWire([payload({ ok: true, run_id: 'run-2', done: false })]);
    await held.ops.answer({ stream: 'keys-2026-09-13', overlay });
    expect(held.sent[0].request).toEqual({
      verb: 'answer',
      args: { stream: 'keys-2026-09-13', overlay },
      stream_output: true,
      principal: 'gianni',
    });
    // the text is not touched on the way out: the supplier writes it as the
    // stream's overlay module and the UI never composes Gyld source twice
    expect(held.sent[0].request.args.overlay).toBe(overlay);
  });

  it('sends ask with the question fragment beside the overlay', async () => {
    const held = fakeWire([payload({ ok: true, run_id: 'run-3', done: false })]);
    await held.ops.ask({ stream: 'keys', overlay: 'A', question: 'B' });
    expect(held.sent[0].request.args).toEqual({ stream: 'keys', overlay: 'A', question: 'B' });
    expect(held.sent[0].request.stream_output).toBe(true);
  });

  it('sends fork and link as parent plus the new stream, with a note only when there is one', async () => {
    const held = fakeWire([payload({ ok: true, run_id: 'run-4', done: false })]);
    await held.ops.fork({ parent: 'base', stream: 'keys' });
    await held.ops.link({ parent: 'base', stream: 'keys-2', note: 'why', force: true });
    expect(held.sent[0].request.verb).toBe('fork');
    expect(held.sent[0].request.args).toEqual({ parent: 'base', stream: 'keys' });
    expect(held.sent[1].request.verb).toBe('link');
    expect(held.sent[1].request.args)
      .toEqual({ parent: 'base', stream: 'keys-2', note: 'why', force: true });
  });

  it('sends rebuild with nothing, and diff with the ORDERED pair', async () => {
    const held = fakeWire([payload({ ok: true, run_id: 'run-5', done: false })]);
    await held.ops.rebuild();
    await held.ops.diff({ left: 'base', right: 'stream-a' });
    expect(held.sent[0].request).toEqual({
      verb: 'rebuild', args: {}, stream_output: true, principal: 'gianni',
    });
    expect(held.sent[1].request.args).toEqual({ left: 'base', right: 'stream-a' });
  });

  it('carries the acting principal on every request', async () => {
    const held = fakeWire([payload({ ok: true, run_id: 'r' })]);
    await held.ops.list();
    await held.ops.rebuild();
    expect(held.sent.map((one) => one.request.principal)).toEqual(['gianni', 'gianni']);
  });

  it('spells the allow-list and nothing else', () => {
    expect([...['list', 'answer', 'ask', 'fork', 'link', 'rebuild', 'diff']]
      .map((name) => verbNamed(name)?.name))
      .toEqual(['list', 'answer', 'ask', 'fork', 'link', 'rebuild', 'diff']);
    // named by spec section 4.7 but refused by the supplier: no host verb yet
    for (const refused of ['occurred', 'lens', 'inspect', 'rm']) {
      expect(verbNamed(refused)).toBeUndefined();
    }
    // which verbs BUILD is the supplier's fact, not a caller's choice
    expect(GyldVerb.LIST.builds).toBe(false);
    expect(GYLD_OPS_ID.length).toBeGreaterThan(0);
    expect(JSON.parse(decoder.decode(encodeRequest(
      GyldVerb.REBUILD.request({}, 'x'),
    )))).toEqual({ verb: 'rebuild', args: {}, stream_output: true, principal: 'x' });
  });
});

describe('a streaming run is followed on the log surface', () => {
  it('subscribes the output surface for the run id, then points the mount at it', async () => {
    const held = fakeWire([payload({ ok: true, run_id: 'run-9', done: false })]);
    await held.ops.fork({ parent: 'base', stream: 'keys' });
    expect(held.subscribed).toEqual([
      { share: GYLD_SHARE, gladeId: GYLD_OUTPUT_ID, key: 'run-9' },
    ]);
    expect(held.runIds).toEqual(['run-9']);
    expect(held.results[0]).toEqual({
      verb: 'fork', response: { ok: true, run_id: 'run-9', done: false },
    });
  });

  it('never follows a verb that does not build, even though its answer carries a run id', async () => {
    const held = fakeWire([payload({ ok: true, run_id: 'run-10', exit: 0 })]);
    await held.ops.list();
    expect(held.subscribed).toEqual([]);
    expect(held.runIds).toEqual([]);
  });

  it('never follows a run that was refused', async () => {
    const held = fakeWire([payload({ ok: false, error: 'stream "../x" is not a stream id' })]);
    const answer = await held.ops.fork({ parent: 'base', stream: '../x' });
    expect(answer.ok).toBe(false);
    expect(held.subscribed).toEqual([]);
    expect(held.runIds).toEqual([]);
  });
});

describe('failure is data, and a press always comes back', () => {
  it('turns a wire refusal into an answer naming the missing provider', async () => {
    const held = fakeWire([{ ok: false }]);
    const answer = await held.ops.list();
    expect(answer.ok).toBe(false);
    expect(answer.error).toContain('gyld.ops');
    expect(held.results[0].response).toBe(answer);
  });

  it('keeps a wire error message when there is one', () => {
    expect(responseFrom({ ok: false, error: 'no route' })).toEqual({ ok: false, error: 'no route' });
  });

  it('reports an empty and an undecodable payload rather than guessing', () => {
    expect(responseFrom({ ok: true }).error).toContain('empty response payload');
    expect(responseFrom({ ok: true, payload: new TextEncoder().encode('not json') }).error)
      .toContain('undecodable');
  });

  it('does not throw or hang when the exchange itself rejects', async () => {
    const held = fakeWire(() => Promise.reject(new Error('socket closed')));
    const answer = await held.ops.rebuild();
    expect(answer.ok).toBe(false);
    expect(answer.error).toContain('socket closed');
    expect(held.results).toHaveLength(1);
  });

  it('says so when a run was accepted but its output cannot be followed', async () => {
    const sent: Sent[] = [];
    const results: GyldOpsResult[] = [];
    const ops = createGyldOps({
      principal: 'gianni',
      async exchange(share, gladeId, bytes) {
        sent.push({ share, gladeId, request: JSON.parse(decoder.decode(bytes)) as GyldOpsRequest });
        return payload({ ok: true, run_id: 'run-11', done: false });
      },
      subscribe: () => Promise.reject(new Error('not subscribed')),
      onResult: (result) => results.push(result),
      onRunId: () => {},
    });
    const answer = await ops.rebuild();
    // the RUN is still accepted: what failed is the following, and both facts
    // are reported rather than one being turned into the other
    expect(answer.ok).toBe(true);
    expect(results).toHaveLength(2);
    expect(results[1].response.error).toContain('could not be followed');
  });
});

describe('the gyld.output mount folds one run\'s records in order', () => {
  // A local binder with no glade destination: the same fold the wire drives,
  // with the ops appended locally instead of arriving from the node.
  const RUN_STREAM = GYLD_OPS_STREAM as unknown as Grip<GyldOutputRecord[]>;

  /** The graph holds contexts and drips by WeakRef, so what a test mounts is
   *  held here for the life of the FILE (test/mount.tsx states the rule). */
  const mounted: unknown[] = [];

  function mountOutput(name: string) {
    const binder = new GlialBinder(new MemoryStoreEngine(), `gyld-test-${name}`);
    const ctx = grok.mainPresentationContext.getOrCreateMatchingContext(`gyld-ops-${name}`);
    const home = ctx.getGripHomeContext();
    // The atom IS its own handle, so the run id is written straight through it
    // rather than through a drip the test would have to wait to resolve.
    const runId = createAtomValueTap(GYLD_OPS_RUN_ID, {
      initial: '', handleGrip: GYLD_OPS_RUN_ID_TAP,
    });
    home.registerTap(runId);
    home.registerTap(gyldOutputTap(binder));
    const consumer = ctx.getGripConsumerContext();
    const records = consumer.getOrCreateConsumer(RUN_STREAM);
    records.subscribe(() => {});
    const writers = new Map<string, Mount>();
    mounted.push(ctx, home, records, runId, writers);
    return {
      binder,
      records,
      setRun: (id: string) => runId.set(id),
      /**
       * Append as the supplier would, straight onto that run's instance. The
       * writer's mount is HELD for the life of the test, exactly as a live
       * writer holds one: the last unmount tears the instance down, and a
       * write into an instance nobody holds is a write nobody sees.
       */
      append: (id: string, record: GyldOutputRecord) => {
        // The same fill the tap derives: one domain, the run id as the key.
        let mount = writers.get(id);
        if (mount === undefined) {
          mount = binder.mount(GyldSurfaces.output, { domain: GYLD_DOMAIN, key: id });
          writers.set(id, mount);
        }
        mount.instance.write(new TextEncoder().encode(JSON.stringify(record)));
      },
    };
  }

  const lines = (run: string, texts: string[]): GyldOutputRecord[] => texts.map((line, at) => ({
    run_id: run, seq: at + 1, principal: 'gianni', stream: 'stdout', line,
  }));

  it('converges the run\'s lines in the order they were appended', async () => {
    const out = mountOutput('order');
    out.setRun('run-a');
    for (const record of lines('run-a', ['capturing', 'validating', 'writing'])) {
      out.append('run-a', record);
    }
    await expect.poll(() => out.records.get()?.length).toBe(3);
    expect(out.records.get()?.map((record) => record.line))
      .toEqual(['capturing', 'validating', 'writing']);
    expect(out.records.get()?.map((record) => record.seq)).toEqual([1, 2, 3]);
  });

  it('is keyed by the run, so a second run is a second fold and not an append', async () => {
    const out = mountOutput('keys');
    out.setRun('run-b');
    for (const record of lines('run-b', ['one', 'two'])) {
      out.append('run-b', record);
    }
    await expect.poll(() => out.records.get()?.length).toBe(2);
    out.append('run-c', lines('run-c', ['fresh'])[0]);
    out.setRun('run-c');
    await expect.poll(() => out.records.get()?.map((record) => record.line)).toEqual(['fresh']);
  });

  it('carries the end marker as a record like any other', async () => {
    const out = mountOutput('end');
    out.setRun('run-d');
    out.append('run-d', lines('run-d', ['building'])[0]);
    out.append('run-d', {
      run_id: 'run-d', seq: 2, principal: 'gianni', stream: 'end', done: true, exit: 0,
    });
    await expect.poll(() => out.records.get()?.length).toBe(2);
    const last = out.records.get()![1];
    expect(last.stream).toBe('end');
    expect(last.done).toBe(true);
    expect(last.exit).toBe(0);
  });
});
