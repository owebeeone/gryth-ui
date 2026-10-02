import type { AttentionCue } from './grips.desktop';

// Page-local reveal expiry; it never writes a shared window record.

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

export interface AttentionDoc {
  set(value: AttentionCue | null): void;
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
      doc?.set(null);
    }, this.ms);
  }
}

/** The desk's own sweep, armed by every reveal in ./taps.desktop. */
export const attentionSweep = new AttentionSweep();
