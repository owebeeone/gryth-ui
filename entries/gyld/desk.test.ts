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
};

describe('the gyld target desk', () => {
  it('is the Gyld pane preset, locked from the first paint', () => {
    expect(GYLD_DESK).toEqual({ foundation: GYLD, locked: true });
  });

  it('places every Gyld tool in the pane its role names', async () => {
    await expect.poll(() => Object.keys(allTools(PluginRegistryTap.get())).length).toBe(7);
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
