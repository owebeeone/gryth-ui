import { describe, expect, it } from 'vitest';
import { AttentionSweep, ATTENTION_MS, type Schedule } from './attention';
import { openWindow, revealFrame } from './ops';
import type { AttentionCue } from './grips.desktop';

function page() {
  let cue: AttentionCue | null = { frameId: 'w1', stamp: 1 };
  const pending: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
  const schedule: Schedule = (fn, ms) => {
    const task = { fn, ms, cancelled: false };
    pending.push(task);
    return () => { task.cancelled = true; };
  };
  return {
    pending, schedule, get: () => cue,
    handle: { set: (next: AttentionCue | null) => { cue = next; } },
    tick: () => { for (const task of pending) { if (!task.cancelled) { task.fn(); } } },
  };
}

describe('SS-05 page-local reveal', () => {
  it('raises and selects without adding a cue to the shared desk', () => {
    const a = openWindow([], 'ask', { w: 10, h: 10 });
    const b = openWindow(a.list, 'chat', { w: 10, h: 10 });
    const shown = revealFrame(b.list, a.id);
    expect(shown.at(-1)?.id).toBe(a.id);
    expect(shown.every((w) => !('attention' in w))).toBe(true);
  });
  it('clears only this page after the interval, preserving another page', () => {
    const a = page();
    const b = page();
    new AttentionSweep(a.schedule).arm(a.handle);
    expect(a.get()).not.toBeNull();
    expect(a.pending[0].ms).toBe(ATTENTION_MS);
    a.tick();
    expect(a.get()).toBeNull();
    expect(b.get()).not.toBeNull();
  });
  it('restarts the interval on a second act', () => {
    const a = page();
    const sweep = new AttentionSweep(a.schedule);
    sweep.arm(a.handle);
    sweep.arm(a.handle);
    expect(a.pending[0].cancelled).toBe(true);
    a.tick();
    expect(a.get()).toBeNull();
  });
  it('survives an absent page handle', () => {
    const a = page();
    new AttentionSweep(a.schedule).arm(undefined);
    expect(() => a.tick()).not.toThrow();
  });
});
