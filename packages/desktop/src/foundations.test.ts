import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { addEntry, defineGrip, grok, PluginRegistryTap, type GrythPlugin } from '@grythjs/plugin-api';
import { GYLD, HUB } from './foundations';
import { DESKTOP_FOUNDATION_PRESET } from './grips.desktop';
import { DesktopWindowsTap, OpenToolTap, registerDesktopTaps } from './taps.desktop';
import { areaRects, foundationOn } from './ops';

// The pane preset is the TARGET's, not the chrome's: the grip defaults to HUB
// so the shell needs no producer, and a target hands its own preset (and a
// boot-time lock) to registerDesktopTaps. Placement inside it comes from the
// tools' own roles, so this suite registers a plugin of its own rather than
// naming a real one — that is exactly what the chrome sees.

const TEST_PLUGIN = defineGrip<GrythPlugin>('Test.PaneRoles.Plugin');
const stub = () => createElement('div');

addEntry(TEST_PLUGIN, {
  tools: {
    tree: { label: 'Tree', defaultSize: { w: 240, h: 480 }, role: 'explorer', windowComponent: stub },
    note: { label: 'Note', defaultSize: { w: 320, h: 240 }, role: 'inspector', windowComponent: stub },
    orphan: { label: 'Orphan', defaultSize: { w: 320, h: 240 }, role: 'crew', windowComponent: stub },
  },
});
grok.registerTap(PluginRegistryTap);
// what `boot(GYLD_DESK)` does for the Gyld target
registerDesktopTaps(grok, { foundation: GYLD, locked: true });

const windows = () => DesktopWindowsTap.get();
const openTool = (toolId: string) => OpenToolTap.get()({ toolId });
const areaOf = (facet: string) =>
  windows().find((w) => w.tabs.some((t) => t.facet === facet))?.dock?.area;

describe('the foundation preset', () => {
  it('defaults to HUB, so the full desktop needs no producer', () => {
    expect(DESKTOP_FOUNDATION_PRESET.defaultValue).toBe(HUB);
  });

  it('lays the Gyld desk out as selector | stage over pulse | inspector', () => {
    const rects = areaRects(GYLD.layout, { x: 0, y: 0, w: 1000, h: 1000 });
    expect([...rects.keys()].sort()).toEqual(['explorer', 'inspector', 'pulse', 'stage']);
    expect(rects.get('explorer')!.w).toBe(200);
    expect(rects.get('inspector')!.w).toBe(240);
    expect(rects.get('stage')!.h).toBe(700);
    expect(rects.get('pulse')!.h).toBe(300);
    // one tool named here, and one only: `settings` declares the `crew` role
    // and this preset has no crew, so it would otherwise land on the stage.
    // Everything else is placed by the role it declares.
    expect(GYLD.designate).toEqual({ settings: 'inspector' });
    expect(GYLD.fallback).toBe('stage');
  });
});

describe('a target that opens locked', () => {
  it('grids the first desk on its own preset and adopts the first-run window', () => {
    const f = foundationOn(windows(), 1);
    expect(f?.foundation).toBe(GYLD);
    expect(areaOf('welcome')).toBe('stage'); // no role, no designation: fallback
  });

  it('docks newly opened tools by the role their plugin declares', () => {
    openTool('tree');
    openTool('note');
    openTool('orphan');
    expect(areaOf('tree')).toBe('explorer');
    expect(areaOf('note')).toBe('inspector');
    // 'crew' is an area of HUB and not of this preset — fallback, tabbed
    // with whatever is on the stage
    expect(areaOf('orphan')).toBe('stage');
  });
});
