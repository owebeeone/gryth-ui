import { describe, it, expect } from 'vitest';
import type { Grip } from '@owebeeone/grip-react';
import { grok } from './runtime';
import { registerAllTaps } from './taps';
import { CURRENT_PAGE, CURRENT_PAGE_TAP, WORKSPACE_NAME } from './grips';
import { DESKTOP_WINDOWS, DESKTOP_WINDOWS_TAP } from './grips.desktop';
import { openWindow } from './desktop/ops';
import { FACETS } from './desktop/facets';

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

  it('lets a headless participant open a window on the desktop', async () => {
    // The "AI opens the debugger" path: the desktop is a document; opening a
    // window is a data edit through the same ops the chrome uses.
    const windowsTap = drip(DESKTOP_WINDOWS_TAP);
    await expect.poll(() => windowsTap.get()).toBeDefined();
    windowsTap.get()!.update((list) => openWindow(list, 'chat', FACETS.chat.defaultSize).list);
    const windows = drip(DESKTOP_WINDOWS);
    const hasFacet = (facet: string) =>
      windows.get()?.some((w) => w.tabs.some((t) => t.facet === facet));
    await expect.poll(() => hasFacet('chat')).toBe(true);
    expect(hasFacet('welcome')).toBe(true); // first-run window intact
  });
});
