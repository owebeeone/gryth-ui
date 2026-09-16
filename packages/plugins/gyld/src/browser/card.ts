import type { DecideNowQuestion, GyldDecideNow } from '../contract';
import { slotLabel, type GyldRecords } from '../records/records';
import type { SceneNode } from '../lens/scene';

// What the node card SAYS, as a pure projection over emitted data.
//
// Every line of it is a read: the question as the host DREW it (the emitted
// box text), the alternatives as that question's own `offers`, the lean as its
// own `preferred`, the reason it cannot be answered as its own `blocked_by`,
// `gated_by` or `ruling`. Nothing here decides anything, and a box this
// stream's decide-now list does not list says exactly that rather than
// reading as "not answerable" (GyldGrythPlugins.md 3.5 and 6.7).
//
// It is pure so the card's content is asserted without a desk: this package
// renders to static markup and dispatches no hover.

export interface CardAlternative {
  slot: string;
  /** What the projection calls it, or the slot when it carries no record. */
  label: string;
  /** True when the question's own emitted `preferred` names this one. */
  preferred: boolean;
}

export interface NodeCardView {
  /** The lens id of the box this card is over. */
  id: string;
  slot: string;
  /** The row's own emitted member name, or the slot when there is no row. */
  label: string;
  /** The question's text: the lines the host drew inside the box. */
  lines: string[];
  /** Whether this stream's decide-now list carries a row for this box. */
  listed: boolean;
  /** The row's emitted `effective_status`, or '' when there is no row. */
  status: string;
  /** The row's own `answerable_now`. */
  answerable: boolean;
  /** One emitted line saying why it is not answerable now. Empty when it is,
   *  and empty when there is no row at all. */
  blocked: string;
  alternatives: CardAlternative[];
}

/**
 * The single emitted reason a row is not answerable now, in the order the
 * decide-now list itself groups them: an open prerequisite first, then a gate
 * that has not occurred, then the ruling that already settled it. A row that
 * is in none of those is reported as emitted rather than explained.
 */
export function blockedSays(question: DecideNowQuestion): string {
  if (question.answerable_now) {
    return '';
  }
  if (question.blocked_by.length > 0) {
    return `blocked by ${question.blocked_by.join(', ')}`;
  }
  if (question.gated_by.length > 0) {
    return `gated by ${question.gated_by.join(', ')}`;
  }
  if (question.ruling !== undefined) {
    return `ruled by ${question.ruling}`;
  }
  return 'this stream does not list it as answerable now';
}

export function cardFor(
  node: SceneNode,
  decideNow: GyldDecideNow | undefined,
  records: GyldRecords | undefined,
): NodeCardView {
  // The join is by QUALIFIED SLOT, which is the identity that survives a
  // restream (R1) and the one the picture and the list share.
  const question = decideNow?.questions.find((row) => row.slot === node.slot);
  if (question === undefined) {
    return {
      id: node.id,
      slot: node.slot,
      label: slotLabel(records, node.slot),
      lines: node.lines,
      listed: false,
      status: '',
      answerable: false,
      blocked: '',
      alternatives: [],
    };
  }
  return {
    id: node.id,
    slot: node.slot,
    label: question.label,
    lines: node.lines,
    listed: true,
    status: question.effective_status,
    answerable: question.answerable_now,
    blocked: blockedSays(question),
    // O2: a decided question KEEPS its offers, with the selected alternative
    // marked by `ruling`, so the list is drawn either way.
    alternatives: question.offers.map((offer) => ({
      slot: offer,
      label: slotLabel(records, offer),
      preferred: question.preferred === offer,
    })),
  };
}
