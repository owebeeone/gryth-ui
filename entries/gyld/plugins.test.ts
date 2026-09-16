import { describe, expect, it } from 'vitest';
import type { Grip } from '@owebeeone/grip-react';
import { PLUGIN_REGISTRY, PluginRegistryTap, allTools, grok, pluginFrom } from '@grythjs/plugin-api';
import { GYLD_PLUGIN } from '@grythjs/plugin-gyld';
import './plugins'; // the target's whole plugin list; importing it IS registering

// The Gyld-only target is only worth having if it really is Gyld only, so the
// claim is asserted against the plugin registry rather than read off the
// import list: this suite imports the same module `entries/gyld/main.tsx`
// imports and then enumerates what the chrome would enumerate.

grok.registerTap(PluginRegistryTap);

const consume = grok.mainPresentationContext;
function drip<T>(grip: Grip<T>) {
  const d = consume.getOrCreateConsumer(grip);
  d.subscribe(() => {});
  return d;
}

const registry = () => drip(PLUGIN_REGISTRY).get();
const tools = () => allTools(registry());

/** Every tool `@grythjs/plugin-gyld` advertises (spec section 2). */
const GYLD_TOOLS = [
  'gyld.ask', 'gyld.browser', 'gyld.compare', 'gyld.decide', 'gyld.decidenow',
  'gyld.detail', 'gyld.diff', 'gyld.streams',
];

/** The desk's own appearance editor — the one tool here from another package,
 *  because it edits THIS desk rather than another subject (see plugins.ts). */
const DESK_TOOLS = ['settings'];

/** Tools of the plugins the FULL desktop lists and this target does not. One
 *  id per plugin, so a regression names the plugin that leaked back in. */
const OTHER_TARGETS_TOOLS = [
  'workspace', 'explorer', 'vms', 'terminal', 'chat', 'gwz', 'wyred.census',
];

describe('the gyld target plugin list', () => {
  it('registers the Gyld plugin', async () => {
    await expect.poll(() => pluginFrom(registry(), GYLD_PLUGIN)).toBeDefined();
  });

  it('advertises every Gyld tool, the appearance editor, and nothing else', async () => {
    await expect.poll(() => Object.keys(tools()).sort())
      .toEqual([...GYLD_TOOLS, ...DESK_TOOLS].sort());
    // the editor is here to be OPENED: it must reach the launcher like any
    // other tool, which is what enumerating the registry is
    expect(tools().settings.label).toBe('Settings');
    // The desktop's own builtins (welcome, grid) are absent here because they
    // are published by registerDesktopTaps, which is shell rather than plugin
    // and runs inside boot(); this module is the plugin list alone.
  });

  it('registers no other plugin', async () => {
    await expect.poll(() => registry()?.size).toBe(2); // gyld + settings

    for (const id of OTHER_TARGETS_TOOLS) {
      expect(tools()[id]).toBeUndefined();
    }
  });
});
