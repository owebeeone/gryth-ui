import { describe, expect, it } from 'vitest';
import { grok, PluginRegistryTap, allTools } from '@grythjs/plugin-api';
import {
  DESKTOP_WINDOWS_TAP, GYLD, openWindow, registerDesktopTaps, type WindowRecord,
} from '@grythjs/desktop';
import { GYLD_DESK } from './desk';
import './plugins'; // the target's plugin list; importing it IS registering

// What this target's desk COSTS the reader on landing, asserted against the
// shell's own composition call rather than against the setup object.
//
// Its own file because `registerDesktopTaps` publishes the shell's builtin
// tools into the registry, and `desk.test.ts` counts what the target's plugin
// list registered. One file per composition keeps both honest.

/** The facets on desk 1 after `boot(setup)` would have run, from the shell's
 *  own first-run desktop (one Welcome window). */
async function landing(setup: Parameters<typeof registerDesktopTaps>[1]) {
  registerDesktopTaps(grok, undefined);
  const handle = grok.mainPresentationContext.getOrCreateConsumer(DESKTOP_WINDOWS_TAP);
  handle.subscribe(() => {});
  await expect.poll(() => handle.get()).toBeDefined();
  handle.get()!.set(openWindow([], 'welcome', { w: 520, h: 280 }).list);
  registerDesktopTaps(grok, setup);
  const list: WindowRecord[] = handle.get()!.get() ?? [];
  const tabOf = (facet: string) =>
    list.flatMap((w) => w.tabs).find((tab) => tab.facet === facet);
  return {
    facets: list.flatMap((w) => w.tabs.map((tab) => tab.facet)),
    areaOf: (facet: string) =>
      list.find((w) => w.tabs.some((tab) => tab.facet === facet))?.dock?.area,
    tabOf,
  };
}

describe('landing on the gyld target', () => {
  it('opens the tree and the browser in their areas, and no Welcome', async () => {
    await expect.poll(() => Object.keys(allTools(PluginRegistryTap.get())).length)
      .toBeGreaterThanOrEqual(7);
    const desk = await landing(GYLD_DESK);
    // the locked preset's own grid, then exactly the two tools the desk names,
    // in the order they open: the browser first, so the tree can be wired to it
    expect(desk.facets).toEqual(['grid', 'gyld.browser', 'gyld.streams']);
    // the reader asked for Gyld, so the shell does not greet them first
    expect(desk.facets).not.toContain('welcome');
    // and each landed by its declared role, not by the order it was opened
    expect(desk.areaOf('gyld.streams')).toBe('explorer');
    expect(desk.areaOf('gyld.browser')).toBe('stage');
    // the WIRE: the tree's tab names the browser's tab as its source, which is
    // what makes a stream click retarget that browser rather than open another
    expect(desk.tabOf('gyld.streams')?.source).toBe(desk.tabOf('gyld.browser')?.id);
    expect(desk.tabOf('gyld.browser')?.source).toBeUndefined();
  });

  it('leaves a desk that names no tool exactly as it was', async () => {
    const desk = await landing({ foundation: GYLD, locked: true });
    // the shell's own answer to an empty desk, untouched by this change
    expect(desk.facets).toEqual(['welcome', 'grid']);
  });
});
