import type { AtomTapHandle } from '@owebeeone/grip-react';
import type { TickerBleed } from '../grips.desktop';
import type { Rect } from './ops';

// Gesture timing for the bleed picker (instance-scope module state, the
// canvasGuard pattern). Hovering a squeezed strip for BLEED_DWELL_MS
// inflates the picker; once the pointer has left both strip and picker,
// BLEED_GRACE_MS pass before it shrinks back. A tear-off shrinks it
// immediately. All writes go through the tap handle — components only
// render what the grip says.
export const BLEED_DWELL_MS = 500;
export const BLEED_GRACE_MS = 240;

type BleedTap = AtomTapHandle<TickerBleed | null> | undefined;

let dwell: ReturnType<typeof setTimeout> | null = null;
let grace: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (dwell) clearTimeout(dwell);
  if (grace) clearTimeout(grace);
  dwell = null;
  grace = null;
}

// Pointer entered a squeezed header strip: keep an already-open picker for
// this frame alive (reinflating if it was mid-shrink), close another
// frame's picker, and arm the dwell.
export function bleedEnter(tap: BleedTap, frameId: string, anchor: Rect) {
  clearTimers();
  const cur = tap?.get();
  if (cur?.frameId === frameId) {
    if (cur.phase === 'closing') tap?.set({ frameId, anchor, phase: 'open' });
    return;
  }
  if (cur && cur.phase === 'open') tap?.set({ ...cur, phase: 'closing' });
  dwell = setTimeout(() => {
    dwell = null;
    tap?.set({ frameId, anchor, phase: 'open' });
  }, BLEED_DWELL_MS);
}

// Pointer entered the picker itself: cancel any pending close.
export function bleedHold(tap: BleedTap) {
  clearTimers();
  const cur = tap?.get();
  if (cur?.phase === 'closing') tap?.set({ ...cur, phase: 'open' });
}

// Pointer left the strip or the picker: shrink back after the grace period.
export function bleedLeave(tap: BleedTap) {
  clearTimers();
  grace = setTimeout(() => {
    grace = null;
    const cur = tap?.get();
    if (cur && cur.phase === 'open') tap?.set({ ...cur, phase: 'closing' });
  }, BLEED_GRACE_MS);
}

// Hard interrupt (a tab tear-off begins): shrink right away.
export function bleedCancel(tap: BleedTap) {
  clearTimers();
  const cur = tap?.get();
  if (cur && cur.phase === 'open') tap?.set({ ...cur, phase: 'closing' });
}
