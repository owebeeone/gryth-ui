import { describe, it, expect } from 'vitest';
import { createAtomValueTap, type Grip } from '@owebeeone/grip-react';
import { grok, defineGrip, type ToolDef } from '@grythjs/plugin-api';
import { registerDesktopTaps } from './taps.desktop';
import { hasTabContext, tabContextFor } from './tabContexts';
import { DESKTOP_WINDOWS, DESKTOP_WINDOWS_TAP } from './grips.desktop';
import { closeWindow, openWindow } from './ops';

registerDesktopTaps(grok);
const consume = grok.mainPresentationContext;
function drip<T>(grip: Grip<T>) {
  const d = consume.getOrCreateConsumer(grip);
  d.subscribe(() => {});
  return d;
}

const SEED = defineGrip<string>('TabCtx.Seed', 'unseeded');

const DEF: ToolDef = {
  label: 'T', defaultSize: { w: 100, h: 100 },
  windowComponent: (() => null) as never,
  tabTaps: () => [createAtomValueTap(SEED, { initial: 'seeded' })],
};

describe('chrome-held tab contexts', () => {
  it('creates one context per tab, seeds its taps, and keeps identity stable', async () => {
    const windowsTap = drip(DESKTOP_WINDOWS_TAP);
    await expect.poll(() => windowsTap.get()).toBeDefined();
    const opened = openWindow(windowsTap.get()!.get() ?? [], 'chat', { w: 10, h: 10 });
    windowsTap.get()!.set(opened.list);
    const tabId = opened.list.find((w) => w.id === opened.id)!.tabs[0].id;

    const ctx = tabContextFor(grok, tabId, DEF);
    expect(tabContextFor(grok, tabId, DEF)).toBe(ctx); // strongly held, stable

    const seeded = ctx.getGripConsumerContext().getOrCreateConsumer(SEED);
    seeded.subscribe(() => {});
    await expect.poll(() => seeded.get()).toBe('seeded');
  });

  it('retires the context and its taps when the tab leaves the document', async () => {
    const windowsTap = drip(DESKTOP_WINDOWS_TAP);
    await expect.poll(() => windowsTap.get()).toBeDefined();
    const opened = openWindow(windowsTap.get()!.get() ?? [], 'chat', { w: 10, h: 10 });
    windowsTap.get()!.set(opened.list);
    const frame = opened.list.find((w) => w.id === opened.id)!;
    const tabId = frame.tabs[0].id;

    const ctx = tabContextFor(grok, tabId, DEF);
    const seeded = ctx.getGripConsumerContext().getOrCreateConsumer(SEED);
    seeded.subscribe(() => {});
    await expect.poll(() => seeded.get()).toBe('seeded');

    // close the window: the tab record leaves the desktop document and the
    // reaper retires the context + unregisters its taps. Another tab's
    // render piggybacks the sweep (notification delivery is queued).
    windowsTap.get()!.update((list) => closeWindow(list, opened.id));
    const welcomeTab = (windowsTap.get()!.get() ?? [])[0].tabs[0].id;
    const PLAIN: ToolDef = { label: 'P', defaultSize: { w: 1, h: 1 }, windowComponent: DEF.windowComponent };
    await expect.poll(() => {
      tabContextFor(grok, welcomeTab, PLAIN);
      return hasTabContext(tabId);
    }).toBe(false);
    void ctx;

    // windows grip notification also reflects the close
    await expect.poll(() => (drip(DESKTOP_WINDOWS).get() ?? []).some((w) => w.id === opened.id)).toBe(false);
  });
});
