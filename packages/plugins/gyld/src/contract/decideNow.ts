import {
  atPath, readArray, readBoolean, readEnvelope, readIdentifier, readIdentifiers,
  readObject, readOptionalIdentifier, readSnapshotRef, readText, readTexts,
  type QualifiedSlot, type SnapshotRef,
} from './common';

// Spec section 7.4: `decide-now.json`.
//
// Every value here is EMITTED by Gyld. The UI folds nothing: `tier`,
// `answerable_now`, `blocked_by`, `gated_by`, `induced_by` and
// `effective_status` are read, never computed (spec section 6.7).

export const DECIDE_NOW_FORMAT = 'gyld.decide-now.v1';

export interface DecideNowQuestion {
  slot: QualifiedSlot;
  label: string;
  declared_status: string;
  effective_status: string;
  tier: string;
  answerable_now: boolean;
  blocked_by: QualifiedSlot[];
  gated_by: QualifiedSlot[];
  induced_by: QualifiedSlot[];
  offers: QualifiedSlot[];
  /** The recorded lean, when the stream carries one. Null means no lean. */
  preferred?: QualifiedSlot;
  /** The ruling that decided this question, when one exists. */
  ruling?: QualifiedSlot;
}

export interface DecideNowRuling {
  slot: QualifiedSlot;
  decides: QualifiedSlot;
  selects: QualifiedSlot;
  text: string;
  sources: string[];
  stream: string;
}

export interface GyldDecideNow {
  format: typeof DECIDE_NOW_FORMAT;
  snapshot: SnapshotRef;
  stream: string;
  questions: DecideNowQuestion[];
  rulings: DecideNowRuling[];
  limits: string[];
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
  return {
    slot: readIdentifier(raw.slot, atPath(path, 'slot')),
    decides: readIdentifier(raw.decides, atPath(path, 'decides')),
    selects: readIdentifier(raw.selects, atPath(path, 'selects')),
    // The ruling's prose. A ruling may be recorded before its text is written,
    // so an empty string is accepted as data rather than rejected.
    text: readText(raw.text, atPath(path, 'text')),
    sources: readIdentifiers(raw.sources, atPath(path, 'sources')),
    stream: readIdentifier(raw.stream, atPath(path, 'stream')),
  };
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
