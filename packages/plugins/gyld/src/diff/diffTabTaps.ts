import { BaseTap, createAtomValueTap, type Grip, type Tap } from '@owebeeone/grip-react';
import {
  GYLD_DEST_LEFT, GYLD_DEST_LEFT_TAP, GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP,
  GYLD_DEST_RIGHT, GYLD_DEST_RIGHT_TAP, GYLD_DEST_STREAM, GYLD_DIFF_SLOT,
  GYLD_DIFF_SLOT_TAP, GYLD_TAB_ID, perspectiveFromParams,
} from '../grips';
import { lensTabTaps } from '../lens/lensTabTaps';
import type { DiffPane } from './panes';

// The gyld.diff seeds.
//
// The window's own destination is a PAIR and a perspective, seeded from the
// opening link `{ left, right, perspective? }` (spec section 2). The record in
// hand is the third seed: one qualified slot, shared by both panes, which is
// what makes a pick in one picture light up the same record in the other.
//
// The PANES are seeded separately, on their own child contexts, by
// `paneTabTaps` below. Each gets the whole of the lens view's state, so the
// two pictures pan, zoom, select and dim independently, and one `Gyld.Dest.
// Stream` relayed off the pair, so the store tap resolves each pane's lens
// from the same grips every other window uses.

function leftFromParams(params?: Record<string, unknown>): string {
  const value = params?.left;
  return typeof value === 'string' ? value : '';
}

function rightFromParams(params?: Record<string, unknown>): string {
  const value = params?.right;
  return typeof value === 'string' ? value : '';
}

export function diffTabTaps(tabId: string, params?: Record<string, unknown>): Tap[] {
  return [
    createAtomValueTap(GYLD_DEST_LEFT, {
      initial: leftFromParams(params), handleGrip: GYLD_DEST_LEFT_TAP,
    }),
    createAtomValueTap(GYLD_DEST_RIGHT, {
      initial: rightFromParams(params), handleGrip: GYLD_DEST_RIGHT_TAP,
    }),
    // ONE perspective for both panes: the window compares the same picture of
    // two streams, and two perspectives side by side would not be a diff.
    createAtomValueTap(GYLD_DEST_PERSPECTIVE, {
      initial: perspectiveFromParams(params), handleGrip: GYLD_DEST_PERSPECTIVE_TAP,
    }),
    createAtomValueTap(GYLD_DIFF_SLOT, { initial: '', handleGrip: GYLD_DIFF_SLOT_TAP }),
    createAtomValueTap(GYLD_TAB_ID, { initial: tabId }),
  ];
}

/**
 * One pane's seeds, registered on that pane's child context.
 *
 * `Gyld.Dest.Stream` is RELAYED from the pair rather than copied: a picker
 * writes the pair, and the pane follows, so the two never drift. Everything
 * else the pane needs, it inherits from the window: one perspective, one slot
 * in hand, one set and one census.
 */
export function paneTabTaps(pane: DiffPane): Tap[] {
  return [new PaneStreamTap(pane.dest), ...lensTabTaps()];
}

/**
 * `Gyld.Dest.Stream` for one pane, from the pair the window holds.
 *
 * A class 3 conversion of one grip into another, and the smallest one there
 * is. It exists so the store tap, the index tap and the lens view keep reading
 * the one destination grip every other window uses, while the window above
 * holds the pair its picker writes. Copying the value at seed time instead
 * would leave a pane on the stream the window opened with, for ever.
 */
class PaneStreamTap extends BaseTap {
  constructor(private readonly pair: Grip<string>) {
    super({ provides: [GYLD_DEST_STREAM], homeParamGrips: [pair] });
  }

  produce(): void {
    const value = this.paramDrips.get(this.pair)?.get();
    this.publish(new Map<Grip<unknown>, unknown>([
      [GYLD_DEST_STREAM as unknown as Grip<unknown>, typeof value === 'string' ? value : ''],
    ]));
  }

  produceOnParams(): void {
    this.produce();
  }

  // This tap has no DESTINATION parameters: it reads one home value and hands
  // the same answer to every consumer of this pane's context.
  produceOnDestParams(): void {
    this.produce();
  }
}
