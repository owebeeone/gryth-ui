import { describe, it, expect } from 'vitest';
import type { Grip } from '@owebeeone/grip-react';
import { grok } from './runtime';
import { registerAllTaps } from './taps';
import { CURRENT_PAGE, CURRENT_PAGE_TAP, WORKSPACE_NAME } from './grips';

// Headless seam test: consumers read grips through the graph without knowing
// the producer — the same consumer path useGrip takes. Subscribing is what
// connects the tap (resolution is lazy until the first subscriber).
registerAllTaps();
const consume = grok.mainPresentationContext;

function drip<T>(grip: Grip<T>) {
  const d = consume.getOrCreateConsumer(grip);
  d.subscribe(() => {});
  return d;
}

describe('grip seam', () => {
  it('serves session and doc grips from registered taps', async () => {
    await expect.poll(() => drip(CURRENT_PAGE).get()).toBe('workspace');
    await expect.poll(() => drip(WORKSPACE_NAME).get()).toBe('mock-workspace');
  });

  it('lets a participant holding the tap handle drive session UI state', async () => {
    const pageTap = drip(CURRENT_PAGE_TAP);
    await expect.poll(() => pageTap.get()).toBeDefined();
    pageTap.get()!.set('debugger');
    await expect.poll(() => drip(CURRENT_PAGE).get()).toBe('debugger');
  });
});
