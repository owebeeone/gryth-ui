import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Drip, Grip } from '@owebeeone/grip-react';
import type { IdentitySources } from '@grythjs/glade/identity';
import type { GwzOutputRecord } from './grips';

// The gwz panel's run takes the STREAMING path (owner ruling 2026-09-28:
// exchanges answer quickly; long work streams). A glade exchange is one request
// and one answer, and the node answers "provider timeout" itself once its
// deadline passes, so a run that held the exchange open for the whole command
// (glade-gwz lets a synchronous one run 30 s) would lose its real answer at the
// node. So every press sends stream:true: the supplier answers at once, with
// the run's id or with a refusal, and an accepted run's output is followed on
// gwz.output.
//
// Each test loads a fresh page (vi.resetModules), as the settings live suite
// does: its identity resolved first, then its own glade runtime, grip graph and
// the plugin's live taps. The node is faked at the glade client alone: the
// exchange and the subscribe are recorded, and a run's records reach the page's
// bus as the node relays them, minted by a session under the SUPPLIER's origin.

type Glade = typeof import('@grythjs/glade');
type Grips = typeof import('./grips');
type Live = typeof import('./live');

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Where a page's identity comes from: its tab's origin, and the principal
 *  grazel serves. */
function sources(origin: string, principal: string): IdentitySources {
  const held = new Map([['glade-origin', origin]]);
  return {
    search: '',
    tabStore: {
      getItem: (key) => held.get(key) ?? null,
      setItem: (key, value) => {
        held.set(key, value);
      },
    },
    bootstrap: Promise.resolve({ node_ws: 'ws://127.0.0.1:9106', principal }),
    schedule: () => () => {},
  };
}

/** Every drip a test reads, held for the life of the FILE: the graph holds
 *  consumers by WeakRef (packages/plugins/gyld/test/mount.tsx states the rule). */
const held: unknown[] = [];

interface Page {
  readonly glade: Glade;
  readonly grips: Grips;
  readonly live: Live;
  /** A grip's current value, read through a drip held live. */
  read<T>(grip: Grip<T>): T | undefined;
  /** The panel as static markup, with React's empty separators between
   *  adjacent text nodes dropped: the words are what is asserted. */
  render(): string;
}

/** A desk page with the gwz plugin's live taps registered, as index.ts does. */
async function openPage(): Promise<Page> {
  vi.resetModules();
  const { establishDeskIdentity } = await import('@grythjs/glade/identity');
  await establishDeskIdentity(sources('tab1', 'owner'));
  const glade = await import('@grythjs/glade');
  const { grok } = await import('@grythjs/plugin-api');
  const { GripProvider } = await import('@owebeeone/grip-react');
  const grips = await import('./grips');
  const live = await import('./live');
  const { Gwz } = await import('./Gwz');
  live.registerGwzLive();
  const drips = new Map<Grip<unknown>, Drip<unknown>>();
  const read = <T,>(grip: Grip<T>): T | undefined => {
    let drip = drips.get(grip as Grip<unknown>) as Drip<T> | undefined;
    if (drip === undefined) {
      drip = grok.query(grip, grok.mainContext);
      drip.subscribe(() => {});
      drips.set(grip as Grip<unknown>, drip as Drip<unknown>);
      held.push(drip);
    }
    grok.flush();
    return drip.get();
  };
  return {
    glade,
    grips,
    live,
    read,
    render() {
      // Everything the panel projects, resolved and held before the render
      // reads it, so the static render sees the values a live one would.
      const projected: Grip<unknown>[] = [
        grips.GWZ_VERB, grips.GWZ_VERB_TAP, grips.GWZ_RESULT, grips.GWZ_RUN_ID,
        grips.GWZ_STREAM, glade.GLADE_STATUS,
      ] as Grip<unknown>[];
      for (const grip of projected) {
        read(grip);
      }
      return renderToStaticMarkup(
        <GripProvider grok={grok} context={grok.mainContext}><Gwz /></GripProvider>,
      ).replaceAll('<!-- -->', '');
    },
  };
}

/** One exchange outcome, as the page's glade client reports it. */
interface Outcome {
  ok: boolean;
  payload?: Uint8Array;
  error?: string;
}

/** The envelope the supplier decodes (glade-gwz `GwzRequest`). */
interface Request {
  verb: string;
  args: string[];
  stream: boolean;
  principal: string;
}

/** The node, as the page's glade client meets it: each exchange is recorded
 *  and answered in turn from `answers`, and each subscribe is recorded. */
