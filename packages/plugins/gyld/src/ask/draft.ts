import type { AtomTapHandle } from '@owebeeone/grip-react';
import { NOTHING_TAKEN, type TakenDraft } from '../decide/drafts';
import type { BrowserFocus } from '../browser/useBrowserFocus';
import type { GyldAskContext } from './envelope';
import type { GyldAskDraft } from './reply';

// TAKE THIS DRAFT (GyldAskAgent.md section 8, step 3.2).
//
// The agent proposes and a human decides. Everything here is about keeping
// that sentence true:
//
//  - A draft is an OFFER, resolved against the ENVELOPE THIS WINDOW HOLDS.
//    The supplier resolves it once against the envelope it was sent; this
//    window resolves it again against the envelope it has now, because a
//    window wired to a browser can have been moved onto another record since
//    the turn was asked. A draft that does not resolve is SAID and cannot be
//    taken (MDV-7: never hide an omission, and never bend a name onto the
//    nearest alternative).
//  - Taking one writes a FORM, not a ruling. It fills the question, the
//    alternative and the ruling text of `Gyld.Tab.Draft.Answer`, and sets the
//    `drafted` mark; it fills no principal, no stamp and no sources, it
//    enables no Submit, and it changes none of the decide window's refusals.
//  - The hand-off goes THROUGH THE BROWSER, which is the one context the ask
//    window and the decide window both resolve.
//
// Pure, as every act in this package is: the handles are passed in, so what a
// press does is asserted by calling it.

/** What this window made of one `draft` record, against the envelope it
 *  holds now. */
export interface DraftOffer {
  /** The question it rules on, as the record named it. */
  question: string;
  /** The alternative the model named, verbatim — what a reader is shown. */
  alternative: string;
  /** The envelope's own label for the alternative it resolved to, or '' when
   *  it resolved to none. */
  label: string;
  /** The qualified slot the form would be filled with, or '' when this draft
   *  cannot be taken. */
  slot: string;
  /** The ruling's prose, as the model wrote it. */
  text: string;
  /** The tags it leans on, offered beside the sources field. */
  sources: string[];
  /** The model id that drafted it. */
  drafted: string;
  /** Whether this window can take it at all. */
  takeable: boolean;
  /** Why it cannot be taken, when it cannot: the supplier's own reason where
   *  it gave one, and this window's where the disagreement is with the
   *  envelope it holds now. */
  reason: string;
}

/**
 * Resolve one draft record against this window's envelope.
 *
 * The alternative is matched on the two names the envelope itself gave it —
 * the qualified slot the supplier resolved, and failing that the model's own
 * string against each offer's slot and label. Nothing else is tried: a name
 * that is neither is a name this record does not offer, which is said.
 */
export function draftOffer(record: GyldAskDraft, envelope: GyldAskContext): DraftOffer {
  const question = record.slot ?? '';
  const alternative = record.alternative ?? '';
  const text = record.ruling_text ?? '';
  const offer: DraftOffer = {
    question: question === '' ? envelope.record.slot : question,
    alternative,
    label: '',
    slot: '',
    text,
    sources: record.sources ?? [],
    drafted: record.drafted_by ?? '',
    takeable: false,
    reason: '',
  };
  if (question !== '' && question !== envelope.record.slot) {
    return {
      ...offer,
      reason: `this draft rules on ${question}, and this window is on `
        + `${envelope.record.slot}`,
    };
  }
  if (text === '') {
    return { ...offer, reason: 'this draft carries no ruling text' };
  }
  const held = envelope.alternatives.find(
    (candidate) => candidate.slot === record.alternative_slot,
  ) ?? envelope.alternatives.find(
    (candidate) => candidate.slot === alternative || candidate.label === alternative,
  );
  if (held === undefined) {
    return {
      ...offer,
      // The supplier's own sentence where it gave one: it resolved the draft
      // against the envelope it was sent, and that is the reason to print.
      reason: record.reason ?? (envelope.alternatives.length === 0
        ? 'this record emits no alternatives at all, so nothing offers this one'
        : `this record offers ${envelope.alternatives.map((one) => one.label).join(', ')}, `
          + 'and not this one'),
    };
  }
  if (record.resolved === false) {
    // The supplier said it resolved to nothing. Its envelope is the one the
    // turn was answered from, so its reason stands even where this window's
    // own envelope would now offer the name.
    return { ...offer, reason: record.reason ?? 'the supplier resolved it to nothing' };
  }
  return { ...offer, label: held.label, slot: held.slot, takeable: true };
}

/** The handles a take writes through: the browser's own hand-off atom, and
 *  the acts this window has on that browser. */
export interface TakeDraftHandles {
  /** `Gyld.Tab.Draft.Taken`, resolved from the browser this window is wired
   *  to. Undefined on a window wired to nothing, which cannot take. */
  taken?: AtomTapHandle<TakenDraft>;
  browser: Pick<BrowserFocus, 'wiredTo' | 'decideReady' | 'decide'>;
}

/** Why this window cannot take a draft at all, or '' when it can. */
export function takeRefusal(on: TakeDraftHandles): string {
  if (on.browser.wiredTo === '' || on.taken === undefined) {
    return 'this ask window is not wired to a graph window, so there is no decide '
      + 'form to take it into: ask from a box\'s menu in the graph';
  }
  if (!on.browser.decideReady) {
    return 'this desk cannot open a decide window';
  }
  return '';
}

/**
 * Take one draft: hand it to the decide window wired to the same browser,
 * opening that window if there is none.
 *
 * The hand-off is written FIRST and the window opened second, so a decide
 * window that did not exist reads the take on its first produce rather than
 * missing it. Nothing is submitted, nothing is validated and no overlay is
 * written: what this does is fill a form.
 */
export function takeDraft(
  on: TakeDraftHandles,
  offer: DraftOffer,
): TakenDraft | undefined {
  if (!offer.takeable || takeRefusal(on) !== '' || on.taken === undefined) {
    return undefined;
  }
  const held = on.taken.get() ?? NOTHING_TAKEN;
  const next: TakenDraft = {
    question: offer.question,
    alternative: offer.slot,
    text: offer.text,
    sources: offer.sources,
    drafted: offer.drafted,
    take: held.take + 1,
  };
  on.taken.set(next);
  // The decide window wired to this browser, on the question the draft rules
  // on — the act that window is already opened by (`decideOn`), so there is
  // one wired path and not a second one for drafts.
  on.browser.decide(offer.question);
  return next;
}
