import type { AtomTapHandle } from '@owebeeone/grip-react';

// WHETHER THE TRANSCRIPT FOLLOWS what is arriving, or stays where the reader
// put it (the ask window's chat layout).
//
// The rule is PURE and the whole of it is here, because it is a rule and not a
// gesture: a transcript scrolled to its end follows every record that lands
// and every chunk that streams into the open turn, and one the reader has
// scrolled up in stays exactly where they left it until they come back down.
//
// The window holds the fact in an atom and nowhere else (CodingRules.md): the
// scroll handler settles it and writes it through the atom's own handle, the
// render reads it, and the ref callback performs the scroll. No hook, no
// listener, no clock — and because the three acts are the three functions
// below, every state of the rule is asserted with plain numbers.

/** The geometry a scrollable box reports, and all of it this rule reads. */
export interface TranscriptScroll {
  /** How far the box has been scrolled from its top, in CSS pixels. */
  scrollTop: number;
  /** How much of the content is in view. */
  clientHeight: number;
  /** How much content there is. */
  scrollHeight: number;
}

/** A box this module can also MOVE: the transcript element itself, and in a
 *  test the same three numbers written by hand. */
export type TranscriptBox = TranscriptScroll;

/**
 * How far from the end still counts as the end, in CSS pixels.
 *
 * Not zero. A browser reports fractional and rounded scroll metrics on a
 * scaled or zoomed page, so an exact comparison would drop the follow on a
 * transcript the reader never left — and one line of slack is small enough
 * that a reader who scrolled up by a line is taken at their word.
 */
export const AT_END_SLACK = 24;

/** Whether the last pixel of the transcript is in view, which is what makes it
 *  follow. A box with nothing to scroll is at its end. */
export function atEnd(on: TranscriptScroll, slack: number = AT_END_SLACK): boolean {
  return on.scrollHeight - on.scrollTop - on.clientHeight <= slack;
}

/**
 * What the transcript's scroll handler does.
 *
 * It settles the fact and writes it through the atom's own handle, reading the
 * HELD value rather than one a render closed over (CodingRules.md, "gesture
 * handlers read via tap handles"): scroll events arrive faster than drip
 * notifications, so a closure read would be answering with the last paint.
 * Nothing is written where nothing changed, so scrolling inside the end — and
 * the scroll the ref callback itself performs — notifies nobody.
 */
export function followScroll(
  handle: AtomTapHandle<boolean> | undefined,
  on: TranscriptScroll,
  slack: number = AT_END_SLACK,
): boolean {
  const now = atEnd(on, slack);
  if (handle !== undefined && handle.get() !== now) {
    handle.set(now);
  }
  return now;
}

/**
 * What the transcript's ref callback does: keep a following transcript at its
 * end, and leave one the reader scrolled up in exactly where it is.
 *
 * The callback is re-attached on every render, which is what makes this the
 * follow: a record landing or a chunk streaming into the open turn re-renders
 * the window, and the transcript is put back at its end with the new content
 * in view. `null` is the detach, and there is nothing to scroll then.
 */
export function keepAtEnd(box: TranscriptBox | null, following: boolean): void {
  if (box === null || !following) {
    return;
  }
  box.scrollTop = box.scrollHeight;
}