function node(page: Page, answers: Outcome[]) {
  const sent: { share: string; gladeId: string; request: Request }[] = [];
  const subscribed: { share: string; gladeId: string; key: string }[] = [];
  let at = 0;
  vi.spyOn(page.glade.client, 'exchange').mockImplementation(async (share, gladeId, payload) => {
    sent.push({ share, gladeId, request: JSON.parse(decoder.decode(payload)) as Request });
    const answer = answers[Math.min(at, answers.length - 1)];
    at += 1;
    return answer;
  });
  vi.spyOn(page.glade.client, 'subscribe').mockImplementation(async (share, gladeId, key) => {
    subscribed.push({ share, gladeId, key: decoder.decode(key ?? new Uint8Array()) });
  });
  return { sent, subscribed };
}

/** The supplier's side of gwz.output. glade-gwz appends a run's records on
 *  the log keyed by its run id, under ITS origin, and the node relays them to
 *  every session subscribed to that run. A session of a second runtime, under
 *  the supplier's own origin, mints them the same way; they reach the page's
 *  bus as the node would hand them over. */
async function supplier(page: Page) {
  vi.resetModules();
  const { establishDeskIdentity } = await import('@grythjs/glade/identity');
  await establishDeskIdentity(sources('glade-gwz', 'glade-gwz'));
  const { session } = await import('@grythjs/glade');
  return {
    append(runId: string, records: GwzOutputRecord[]): void {
      page.glade.bus.deliver(records.map((record) => session.append(
        'ws-razel', 'gwz.output', 'log',
        encoder.encode(JSON.stringify(record)), encoder.encode(runId),
      )));
    },
  };
}

/** An exchange answer carrying a GwzResponse exactly as glade-gwz serializes
 *  one: `stdout` and `stderr` are always written, empty or not. */
function answered(body: object): Outcome {
  return { ok: true, payload: encoder.encode(JSON.stringify({ stdout: '', stderr: '', ...body })) };
}

/** glade-gwz's accept for a streamed run (`GwzResponse::accepted`). */
function accepted(runId: string): Outcome {
  return answered({ ok: true, run_id: runId, done: false, attributed_to: 'owner' });
}

/** glade-gwz's refusal of a verb off its allow-list (`GwzResponse::failed`),
 *  checked BEFORE the streaming branch (`supplier.rs`, `answer`). */
const DENIED = 'verb `commit` not in stage-1 allow-list ["status", "ls", "diff"]';
const REFUSED = answered({ ok: false, error: DENIED });

/** One run's records as `spawn_stream` appends them: a line per output line,
 *  closed by the `{done, exit}` marker. */
function records(runId: string, lines: [string, string][], exit: number): GwzOutputRecord[] {
  const out: GwzOutputRecord[] = lines.map(([stream, line], at) => ({
    run_id: runId, seq: at + 1, principal: 'owner', stream, line,
  }));
  out.push({
    run_id: runId, seq: lines.length + 1, principal: 'owner', stream: 'end', done: true, exit,
  });
  return out;
}

const RUN_1 = records('run-1', [['stdout', 'gyld: clean'], ['stderr', 'glial: 1 ahead']], 0);

