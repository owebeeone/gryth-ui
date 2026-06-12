import { describe, it, expect } from 'vitest';
import type { Grip } from '@owebeeone/grip-react';
import {
  grok, PluginRegistryTap, PLUGIN_REGISTRY, allTools, pluginFrom,
} from '@grythjs/plugin-api';
import './index'; // importing the plugin IS registering it
import { WORKSPACE_PLUGIN, WORKSPACE_LIST } from './grips';
import { GraphEngine } from './graphEngine';

grok.registerTap(PluginRegistryTap);

const consume = grok.mainPresentationContext;
function drip<T>(grip: Grip<T>) {
  const d = consume.getOrCreateConsumer(grip);
  d.subscribe(() => {});
  return d;
}

describe('workspace plugin', () => {
  it('registers its tool under its own grip; the chrome finds it via allTools', async () => {
    await expect.poll(() => pluginFrom(drip(PLUGIN_REGISTRY).get(), WORKSPACE_PLUGIN)).toBeDefined();
    const tools = allTools(drip(PLUGIN_REGISTRY).get());
    expect(tools.workspace.label).toBe('Workspaces');
    expect(tools.workspace.defaultSize).toEqual({ w: 760, h: 520 });
  });

  it('serves workspace records (icon + name) from the list tap', async () => {
    await expect.poll(() => drip(WORKSPACE_LIST).get()?.length).toBeGreaterThan(0);
    for (const w of drip(WORKSPACE_LIST).get()!) {
      expect(w.icon).toBeTruthy();
      expect(w.name).toBeTruthy();
      expect(w.repos.length).toBeGreaterThan(0);
    }
  });

  it('the graph engine snapshots nodes for the given repos', () => {
    const engine = new GraphEngine();
    engine.setInput(
      [
        { path: '', name: 'root', branch: 'main', head: 'abc', ahead: 0, behind: 0, dirty: false, changedFiles: [] },
        { path: 'lib', name: 'lib', branch: 'main', head: 'def', ahead: 1, behind: 0, dirty: true, changedFiles: [{ path: 'x.ts' }] },
      ],
      [{ source: 'lib', target: '' }],
      'test',
    );
    const nodes = engine.current();
    expect(nodes.map((n) => n.id).sort()).toEqual(['lib', 'root']);
    expect(nodes.find((n) => n.id === 'lib')!.dirty).toBe(true);
  });
});
