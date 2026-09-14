import { describe, it, expect } from 'vitest';
import { createAtomValueTap } from '@owebeeone/grip-react';
import { readStreamsIndex, type GyldDecideNow } from '../contract';
import {
  GYLD_ANSWER_DRAFT, GYLD_DECIDE_NOW, GYLD_DIFF, GYLD_OPS, GYLD_OPS_RESULT,
  GYLD_OPS_STATUS, GYLD_OPS_STREAM, GYLD_RECORDS, GYLD_SET_TAP, GYLD_STREAMS,
} from '../grips';
import type { GyldRecords } from '../records/records';
import type { GyldStreamsCensus } from '../store/state';
import { DecideWindow } from '../decide/DecideWindow';
import { decideTabTaps } from '../decide/decideTabTaps';
import {
  REGISTRATION_MARKER, answerOverlay, askJoin, askOverlay, overlayTarget,
  type OverlayTarget,
} from '../decide/overlay';
import { declaredSymbol } from '../decide/symbols';
import { answerSubmit, askSubmit, composeAnswer, composeAsk } from '../decide/compose';
import { DiffWindow } from '../diff/DiffWindow';
import { diffTabTaps } from '../diff/diffTabTaps';
import { StreamManager } from '../streams/StreamManager';
import { streamsTabTaps } from '../streams/streamsTabTaps';
import { StreamOperation, diffCommand, draftCommand } from '../streams/operations';
import { streamSubmit } from '../streams/submit';
import { addStaticRoot } from '../browser/setOps';
import {
  GYLD_STATIC_BASE, buildUrl, opsGate, retargetToBuild,
} from './submit';
import type { GyldOps, GyldOpsResponse, GyldOpsResult } from './ops';
import { mountDesk } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';
import streamsFixture from '../../test/fixtures/bundle/streams.json';

// Step 4.4: submit instead of export.
//
// The export path stays exactly as it was, and the submit beside it sends the
// SAME text. Nothing about a submission is composed twice: one function makes
// the overlay, the Export button puts it in the box and the Submit button puts
// it on the wire, so a test that pins one pins the other.
//
// Every window renders to static markup here, as every window test in this
// package does, so what is asserted is the composed call and the rendered
// state, never a synthetic click.

const index = readStreamsIndex(streamsFixture);
const census: GyldStreamsCensus = {
  status: 'ready',
  streams: index.streams.map((record) => ({ id: record.id, rootIndex: 0, record })),
  collisions: [],
  loadedAt: 'now',
};
const target = overlayTarget(census, 'stream-a') as OverlayTarget;

const VERSION_PIN = 'glade_decisions:GladeDecisions.version_pin';
const BUMP = 'glade_decisions:GladeDecisions.bump_to_current';

const DRAFT = {
  question: VERSION_PIN,
  alternative: BUMP,
  principal: 'gianni',
  stamp: '2026-09-13T01:00:00Z',
  sources: 'IrohReview §1',
  text: '2026-09-13, owner: take iroh 1.2.0 now.',
};

const ASK_DRAFT = {
  symbol: 'PinAudit',
  label: 'pin_audit',
  docstring: 'How the bumped iroh pin is audited.',
  requires: [],
  gates: [],
  alternatives: [
    {
      symbol: 'AuditOnBump',
      label: 'audit_on_bump',
      description: 'Audit the whole dependency set at the bump, once.',
      preferred: false,
    },
    {
      symbol: 'AuditAtSlice',
      label: 'audit_at_slice',
      description: 'Audit at the first real-route slice.',
      preferred: false,
    },
  ],
};

const settled = async <T,>(read: () => T, done: (value: T) => boolean): Promise<T> => {
  await expect.poll(() => done(read())).toBe(true);
  return read();
};

/** Stream A's records, as the store and the index tap actually build them. */
async function streamARecords(): Promise<GyldRecords> {
  const tab = mountDesk(undefined, new FakeBundle())
    .tab('sub-records', decideTabTaps('sub-records', { stream: 'stream-a' }));
  return settled(
    () => tab.read(GYLD_RECORDS).get() as GyldRecords,
    (value) => value?.status === 'ok',
  );
}

interface Call { verb: string; args: Record<string, unknown> }

/** A recording ops handle. Every method answers with whatever this was given,
 *  so a test drives a refusal exactly as it drives a success. */