/** The labels of the panel's buttons, in order. */
function buttons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((match) => match[1]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('run takes the streaming path', () => {
  it('sends stream:true, and follows the run\'s output on gwz.output', async () => {
    const page = await openPage();
    const wire = node(page, [accepted('run-1')]);
    await page.live.runGwz('status', []);
    // the exchange is answered at once: it never waits on the command
    expect(wire.sent.map((one) => one.request.stream)).toEqual([true]);
    expect(wire.sent).toEqual([{
      share: 'ws-razel',
      gladeId: 'gwz.ops',
      request: { verb: 'status', args: [], stream: true, principal: 'owner' },
    }]);
    expect(page.read(page.grips.GWZ_RESULT)).toEqual({
      ok: true, stdout: '', stderr: '', run_id: 'run-1', done: false, attributed_to: 'owner',
    });
    // the run's log is subscribed, then the mount is pointed at it
    expect(wire.subscribed).toEqual([{ share: 'ws-razel', gladeId: 'gwz.output', key: 'run-1' }]);
    expect(page.read(page.grips.GWZ_RUN_ID)).toBe('run-1');
    // and what the supplier appends for THAT run converges into the stream
    const gwz = await supplier(page);
    gwz.append('run-0', records('run-0', [['stdout', 'another run']], 0));
    gwz.append('run-1', RUN_1);
    await expect.poll(() => page.read(page.grips.GWZ_STREAM)).toEqual(RUN_1);
  });

  it('carries the args and the principal on the envelope', async () => {
    const page = await openPage();
    const wire = node(page, [accepted('run-1')]);
    await page.live.runGwz('diff', ['gyld']);
    expect(wire.sent[0].request).toEqual({
      verb: 'diff', args: ['gyld'], stream: true, principal: 'owner',
    });
  });
});

describe('failure is data on the streaming path, and a press always comes back', () => {
  it('lands the deny demo\'s refusal, follows nothing, and drops the earlier run\'s output', async () => {
    const page = await openPage();
    const wire = node(page, [accepted('run-1'), REFUSED]);
    await page.live.runGwz('status', []);
    await page.live.runGwz('commit', ['-m', 'demo']);
    expect(wire.sent[1].request).toEqual({
      verb: 'commit', args: ['-m', 'demo'], stream: true, principal: 'owner',
    });
    expect(page.read(page.grips.GWZ_RESULT)).toEqual({ ok: false, stdout: '', stderr: '', error: DENIED });
    expect(wire.subscribed.map((one) => one.key)).toEqual(['run-1']);
    expect(page.read(page.grips.GWZ_RUN_ID)).toBe('');
  });

  it('lands a wire failure (the node\'s provider timeout, or no provider) as data', async () => {
    const page = await openPage();
    const wire = node(page, [{ ok: false, error: 'provider timeout' }, { ok: false }]);
    await page.live.runGwz('status', []);
    expect(page.read(page.grips.GWZ_RESULT)).toEqual({ ok: false, error: 'provider timeout' });
    await page.live.runGwz('status', []);
    expect(page.read(page.grips.GWZ_RESULT)?.error).toContain('no provider for gwz.ops');
    expect(wire.subscribed).toEqual([]);
    expect(page.read(page.grips.GWZ_RUN_ID)).toBe('');
  });

  it('lands an exchange that rejects as data, rather than a press that never answers', async () => {
    const page = await openPage();
    vi.spyOn(page.glade.client, 'exchange').mockRejectedValue(
      new Error("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state."),
    );
    await expect(page.live.runGwz('status', [])).resolves.toBeUndefined();
    const result = page.read(page.grips.GWZ_RESULT);
    expect(result?.ok).toBe(false);
    expect(result?.error).toContain('Still in CONNECTING state');
  });

  it('says so when a run was accepted but its output cannot be followed', async () => {
    const page = await openPage();
    node(page, [accepted('run-2')]);
    vi.spyOn(page.glade.client, 'subscribe').mockRejectedValue(new Error('glade client: not connected'));
    await expect(page.live.runGwz('status', [])).resolves.toBeUndefined();
    const result = page.read(page.grips.GWZ_RESULT);
    // the RUN was accepted; what failed is the following, and both are said
    expect(result?.run_id).toBe('run-2');
    expect(result?.error).toContain('run-2 was accepted but its output could not be followed');
    expect(result?.error).toContain('glade client: not connected');
    expect(page.read(page.grips.GWZ_RUN_ID)).toBe('');
  });
});

describe('the panel: one run button, and a finished run shown plainly', () => {
  it('has ONE run button, which streams: the separate stream button is gone', async () => {
    const page = await openPage();
    expect(buttons(page.render())).toEqual(['status', 'ls', 'diff', 'run', 'deny demo']);
  });

  it('shows a streamed run\'s output, its done marker and its exit status', async () => {
    const page = await openPage();
    node(page, [accepted('run-1'), accepted('run-2')]);
    expect(page.render()).toContain('no run yet');
    await page.live.runGwz('status', []);
    // accepted, which is not yet an outcome, and nothing has arrived
    let html = page.render();
    expect(html).toContain('accepted · run <b>run-1</b> · by <b>owner</b>');
    expect(html).not.toContain('ok=');
    expect(html).toContain('run run-1 accepted — waiting for its output');
    const gwz = await supplier(page);
    gwz.append('run-1', RUN_1);
    await expect.poll(() => page.read(page.grips.GWZ_STREAM)?.length).toBe(3);
    html = page.render();
    expect(html).toContain('<b>stdout</b> gyld: clean');
    expect(html).toContain('<b>stderr</b> glial: 1 ahead');
    expect(html).toContain('<div class="gwz-line gwz-end"><b>— done</b> · exit 0</div>');
    // a command that fails says so on its marker, and the last run's lines go
    await page.live.runGwz('diff', []);
    gwz.append('run-2', records('run-2', [['stderr', 'gwz: no such member']], 2));
    await expect.poll(() => page.read(page.grips.GWZ_STREAM)?.length).toBe(2);
    html = page.render();
    expect(html).toContain('<div class="gwz-line gwz-end err"><b>— done</b> · exit 2</div>');
    expect(html).not.toContain('gyld: clean');
  });

  it('shows the deny demo\'s refusal as data, with no earlier run\'s output under it', async () => {
    const page = await openPage();
    node(page, [accepted('run-1'), REFUSED]);
    await page.live.runGwz('status', []);
    const gwz = await supplier(page);
    gwz.append('run-1', RUN_1);
    await expect.poll(() => page.read(page.grips.GWZ_STREAM)?.length).toBe(3);
    await page.live.runGwz('commit', ['-m', 'demo']);
    const html = page.render();
    expect(html).toContain('<div class="gwz-result err">error: <b>verb `commit` not in stage-1 allow-list');
    expect(html).not.toContain('gyld: clean');
    expect(html).toContain('no run yet');
  });
});
