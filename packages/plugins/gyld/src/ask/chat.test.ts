import { describe, it, expect } from 'vitest';
import type { AtomTapHandle } from '@owebeeone/grip-react';
import { sendsOnKey } from './submit';
import {
  AT_END_SLACK, atEnd, followScroll, keepAtEnd, type TranscriptBox,
} from './transcript';

// The two rules the ask window's chat layout turns on, both PURE and both
// asserted with no DOM and no desk.
//
// The window holds "the reader is at the end" in an atom — written by the
// transcript's scroll handler, read at render, performed in the ref callback
// (CodingRules.md: a ref callback and event handlers writing to atoms are the
// sanctioned reach; a hook is not) — so the RULE is a function over the four
// numbers a scrollable box reports, and the whole of it is asserted here.
//
// The composer's key rule is the same shape for the same reason: Enter sends,
// Shift+Enter is a newline, and a press is asserted by calling the rule rather
// than by dispatching a key this package never renders.

const box = (
  scrollTop: number, clientHeight: number, scrollHeight: number,
): TranscriptBox => ({ scrollTop, clientHeight, scrollHeight });

/** An atom's handle, and every write it took. */
function held(initial: boolean) {
  let value = initial;
  const writes: boolean[] = [];
  const handle = {
    get: () => value,
    set: (next: boolean) => {
      value = next;
      writes.push(next);
    },
    update: (fn: (prev: boolean) => boolean) => {
      handle.set(fn(value));
    },
  } as AtomTapHandle<boolean>;
  return { handle, writes, read: () => value };
}

describe('the transcript follows the end, or stays where the reader put it', () => {
  it('is at the end when the last pixel is in view', () => {
    expect(atEnd(box(600, 300, 900))).toBe(true);
  });

  it('is at the end within the slack a rounded metric needs', () => {
    expect(atEnd(box(600 - AT_END_SLACK, 300, 900))).toBe(true);
    expect(atEnd(box(600 - AT_END_SLACK - 1, 300, 900))).toBe(false);
  });

  it('is at the end when there is nothing to scroll at all', () => {
    expect(atEnd(box(0, 300, 300))).toBe(true);
    expect(atEnd(box(0, 300, 120))).toBe(true);
  });

  it('is NOT at the end when the reader has scrolled up', () => {
    expect(atEnd(box(0, 300, 900))).toBe(false);
    expect(atEnd(box(200, 300, 900))).toBe(false);
  });

  it('takes its slack from the caller', () => {
    expect(atEnd(box(0, 300, 320), 20)).toBe(true);
    expect(atEnd(box(0, 300, 320), 19)).toBe(false);
  });
});

describe('the scroll handler writes the fact through the atom`s own handle', () => {
  it('writes when the reader leaves the end, and again when they come back', () => {
    const atom = held(true);
    expect(followScroll(atom.handle, box(0, 300, 900))).toBe(false);
    expect(atom.read()).toBe(false);
    expect(followScroll(atom.handle, box(600, 300, 900))).toBe(true);
    expect(atom.read()).toBe(true);
    expect(atom.writes).toEqual([false, true]);
  });

  it('writes nothing where nothing changed, so a scroll notifies nothing', () => {
    const atom = held(true);
    expect(followScroll(atom.handle, box(600, 300, 900))).toBe(true);
    expect(followScroll(atom.handle, box(595, 300, 900))).toBe(true);
    expect(atom.writes).toEqual([]);
  });

  it('reads the HELD value, not one a render closed over', () => {
    // The atom is the fact; a handler that re-derived it from its own render
    // would write the state of the last paint, which is the hazard
    // CodingRules.md names for gesture handlers.
    const atom = held(false);
    expect(followScroll(atom.handle, box(0, 300, 900))).toBe(false);
    expect(atom.writes).toEqual([]);
  });

  it('settles the fact even where the window has no handle to write to', () => {
    expect(followScroll(undefined, box(600, 300, 900))).toBe(true);
    expect(followScroll(undefined, box(0, 300, 900))).toBe(false);
  });
});

describe('a following transcript is kept at its end', () => {
  it('scrolls one that is following to the bottom', () => {
    const el = box(0, 300, 900);
    keepAtEnd(el, true);
    expect(el.scrollTop).toBe(900);
  });

  it('leaves one the reader scrolled up in exactly where they left it', () => {
    const el = box(120, 300, 900);
    keepAtEnd(el, false);
    expect(el.scrollTop).toBe(120);
  });

  it('does nothing at all before the element exists', () => {
    expect(() => keepAtEnd(null, true)).not.toThrow();
  });
});

describe('Enter sends and Shift+Enter is a newline', () => {
  it('sends on a plain Enter', () => {
    expect(sendsOnKey({ key: 'Enter' })).toBe(true);
    expect(sendsOnKey({ key: 'Enter', shiftKey: false })).toBe(true);
  });

  it('does not send on Shift+Enter, which is the newline', () => {
    expect(sendsOnKey({ key: 'Enter', shiftKey: true })).toBe(false);
  });

  it('does not send on any other key', () => {
    for (const key of ['a', ' ', 'Tab', 'Escape', 'NumpadEnter']) {
      expect(sendsOnKey({ key })).toBe(false);
    }
  });

  it('does not send on an Enter a modifier was held for', () => {
    expect(sendsOnKey({ key: 'Enter', altKey: true })).toBe(false);
    expect(sendsOnKey({ key: 'Enter', ctrlKey: true })).toBe(false);
    expect(sendsOnKey({ key: 'Enter', metaKey: true })).toBe(false);
  });

  it('does not send the Enter that commits an IME composition', () => {
    // A reader composing CJK text presses Enter to accept the candidate; that
    // press is the composition's, not the composer's, and sending on it would
    // send half a question.
    expect(sendsOnKey({ key: 'Enter', isComposing: true })).toBe(false);
  });
});