function fakeOps(answer: GyldOpsResponse = { ok: true, run_id: 'run-1', done: false }) {
  const calls: Call[] = [];
  const record = (verb: string) => async (args: Record<string, unknown> = {}) => {
    calls.push({ verb, args });
    return answer;
  };
  const ops = {
    list: record('list'),
    answer: record('answer'),
    ask: record('ask'),
    fork: record('fork'),
    link: record('link'),
    rebuild: record('rebuild'),
    diff: record('diff'),
  } as unknown as GyldOps;
  return { ops, calls };
}

/** A desk whose windows can submit, with the ops handle, the connection state
 *  and the last answer seeded the way the live module produces them. */
function deskWith(options: {
  ops?: GyldOps;
  status?: string;
  result?: GyldOpsResult | null;
  stream?: unknown[];
} = {}) {
  const desk = mountDesk(undefined, new FakeBundle());
  const home = desk.ctx.getGripHomeContext();
  if (options.ops !== undefined) {
    home.registerTap(createAtomValueTap<GyldOps>(GYLD_OPS, { initial: options.ops }));
  }
  home.registerTap(createAtomValueTap(GYLD_OPS_STATUS, { initial: options.status ?? 'live' }));
  home.registerTap(createAtomValueTap<GyldOpsResult | null>(GYLD_OPS_RESULT, {
    initial: options.result ?? null,
  }));
  home.registerTap(createAtomValueTap(GYLD_OPS_STREAM, {
    initial: (options.stream ?? []) as never,
  }));
  return desk;
}

describe('what a submit is allowed to do, and when it is not', () => {
  it('is refused with the reason when no glade node produced Gyld.Ops', () => {
    const gate = opsGate(undefined, '');
    expect(gate.ready).toBe(false);
    expect(gate.reason).toContain('no glade node');
  });

  it('is refused while the glade connection is offline', () => {
    const { ops } = fakeOps();
    const gate = opsGate(ops, 'offline');
    expect(gate.ready).toBe(false);
    expect(gate.reason).toContain('offline');
  });

  it('is allowed when a handle resolved and the connection is live', () => {
    const { ops } = fakeOps();
    expect(opsGate(ops, 'live')).toEqual({ ready: true, reason: '' });
    // connecting is neither unresolved nor offline: the send is allowed and a
    // failure comes back as data, which is the whole rule
    expect(opsGate(ops, 'connecting').ready).toBe(true);
  });
});

describe('a submit sends exactly the text the export writes', () => {
  it('answers with the composed overlay, verbatim, on the window\'s stream', async () => {
    const desk = deskWith();
    const tab = desk.tab('sub-answer', decideTabTaps('sub-answer', { stream: 'stream-a' }));
    const records = await settled(
      () => tab.read(GYLD_RECORDS).get() as GyldRecords,
      (value) => value?.status === 'ok',
    );
    const rows = (await settled(
      () => tab.read(GYLD_DECIDE_NOW).get(),
      (value) => (value as { status: string })?.status === 'ok',
    ) as { value: GyldDecideNow }).value.questions;

    const composed = composeAnswer({ target, draft: DRAFT, rows, records });
    // the very text the export box would hold, byte for byte
    expect(composed).toBe(answerOverlay({
      target,
      draft: DRAFT,
      question: declaredSymbol(records, VERSION_PIN)!,
      label: 'version_pin',
      alternative: declaredSymbol(records, BUMP)!,
    }));
    expect(composed).toContain('class VersionPinRuling(Ruling):');

    const { ops, calls } = fakeOps();
    await answerSubmit(ops, target, composed);
    expect(calls).toEqual([{
      verb: 'answer', args: { stream: 'stream-a', overlay: composed },
    }]);
  });

  it('composes nothing when the shape check is not met, and submits nothing', async () => {
    const { ops, calls } = fakeOps();
    expect(composeAnswer({
      target, draft: { ...DRAFT, alternative: '' }, rows: [], records: undefined,
    })).toBe('');
    await answerSubmit(ops, target, '');
    expect(calls).toEqual([]);
  });

  it('asks with the two operands whose join IS the exported text', async () => {
    const records = await streamARecords();
    const parts = composeAsk({ target, draft: ASK_DRAFT, records });
    expect(parts).toBeDefined();
    // The supplier writes `overlay.trim_end() + "\n\n" + question.trim_end() +
    // "\n"` (glade-gyld/src/verbs.rs, `overlay_text`). The export composes the
    // module by that same join, so the text the reader reads and the module
    // the supplier writes are the same bytes rather than two that look alike.
    expect(askJoin(parts!)).toBe(askOverlay({
      target, draft: ASK_DRAFT, requires: [], gates: [],
    }));
    expect(parts!.overlay).toContain(REGISTRATION_MARKER);
    expect(parts!.overlay.trimEnd().endsWith('from gyld import model, use')).toBe(true);
    expect(parts!.question).toContain('class PinAudit(Question):');
    expect(parts!.question).not.toContain(REGISTRATION_MARKER);

    const { ops, calls } = fakeOps();
    await askSubmit(ops, target, parts);
    expect(calls).toEqual([{
      verb: 'ask',
      args: { stream: 'stream-a', overlay: parts!.overlay, question: parts!.question },
    }]);
  });

  it('asks nothing at all when the draft does not compose', async () => {
    const { ops, calls } = fakeOps();
    expect(composeAsk({ target, draft: ASK_DRAFT, records: undefined })).toBeUndefined();
    await askSubmit(ops, target, undefined);
    expect(calls).toEqual([]);
  });

  it('forks and links on exactly what the exported command names', async () => {
    const draft = { operation: StreamOperation.FORK, parent: 'base', name: ' keys-2026-09-13 ' };
    expect(draftCommand(draft)).toContain('fork base keys-2026-09-13');
    const { ops, calls } = fakeOps();
    await streamSubmit(ops, draft);
    await streamSubmit(ops, { ...draft, operation: StreamOperation.LINK });
    expect(calls).toEqual([
      { verb: 'fork', args: { parent: 'base', stream: 'keys-2026-09-13' } },
      { verb: 'link', args: { parent: 'base', stream: 'keys-2026-09-13' } },
    ]);
  });

  it('submits no half-composed stream', async () => {
    const { ops, calls } = fakeOps();
    await streamSubmit(ops, { operation: StreamOperation.FORK, parent: '', name: 'keys' });
    await streamSubmit(ops, { operation: StreamOperation.FORK, parent: 'base', name: '  ' });
    expect(calls).toEqual([]);
  });
});

