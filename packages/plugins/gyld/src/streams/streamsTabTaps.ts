import { createAtomValueTap, type Tap } from '@owebeeone/grip-react';
import {
  GYLD_PICKER_ERROR, GYLD_PICKER_ERROR_TAP, GYLD_PICKER_URL, GYLD_PICKER_URL_TAP,
  GYLD_STREAM_DRAFT, GYLD_STREAM_DRAFT_TAP, GYLD_STREAM_EXPORT, GYLD_STREAM_EXPORT_TAP,
} from '../grips';
import { DRAFT_EMPTY } from './operations';

// The gyld.streams seeds: this window's fork-or-link draft and the command it
// last exported, one set per tab, so two stream managers compose independently.
//
// No DESTINATION is seeded. The window reads the census, which is a home
// value, and each row's validation through that row's own child context, so it
// needs none. A window opened wired to a browser therefore resolves that
// browser's stream and perspective through the graph, which is what lets a
// click on a row retarget the browser rather than open a second one; a seed
// here would shadow that for ever (the rule detail and decidenow's seeds are
// written against, in `detailTabTaps.ts`).
//
// The set picker's two drafts are seeded because this window shows the picker
// as its empty state, exactly as the browser does, and the picker's drafts are
// per window.

export function streamsTabTaps(): Tap[] {
  return [
    createAtomValueTap(GYLD_STREAM_DRAFT, {
      initial: DRAFT_EMPTY, handleGrip: GYLD_STREAM_DRAFT_TAP,
    }),
    createAtomValueTap(GYLD_STREAM_EXPORT, {
      initial: '', handleGrip: GYLD_STREAM_EXPORT_TAP,
    }),
    createAtomValueTap(GYLD_PICKER_URL, { initial: '', handleGrip: GYLD_PICKER_URL_TAP }),
    createAtomValueTap(GYLD_PICKER_ERROR, { initial: '', handleGrip: GYLD_PICKER_ERROR_TAP }),
  ];
}
