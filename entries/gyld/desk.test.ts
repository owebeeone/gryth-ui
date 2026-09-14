import { describe, expect, it } from 'vitest';
import { PluginRegistryTap, allTools, type ToolId } from '@grythjs/plugin-api';
import { GYLD, openFoundation, openWindow, toolRoles, type WindowRecord } from '@grythjs/desktop';
import { GYLD_DESK } from './desk';
import './plugins'; // the target's plugin list; importing it IS registering

// The target's DESK, asserted the way its plugin list is: against what the
// chrome would actually do, not against the import. The claim is that the
// preset and the plugin's declared roles meet — this target names no tool in
// its layout and no area in its plugin, so if either side drifted the windows
// would silently pile onto the fallback.

const SIZE = { w: 400, h: 300 };

/** Where the owner asked each Gyld window to land on a locked desk. */
const EXPECTED: Record<ToolId, string> = {
  'gyld.streams': 'explorer',   // the stream tree is the selector
  'gyld.browser': 'stage',
  'gyld.compare': 'stage',
  'gyld.diff': 'stage',
  'gyld.decidenow': 'pulse',
  'gyld.detail': 'inspector',
  'gyld.decide': 'inspector',
  // not a Gyld tool: the desk's appearance editor. Its plugin declares the
  // `crew` role, which this preset has no area for, so the preset designates
  // it rather than letting it fall back onto the stage.
  settings: 'inspector',
};

describe('the gyld target desk', () => {
  it('is the Gyld pane preset, locked from the first paint', () => {
    expect(GYLD_DESK.foundation).toBe(GYLD);
    expect(GYLD_DESK.locked).toBe(true);
    // and the two windows it opens with: the browser first, because the tree
    // is opened WIRED to it and a sink names a source that already exists. The
    // wire is what makes a stream click retarget that browser instead of
    // opening a second one. What the pair costs the desk is asserted in
    // `landing.test.ts`.
    expect(GYLD_DESK.tools).toEqual([
      { toolId: 'gyld.browser' },
      { toolId: 'gyld.streams', wiredTo: 'gyld.browser' },
    ]);
  });

  it('places every tool it lists in the pane its role or the preset names', async () => {
    await expect.poll(() => Object.keys(allTools(PluginRegistryTap.get())).length).toBe(8);
    const roles = toolRoles(allTools(PluginRegistryTap.get()));
    let list: WindowRecord[] = [];
    for (const toolId of Object.keys(EXPECTED)) {
      list = openWindow(list, toolId, SIZE).list;
    }
    const out = openFoundation(list, 1, GYLD_DESK.foundation!, {}, roles);
    const areaOf = (toolId: ToolId) =>
      out.list.find((w) => w.tabs.some((t) => t.facet === toolId))!.dock?.area;
    for (const [toolId, area] of Object.entries(EXPECTED)) {
      expect(`${toolId} -> ${areaOf(toolId)}`).toBe(`${toolId} -> ${area}`);
    }
  });
});
