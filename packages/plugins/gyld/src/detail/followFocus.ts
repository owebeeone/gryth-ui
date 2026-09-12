import { BaseTap, type Grip } from '@owebeeone/grip-react';
import { NO_FOCUS, type GyldFocus } from '../focus';
import { GYLD_DEST_REF, GYLD_DEST_STREAM, GYLD_FOCUS } from '../grips';

/**
 * The window destination that IS the shared focus.
 *
 * A class 3 conversion of one grip into two, the same shape the diff window's
 * `PaneStreamTap` uses: it exists so the store tap, the index tap and the
 * record tap keep reading the one destination pair every other window uses,
 * while what fills that pair comes from `Gyld.Focus` rather than from the
 * window's own seeds. A detail window renders its body inside a child context
 * carrying this tap while it is following, so turning following off puts the
 * window straight back on the record its own seeds name; nothing is copied and
 * nothing is overwritten.
 *
 * `Gyld.Focus` is a stream and a QUALIFIED SLOT, so following it across
 * streams is the correlation MDV-5 asks for and not a record id that would
 * mean something else in another stream (spec R1). Nothing focused publishes
 * the empty pair, which every window already renders as "no record".
 */
export class FocusDestTap extends BaseTap {
  constructor() {
    super({ provides: [GYLD_DEST_STREAM, GYLD_DEST_REF], homeParamGrips: [GYLD_FOCUS] });
  }

  produce(): void {
    const held = this.paramDrips.get(GYLD_FOCUS)?.get() as GyldFocus | undefined;
    const focus = held ?? NO_FOCUS;
    this.publish(new Map<Grip<unknown>, unknown>([
      [GYLD_DEST_STREAM as unknown as Grip<unknown>, focus.stream],
      [GYLD_DEST_REF as unknown as Grip<unknown>, focus.ref],
    ]));
  }

  produceOnParams(): void {
    this.produce();
  }

  // No DESTINATION parameters: one home value, one answer for every consumer
  // of the context this tap is registered on.
  produceOnDestParams(): void {
    this.produce();
  }
}
