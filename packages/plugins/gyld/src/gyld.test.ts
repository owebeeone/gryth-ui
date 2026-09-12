import { describe, it, expect } from 'vitest';
import type { Grip, Tap } from '@owebeeone/grip-react';
import {
  grok, PluginRegistryTap, PLUGIN_REGISTRY, allTools, pluginFrom,
} from '@grythjs/plugin-api';
import './index'; // importing the plugin IS registering it
import {
  GYLD_PLUGIN, GYLD_DEST_STREAM, GYLD_DEST_PERSPECTIVE,
  GYLD_DEST_STREAM_TAP, GYLD_DEST_PERSPECTIVE_TAP,
} from './grips';

grok.registerTap(PluginRegistryTap);

const consume = grok.mainPresentationContext;
function drip<T>(grip: Grip<T>) {
  const d = consume.getOrCreateConsumer(grip);
  d.subscribe(() => {});
  return d;
}

const tools = () => allTools(drip(PLUGIN_REGISTRY).get());

// Stand in for the desktop chrome: a keyed tab context whose HOME context
// carries the tool's tabTaps, exactly as tabContextFor does
// (packages/desktop/src/tabContexts.ts).
function seedTab(key: string, params?: Record<string, unknown>) {
  const taps: Tap[] = tools()['gyld.browser'].tabTaps!(key, params);
  const ctx = grok.mainPresentationContext.getOrCreateMatchingContext(`tab:${key}`);
  const home = ctx.getGripHomeContext();
  for (const tap of taps) {
    home.registerTap(tap);
  }
  const read = <T,>(grip: Grip<T>) => {
    const d = ctx.getGripConsumerContext().getOrCreateConsumer(grip);
    d.subscribe(() => {});
    return d;
  };
  return { read, release: () => taps.forEach((tap) => home.unregisterTap(tap)) };
}

describe('gyld plugin registration', () => {
  it('inserts its entry under GYLD_PLUGIN when the module is imported', async () => {
    await expect.poll(() => pluginFrom(drip(PLUGIN_REGISTRY).get(), GYLD_PLUGIN)).toBeDefined();
  });

  it('the chrome finds gyld.browser via allTools', async () => {
    await expect.poll(() => tools()['gyld.browser']).toBeDefined();
    const tool = tools()['gyld.browser'];
    expect(tool.label).toBe('Gyld browser');
    expect(tool.defaultSize).toEqual({ w: 900, h: 620 });
    expect(tool.role).toBe('explorer');
    expect(typeof tool.windowComponent).toBe('function');
  });

  it('seeds the destination atoms per tab from the opening link params', async () => {
    const tab = seedTab('gyld-seeded', { stream: 'base', perspective: 'decisions' });
    await expect.poll(() => tab.read(GYLD_DEST_STREAM).get()).toBe('base');
    expect(tab.read(GYLD_DEST_PERSPECTIVE).get()).toBe('decisions');
    // the seeds publish their write handles, so a gesture reads and writes
    // through handle.get()/set, never through a render closure
    await expect.poll(() => tab.read(GYLD_DEST_STREAM_TAP).get()).toBeDefined();
    expect(tab.read(GYLD_DEST_PERSPECTIVE_TAP).get()).toBeDefined();
    tab.release();
  });

  it('two tabs are independent destinations', async () => {
    const a = seedTab('gyld-a', { stream: 'base', perspective: 'decisions' });
    const b = seedTab('gyld-b', { stream: 'keys-2026-09-13', perspective: 'architecture' });
    await expect.poll(() => a.read(GYLD_DEST_STREAM).get()).toBe('base');
    await expect.poll(() => b.read(GYLD_DEST_STREAM).get()).toBe('keys-2026-09-13');
    expect(a.read(GYLD_DEST_PERSPECTIVE).get()).toBe('decisions');
    expect(b.read(GYLD_DEST_PERSPECTIVE).get()).toBe('architecture');
    a.release();
    b.release();
  });

  it('leaves the destination EMPTY when the link carries none (no invented default)', async () => {
    const tab = seedTab('gyld-empty');
    await expect.poll(() => tab.read(GYLD_DEST_STREAM_TAP).get()).toBeDefined();
    expect(tab.read(GYLD_DEST_STREAM).get()).toBe('');
    expect(tab.read(GYLD_DEST_PERSPECTIVE).get()).toBe('');
    tab.release();
  });

  it('ignores non-string link params rather than coercing them', async () => {
    const tab = seedTab('gyld-junk', { stream: 42, perspective: null });
    await expect.poll(() => tab.read(GYLD_DEST_STREAM_TAP).get()).toBeDefined();
    expect(tab.read(GYLD_DEST_STREAM).get()).toBe('');
    expect(tab.read(GYLD_DEST_PERSPECTIVE).get()).toBe('');
    tab.release();
  });
});
