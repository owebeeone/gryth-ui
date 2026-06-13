import type { AtomTapHandle } from '@owebeeone/grip-react';
import { defineGrip, type GrythPlugin, type PrincipalRef } from '@grythjs/plugin-api';

// The plugin's identity grip (the registry key).
export const TERMINALS_PLUGIN = defineGrip<GrythPlugin>('Terminals.Plugin');

// Doc scope: every PTY session the workspace knows, WITH ATTRIBUTION —
// who started it, and on whose behalf ("what has my agent opened").
// Sessions outlive their views: closing a terminal window detaches a view,
// it does NOT close the session (the contract's detach rule). Mock-bound
// today; the gryth session service binds the same grip later.
export interface SessionRecord {
  id: string;
  cwd: string;
  owner: PrincipalRef;
  machine?: string;    // vm_manager machine the session runs on
  startedAt: string;
}
export const TERMINAL_SESSIONS = defineGrip<SessionRecord[]>('Terminals.Sessions', []);
export const TERMINAL_SESSIONS_TAP = defineGrip<AtomTapHandle<SessionRecord[]>>('Terminals.Sessions.Tap');
