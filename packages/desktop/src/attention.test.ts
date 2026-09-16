import { describe, expect, it } from 'vitest';
import { AttentionSweep, ATTENTION_MS, type Schedule } from './attention';
import { openWindow, revealFrame } from './ops';
import type { WindowRecord } from './grips.desktop';

// The clock half of the attention cue: it must clear the mark AFTER the
// interval and not a moment before, and a burst of acts must leave one
// pending sweep rather than a queue of them.

/** The desk document, and a clock the test fires by hand. */
function desk() {
  let list = openWindow([], 'ask', { w: 10, h: 10 }).list;
  const pending: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
  const schedule: Schedule = (fn, ms) => {
    const entry = { fn, ms, cancelled: false };
    pending.push(entry);
    return () => { entry.cancelled = true; };
  };
  return {
    pending,
    schedule,
    doc: { update: (next: (l: WindowRecord[]) => WindowRecord[]) => { list = next(list); } },
    marked: () => list.filter((w) => w.attention !== undefined).length,
    reveal: () => { list = revealFrame(list, list[0].id); },
    // fire every timer the fake clock still holds, in order
    tick: () => { for (const entry of pending) { if (!entry.cancelled) { entry.fn(); } } },
  };
}

describe('the attention sweep', () => {
  it('clears the mark when the interval is up, and not before', () => {
    const it0 = desk();
    const sweep = new AttentionSweep(it0.schedule);
    it0.reveal();
    sweep.arm(it0.doc);
    expect(it0.marked()).toBe(1);          // still wearing the cue
    expect(it0.pending[0].ms).toBe(ATTENTION_MS);
    it0.tick();
    expect(it0.marked()).toBe(0);
  });

  it('restarts the interval on a second act, so the last cue gets its run', () => {
    const it0 = desk();
    const sweep = new AttentionSweep(it0.schedule);
    it0.reveal();
    sweep.arm(it0.doc);
    it0.reveal();
    sweep.arm(it0.doc);
    expect(it0.pending).toHaveLength(2);
    expect(it0.pending[0].cancelled).toBe(true);   // the first never fires
    expect(it0.marked()).toBe(1);
    it0.tick();
    expect(it0.marked()).toBe(0);
  });

  it('survives a desk that is not there yet', () => {
    const it0 = desk();
    const sweep = new AttentionSweep(it0.schedule);
    sweep.arm(undefined);
    expect(() => it0.tick()).not.toThrow();
  });
});
