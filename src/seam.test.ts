import { describe, it, expect } from 'vitest';
import type { Grip } from '@owebeeone/grip-react';
import { grok, WORKSPACE_NAME } from '@grythjs/plugin-api';
import { registerAllTaps } from './taps';
import {
  DESKTOP_BUILTINS,
  DESKTOP_CURRENT, DESKTOP_CURRENT_TAP,
  DESKTOP_WINDOWS, DESKTOP_WINDOWS_TAP,
  openWindow,
} from '@grythjs/desktop';

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
  it('serves doc grips from registered taps', async () => {
    await expect.poll(() => drip(WORKSPACE_NAME).get()).toBe('mock-workspace');
  });

  it('lets a participant holding the tap handle drive desktop UI state', async () => {
    // delegated control: an agent switches the visible virtual desktop
    const currentTap = drip(DESKTOP_CURRENT_TAP);
    await expect.poll(() => currentTap.get()).toBeDefined();
    currentTap.get()!.set(3);
    await expect.poll(() => drip(DESKTOP_CURRENT).get()).toBe(3);
  });

  it('lets a headless participant open a window on the desktop', async () => {
    // The "AI opens the debugger" path: the desktop is a document; opening a
    // window is a data edit through the same ops the chrome uses.
    const windowsTap = drip(DESKTOP_WINDOWS_TAP);
    await expect.poll(() => windowsTap.get()).toBeDefined();
    windowsTap.get()!.update((list) => openWindow(list, 'chat', DESKTOP_BUILTINS.tools!.chat.defaultSize).list);
    const windows = drip(DESKTOP_WINDOWS);
    const hasFacet = (facet: string) =>
      windows.get()?.some((w) => w.tabs.some((t) => t.facet === facet));
    await expect.poll(() => hasFacet('chat')).toBe(true);
    expect(hasFacet('welcome')).toBe(true); // first-run window intact
  });
});
