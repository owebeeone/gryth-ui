import type { GripContextLike, Grok } from '@owebeeone/grip-react';

// App-level COMMANDS (G-5): a plugin declares a global action — label, an
// optional hotkey, a handler — and the shell shows it in the sidebar and the
// launcher and binds the hotkey. "Export", "Help", "Report" and the like,
// without a host hand-wiring a button for each. Commands live beside `tools`
// in the plugin object, so they are registry DATA like everything else: the
// shell enumerates them and imports no plugin.

export type CommandId = string;

/** What a command runs against: the shell's runtime and the context the
 *  command was invoked from (the desktop's own, for the sidebar, launcher and
 *  hotkeys). A command resolves the shell intents it needs from there, e.g.
 *  `context.getGripConsumerContext().getOrCreateConsumer(DESKTOP_OPEN_TOOL).get()`. */
export interface CommandContext {
  grok: Grok;
  context: GripContextLike;
}

export interface CommandDef {
  /** Canonical text: the sidebar entry, a11y, agents. */
  label: string;
  /**
   * A hotkey spec: modifiers joined with `+` and one key, e.g. `Mod+Shift+Y`,
   * `Ctrl+K`, `F2`. `Mod` is Cmd on macOS and Ctrl elsewhere (either is
   * accepted). Key names are the DOM `KeyboardEvent.key` ones; letters are
   * case-insensitive. A letter or digit also matches by `KeyboardEvent.code`
   * (`KeyY`, `Digit1`), so a chord whose produced character differs from the
   * key (`Shift+1` → `!`, Alt on macOS → a diacritic) still fires. A hotkey the
   * host already binds is NOT bound (the host wins), and the shell logs that
   * conflict once. The shell fires a chord once per press (auto-repeats are
   * ignored) and not while focus is in a text field.
   */
  hotkey?: string;
  run: (ctx: CommandContext) => void;
}

/** A hotkey spec parsed into its parts, normalised for comparison. */
export interface Hotkey {
  key: string;        // lower-cased for single characters, as given otherwise
  mod: boolean;       // Ctrl OR Cmd (platform-neutral)
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

const MODIFIERS: Record<string, keyof Omit<Hotkey, 'key'>> = {
  mod: 'mod', ctrl: 'ctrl', control: 'ctrl', cmd: 'meta', meta: 'meta', command: 'meta',
  alt: 'alt', option: 'alt', shift: 'shift',
};

/** `null` for a spec with no key or an unknown modifier. */
export function parseHotkey(spec: string): Hotkey | null {
  const parts = spec.split('+').map((p) => p.trim()).filter((p) => p.length > 0);
  const out: Hotkey = { key: '', mod: false, ctrl: false, meta: false, alt: false, shift: false };
  for (const part of parts) {
    const flag = MODIFIERS[part.toLowerCase()];
    if (flag !== undefined) {
      out[flag] = true;
    } else if (out.key === '') {
      out.key = part.length === 1 ? part.toLowerCase() : part;
    } else {
      return null;
    }
  }
  if (out.key === '') {
    return null;
  }
  return out;
}

/** The canonical spelling two specs are compared by: `Ctrl+Shift+i`. `Mod` is
 *  kept distinct from `Ctrl`/`Cmd`, so a host that reserves `Ctrl+K` does not
 *  reserve `Mod+K`; `hotkeyMatches` is where platform equivalence lives. */
export function hotkeyKey(h: Hotkey): string {
  const mods: string[] = [];
  if (h.mod) { mods.push('Mod'); }
  if (h.ctrl) { mods.push('Ctrl'); }
  if (h.meta) { mods.push('Cmd'); }
  if (h.alt) { mods.push('Alt'); }
  if (h.shift) { mods.push('Shift'); }
  return [...mods, h.key].join('+');
}

/** The subset of a `KeyboardEvent` a hotkey is matched against. */
export interface KeyChord {
  key: string;
  /** The physical key (`KeyY`, `Digit1`); the fallback when a modifier changed `key`. */
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const CODE_KEY_RE = /^Key([A-Z])$/;
const CODE_DIGIT_RE = /^Digit([0-9])$/;

/** The letter or digit a `KeyboardEvent.code` names, lower-cased; undefined for any other code. */
export function keyFromCode(code: string | undefined): string | undefined {
  if (code === undefined) {
    return undefined;
  }
  const letter = CODE_KEY_RE.exec(code);
  if (letter !== null) {
    return letter[1].toLowerCase();
  }
  const digit = CODE_DIGIT_RE.exec(code);
  if (digit !== null) {
    return digit[1];
  }
  return undefined;
}

export function hotkeyMatches(h: Hotkey, e: KeyChord): boolean {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  // `key` is the produced character; with Shift a digit becomes `!`, with Alt on
  // macOS a letter becomes a diacritic. Only then does a single-character spec
  // fall back to the physical key (`Digit1`, `KeyI`). A plain letter or digit is
  // matched as produced, so on a non-QWERTY layout one physical key never
  // matches two chords (AZERTY `KeyA` produces `q`: it is Ctrl+Q, not Ctrl+A).
  const plain = /^[a-z0-9]$/.test(key);
  if (key !== h.key && !(!plain && h.key.length === 1 && keyFromCode(e.code) === h.key)) {
    return false;
  }
  if (h.alt !== e.altKey || h.shift !== e.shiftKey) {
    return false;
  }
  if (h.mod) {
    // either platform modifier, but not both and not neither
    return (e.ctrlKey || e.metaKey) && !(e.ctrlKey && e.metaKey);
  }
  return h.ctrl === e.ctrlKey && h.meta === e.metaKey;
}

/** Two specs collide when they are the same chord, or when one is `Mod+…` and
 *  the other is its Ctrl or Cmd spelling (on some platform they are one key). */
export function hotkeyCollides(a: Hotkey, b: Hotkey): boolean {
  if (a.key !== b.key || a.alt !== b.alt || a.shift !== b.shift) {
    return false;
  }
  if (a.mod || b.mod) {
    const other = a.mod ? b : a;
    return other.mod || other.ctrl !== other.meta;
  }
  return a.ctrl === b.ctrl && a.meta === b.meta;
}
