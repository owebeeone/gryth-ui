import { describe, it, expect } from 'vitest';
import type { Grip } from '@owebeeone/grip-react';
import { grok, defineGrip } from './runtime';
import {
  PluginRegistryTap, PLUGIN_REGISTRY, PLUGIN_REGISTRY_TAP,
  addEntry, removeEntry, pluginFrom,
  type GripComponentFactory, type GrythPlugin,
} from './registry';

grok.registerTap(PluginRegistryTap);

const consume = grok.mainPresentationContext;
function drip<T>(grip: Grip<T>) {
  const d = consume.getOrCreateConsumer(grip);
  d.subscribe(() => {});
  return d;
}

const View = (() => null) as unknown as GripComponentFactory;
const plugin = (tool: string, label = tool): GrythPlugin => ({
  tools: { [tool]: { label, defaultSize: { w: 100, h: 80 }, windowComponent: View } },
});

const lookup = <P,>(grip: Grip<P>) => pluginFrom(drip(PLUGIN_REGISTRY).get(), grip);

describe('plugin registry (atom tap with a special setter)', () => {
  it('serves an entry added AFTER a consumer subscribed (late binding)', async () => {
    const PLUG = defineGrip<GrythPlugin>('Test.PluginA');
    const d = drip(PLUGIN_REGISTRY);
    expect(pluginFrom(d.get(), PLUG)).toBeUndefined();
    addEntry(PLUG, plugin('alpha'));
    await expect.poll(() => lookup(PLUG)?.tools?.alpha.label).toBe('alpha');
    removeEntry(PLUG as Grip<unknown>);
    await expect.poll(() => lookup(PLUG)).toBeUndefined();
  });

  it('COW: snapshots are immutable; re-adding REPLACES the entry', async () => {
    const PLUG = defineGrip<GrythPlugin>('Test.PluginB');
    addEntry(PLUG, plugin('one'));
    await expect.poll(() => lookup(PLUG)?.tools?.one.label).toBe('one');
    const before = drip(PLUGIN_REGISTRY).get();
    addEntry(PLUG, plugin('one', 'one v2'));
    await expect.poll(() => lookup(PLUG)?.tools?.one.label).toBe('one v2');
    // the earlier snapshot is untouched (copy-mutate-set, not in-place)
    expect(pluginFrom(before, PLUG)?.tools?.one.label).toBe('one');
    removeEntry(PLUG as Grip<unknown>);
  });

  it('entries on different grips are independent', async () => {
    const A = defineGrip<GrythPlugin>('Test.PluginC');
    const B = defineGrip<GrythPlugin>('Test.PluginD');
    addEntry(A, plugin('ay'));
    addEntry(B, plugin('bee'));
    await expect.poll(() => lookup(A)?.tools?.ay).toBeDefined();
    expect(lookup(B)?.tools?.bee).toBeDefined();
    removeEntry(A as Grip<unknown>);
    await expect.poll(() => lookup(A)).toBeUndefined();
    expect(lookup(B)?.tools?.bee).toBeDefined();
    removeEntry(B as Grip<unknown>);
  });

  it('advertises its setter through the graph (the handleGrip pattern)', async () => {
    const handleDrip = drip(PLUGIN_REGISTRY_TAP);
    await expect.poll(() => handleDrip.get()).toBeDefined();
    const PLUG = defineGrip<GrythPlugin>('Test.PluginE');
    handleDrip.get()!.update((prev) => {
      const next = new Map(prev);
      next.set(PLUG as Grip<unknown>, plugin('ee'));
      return next;
    });
    await expect.poll(() => lookup(PLUG)?.tools?.ee).toBeDefined();
    removeEntry(PLUG as Grip<unknown>);
  });
});
