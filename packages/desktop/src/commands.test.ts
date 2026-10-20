import { describe, expect, it } from 'vitest';
import type { CommandDef } from '@grythjs/plugin-api';
import { SHELL_HOTKEYS, bindCommands, commandFor, keydownCommand } from './commands';

// The shell's command binding (G-5): the host's chords win, a conflict is
// logged once, and a chord resolves to the command it fires.

const run = () => {};
const cmd = (label: string, hotkey?: string): CommandDef => ({ label, hotkey, run });

describe('bindCommands', () => {
  it('binds free hotkeys and skips commands without one', () => {
    const bound = bindCommands({ a: cmd('A', 'Mod+Shift+I'), b: cmd('B'), c: cmd('C', 'F2') });
    expect(bound.map((b) => b.id)).toEqual(['a', 'c']);
    expect(commandFor(bound, { key: 'I', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })?.id).toBe('a');
    expect(commandFor(bound, { key: 'F2', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })?.id).toBe('c');
    expect(commandFor(bound, { key: 'F3', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBeUndefined();
  });

  it('C-P3-3: a chord resolves by code when the key was shifted, and a held chord is swallowed but runs once', () => {
    const bound = bindCommands({ one: cmd('One', 'Mod+Shift+1'), y: cmd('Y', 'Mod+Shift+Y') });
    const shifted = { key: '!', code: 'Digit1', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true };
    expect(commandFor(bound, shifted)?.id).toBe('one');
    expect(keydownCommand(bound, shifted)).toEqual({ swallow: true, run: bound[0] });
    const press = { key: 'Y', code: 'KeyY', ctrlKey: false, metaKey: true, altKey: false, shiftKey: true };
    expect(keydownCommand(bound, { ...press, repeat: false }).run?.id).toBe('y');
    const held = keydownCommand(bound, { ...press, repeat: true });
    expect(held.swallow).toBe(true);
    expect(held.run).toBeUndefined();
    expect(keydownCommand(bound, { ...press, key: 'Z', code: 'KeyZ' })).toEqual({ swallow: false, run: undefined });
  });

  it('the host wins a conflict, logged once per command', () => {
    const logs: string[] = [];
    const log = (m: string) => { logs.push(m); };
    const commands = { over: cmd('Overview', 'Shift+ArrowUp'), host: cmd('Host', 'Ctrl+K'), free: cmd('Free', 'Mod+Shift+R') };
    const reserved = [...SHELL_HOTKEYS, 'Mod+K'];
    expect(bindCommands(commands, reserved, log).map((b) => b.id)).toEqual(['free']);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain('"over"');
    expect(logs[1]).toContain('"host"');
    // a re-render binds again and says nothing more
    bindCommands(commands, reserved, log);
    expect(logs).toHaveLength(2);
  });

  it('an unparseable spec is not bound, and the first of two equal chords wins', () => {
    const logs: string[] = [];
    const bound = bindCommands({ bad: cmd('Bad', 'Ctrl+'), one: cmd('One', 'Mod+E'), two: cmd('Two', 'Mod+E') }, SHELL_HOTKEYS, (m) => { logs.push(m); });
    expect(bound.map((b) => b.id)).toEqual(['one']);
    expect(logs.some((m) => m.includes('unparseable'))).toBe(true);
  });
});