describe('a build that landed is where the next read comes from', () => {
  it('resolves the build directory the answer named to grazel\'s static path', () => {
    expect(buildUrl('/Users/x/data/files/gyld/builds/build-1789247615547'))
      .toBe(`${GYLD_STATIC_BASE}/builds/build-1789247615547`);
    // nothing is guessed: a directory that is not under a `builds/` segment
    // resolves to no URL at all, and the window offers none
    expect(buildUrl('/Users/x/data/files/gyld')).toBeUndefined();
    expect(buildUrl(undefined)).toBeUndefined();
  });

  it('retargets the set at the build, once, leaving the other roots alone', () => {
    const before = addStaticRoot({ roots: [] }, 'http://localhost:5173/gyld-bundle').set;
    const after = retargetToBuild(before, '/d/gyld/builds/build-7');
    expect(after.error).toBeUndefined();
    expect(after.set.roots).toEqual([
      { kind: 'static', baseUrl: 'http://localhost:5173/gyld-bundle' },
      { kind: 'static', baseUrl: `${GYLD_STATIC_BASE}/builds/build-7` },
    ]);
    // the same build twice is the same root twice
    expect(retargetToBuild(after.set, '/d/gyld/builds/build-7').error)
      .toContain('already a root');
    expect(retargetToBuild(before, '/d/gyld').error).toContain('named no build directory');
  });
});

