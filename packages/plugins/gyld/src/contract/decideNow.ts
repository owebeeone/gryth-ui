import {
  atPath, readArray, readBoolean, readEnvelope, readIdentifier, readIdentifiers,
  readObject, readOptionalIdentifier, readSnapshotRef, readText, readTexts,
  type QualifiedSlot, type SnapshotRef,
} from './common';

// Spec section 7.4: `decide-now.json`.
//
// Every value here is EMITTED by Gyld. The UI folds nothing: `tier`,
// `answerable_now`, `answerable_because`, `blocked_by`, `gated_by`,
// `induced_by` and `effective_status` are read, never computed (spec section
// 6.7). A row says why it carries the flag it carries BOTH ways round: a
// blocked one through its three lists, an answerable one through
// `answerable_because`.

export const DECIDE_NOW_FORMAT = 'gyld.decide-now.v1';

/**
 * One question an answerable question requires, and what clears it.
 *
 * `effective_status` is that prerequisite's own emitted status, and `ruling`
 * the live ruling that set it where the stream records one. A prerequisite an
 * anchor declares as decided carries no ruling, and that absence is a fact
 * about the stream rather than a missing field.
 */
export interface AnswerablePrerequisite {
  slot: QualifiedSlot;
  effective_status: string;
  ruling?: QualifiedSlot;
}

/**
 * Why a row is answerable now, in the shape the blocked reason uses.
 *
 * The three facts the emitter tested: every prerequisite with what clears it,
 * the gates holding the question and the alternatives inducing it. On an
 * answerable row the last two are empty, which is how the record says no
 * trigger gates it and no unchosen alternative induced it, and an empty
 * `prerequisites` list says the question requires nothing at all. Absent on a
 * row that is not answerable now, and absent on every row of a bundle emitted
 * before the field existed.
 */
export interface AnswerableBecause {
  prerequisites: AnswerablePrerequisite[];
  gated_by: QualifiedSlot[];
  induced_by: QualifiedSlot[];
}

export interface DecideNowQuestion {
  slot: QualifiedSlot;
  label: string;
  declared_status: string;
  effective_status: string;
  tier: string;
  answerable_now: boolean;
  /** The emitted reason for that flag. Absent when it is false, and absent on
   *  a bundle emitted before the field existed. */
  answerable_because?: AnswerableBecause;
  blocked_by: QualifiedSlot[];
  gated_by: QualifiedSlot[];
  induced_by: QualifiedSlot[];
  offers: QualifiedSlot[];
  /** The recorded lean, when the stream carries one. Null means no lean. */
  preferred?: QualifiedSlot;
  /** The ruling that decided this question, when one exists. */
  ruling?: QualifiedSlot;
}

/**
 * One ruling of the chain, as the v2 capture host emits it.
 *
 * Section 7.4 sketches four fields; the host writes nine, and three of them
 * are legitimately null. A record that only marks a trigger as `Occurred`
 * decides nothing and selects nothing, and a ruling an ancestor made that a
 * child reopened is emitted with `live: false` rather than dropped, because
 * that is what the chain says happened. Nothing here is folded: which rulings
 * stand is `live` as Gyld wrote it (spec section 6.7).
 */
export interface DecideNowRuling {
  slot: QualifiedSlot;
  /** The record's own name, which is what a reader recognises it by. */
  label: string;
  /** The stream of the chain whose overlay declared it. */
  stream: string;
  /** Whether this ruling still stands in this stream's chain. */
  live: boolean;
  text: string;
  sources: string[];
  /** The question this ruling decides. Absent on a record that only marks a
   *  trigger as occurred. */
  decides?: QualifiedSlot;
  /** The alternative it selects. Absent when it decides nothing. */
  selects?: QualifiedSlot;
  /** The question it reopens, retiring an earlier ruling of the chain. */
  reopens?: QualifiedSlot;
  /** The triggers this record marks as having occurred (owner ruling O3), so
   *  a gate is data. Empty on an ordinary ruling. */
  occurred: QualifiedSlot[];
  /** The stage-one principal stub, recorded as data (owner ruling O6). */
  principal?: string;
  stamp?: string;
}

export interface GyldDecideNow {
  format: typeof DECIDE_NOW_FORMAT;
  snapshot: SnapshotRef;
  stream: string;
  questions: DecideNowQuestion[];
  rulings: DecideNowRuling[];
  limits: string[];
}

function readPrerequisite(value: unknown, path: string): AnswerablePrerequisite {
  const raw = readObject(value, path);
  const prerequisite: AnswerablePrerequisite = {
    slot: readIdentifier(raw.slot, atPath(path, 'slot')),
    effective_status: readIdentifier(raw.effective_status, atPath(path, 'effective_status')),
  };
  // No ruling is the ordinary case for a prerequisite an anchor declares, so
  // a null reads as absent rather than as a violation.
  const ruling = readOptionalIdentifier(raw.ruling, atPath(path, 'ruling'));
  if (ruling !== undefined) {
    prerequisite.ruling = ruling;
  }
  return prerequisite;
}

