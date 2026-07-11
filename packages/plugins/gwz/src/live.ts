// The Gwz plugin's LIVE wiring (GLP-0006 P1.S4) — the demo's gwz.ts ported into
// the plugin. The gwz command surface is grazel's composed glade-gwz supplier
// EXCHANGE (ws-razel, gwz.ops): a request is a JSON envelope, the answer a
// {ok,exit,stdout,stderr} — failure is DATA (a disallowed verb comes back
// {ok:false,error}), never a hang. Long ops stream: the exchange answers
// {run_id,done:false}; we subscribe (ws-razel, gwz.output, run_id) and point a
// glial LOG mount at that run key (GWZ_RUN_ID drives its fill) so the run's
// output ops converge live into GWZ_STREAM.

import { createAtomValueTap } from '@owebeeone/grip-react';
import { glialTap } from '@owebeeone/glial-runtime/grip';
import { SessionDestination, utf8, type Fill, type SessionLike } from '@owebeeone/glial-runtime';
import { defineManifest } from '@owebeeone/glial-runtime/manifest';
import { grok } from '@grythjs/plugin-api';
import { bus, client, glial, principal, resolveController, session } from '@grythjs/glade';
import {
  GWZ_RESULT, GWZ_RESULT_TAP,
  GWZ_RUN_ID, GWZ_RUN_ID_TAP,
  GWZ_STREAM, GWZ_STREAM_TAP,
  GWZ_VERB, GWZ_VERB_TAP, GWZ_VERBS,
  type GwzResponse,
  type GwzOutputRecord,
} from './grips';

/** The gwz command exchange + long-op output surfaces (grazel-app.glade). */
export const GWZ_SHARE = 'ws-razel';
export const GWZ_OPS_ID = 'gwz.ops';
export const GWZ_OUTPUT_ID = 'gwz.output';

/** The typed gwz.output surface handle (the mount references this, never the raw
 *  glade-id string — the P0.S5a compile wall). */
const gwzM = defineManifest({
  output: { id: GWZ_OUTPUT_ID, shape: 'log', share: GWZ_SHARE, domain: 'document', zone: 'commons' },
});

const enc = new TextEncoder();
const dec = new TextDecoder();

/** The wire destination for the gwz.output log, keyed by the current run id (the
 *  fill's key — set via GWZ_RUN_ID). A distinct run is a distinct key = a
 *  distinct instance/fold. */
function gwzOutputDest(fill: Fill): SessionDestination {
  const runId = String(fill.key ?? '');
  return new SessionDestination(session as unknown as SessionLike, bus, {
    share: GWZ_SHARE,
    gladeId: GWZ_OUTPUT_ID,
    shape: 'log',
    key: utf8(runId),
  });
}

/** Register the gwz atom taps + the gwz.output log mount (keyed by the streaming
 *  run id — it remounts as GWZ_RUN_ID changes). Called once from index.ts. */
export function registerGwzLive(): void {
  grok.registerTap(createAtomValueTap(GWZ_VERB, { initial: GWZ_VERBS[0], handleGrip: GWZ_VERB_TAP }));
  grok.registerTap(createAtomValueTap<GwzResponse | null>(GWZ_RESULT, { initial: null, handleGrip: GWZ_RESULT_TAP }));
  grok.registerTap(createAtomValueTap(GWZ_RUN_ID, { initial: '', handleGrip: GWZ_RUN_ID_TAP }));
  grok.registerTap(
    glialTap<GwzOutputRecord[]>({
      binder: glial,
      decl: gwzM.output,
      grip: GWZ_STREAM,
      // fixed domain, run id as the key param — a run switch remounts the fold.
      fill: { domain: 'gwz', key: { param: GWZ_RUN_ID } },
      handleGrip: GWZ_STREAM_TAP,
      gladeFor: gwzOutputDest,
    }),
  );
}

// --- atom controllers (resolved once, like chat's postToGroup) --------------

let resultCtl: { set(v: GwzResponse | null): void } | undefined;
let runIdCtl: { set(v: string): void } | undefined;
function setResult(v: GwzResponse | null): void {
  resultCtl ??= resolveController(GWZ_RESULT_TAP);
  resultCtl.set(v);
}
function setRunId(v: string): void {
  runIdCtl ??= resolveController(GWZ_RUN_ID_TAP);
  runIdCtl.set(v);
}

// --- the exchange ------------------------------------------------------------

/** The JSON request envelope the supplier decodes: {verb,args,stream,principal}.
 *  `principal` is the P0.S7 attribution stamp (stage-1: data, not gated). */
function envelope(verb: string, args: string[], stream: boolean): Uint8Array {
  return enc.encode(JSON.stringify({ verb, args, stream, principal }));
}

/** Turn the wire outcome into a GwzResponse. A wire ok:false (no provider /
 *  route error) is ALSO failure-as-data — surfaced honestly, never swallowed. */
function responseFrom(out: { ok: boolean; payload?: Uint8Array; error?: string }): GwzResponse {
  if (!out.ok) {
    return { ok: false, error: out.error ?? 'no provider for gwz.ops (is the glade-gwz supplier attached?)' };
  }
  if (!out.payload) return { ok: false, error: 'gwz: empty response payload' };
  try {
    return JSON.parse(dec.decode(out.payload)) as GwzResponse;
  } catch {
    return { ok: false, error: 'gwz: undecodable response payload' };
  }
}

/** Run a verb (stream:false) and land the answer in GWZ_RESULT. `verb` may be a
 *  disallowed verb (the deny demo) — the supplier answers ok:false as data. */
export async function runGwz(verb: string, args: string[]): Promise<void> {
  const out = await client.exchange(GWZ_SHARE, GWZ_OPS_ID, envelope(verb, args, false));
  setResult(responseFrom(out));
}

/** Run a verb with stream:true: the exchange answers {run_id,done:false}; then
 *  subscribe the output surface for that run and point the glial mount at it so
 *  the output ops converge live into GWZ_STREAM. */
export async function streamGwz(verb: string, args: string[]): Promise<void> {
  const out = await client.exchange(GWZ_SHARE, GWZ_OPS_ID, envelope(verb, args, true));
  const resp = responseFrom(out);
  setResult(resp);
  if (resp.ok && resp.run_id) {
    await client.subscribe(GWZ_SHARE, GWZ_OUTPUT_ID, utf8(resp.run_id));
    setRunId(resp.run_id);
  }
}
