import { createAtomValueTap, type Tap } from '@owebeeone/grip-react';
import {
  GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP, GYLD_DEST_REF, GYLD_DEST_REF_TAP,
  GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP,
  GYLD_TAB_ASK_ANSWER, GYLD_TAB_ASK_ANSWER_TAP,
  GYLD_TAB_ASK_AT_END, GYLD_TAB_ASK_AT_END_TAP,
  GYLD_TAB_ASK_CITES, GYLD_TAB_ASK_CITES_TAP,
  GYLD_TAB_ASK_CONVERSATION, GYLD_TAB_ASK_CONVERSATION_TAP,
  GYLD_TAB_ASK_DRAFT, GYLD_TAB_ASK_DRAFT_TAP,
  perspectiveFromParams, refFromParams, streamFromParams,
} from '../grips';
import type { GyldOpsResponse } from '../ops/ops';
import { NOTHING_OPEN } from './citations';
import { NO_CONVERSATION, type AskConversation } from './conversation';

// The gyld.ask seeds, written against the one rule `gyld.detail` and
// `gyld.decide` are already written against.
//
// The CONVERSATION, the DRAFT and the ANSWER are always seeded: they are this
// window's own and no browser publishes any of them, so a sink's seed of them
// shadows nothing the source has. The conversation comes from the opening
// link because the window
// that opened the menu minted it (GyldAskAgent.md section 6) — a window opened
// from the launcher carries none, which is a rendered state, not a default.
//
// The DESTINATION is seeded only when the opening link carries one. A window
// opened WIRED to a browser seeds none, so it resolves that browser's stream
// and its focused record live and follows them; a seed here would sit below
// the wire's parent edge and shadow the browser for ever.

/** The conversation id the opening link carried, or '' when it carried none. */
export function conversationFromParams(params?: Record<string, unknown>): string {
  const value = params?.conversation;
  return typeof value === 'string' ? value : '';
}

/**
 * The conversation this window opens in (step 2.1).
 *
 * The link carries the ID the menu minted; the RECORD it is on is the link's
 * own `ref` when it has one, and empty when it has not — a WIRED window is
 * opened with no destination on purpose, so its conversation binds to the
 * record its first turn is actually asked about (./conversation.ts).
 */
export function seededConversation(params?: Record<string, unknown>): AskConversation {
  const id = conversationFromParams(params);
  return id === '' ? NO_CONVERSATION : { id, slot: refFromParams(params) };
}

export function askTabTaps(_tabId: string, params?: Record<string, unknown>): Tap[] {
  const seeds: Tap[] = [
    createAtomValueTap(GYLD_TAB_ASK_CONVERSATION, {
      initial: seededConversation(params), handleGrip: GYLD_TAB_ASK_CONVERSATION_TAP,
    }),
    createAtomValueTap(GYLD_TAB_ASK_DRAFT, {
      initial: '', handleGrip: GYLD_TAB_ASK_DRAFT_TAP,
    }),
    // A window opens at the END of the conversation it opens on, and follows
    // what arrives until the reader scrolls up (./transcript.ts).
    createAtomValueTap(GYLD_TAB_ASK_AT_END, {
      initial: true, handleGrip: GYLD_TAB_ASK_AT_END_TAP,
    }),
    // What the supplier answered THIS window's last `explain` with. `null`
    // until one has been sent, which is a rendered state and not a default.
    createAtomValueTap<GyldOpsResponse | null>(GYLD_TAB_ASK_ANSWER, {
      initial: null, handleGrip: GYLD_TAB_ASK_ANSWER_TAP,
    }),
    // Which citation boxes are open (./citations.ts). Nothing is, on a window
    // that has just opened: a reply is read first and its sources second, so
    // every box and every footer chip starts folded away.
    createAtomValueTap(GYLD_TAB_ASK_CITES, {
      initial: NOTHING_OPEN, handleGrip: GYLD_TAB_ASK_CITES_TAP,
    }),
  ];
  const stream = streamFromParams(params);
  const ref = refFromParams(params);
  if (stream === '' && ref === '') {
    return seeds;
  }
  return [
    ...seeds,
    createAtomValueTap(GYLD_DEST_STREAM, {
      initial: stream, handleGrip: GYLD_DEST_STREAM_TAP,
    }),
    createAtomValueTap(GYLD_DEST_REF, { initial: ref, handleGrip: GYLD_DEST_REF_TAP }),
    // The picture the record was asked about FROM, which the envelope names
    // and whose box text is its `record.lines`. Seeded with the rest of the
    // destination or not at all: a wired window inherits the browser's.
    createAtomValueTap(GYLD_DEST_PERSPECTIVE, {
      initial: perspectiveFromParams(params), handleGrip: GYLD_DEST_PERSPECTIVE_TAP,
    }),
  ];
}
