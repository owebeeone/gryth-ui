import { describe, expect, it } from 'vitest';
import type { Grip } from '@owebeeone/grip-react';
import { grok, defineGrip } from './runtime';
import { PluginRegistryTap, PLUGIN_REGISTRY, addEntry, allCommands, removeEntry, type GrythPlugin } from './registry';
import { hotkeyCollides, hotkeyKey, hotkeyMatches, keyFromCode, parseHotkey } from './commands';

// Commands (G-5) at the contract: declared beside tools, flattened like them,
// and hotkey specs that parse, match a chord and collide platform-neutrally.

grok.registerTap(PluginRegistryTap);
const chord = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe('hotkey specs', () => {
  it('parses modifiers in any order and case, and a key', () => {
    const h = parseHotkey('shift+MOD+i')!;
    expect(h).toMatchObject({ mod: true, shift: true, ctrl: false, meta: false, alt: false, key: 'i' });
    expect(hotkeyKey(h)).toBe('Mod+Shift+i');
    expect(parseHotkey('F2')).toMatchObject({ key: 'F2' });
    expect(parseHotkey('Cmd+ArrowUp')).toMatchObject({ meta: true, key: 'ArrowUp' });
  });

  it('refuses a spec with no key or with two keys', () => {
    expect(parseHotkey('Ctrl+Shift')).toBeNull();
    expect(parseHotkey('a+b')).toBeNull();
    expect(parseHotkey('')).toBeNull();
  });

  it('Mod matches Ctrl or Cmd, not both, and letters ignore case', () => {
    const h = parseHotkey('Mod+Shift+I')!;
    expect(hotkeyMatches(h, chord('I', { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(hotkeyMatches(h, chord('i', { metaKey: true, shiftKey: true }))).toBe(true);
    expect(hotkeyMatches(h, chord('i', { metaKey: true, ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(hotkeyMatches(h, chord('i', { shiftKey: true }))).toBe(false);
    expect(hotkeyMatches(h, chord('i', { ctrlKey: true }))).toBe(false);
    expect(hotkeyMatches(parseHotkey('Escape')!, chord('Escape'))).toBe(true);
    expect(hotkeyMatches(parseHotkey('Escape')!, chord('Escape', { shiftKey: true }))).toBe(false);
  });

  it('C-P3-3: a shifted digit or an Alt-modified letter matches by KeyboardEvent.code', () => {
    const digit = parseHotkey('Mod+Shift+1')!;
    expect(hotkeyMatches(digit, { ...chord('!', { ctrlKey: true, shiftKey: true }), code: 'Digit1' })).toBe(true);
    expect(hotkeyMatches(digit, { ...chord('!', { ctrlKey: true, shiftKey: true }), code: 'Digit2' })).toBe(false);
    expect(hotkeyMatches(digit, chord('!', { ctrlKey: true, shiftKey: true }))).toBe(false);
    const alt = parseHotkey('Alt+I')!;
    expect(hotkeyMatches(alt, { ...chord('ˆ', { altKey: true }), code: 'KeyI' })).toBe(true);
    // a named key never matches by code
    expect(hotkeyMatches(parseHotkey('F2')!, { ...chord('F3'), code: 'F2' })).toBe(false);
    expect(keyFromCode('KeyQ')).toBe('q');
    expect(keyFromCode('Digit7')).toBe('7');
    expect(keyFromCode('ArrowUp')).toBeUndefined();
    expect(keyFromCode(undefined)).toBeUndefined();
  });

  it('collides when the chords are one key on some platform', () => {
    const mod = parseHotkey('Mod+K')!;
    expect(hotkeyCollides(mod, parseHotkey('Ctrl+K')!)).toBe(true);
    expect(hotkeyCollides(parseHotkey('Cmd+K')!, mod)).toBe(true);
    expect(hotkeyCollides(mod, parseHotkey('Ctrl+Shift+K')!)).toBe(false);
    expect(hotkeyCollides(parseHotkey('Ctrl+K')!, parseHotkey('Cmd+K')!)).toBe(false);
    expect(hotkeyCollides(parseHotkey('Shift+ArrowUp')!, parseHotkey('shift+arrowup')!)).toBe(false);
    expect(hotkeyCollides(parseHotkey('Shift+ArrowUp')!, parseHotkey('Shift+ArrowUp')!)).toBe(true);
  });
});

describe('plugin commands in the registry', () => {
  it('flattens every entry\'s commands; later entries win a collision', async () => {
    const A = defineGrip<GrythPlugin>('Test.CommandsA');
    const B = defineGrip<GrythPlugin>('Test.CommandsB');
    const run = () => {};
    addEntry(A, { commands: { 'a.one': { label: 'One', hotkey: 'Mod+1', run }, shared: { label: 'A', run } } });
    addEntry(B, { commands: { shared: { label: 'B', run } } });
    const d = grok.mainPresentationContext.getOrCreateConsumer(PLUGIN_REGISTRY);
    d.subscribe(() => {});
    await expect.poll(() => Object.keys(allCommands(d.get())).sort()).toEqual(['a.one', 'shared']);
    expect(allCommands(d.get()).shared.label).toBe('B');
    expect(allCommands(d.get())['a.one'].hotkey).toBe('Mod+1');
    expect(allCommands(undefined)).toEqual({});
    removeEntry(A as Grip<unknown>);
    removeEntry(B as Grip<unknown>);
  });
});

describe('Phase 2 Code P3-9: layouts', () => {
  it('a plain produced letter wins over the physical key (AZERTY KeyA produces q)', () => {
    const chord = { key: 'q', code: 'KeyA', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
    expect(hotkeyMatches(parseHotkey('Ctrl+Q')!, chord)).toBe(true);
    expect(hotkeyMatches(parseHotkey('Ctrl+A')!, chord)).toBe(false);
  });
  it('a shifted digit still matches its physical key', () => {
    const chord = { key: '!', code: 'Digit1', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true };
    expect(hotkeyMatches(parseHotkey('Ctrl+Shift+1')!, chord)).toBe(true);
  });
});
