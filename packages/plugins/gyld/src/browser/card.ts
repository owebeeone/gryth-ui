import type {
  AnswerablePrerequisite, DecideNowQuestion, GyldDecideNow,
} from '../contract';
import { slotLabel, type GyldRecords } from '../records/records';
import type { SceneNode } from '../lens/scene';

// What the node card SAYS, as a pure projection over emitted data.
//
// Every line of it is a read: the question as the host DREW it (the emitted
// box text), the alternatives as that question's own `offers`, the lean as its
// own `preferred`, the reason it cannot be answered as its own `blocked_by`,
// `gated_by` or `ruling`, and the reason it CAN be as its own
// `answerable_because`. Nothing here decides anything, and a box this
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
  /** One emitted line saying why it IS answerable now. Empty when it is not,
   *  empty when there is no row, and empty when the row carries no reason,
   *  which is what a bundle emitted before the field existed looks like. */
  answerableBecause: string;
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

/** One prerequisite, as the row recorded it: the slot, the status where it is
 *  not the Decided the lead-in already claims, and the ruling that set it. */
function prerequisiteSays(prerequisite: AnswerablePrerequisite): string {
  const status = prerequisite.effective_status === 'Decided'
    ? ''
    : ` (${prerequisite.effective_status})`;
  const ruling = prerequisite.ruling === undefined ? '' : ` by ruling ${prerequisite.ruling}`;
  return `${prerequisite.slot}${status}${ruling}`;
}

/**
 * The emitted reason a row IS answerable now, as one phrase.
 *
 * The mirror of `blockedSays`, and a read in exactly the same sense: the three
 * facts are the row's own `answerable_because`, not a conclusion drawn here.
 * Each clause says what that record says, so a record whose gate or induced
 * list is not empty is reported rather than glossed as "nothing gates it".
 * Empty when the row is not answerable now and empty when it carries no
 * reason, which is what every row of a bundle emitted before the field looks
 * like: the card then says what it said before rather than inventing one.
 */
export function answerableBecause(question: DecideNowQuestion): string {
  const because = question.answerable_because;
  if (!question.answerable_now || because === undefined) {
    return '';
  }
  const needs = because.prerequisites;
  const decided = needs.every((prerequisite) => prerequisite.effective_status === 'Decided');
  const listed = needs.map(prerequisiteSays).join(', ');
  const prerequisites = needs.length === 0
    ? 'no prerequisite at all'
    : (decided ? `every prerequisite is decided (${listed})` : `its prerequisites are ${listed}`);
  const gates = because.gated_by.length === 0
    ? 'nothing gates it'
    : `gated by ${because.gated_by.join(', ')}`;
  const branch = because.induced_by.length === 0
    ? 'not branch-induced'
    : `induced by ${because.induced_by.join(', ')}`;
  return `${prerequisites}, ${gates}, ${branch}`;
}

/** That reason with the flag it explains, which is the card's own line. */
export function answerableSays(question: DecideNowQuestion): string {
  const because = answerableBecause(question);
  return because === '' ? '' : `answerable now: ${because}`;
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
      answerableBecause: '',
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
    answerableBecause: answerableSays(question),
    // O2: a decided question KEEPS its offers, with the selected alternative
    // marked by `ruling`, so the list is drawn either way.
    alternatives: question.offers.map((offer) => ({
      slot: offer,
      label: slotLabel(records, offer),
      preferred: question.preferred === offer,
    })),
  };
}