function readBecause(value: unknown, path: string): AnswerableBecause {
  const raw = readObject(value, path);
  const needs = atPath(path, 'prerequisites');
  return {
    prerequisites: readArray(raw.prerequisites, needs)
      .map((item, i) => readPrerequisite(item, atPath(needs, i))),
    gated_by: readIdentifiers(raw.gated_by, atPath(path, 'gated_by')),
    induced_by: readIdentifiers(raw.induced_by, atPath(path, 'induced_by')),
  };
}

function readQuestion(value: unknown, path: string): DecideNowQuestion {
  const raw = readObject(value, path);
  const question: DecideNowQuestion = {
    slot: readIdentifier(raw.slot, atPath(path, 'slot')),
    label: readIdentifier(raw.label, atPath(path, 'label')),
    declared_status: readIdentifier(raw.declared_status, atPath(path, 'declared_status')),
    effective_status: readIdentifier(raw.effective_status, atPath(path, 'effective_status')),
    tier: readIdentifier(raw.tier, atPath(path, 'tier')),
    answerable_now: readBoolean(raw.answerable_now, atPath(path, 'answerable_now')),
    blocked_by: readIdentifiers(raw.blocked_by, atPath(path, 'blocked_by')),
    gated_by: readIdentifiers(raw.gated_by, atPath(path, 'gated_by')),
    induced_by: readIdentifiers(raw.induced_by, atPath(path, 'induced_by')),
    // O2: an effectively decided question KEEPS its offers, with the selected
    // alternative marked by `ruling`, so this list is not emptied on decision.
    offers: readIdentifiers(raw.offers, atPath(path, 'offers')),
  };
  // Absent, null, or a whole record: the three states an older bundle, a row
  // that is not answerable, and an answerable row are respectively in.
  if (raw.answerable_because !== undefined && raw.answerable_because !== null) {
    question.answerable_because = readBecause(
      raw.answerable_because, atPath(path, 'answerable_because'),
    );
  }
  const preferred = readOptionalIdentifier(raw.preferred, atPath(path, 'preferred'));
  if (preferred !== undefined) {
    question.preferred = preferred;
  }
  const ruling = readOptionalIdentifier(raw.ruling, atPath(path, 'ruling'));
  if (ruling !== undefined) {
    question.ruling = ruling;
  }
  return question;
}

function readRuling(value: unknown, path: string): DecideNowRuling {
  const raw = readObject(value, path);
  const ruling: DecideNowRuling = {
    slot: readIdentifier(raw.slot, atPath(path, 'slot')),
    label: readIdentifier(raw.label, atPath(path, 'label')),
    stream: readIdentifier(raw.stream, atPath(path, 'stream')),
    // Which rulings still stand is the host's answer, not a fold over the
    // chain, so a missing flag is a violation rather than a cheerful `true`.
    live: readBoolean(raw.live, atPath(path, 'live')),
    // The ruling's prose. A ruling may be recorded before its text is written,
    // so an empty string is accepted as data rather than rejected.
    text: readText(raw.text, atPath(path, 'text')),
    sources: readIdentifiers(raw.sources, atPath(path, 'sources')),
    occurred: readIdentifiers(raw.occurred, atPath(path, 'occurred')),
  };
  const decides = readOptionalIdentifier(raw.decides, atPath(path, 'decides'));
  if (decides !== undefined) {
    ruling.decides = decides;
  }
  const selects = readOptionalIdentifier(raw.selects, atPath(path, 'selects'));
  if (selects !== undefined) {
    ruling.selects = selects;
  }
  const reopens = readOptionalIdentifier(raw.reopens, atPath(path, 'reopens'));
  if (reopens !== undefined) {
    ruling.reopens = reopens;
  }
  const principal = readOptionalIdentifier(raw.principal, atPath(path, 'principal'));
  if (principal !== undefined) {
    ruling.principal = principal;
  }
  const stamp = readOptionalIdentifier(raw.stamp, atPath(path, 'stamp'));
  if (stamp !== undefined) {
    ruling.stamp = stamp;
  }
  return ruling;
}

/**
 * Read one `decide-now.json`.
 *
 * No referential check runs across `rulings` and `questions`. The questions
 * array is the decide-now LIST (answerable, then blocked, then gated), not the
 * stream's whole question set, so a ruling may legitimately decide a question
 * that this file does not list. Cross-checking them would invent a constraint
 * the spec does not state.
 */
export function readDecideNow(value: unknown): GyldDecideNow {
  const raw = readEnvelope(value, DECIDE_NOW_FORMAT);
  const path = DECIDE_NOW_FORMAT;
  const questionsPath = atPath(path, 'questions');
  const rulingsPath = atPath(path, 'rulings');
  return {
    format: DECIDE_NOW_FORMAT,
    snapshot: readSnapshotRef(raw.snapshot, atPath(path, 'snapshot')),
    stream: readIdentifier(raw.stream, atPath(path, 'stream')),
    questions: readArray(raw.questions, questionsPath).map(
      (item, i) => readQuestion(item, atPath(questionsPath, i)),
    ),
    rulings: readArray(raw.rulings, rulingsPath).map(
      (item, i) => readRuling(item, atPath(rulingsPath, i)),
    ),
    // Spec section 6.7: every window shows its limits and omissions, so they
    // are required, not optional decoration.
    limits: readTexts(raw.limits, atPath(path, 'limits')),
  };
}
