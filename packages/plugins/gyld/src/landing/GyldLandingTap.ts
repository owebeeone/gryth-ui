import { BaseTap, type AtomTapHandle, type Grip, type GripContext } from '@owebeeone/grip-react';
import { GYLD_LANDING, GYLD_NODE, GYLD_OPS_STATUS, GYLD_SET, GYLD_SET_TAP } from '../grips';
import { addShareRoot } from '../browser/setOps';
import { EMPTY_SET, type GyldSet } from '../store/state';
import {
  GladePresence, LANDING_UNSET, landsGladeRoot, type GyldLanding,
} from './landing';

// GyldLandingTap: what an empty desk does when the glade session comes up.
//
// It is a TAP and not an effect on purpose. The transition is state — "the
// session became ready while this desk had no root" — and state lives in the
// tap layer (CodingRules.md): a React effect would run once per mounted
// window, would run again on every remount, and would not exist at all on a
// desk whose gyld windows are closed. One tap at the plugin root sees the edge
// once, whatever is on screen.
//
// It publishes `Gyld.Landing` so the set picker can say what state the desk is
// in without asking the glade module anything; the picker is a pure read of
// that value.
//
// THE FENCE: the only thing this tap ever writes is the desk's own root SET,
// and only the glade root, and only on the edge into ready with nothing there.
// A reader who removes that root removes it: the edge has passed, and this tap
// does not put it back while the session stays up.

export class GyldLandingTap extends BaseTap {
  /** The presence the last param change was seen at, so the next one is an
   *  edge rather than a state. */
  private presence: GladePresence = GladePresence.ABSENT;

  /** Whether this desk added the glade root by itself, which is what the
   *  published landing reports. */
  private landed = false;

  /** Held so an unchanged landing publishes one identity and a consumer does
   *  not re-render on a tick that changed nothing. */
  private published: GyldLanding = LANDING_UNSET;

  constructor() {
    super({
      provides: [GYLD_LANDING],
      // The set and its handle are read HOME: this is the desk's one set, and
      // the handle is how a tap writes an atom (never a second producer).
      homeParamGrips: [GYLD_OPS_STATUS, GYLD_NODE, GYLD_SET, GYLD_SET_TAP],
    });
  }

  // --- Tap lifecycle -------------------------------------------------------

  produce(opts?: { destContext?: GripContext }): void {
    const updates = new Map<Grip<unknown>, unknown>([
      [GYLD_LANDING as unknown as Grip<unknown>, this.landing()],
    ]);
    this.publish(updates, opts?.destContext);
  }

  produceOnParams(): void {
    this.settle();
    this.produce();
  }

  // Nothing here is per destination: one desk, one landing.
  produceOnDestParams(): void {}

  onDetach(): void {
    this.presence = GladePresence.ABSENT;
    this.landed = false;
    this.published = LANDING_UNSET;
    super.onDetach();
  }

  // --- The edge ------------------------------------------------------------

  /** The current landing, with one identity while nothing about it changed. */
  private landing(): GyldLanding {
    const node = this.param<string>(GYLD_NODE) ?? '';
    const held = this.published;
    if (held.presence === this.presence && held.node === node && held.landed === this.landed) {
      return held;
    }
    this.published = Object.freeze({ presence: this.presence, node, landed: this.landed });
    return this.published;
  }

  /**
   * Take the edge, if this change was one.
   *
   * Reading the set through the same param drip the decision is made on is
   * what keeps this honest: the value the tap sees is the value the desk has,
   * and the write goes back through the atom's own handle, so the picker's
   * `Add glade node` and this tap add the root by exactly one code path.
   */
  private settle(): void {
    const was = this.presence;
    this.presence = GladePresence.of(this.param<string>(GYLD_OPS_STATUS) ?? '');
    const set = this.param<GyldSet>(GYLD_SET) ?? EMPTY_SET;
    if (!landsGladeRoot(was, this.presence, set)) {
      return;
    }
    const handle = this.param<AtomTapHandle<GyldSet>>(GYLD_SET_TAP);
    if (handle === undefined) {
      return;
    }
    this.landed = true;
    handle.update((held) => addShareRoot(held).set);
  }

  private param<T>(grip: Grip<T>): T | undefined {
    return this.paramDrips.get(grip as unknown as Grip<unknown>)?.get() as T | undefined;
  }
}