describe('the decide window offers Submit beside Export', () => {
  it('disables both submits with the reason when there is no glade node', async () => {
    const desk = deskWith({ status: '' });
    const tab = desk.tab('sub-none', decideTabTaps('sub-none', {
      stream: 'stream-a', question: VERSION_PIN,
    }));
    await settled(
      () => tab.read(GYLD_DECIDE_NOW).get(),
      (value) => (value as { status: string })?.status === 'ok',
    );
    const markup = tab.render(<DecideWindow />);
    expect(/<button[^>]*class="gyld-answer-submit"[^>]*disabled/.test(markup)).toBe(true);
    expect(/<button[^>]*class="gyld-ask-submit"[^>]*disabled/.test(markup)).toBe(true);
    expect(markup).toContain('no glade node');
    // and the export path is untouched
    expect(markup).toContain('gyld-answer-export');
  });

  it('keeps Export and refuses Submit over a module that already has records', async () => {
    // stream-a's own overlay declares its rulings and its added question, and
    // a submit writes the module whole. The export path is untouched.
    const { ops } = fakeOps();
    const desk = deskWith({ ops });
    const tab = desk.tab('sub-overwrite', decideTabTaps('sub-overwrite', {
      stream: 'stream-a', question: VERSION_PIN,
    }));
    await settled(
      () => tab.read(GYLD_RECORDS).get() as GyldRecords,
      (value) => value?.status === 'ok',
    );
    const markup = tab.render(<DecideWindow />);
    expect(markup).toContain('gyld-decide-unsendable');
    expect(markup).toContain('already declares');
    expect(/<button[^>]*class="gyld-answer-submit"[^>]*disabled/.test(markup)).toBe(true);
    expect(/<button[^>]*class="gyld-ask-submit"[^>]*disabled/.test(markup)).toBe(true);
    // the export is refused only by its own shape check (no alternative
    // chosen yet), never by this: merging by hand is what it is for
    expect(/<button[^>]*class="gyld-answer-export"[^>]*title=""/.test(markup)).toBe(true);
    expect(markup).toContain('choose one offered alternative');
  });

  it('disables them while the connection is offline, and says so', async () => {
    const { ops } = fakeOps();
    const desk = deskWith({ ops, status: 'offline' });
    const tab = desk.tab('sub-offline', decideTabTaps('sub-offline', {
      stream: 'stream-a', question: VERSION_PIN,
    }));
    await settled(
      () => tab.read(GYLD_DECIDE_NOW).get(),
      (value) => (value as { status: string })?.status === 'ok',
    );
    const markup = tab.render(<DecideWindow />);
    expect(/<button[^>]*class="gyld-answer-submit"[^>]*disabled/.test(markup)).toBe(true);
    expect(markup).toContain('offline');
  });

  it('renders a refused answer by its reason, and keeps the draft', async () => {
    const { ops } = fakeOps();
    const desk = deskWith({
      ops,
      result: {
        verb: 'answer',
        response: {
          ok: false,
          error: 'stream keys-2026-09-13: PREREQUISITE_OPEN',
          exit: 1,
          stderr: 'gyld.errors.GyldError: PREREQUISITE_OPEN',
          attributed_to: 'gianni',
        },
      },
    });
    const tab = desk.tab('sub-refused', decideTabTaps('sub-refused', {
      stream: 'stream-a', question: VERSION_PIN,
    }));
    await settled(
      () => tab.read(GYLD_DECIDE_NOW).get(),
      (value) => (value as { status: string })?.status === 'ok',
    );
    const drafts = tab.ctx.getGripConsumerContext().getOrCreateConsumer(GYLD_ANSWER_DRAFT);
    drafts.subscribe(() => {});
    const markup = tab.render(<DecideWindow />);
    expect(markup).toContain('PREREQUISITE_OPEN');
    expect(markup).toContain('gianni');
    // the draft is the reader's work and a refusal never clears it
    expect(drafts.get()).toBeDefined();
    // the gate is open: what stopped this one was the supplier, not the wire
    expect(markup).not.toContain('no glade node');
    expect(markup).not.toContain('the glade node is offline');
  });

  it('shows the streamed output records in the order the log folded them', async () => {
    const { ops } = fakeOps();
    const desk = deskWith({
      ops,
      result: { verb: 'answer', response: { ok: true, run_id: 'run-4', done: false } },
      stream: [
        { run_id: 'run-4', seq: 1, stream: 'stdout', line: 'capturing stream-a' },
        { run_id: 'run-4', seq: 2, stream: 'stderr', line: 'a warning' },
        { run_id: 'run-4', seq: 3, stream: 'end', done: true, exit: 0 },
      ],
    });
    const tab = desk.tab('sub-stream', decideTabTaps('sub-stream', { stream: 'stream-a' }));
    await settled(() => tab.read(GYLD_STREAMS).get(), (value) => value?.status === 'ready');
    const markup = tab.render(<DecideWindow />);
    expect(markup).toContain('capturing stream-a');
    expect(markup).toContain('a warning');
    expect(markup.indexOf('capturing stream-a')).toBeLessThan(markup.indexOf('a warning'));
    expect(markup).toContain('run-4');
    expect(markup).toContain('exit 0');
  });

  it('offers the build the answer named as a root to read it from', async () => {
    const { ops } = fakeOps();
    const desk = deskWith({
      ops,
      result: {
        verb: 'answer',
        response: {
          ok: true, exit: 0, run_id: 'run-5',
          output_dir: '/d/files/gyld/builds/build-1789247615547',
        },
      },
    });
    const tab = desk.tab('sub-built', decideTabTaps('sub-built', { stream: 'stream-a' }));
    await settled(() => tab.read(GYLD_STREAMS).get(), (value) => value?.status === 'ready');
    const markup = tab.render(<DecideWindow />);
    expect(markup).toContain('/d/files/gyld/builds/build-1789247615547');
    expect(markup).toContain(`${GYLD_STATIC_BASE}/builds/build-1789247615547`);
    expect(/<button[^>]*class="gyld-ops-retarget"/.test(markup)).toBe(true);
  });
});

