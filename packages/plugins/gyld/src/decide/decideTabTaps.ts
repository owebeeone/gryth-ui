import { createAtomValueTap, type Tap } from '@owebeeone/grip-react';
import {
  GYLD_ANSWER_DRAFT, GYLD_ANSWER_DRAFT_TAP, GYLD_ANSWER_EXPORT, GYLD_ANSWER_EXPORT_TAP,
  GYLD_ASK_DRAFT, GYLD_ASK_DRAFT_TAP, GYLD_ASK_EXPORT, GYLD_ASK_EXPORT_TAP,
  GYLD_DEST_REF, GYLD_DEST_REF_TAP, GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP,
  refFromParams, streamFromParams,
} from '../grips';
import { ANSWER_EMPTY, ASK_EMPTY } from './drafts';
import { GyldTakenDraftTap } from './GyldTakenDraftTap';

// The gyld.decide seeds.
//
// The two drafts and their two exports are ALWAYS seeded: they are this
// window's own work, and a window wired to a browser must not compose into the
// browser's context.
//
// The DESTINATION follows the same rule `gyld.detail` is written against: it
// is seeded only when the opening link carries one. A window opened wired to a
// browser seeds none, so it resolves that browser's stream and its focused
// record live, and the answer form opens on the question the reader was
// looking at. A window opened with `{ stream, question }` stands alone on it.
//
// Spec section 2 calls the link param `question`; sections 2 and 3.3 seed the
// same value into `Gyld.Dest.Ref`, as `gyld.detail`'s `ref` and the browser's
// `focus` already do, so all three spellings are read into one grip.

export function decideTabTaps(_tabId: string, params?: Record<string, unknown>): Tap[] {
  const stream = streamFromParams(params);
  const question = params?.question;
  const ref = typeof question === 'string' ? question : refFromParams(params);
  const seeds: Tap[] = [
    createAtomValueTap(GYLD_ANSWER_DRAFT, {
      initial: ANSWER_EMPTY, handleGrip: GYLD_ANSWER_DRAFT_TAP,
    }),
    createAtomValueTap(GYLD_ASK_DRAFT, {
      initial: ASK_EMPTY, handleGrip: GYLD_ASK_DRAFT_TAP,
    }),
    createAtomValueTap(GYLD_ANSWER_EXPORT, {
      initial: '', handleGrip: GYLD_ANSWER_EXPORT_TAP,
    }),
    createAtomValueTap(GYLD_ASK_EXPORT, { initial: '', handleGrip: GYLD_ASK_EXPORT_TAP }),
    // LAST of the four, so the answer draft above is registered before it
    // reads that atom's handle: the tap that fills this window's form from a
    // draft the reader took in the ask window (GyldAskAgent.md section 8). It
    // applies each take once and fills four fields; a window wired to no
    // browser resolves no take and it fills nothing.
    new GyldTakenDraftTap(),
  ];
  if (stream === '' && ref === '') {
    return seeds;
  }
  return [
    ...seeds,
    createAtomValueTap(GYLD_DEST_STREAM, {
      initial: stream, handleGrip: GYLD_DEST_STREAM_TAP,
    }),
    createAtomValueTap(GYLD_DEST_REF, { initial: ref, handleGrip: GYLD_DEST_REF_TAP }),
  ];
}
