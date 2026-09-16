import { createAtomValueTap, type Tap } from '@owebeeone/grip-react';
import {
  GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP, GYLD_DEST_REF, GYLD_DEST_REF_TAP,
  GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP,
  GYLD_TAB_ASK_CONVERSATION, GYLD_TAB_ASK_CONVERSATION_TAP,
  GYLD_TAB_ASK_DRAFT, GYLD_TAB_ASK_DRAFT_TAP,
  perspectiveFromParams, refFromParams, streamFromParams,
} from '../grips';

// The gyld.ask seeds, written against the one rule `gyld.detail` and
// `gyld.decide` are already written against.
//
// The CONVERSATION and the DRAFT are always seeded: they are this window's own,
// no browser publishes either, so a sink's seed of them shadows nothing the
// source has. The conversation comes from the opening link because the window
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

export function askTabTaps(_tabId: string, params?: Record<string, unknown>): Tap[] {
  const seeds: Tap[] = [
    createAtomValueTap(GYLD_TAB_ASK_CONVERSATION, {
      initial: conversationFromParams(params), handleGrip: GYLD_TAB_ASK_CONVERSATION_TAP,
    }),
    createAtomValueTap(GYLD_TAB_ASK_DRAFT, {
      initial: '', handleGrip: GYLD_TAB_ASK_DRAFT_TAP,
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