describe('the diff window asks for a comparison the bundle does not carry', () => {
  it('offers the request beside the command, on the pair in its own order', async () => {
    // the bundle carries base..stream-a and not the reverse, so this pair is
    // absent and the window has something to ask for
    const { ops } = fakeOps();
    const params = { left: 'stream-a', right: 'base' };
    const desk = deskWith({ ops });
    const tab = desk.tab('df-request', diffTabTaps('df-request', params));
    await settled(
      () => tab.read(GYLD_DIFF).get() as { status?: string },
      (value) => value?.status === 'absent',
    );
    const markup = tab.render(<DiffWindow tabId="df-request" params={params} />);
    expect(markup).toContain(diffCommand('stream-a', 'base'));
    expect(/<button[^>]*class="gyld-ops-diff"/.test(markup)).toBe(true);
    expect(/<button[^>]*class="gyld-ops-diff"[^>]*disabled/.test(markup)).toBe(false);
    expect(markup).toContain('ask Gyld to write the diff of stream-a against base');
  });

  it('has nothing to ask with when there is no glade node, and says so', async () => {
    const params = { left: 'stream-a', right: 'base' };
    const desk = deskWith({ status: '' });
    const tab = desk.tab('df-noops', diffTabTaps('df-noops', params));
    await settled(
      () => tab.read(GYLD_DIFF).get() as { status?: string },
      (value) => value?.status === 'absent',
    );
    const markup = tab.render(<DiffWindow tabId="df-noops" params={params} />);
    expect(/<button[^>]*class="gyld-ops-diff"[^>]*disabled/.test(markup)).toBe(true);
    expect(markup).toContain('no glade node');
    // and the command that writes it by hand is still there
    expect(markup).toContain(diffCommand('stream-a', 'base'));
  });
});

describe('the stream manager offers Submit and Rebuild', () => {
  it('draws both, enabled, when the glade node is live', async () => {
    const { ops } = fakeOps();
    const desk = deskWith({ ops });
    const tab = desk.tab('sm-submit', streamsTabTaps());
    await settled(
      () => tab.read(GYLD_STREAMS).get() as GyldStreamsCensus,
      (value) => value?.status === 'ready',
    );
    const markup = tab.render(<StreamManager tabId="sm" />);
    expect(/<button[^>]*class="gyld-stream-submit"/.test(markup)).toBe(true);
    expect(/<button[^>]*class="gyld-ops-rebuild"/.test(markup)).toBe(true);
    // List builds nothing, so it is never refused on shape
    expect(/<button[^>]*class="gyld-ops-list"[^>]*disabled/.test(markup)).toBe(false);
    // the form has no parent or name yet, so the submit is refused on SHAPE
    expect(/<button[^>]*class="gyld-stream-submit"[^>]*disabled/.test(markup)).toBe(true);
    expect(/<button[^>]*class="gyld-ops-rebuild"[^>]*disabled/.test(markup)).toBe(false);
    // and the exported command is still there
    expect(markup).toContain('gyld-stream-export');
  });

  it('offers List and Rebuild on a root that has nothing on it yet', async () => {
    // the state a glade root starts in: the supplier's bundle root is empty,
    // nothing has landed on gyld.streams, and Rebuild is what makes the first
    // build. A window with no tree still has those two presses.
    const { ops } = fakeOps();
    const desk = deskWith({ ops });
    const tab = desk.tab('sm-empty', streamsTabTaps());
    tab.read(GYLD_SET_TAP).get()?.set({
      roots: [{ kind: 'static', baseUrl: 'http://localhost:1/nothing' }],
    });
    const markup = tab.render(<StreamManager tabId="sm" />);
    expect(markup).toContain('gyld-streams-empty');
    expect(/<button[^>]*class="gyld-ops-list"[^>]*disabled/.test(markup)).toBe(false);
    expect(/<button[^>]*class="gyld-ops-rebuild"[^>]*disabled/.test(markup)).toBe(false);
    expect(markup).toContain('nothing has been submitted from this desk yet');
  });

  it('disables Rebuild with the reason when there is no glade node', async () => {
    const desk = deskWith({ status: '' });
    const tab = desk.tab('sm-noops', streamsTabTaps());
    await settled(
      () => tab.read(GYLD_STREAMS).get() as GyldStreamsCensus,
      (value) => value?.status === 'ready',
    );
    const markup = tab.render(<StreamManager tabId="sm" />);
    expect(/<button[^>]*class="gyld-ops-rebuild"[^>]*disabled/.test(markup)).toBe(true);
    expect(markup).toContain('no glade node');
  });
});
