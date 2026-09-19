import { describe, expect, it } from 'vitest';
import { LegendPanel } from './legendPanel';

// The overlay's three states and two gestures. Three named instances, so an
// impossible one — shrunk while showing help — cannot be constructed at all.

describe('the legend overlay has three states and no others', () => {
  it('names them, and tells them apart by what they show', () => {
    expect(LegendPanel.ALL).toHaveLength(3);
    expect(LegendPanel.ALL.map((panel) => panel.param)).toEqual(['shrunk', 'open', 'help']);
    expect(LegendPanel.SHRUNK.open).toBe(false);
    expect(LegendPanel.SHRUNK.showsRows).toBe(false);
    expect(LegendPanel.OPEN.open).toBe(true);
    expect(LegendPanel.OPEN.showsRows).toBe(true);
    expect(LegendPanel.OPEN.help).toBe(false);
    expect(LegendPanel.HELP.open).toBe(true);
    expect(LegendPanel.HELP.help).toBe(true);
    expect(LegendPanel.HELP.showsRows).toBe(false);
  });

  it('expands and shrinks with one gesture, whatever is being shown', () => {
    expect(LegendPanel.SHRUNK.toggled()).toBe(LegendPanel.OPEN);
    expect(LegendPanel.OPEN.toggled()).toBe(LegendPanel.SHRUNK);
    // shrinking from the help goes all the way to the tab
    expect(LegendPanel.HELP.toggled()).toBe(LegendPanel.SHRUNK);
  });

  it('opens the help from the rows, and goes back to the rows from it', () => {
    expect(LegendPanel.OPEN.withHelp()).toBe(LegendPanel.HELP);
    expect(LegendPanel.HELP.withHelp()).toBe(LegendPanel.OPEN);
  });

  it('reads a param, and falls back to the state that takes no room', () => {
    for (const panel of LegendPanel.ALL) {
      expect(LegendPanel.of(panel.param)).toBe(panel);
    }
    expect(LegendPanel.of(undefined)).toBe(LegendPanel.SHRUNK);
    expect(LegendPanel.of('')).toBe(LegendPanel.SHRUNK);
    expect(LegendPanel.of('OPEN')).toBe(LegendPanel.SHRUNK);
    expect(LegendPanel.of(true)).toBe(LegendPanel.SHRUNK);
  });
});
