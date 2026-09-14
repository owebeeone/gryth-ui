import { BaseTap, type AtomTapHandle, type Grip, type GripContext } from '@owebeeone/grip-react';
import {
  GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP, GYLD_DEST_STREAM,
  GYLD_DEST_STREAM_TAP, GYLD_STREAMS, GYLD_TAB_PICKED,
} from '../grips';
import type { GyldStreamsCensus } from '../store/state';
import { NOTHING_PICKED, firstPick, type GyldFirstPick } from './firstPick';

// GyldFirstPickTap: one per browser window, seeded by `browserTabTaps`.
//
// It fills the window's OWN destination atoms when the census arrives and the
// window has chosen nothing, so a desk with one bundle in it draws instead of
// waiting for two picks. A tap and not an effect for the reason every other
// piece of state here is one: the census can land before the window mounts,
// after it mounts, or again on the next build, and a tap sees all three the
// same way (CodingRules.md).
//
// It is PER TAB because the values it writes are: `Gyld.Dest.Stream` and
// `Gyld.Dest.Perspective` are instance-scope atoms of one window, and two
// windows of the same desk choose independently.
//
// THE FENCE: it writes only into an EMPTY value, and only what ./firstPick
// read off the census. A reader's pick is never overwritten and never
// restored, and a census that names nothing writes nothing.

export class GyldFirstPickTap extends BaseTap {
  /** What this window chose for itself, held so the published value keeps
   *  saying it after the atoms it wrote stop being empty. */
  private picked: GyldFirstPick = NOTHING_PICKED;

  constructor() {
    super({
      provides: [GYLD_TAB_PICKED],
      homeParamGrips: [
        GYLD_STREAMS, GYLD_DEST_STREAM, GYLD_DEST_PERSPECTIVE,
        GYLD_DEST_STREAM_TAP, GYLD_DEST_PERSPECTIVE_TAP,
      ],
    });
  }

  // --- Tap lifecycle -------------------------------------------------------

  produce(opts?: { destContext?: GripContext }): void {
    this.publish(
      new Map<Grip<unknown>, unknown>([[GYLD_TAB_PICKED as unknown as Grip<unknown>, this.picked]]),
      opts?.destContext,
    );
  }

  produceOnParams(): void {
    this.settle();
    this.produce();
  }

  // One window, one destination: nothing here is resolved per consumer.
  produceOnDestParams(): void {}

  onDetach(): void {
    this.picked = NOTHING_PICKED;
    super.onDetach();
  }

  // --- The pick ------------------------------------------------------------

  private settle(): void {
    const stream = this.param<string>(GYLD_DEST_STREAM) ?? '';
    const perspective = this.param<string>(GYLD_DEST_PERSPECTIVE) ?? '';
    const pick = firstPick(this.param<GyldStreamsCensus>(GYLD_STREAMS), stream, perspective);
    if (pick.stream !== '') {
      const handle = this.param<AtomTapHandle<string>>(GYLD_DEST_STREAM_TAP);
      if (handle !== undefined) {
        handle.set(pick.stream);
        this.picked = { ...this.picked, stream: pick.stream };
      }
    }
    if (pick.perspective !== '') {
      const handle = this.param<AtomTapHandle<string>>(GYLD_DEST_PERSPECTIVE_TAP);
      if (handle !== undefined) {
        handle.set(pick.perspective);
        this.picked = { ...this.picked, perspective: pick.perspective };
      }
    }
  }

  private param<T>(grip: Grip<T>): T | undefined {
    return this.paramDrips.get(grip as unknown as Grip<unknown>)?.get() as T | undefined;
  }
}
