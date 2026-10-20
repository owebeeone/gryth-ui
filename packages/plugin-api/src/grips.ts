import { createAtomValueTap, type AtomTapHandle } from '@owebeeone/grip-react';
import { defineGrip } from './runtime';

// Doc scope: shared collaboration state (the "google-docs document").
// Mock-backed today; the gryth provider registers the same grips later.
export const WORKSPACE_NAME = defineGrip<string>('Doc.WorkspaceName', '');

// Read-only mode (G-3). FALSE by default: with no producer at all, every
// client behaves as it always has. A host (a kiosk, a presentation, a tab that
// is not the writer) or a replay root registers `grythReadOnlyTap(true)` in the
// context its tools mount under, and the controls that honour the grip
// disable themselves. What honours it is listed in
// dev-docs/GrythPluginContract.md ("General additions", G-3): the Settings
// panel's controls and the window chrome's close, minimize, move and resize.
// It is advice to controls, not an enforcement boundary — a tool that writes
// through a grip it does not guard is not stopped by it.
export const GRYTH_READ_ONLY = defineGrip<boolean>('Gryth.ReadOnly', false);
export const GRYTH_READ_ONLY_TAP = defineGrip<AtomTapHandle<boolean>>('Gryth.ReadOnly.Tap');

/**
 * The producer of `GRYTH_READ_ONLY`, one per context that sets the mode: an
 * atom tap registered into the host's root (`grok.registerTap`) or into a
 * replay root's home context. Its handle is advertised at
 * `GRYTH_READ_ONLY_TAP`, so the mode can be flipped at runtime.
 */
export function grythReadOnlyTap(initial: boolean = true) {
  return createAtomValueTap(GRYTH_READ_ONLY, { initial, handleGrip: GRYTH_READ_ONLY_TAP });
}
