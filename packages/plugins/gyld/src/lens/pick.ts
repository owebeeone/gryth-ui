import type { AtomTapHandle } from '@owebeeone/grip-react';
import type { GyldLens } from '../contract';
import { effectiveSelection, pickOutcome, type PickOutcome } from '../browser/links';
import type { GyldFocus } from '../focus';
import { NO_SELECTION, type GyldSelection } from './camera';

// What one pick in the picture WRITES, as one function over the three handles
// it writes through.
//
// `pickOutcome` (browser/links.ts) is the arithmetic and stays pure; this is
// the act. It is here rather than inline in the view so the writes a click
// makes can be asserted against a real context — the view renders to static
// markup in this package's tests, which cannot dispatch a click — and so the
// order of the three writes is stated in one place rather than in a handler.
//
// Every current value is read back through its HANDLE and never through a
// render closure: a drip notification is queued, so two picks can land inside
// one cycle and the second would otherwise be composed against the selection
// the first one replaced (CodingRules.md).

export interface PickHandles {
  selection?: AtomTapHandle<GyldSelection>;
  /** The record this WINDOW is on: what a sink wired to it resolves. */
  ref?: AtomTapHandle<string>;
  /** The shared focus every gyld window may follow (MDV-5). */
  focus?: AtomTapHandle<GyldFocus>;
}

/** Apply one pick and return what it wrote, so a caller can report the slot. */
export function applyPick(
  handles: PickHandles,
  lens: GyldLens,
  stream: string,
  lensId: string,
  additive: boolean,
): PickOutcome {
  const held = effectiveSelection(
    lens,
    handles.selection?.get() ?? NO_SELECTION,
    handles.ref?.get() ?? '',
  );
  const outcome = pickOutcome(lens, held, stream, lensId, additive);
  handles.selection?.set(outcome.selection);
  handles.ref?.set(outcome.ref);
  handles.focus?.set(outcome.focus);
  return outcome;
}
