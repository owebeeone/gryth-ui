import {
  hotkeyCollides, hotkeyKey, hotkeyMatches, parseHotkey,
  type CommandDef, type CommandId, type Hotkey, type KeyChord,
} from '@grythjs/plugin-api';

// The shell side of commands (G-5): which declared hotkeys are bound, given
// the chords the host already handles. The host's win: a command whose hotkey
// collides with a reserved chord is listed but never bound, and the conflict
// is logged ONCE per command (a render-time computation must not log on every
// render). Pure over its inputs, so the Desktop's keyboard handler can call
// it on each key without an effect or a listener.

/** The chords the desktop's own keyboard handling takes (Desktop.tsx
 *  `onKeyDown`): overview and desktop switching. */
export const SHELL_HOTKEYS: readonly string[] = [
  'Shift+ArrowUp', 'Shift+ArrowDown', 'Shift+ArrowLeft', 'Shift+ArrowRight', 'Escape',
];

export interface BoundCommand {
  id: CommandId;
  def: CommandDef;
  hotkey: Hotkey;
}

const warned = new Set<string>();

/** The commands whose hotkeys may fire, in registry order. `reserved` are the
 *  host's chords (the shell's own plus any the composition names). A spec that
 *  does not parse is skipped and logged once, like a conflict. */
export function bindCommands(
  commands: Record<CommandId, CommandDef>,
  reserved: readonly string[] = SHELL_HOTKEYS,
  log: (message: string) => void = (m) => console.warn(m),
): BoundCommand[] {
  const taken = reserved.map(parseHotkey).filter((h): h is Hotkey => h !== null);
  const bound: BoundCommand[] = [];
  for (const [id, def] of Object.entries(commands)) {
    if (def.hotkey === undefined) {
      continue;
    }
    const hotkey = parseHotkey(def.hotkey);
    const clash = hotkey === null ? undefined : taken.find((t) => hotkeyCollides(t, hotkey));
    if (hotkey === null || clash !== undefined) {
      const note = `${id}:${def.hotkey}`;
      if (!warned.has(note)) {
        warned.add(note);
        log(hotkey === null || clash === undefined
          ? `gryth: command "${id}" has an unparseable hotkey "${def.hotkey}"; not bound`
          : `gryth: command "${id}" hotkey ${hotkeyKey(hotkey)} is bound by the host (${hotkeyKey(clash)}); the host wins`);
      }
      continue;
    }
    // an earlier command's chord is taken too: first declared wins
    if (bound.some((b) => hotkeyCollides(b.hotkey, hotkey))) {
      continue;
    }
    bound.push({ id, def, hotkey });
  }
  return bound;
}

/** The bound command a key chord fires, if any. */
export function commandFor(bound: readonly BoundCommand[], chord: KeyChord): BoundCommand | undefined {
  return bound.find((b) => hotkeyMatches(b.hotkey, chord));
}

/** What a keydown on a bound chord does: `swallow` (the shell takes the event,
 *  so the browser's and the shell's own handling never see it) and `run` (the
 *  command fires). A held chord auto-repeats; it is swallowed each time but
 *  RUNS ONCE, on the first press (`repeat` false). */
export function keydownCommand(bound: readonly BoundCommand[], e: KeyChord & { readonly repeat?: boolean }): { readonly swallow: boolean; readonly run: BoundCommand | undefined } {
  const hit = commandFor(bound, e);
  if (hit === undefined) {
    return { swallow: false, run: undefined };
  }
  return { swallow: true, run: e.repeat === true ? undefined : hit };
}
