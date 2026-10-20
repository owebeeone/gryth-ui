import { describe, expect, it } from 'vitest';
import { grok } from '@grythjs/plugin-api';
import { DesktopCurrentTap, DesktopListTap, DesktopWindowsTap, OpenOnDesktopTap, registerDesktopTaps } from './taps.desktop';

// Desktop.OpenOnDesktop (G-7): the window lands on the desktop asked for, the
// desk switches there, and a NAME is a handle to one new desktop.

registerDesktopTaps(grok);

function windowsOn(desk: number) {
  return DesktopWindowsTap.get().filter((w) => w.desktop === desk && !w.foundation);
}

describe('Desktop.OpenOnDesktop', () => {
  it('with no target adds a new desktop, switches to it and opens the tool there', () => {
    DesktopListTap.set([1, 2]);
    DesktopCurrentTap.set(1);
    const open = OpenOnDesktopTap.get();
    const desk = open({ toolId: 'welcome', params: { at: 'x' } });
    expect(desk).toBe(3);
    expect(DesktopListTap.get()).toContain(3);
    expect(DesktopCurrentTap.get()).toBe(3);
    const wins = windowsOn(3);
    expect(wins).toHaveLength(1);
    expect(wins[0].tabs[0]).toMatchObject({ facet: 'welcome', params: { at: 'x' } });
  });

  it('a numbered desktop is used, and added when the desk does not have it', () => {
    const open = OpenOnDesktopTap.get();
    expect(open({ toolId: 'welcome' }, { desktop: 2 })).toBe(2);
    expect(DesktopCurrentTap.get()).toBe(2);
    expect(windowsOn(2).length).toBeGreaterThan(0);
    DesktopListTap.set([1, 2, 3]);
    expect(open({ toolId: 'welcome' }, { desktop: 7 })).toBe(7);
    expect(DesktopListTap.get()).toContain(7);
  });

  it('a name opens one new desktop and lands later calls on the same one', () => {
    const open = OpenOnDesktopTap.get();
    const before = windowsOn(1).length;
    const first = open({ toolId: 'welcome' }, { name: 'scratch' });
    const second = open({ toolId: 'welcome' }, { name: 'scratch' });
    expect(second).toBe(first);
    expect(windowsOn(first)).toHaveLength(2);
    expect(windowsOn(1)).toHaveLength(before);
    const other = open({ toolId: 'welcome' }, { name: 'other' });
    expect(other).not.toBe(first);
    // a number beats a name
    expect(open({ toolId: 'welcome' }, { name: 'scratch', desktop: 1 })).toBe(1);
  });
});
