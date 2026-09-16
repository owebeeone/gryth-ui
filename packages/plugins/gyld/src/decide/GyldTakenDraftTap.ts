import { BaseTap, type AtomTapHandle, type Grip, type GripContext } from '@owebeeone/grip-react';
import {
  GYLD_ANSWER_DRAFT_TAP, GYLD_TAB_DRAFT_TAKEN, GYLD_TAB_DRAFT_TOOK,
} from '../grips';
import { NOTHING_TAKEN, takenInto, type AnswerDraft, type TakenDraft } from './drafts';

// GyldTakenDraftTap: one per decide window, seeded by `decideTabTaps`
// (GyldAskAgent.md section 8, step 3.2).
//
// It fills this window's OWN answer draft from the ruling an agent drafted
// and a reader took in the ask window — the hand-off atom the BROWSER
// publishes, which is the one context both sinks resolve.
//
// A tap and not an effect, for the reason `GyldFirstPickTap` is one: the take
// can be written before this window exists (the ask window writes it and then
// opens the decide window), after it exists, or again on the next draft, and
// a tap sees all three the same way. There is no React state anywhere near
// this (CodingRules.md).
//
// THE FENCE, and it is the whole of the rule:
//
//  - Each take is applied EXACTLY ONCE, by its own count. A republished value
//    is not a second fill, and a reader's edits after a fill are never
//    reverted, because nothing re-applies a take already applied.
//  - It fills four fields and no more: the question, the alternative, the
//    ruling text and the `drafted` mark. The principal, the stamp and the
//    sources are left as the reader left them (section 8), so the window's
//    shape checks and every one of its refusals are untouched.
//  - `take: 0` fills nothing at all: that is "nothing has been taken on this
//    browser", which is a rendered state and not a draft.

export class GyldTakenDraftTap extends BaseTap {
  /** The take this window has applied, held so the published value keeps
   *  saying which draft the form holds after the atom stops changing. */
  private took: TakenDraft = NOTHING_TAKEN;

  constructor() {
    super({
      provides: [GYLD_TAB_DRAFT_TOOK],
      homeParamGrips: [GYLD_TAB_DRAFT_TAKEN, GYLD_ANSWER_DRAFT_TAP],
    });
  }

  // --- Tap lifecycle -------------------------------------------------------

  produce(opts?: { destContext?: GripContext }): void {
    this.publish(
      new Map<Grip<unknown>, unknown>([[GYLD_TAB_DRAFT_TOOK as unknown as Grip<unknown>, this.took]]),
      opts?.destContext,
    );
  }

  produceOnParams(): void {
    this.settle();
    this.produce();
  }

  // One window, one form: nothing here is resolved per consumer.
  produceOnDestParams(): void {}

  onDetach(): void {
    this.took = NOTHING_TAKEN;
    super.onDetach();
  }

  // --- The fill ------------------------------------------------------------

  private settle(): void {
    const taken = this.param<TakenDraft>(GYLD_TAB_DRAFT_TAKEN) ?? NOTHING_TAKEN;
    if (taken.take === 0 || taken.take <= this.took.take) {
      return;
    }
    const handle = this.param<AtomTapHandle<AnswerDraft>>(GYLD_ANSWER_DRAFT_TAP);
    if (handle === undefined) {
      // The form's own atom is not resolved yet. Nothing is recorded as
      // applied, so the take lands when it is.
      return;
    }
    handle.update((held) => takenInto(held, taken));
    this.took = taken;
  }

  private param<T>(grip: Grip<T>): T | undefined {
    return this.paramDrips.get(grip as unknown as Grip<unknown>)?.get() as T | undefined;
  }
}
