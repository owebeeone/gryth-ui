import type { WindowRecord } from './grips.desktop';
import { clearAttention } from './ops';

// The ATTENTION sweep: the CLOCK half of `ops.revealFrame`'s mark.
//
// The mark says "the act you just asked for landed HERE" and must go by
// itself a moment later — a cue that stayed would burn in, and a desk
// document written back with one on it would come back from a reload looking
// like something had just happened.
//
// The chrome does not own this timer. A React effect is banned here
// (dev-docs/CodingRules.md) and would be the wrong owner anyway: the mark is
// part of the desk document, so it is cleared through the same handle every
// other desk transform is written through. Instance-scope module state, the
// ./tickerBleed pattern, with the clock injected so a suite asserts the
// interval instead of waiting for it.

/** How long a frame wears its cue. `desktop.css`'s `win-attention` animation
 *  runs for the same time — keep the two in sync. */
export const ATTENTION_MS = 600;

/** Run `fn` after `ms`, and return the cancel. The desk's one injectable
 *  clock: tests hand in their own and fire it by hand. */
export type Schedule = (fn: () => void, ms: number) => () => void;

/** The real clock. */
export function timeoutSchedule(fn: () => void, ms: number): () => void {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}

/** The slice of the desk-document handle the sweep writes back through. */
export interface AttentionDoc {
  update(next: (list: WindowRecord[]) => WindowRecord[]): void;
}

export class AttentionSweep {
  private cancel: (() => void) | null = null;

  constructor(
    private readonly schedule: Schedule = timeoutSchedule,
    private readonly ms: number = ATTENTION_MS,
  ) {}

  /**
   * A reveal just marked a frame: clear every mark again in `ms`.
   *
   * A second reveal RESTARTS the interval rather than queueing another one,
   * so the cue the reader is actually looking at — the last one — always gets
   * its full run, and a burst of acts leaves exactly one pending sweep.
   */
  arm(doc: AttentionDoc | undefined): void {
    this.cancel?.();
    this.cancel = this.schedule(() => {
      this.cancel = null;
      doc?.update(clearAttention);
    }, this.ms);
  }
}

/** The desk's own sweep, armed by every reveal in ./taps.desktop. */
export const attentionSweep = new AttentionSweep();
