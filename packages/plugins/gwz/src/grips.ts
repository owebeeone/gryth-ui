import type { AtomTapHandle } from '@owebeeone/grip-react';
import type { GlialTapController } from '@owebeeone/glial-runtime/grip';
import { defineGrip, type GrythPlugin } from '@grythjs/plugin-api';

// The plugin's identity grip (the registry key).
export const GWZ_PLUGIN = defineGrip<GrythPlugin>('Gwz.Plugin');

/** The stage-1 read-only allow-list the glade-gwz supplier honors (exec.rs). The
 *  picker is limited to these; anything else the supplier refuses AS DATA. */
export const GWZ_VERBS = ['status', 'ls', 'diff'] as const;

/** The exchange answer (glade-gwz GwzResponse, JSON). Failure is data. */
export interface GwzResponse {
  ok: boolean;
  exit?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  run_id?: string;
  done?: boolean;
  attributed_to?: string;
}

/** One record on the gwz.output log for a streaming run (glade-gwz
 *  GwzOutputRecord, JSON). `stream` is "stdout" | "stderr" | "end". */
export interface GwzOutputRecord {
  run_id: string;
  seq: number;
  principal?: string;
  stream: string;
  line?: string;
  done?: boolean;
  exit?: number;
}

// Shared state (no React state hook), mirroring the demo's GwzPanel: one gwz
// tool, its state shared across windows. The verb picker, the last answer, the
// current streaming run id (drives the gwz.output mount's key), and the live
// streamed records.
export const GWZ_VERB = defineGrip<string>('Gwz.Verb', GWZ_VERBS[0]);
export const GWZ_VERB_TAP = defineGrip<AtomTapHandle<string>>('Gwz.Verb.Tap');
export const GWZ_RESULT = defineGrip<GwzResponse | null>('Gwz.Result', null);
export const GWZ_RESULT_TAP = defineGrip<AtomTapHandle<GwzResponse | null>>('Gwz.Result.Tap');
export const GWZ_RUN_ID = defineGrip<string>('Gwz.RunId', '');
export const GWZ_RUN_ID_TAP = defineGrip<AtomTapHandle<string>>('Gwz.RunId.Tap');
export const GWZ_STREAM = defineGrip<GwzOutputRecord[]>('Gwz.Stream', []);
export const GWZ_STREAM_TAP = defineGrip<GlialTapController<GwzOutputRecord[]>>('Gwz.Stream.Tap');
