import { createAtomValueTap, type Tap } from '@owebeeone/grip-react';
import {
  GYLD_DEST_PROPOSAL, GYLD_DEST_PROPOSAL_TAP, GYLD_DEST_RUN, GYLD_DEST_RUN_TAP,
  GYLD_DEST_SIDE, GYLD_RUN_DRAFT, GYLD_RUN_DRAFT_TAP, GYLD_TAB_ID,
  proposalFromParams, runFromParams,
} from '../grips';
import { lensTabTaps } from '../lens/lensTabTaps';
import type { CompareSide } from './sides';

// The gyld.compare seeds.
//
// The destination is a RUN and one PROPOSAL of it (spec section 2, `{ run,
// proposal }`), seeded from the opening link so a reopened window comes back on
// the same comparison. The run is seeded as the URL it is served from: a run is
// not a bundle, it is not censused with one, and this window resolves it
// directly rather than through `Gyld.Set`.
//
// The draft is the URL field, seeded from the same param so a window opened on
// a run shows the run it is on. It is a draft and not the destination: nothing
// is read until the reader presses Read, and a window opened with no run reads
// nothing at all rather than guessing a place to look.

export function compareTabTaps(tabId: string, params?: Record<string, unknown>): Tap[] {
  const run = runFromParams(params);
  return [
    createAtomValueTap(GYLD_DEST_RUN, { initial: run, handleGrip: GYLD_DEST_RUN_TAP }),
    createAtomValueTap(GYLD_DEST_PROPOSAL, {
      initial: proposalFromParams(params), handleGrip: GYLD_DEST_PROPOSAL_TAP,
    }),
    createAtomValueTap(GYLD_RUN_DRAFT, { initial: run, handleGrip: GYLD_RUN_DRAFT_TAP }),
    createAtomValueTap(GYLD_TAB_ID, { initial: tabId }),
  ];
}

/**
 * One side's seeds, registered on that side's child context.
 *
 * The whole of the lens view's state, so the two pictures pan, zoom, select
 * and dim independently, plus the one atom that says which side this is. The
 * store tap reads that atom as a destination parameter and resolves the lens
 * file the run's own index names for it, so the view keeps reading the one
 * `Gyld.Lens` every other window uses.
 */
export function sideTabTaps(side: CompareSide): Tap[] {
  return [
    createAtomValueTap(GYLD_DEST_SIDE, { initial: side.name }),
    ...lensTabTaps(),
  ];
}
