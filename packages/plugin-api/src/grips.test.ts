import { describe, expect, it } from 'vitest';
import { grok } from './runtime';
import { GRYTH_READ_ONLY, GRYTH_READ_ONLY_TAP, grythReadOnlyTap } from './grips';

// GRYTH_READ_ONLY (G-3): false with no producer, so nothing changes for a
// client that never sets it; a producer registered in ONE context sets the
// mode there (a replay root, a kiosk host) and nowhere else.

describe('GRYTH_READ_ONLY', () => {
  it('defaults to false where nothing produces it', () => {
    const d = grok.mainPresentationContext.getOrCreateConsumer(GRYTH_READ_ONLY);
    d.subscribe(() => {});
    expect(d.get()).toBe(false);
  });

  it('is set per context by its atom tap, and flips through its handle', async () => {
    const root = grok.mainPresentationContext.getOrCreateMatchingContext('readonly-root');
    const tap = grythReadOnlyTap();
    root.getGripHomeContext().registerTap(tap);
    const inside = root.getGripConsumerContext().getOrCreateConsumer(GRYTH_READ_ONLY);
    inside.subscribe(() => {});
    await expect.poll(() => inside.get()).toBe(true);
    const outside = grok.mainPresentationContext.getOrCreateConsumer(GRYTH_READ_ONLY);
    outside.subscribe(() => {});
    expect(outside.get()).toBe(false);
    const handle = root.getGripConsumerContext().getOrCreateConsumer(GRYTH_READ_ONLY_TAP);
    handle.subscribe(() => {});
    await expect.poll(() => handle.get()).toBeDefined();
    handle.get()!.set(false);
    await expect.poll(() => inside.get()).toBe(false);
    root.getGripHomeContext().unregisterTap(tap);
  });
});
