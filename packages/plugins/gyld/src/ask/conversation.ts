import type { AtomTapHandle } from '@owebeeone/grip-react';
import { conversationId } from './envelope';

// THE CONVERSATION a window is in, and how long it lasts (GyldAskAgent.md
// section 6, step 2.1).
//
// Section 6 mints ONE id per ask window — `conv-<tabId>-<slot>-<stamp>`, held
// in `Gyld.Tab.Ask.Conversation` — and a follow-up is the same verb with the
// same id and a new question. So the lifetime is the whole of this file:
//
//  - MINTED once, by the window that opened the menu, or by a reader who
//    starts over here.
//  - KEPT across every turn, which is what makes the reply one fold, one
//    mount and one key rather than one per question asked.
//  - REPLACED when the window is moved onto ANOTHER RECORD. A conversation is
//    about a record: the envelope it rides in carries that record's status,
//    its alternatives and its citations, and a window wired to a browser
//    follows whatever box the reader picks next. Carrying one conversation
//    across two records would hand the supplier a prior turn about a question
//    this turn is not asking about.
//
// A conversation therefore carries the record it is ON as well as its id. It
// is not read out of the id — nothing here parses one — because a slot and a
// tab id can both hold the separator, and an id is an identity rather than a
// document.
//
// Everything here is PURE. The stamp is the caller's, taken in the gesture
// that mints: a clock read in a render is not this package's to take.

/** The conversation one ask window is in. */
export interface AskConversation {
  /** The id every turn of it rides under, and the key its reply is folded
   *  by. Empty means this window has no conversation at all, which is a
   *  rendered state and not a default. */
  id: string;
  /**
   * The record it is about.
   *
   * Empty means minted but not yet asked in: the opening link of a WIRED
   * window carries no record — it follows the browser's — so the conversation
   * binds to the record the first turn is actually asked about.
   */
  slot: string;
}

export const NO_CONVERSATION: AskConversation = Object.freeze({ id: '', slot: '' });

/** What one is minted FROM: the window's browser, the record, and the stamp
 *  the gesture read. */
export interface AskConversationOn {
  /** The tab id of the browser this window is wired to, or '' when it stands
   *  alone — exactly what `askOn` mints with, so both ways spell one id. */
  tabId: string;
  slot: string;
  stamp: number;
}

/** A new conversation on this record. The reader starting over is this, and
 *  so is the menu's own `Ask about this`. */
export function mintConversation(on: AskConversationOn): AskConversation {
  return { id: conversationId(on.tabId, on.slot, on.stamp), slot: on.slot };
}

/**
 * The conversation this window's NEXT TURN belongs to.
 *
 * Three answers, and each is the lifetime rule stated once:
 *
 *  - the one it already has, when that conversation is on this record — a
 *    follow-up is the same conversation;
 *  - the same ID bound to this record, when it was minted for a window that
 *    had not asked yet;
 *  - a NEW one, when this window has been moved onto another record.
 *
 * It is called in the gesture, not in the render, and it writes nothing: the
 * window writes what comes back through the atom's own handle.
 */
export function conversationForTurn(
  held: AskConversation,
  on: AskConversationOn,
): AskConversation {
  if (on.slot === '') {
    // No record to be about. The window draws its "no record" state instead
    // of an envelope, so there is nothing to mint for and nothing to bind.
    return held;
  }
  if (held.id === '' || movedOff(held, on.slot)) {
    return mintConversation(on);
  }
  return held.slot === on.slot ? held : { id: held.id, slot: on.slot };
}

/**
 * Whether this window has been moved off the record its conversation is on.
 *
 * Said in the window BEFORE the press (the next turn opens a new
 * conversation), because a reader who has walked the browser three boxes on
 * should be told which record their next question is about.
 */
export function movedOff(held: AskConversation, slot: string): boolean {
  return held.id !== '' && held.slot !== '' && slot !== '' && held.slot !== slot;
}

/**
 * Settle the conversation the turn about to be sent belongs to, and write it
 * back through the atom's own handle.
 *
 * This is the ACT a press performs, and it is a pure function over the handle
 * for the reason every act in this package is one: nothing here dispatches a
 * click, so what a press does is asserted by calling it. The handle is read
 * rather than the caller's rendered value (CodingRules.md, "Gesture handlers
 * read via tap handles"), and `held` is the fallback for a window whose atom
 * is not seeded at all — a launcher-opened window with no handle to write.
 */
export function turnConversation(
  handle: AtomTapHandle<AskConversation> | undefined,
  on: AskConversationOn,
  held: AskConversation = NO_CONVERSATION,
): AskConversation {
  const from = handle?.get() ?? held;
  const next = conversationForTurn(from, on);
  if (next !== from) {
    handle?.set(next);
  }
  return next;
}

/** Start over: a new conversation on this record, whatever this window was
 *  in. The turns already asked stay on the log under the id they were asked
 *  in; this window simply stops folding them. */
export function startConversation(
  handle: AtomTapHandle<AskConversation> | undefined,
  on: AskConversationOn,
): AskConversation {
  const next = mintConversation(on);
  handle?.set(next);
  return next;
}
