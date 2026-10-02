import { describe, it, expect } from 'vitest';
import { createAtomValueTap, type Grip } from '@owebeeone/grip-react';
import { grok, defineGrip, type ToolDef } from '@grythjs/plugin-api';
import { registerDesktopTaps } from './taps.desktop';
import { hasTabContext, tabContextFor, unwireTab, wireTabSource } from './tabContexts';
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

  // A sink wired AFTER the fact — the stream tree adopting a browser once the
  // one it was opened against is closed. Its consumers have already resolved
  // (to the grip's own default, which is how "no source" is spelled), so the
  // new parent edge is worth nothing unless they are resolved again.
  it('re-resolves a sink wired after its consumers already resolved', async () => {
    const windowsTap = drip(DESKTOP_WINDOWS_TAP);
    await expect.poll(() => windowsTap.get()).toBeDefined();
    const handle = windowsTap.get()!;
    const source = openWindow(handle.get() ?? [], 'chat', { w: 10, h: 10 });
    const sink = openWindow(source.list, 'chat', { w: 10, h: 10 });
    handle.set(sink.list);
    const sourceTab = source.list.find((w) => w.id === source.id)!.tabs[0].id;
    const sinkTab = sink.list.find((w) => w.id === sink.id)!.tabs[0].id;

    const sourceCtx = tabContextFor(grok, sourceTab, DEF);
    const PLAIN: ToolDef = {
      label: 'P', defaultSize: { w: 1, h: 1 }, windowComponent: DEF.windowComponent,
    };
    const sinkCtx = tabContextFor(grok, sinkTab, PLAIN);
    const seen = sinkCtx.getGripConsumerContext().getOrCreateConsumer(SEED);
    seen.subscribe(() => {});
    await expect.poll(() => seen.get()).toBe('unseeded'); // unwired: the default

    wireTabSource(sinkTab, sourceTab, sourceCtx);
    await expect.poll(() => seen.get()).toBe('seeded');
    // and the wire comes back off again when the sink is pinned
    unwireTab(sinkTab);
    await expect.poll(() => seen.get()).toBe('unseeded');
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

describe('SS-06 live tab-link fields', () => {
  it('reapplies destinations in place and writes local picks back without resetting instance atoms', async () => {
    const { tabLinkField } = await import('@grythjs/plugin-api');
    const DEST = defineGrip<string>('TabCtx.Destination', '');
    const DEST_TAP = defineGrip<import('@owebeeone/grip-react').AtomTapHandle<string>>('TabCtx.Destination.Tap');
    const CAMERA = defineGrip<number>('TabCtx.Camera', 0);
    const camera = createAtomValueTap(CAMERA, { initial: 1 });
    const def: ToolDef = {
      ...DEF,
      tabTaps: (_id, params) => [createAtomValueTap(DEST, { initial: String(params?.dest ?? ''), handleGrip: DEST_TAP }), camera],
      linkFields: [tabLinkField(DEST, DEST_TAP, (p) => typeof p?.dest === 'string' ? p.dest : '', (v) => ({ dest: v }))],
    };
    const handle = drip(DESKTOP_WINDOWS_TAP).get()!;
    const oldIds = handle.get().flatMap((w) => w.tabs.map((t) => t.id));
    handle.set([]);
    await expect.poll(() => oldIds.every((id) => !hasTabContext(id))).toBe(true);
    const opened = openWindow([], 'test', { w: 10, h: 10 }, 1, { dest: 'first' });
    handle.set(opened.list);
    const tab = opened.list[0].tabs[0];
    const ctx = tabContextFor(grok, tab.id, def, tab.params);
    const d = ctx.getGripConsumerContext().getOrCreateConsumer(DEST);
    d.subscribe(() => {});
    grok.flush();
    camera.set(99);
    handle.update((list) => list.map((w) => ({ ...w, tabs: w.tabs.map((t) => ({ ...t, params: { dest: 'remote' } })) })));
    grok.flush();
    expect(tabContextFor(grok, tab.id, def, { dest: 'remote' })).toBe(ctx);
    await expect.poll(() => d.get()).toBe('remote');
    expect(camera.get()).toBe(99);
    const destination = ctx.getGripConsumerContext().getOrCreateConsumer(DEST_TAP);
    destination.subscribe(() => {}); grok.flush();
    destination.get()!.set('local'); grok.flush();
    await expect.poll(() => handle.get()[0].tabs[0].params).toEqual({ dest: 'local' });
    handle.update((list) => list.map((w) => ({ ...w, tabs: w.tabs.map((t) => ({ ...t, params: undefined })) })));
    grok.flush();
    await expect.poll(() => d.get()).toBe('');
    expect(camera.get()).toBe(99);
  });
  it('keeps inherited destinations out of a wired sink record', async () => {
    const { tabLinkField } = await import('@grythjs/plugin-api');
    const VALUE = defineGrip<string>('TabCtx.Inherited', '');
    const HANDLE = defineGrip<import('@owebeeone/grip-react').AtomTapHandle<string>>('TabCtx.Inherited.Tap');
    const sourceTap = createAtomValueTap(VALUE, { initial: 'source', handleGrip: HANDLE });
    const field = tabLinkField(VALUE, HANDLE, (p) => String(p?.dest ?? ''), (v) => ({ dest: v }), { inherited: true });
    const sourceDef: ToolDef = { ...DEF, tabTaps: () => [sourceTap] };
    const sinkDef: ToolDef = { ...DEF, tabTaps: () => [], linkFields: [field] };
    const handle = drip(DESKTOP_WINDOWS_TAP).get()!;
    const oldIds = handle.get().flatMap((w) => w.tabs.map((t) => t.id));
    handle.set([]);
    await expect.poll(() => oldIds.every((id) => !hasTabContext(id))).toBe(true);
    const a = openWindow([], 'source', { w: 1, h: 1 });
    const sourceId = a.list[0].tabs[0].id;
    const b = openWindow(a.list, 'sink', { w: 1, h: 1 }, 1, undefined, sourceId);
    const sinkId = b.list[1].tabs[0].id;
    handle.set(b.list);
    const source = tabContextFor(grok, sourceId, sourceDef);
    const sink = tabContextFor(grok, sinkId, sinkDef);
    wireTabSource(sinkId, sourceId, source);
    const read = sink.getGripConsumerContext().getOrCreateConsumer(VALUE); read.subscribe(() => {}); grok.flush();
    await expect.poll(() => read.get()).toBe('source');
    sourceTap.set('next'); grok.flush();
    await expect.poll(() => read.get()).toBe('next');
    expect(handle.get()[1].tabs[0].params).toBeUndefined();
  });
});
