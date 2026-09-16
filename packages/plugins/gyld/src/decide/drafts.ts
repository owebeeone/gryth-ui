// The two drafts the decide window holds, and the LOCAL form checks over them.
//
// Spec risk R5 is the rule these are written against: "the decide window's
// form checks must not grow into a second validator; the rule is that only
// shape (non-empty, one chosen) is checked locally". So: is a question
// chosen, is an alternative chosen, is the text there, is at most one
// alternative marked preferred. Whether the prerequisites are decided,
// whether the alternative is among the question's offers in the stream Gyld
// will capture, whether the gate has occurred, whether the name is a legal
// identifier: every one of those is Gyld's answer and appears here only as
// `validation.json` coming back (spec sections 4.5 and 6.1).

/** The answer a ruling records: what it decides, what it selects, who said it
 *  and when. Class 1 atom, INSTANCE scope, one per tab. */
export interface AnswerDraft {
  /** The question's qualified slot, from the emitted decide-now list. */
  question: string;
  /** The chosen alternative's qualified slot, from that question's own
   *  emitted `offers`. */
  alternative: string;
  /** The stage-one principal stub, recorded as data (owner ruling O6). */
  principal: string;
  /** The stamp, as TEXT: a clock reading taken by this window would be a fact
   *  the window invented, and the ruling is dated by the owner. */
  stamp: string;
  /** One source per line, as the emitted rulings carry them. */
  sources: string;
  /** The ruling's prose, which becomes the record's docstring. */
  text: string;
  /**
   * The MODEL ID whose draft this text and this alternative still are
   * (GyldAskAgent.md section 8), or '' when they are the reader's own.
   *
   * It is a mark, not a fact about the graph: it is set by taking an agent's
   * draft, it is cleared the moment the reader edits either drafted field,
   * and while it is set the submitted ruling carries a line saying the text
   * was drafted by that model and accepted by the principal who submitted it.
   * It fills NOTHING else — not the principal, which is the reader's field
   * and what the overlay records (owner ruling O6), and not the sources,
   * which are offered beside the field for the reader to take.
   */
  drafted: string;
}

export const ANSWER_EMPTY: AnswerDraft = Object.freeze({
  question: '', alternative: '', principal: '', stamp: '', sources: '', text: '',
  drafted: '',
});

/**
 * A ruling an agent drafted and a reader TOOK: what the ask window hands the
 * decide window wired to the same browser (step 3.2).
 *
 * It travels through the BROWSER, because that is the one context both
 * windows resolve: a sink reads what its source publishes, and two sinks of
 * one browser see each other's nothing. So the ask window writes this atom
 * through the handle it resolves from the browser, and the decide window's
 * own tap reads it and fills the form (`GyldTakenDraftTap`).
 *
 * `take` is what makes one take distinct from the next: a COUNT, so a take is
 * applied exactly once and a second take of the same draft is a second fill
 * rather than a no-op. It is not a clock — nothing here reads one.
 */
export interface TakenDraft {
  /** The question the draft rules on, as the record named it. */
  question: string;
  /** The chosen alternative's qualified slot, as the ENVELOPE offered it. */
  alternative: string;
  /** The ruling's prose, as the model wrote it. */
  text: string;
  /** The tags the draft leans on, offered beside the sources field and never
   *  written into it (section 8). */
  sources: string[];
  /** The model id, which becomes the form's `drafted` mark. */
  drafted: string;
  /** The nth take on this browser. 0 is "nothing has been taken here". */
  take: number;
}

export const NOTHING_TAKEN: TakenDraft = Object.freeze({
  question: '', alternative: '', text: '', sources: [], drafted: '', take: 0,
});

/**
 * The form a take fills in: the question, the alternative, the ruling text
 * and the mark — and NOT one field more.
 *
 * The principal, the stamp and the sources are left exactly as the reader
 * left them, which is what makes a taken draft a pre-filled form rather than
 * a submission: `answerShapeFaults` still demands a principal and a stamp,
 * and the window's refusals are untouched.
 */
export function takenInto(held: AnswerDraft, taken: TakenDraft): AnswerDraft {
  return {
    ...held,
    question: taken.question,
    alternative: taken.alternative,
    text: taken.text,
    drafted: taken.drafted,
  };
}

/**
 * The reader's own edit of a drafted field.
 *
 * The mark goes the moment they change what the agent wrote — the alternative
 * or the ruling text — because from then on the text is theirs and a stamp
 * saying the model drafted it would be false. It is one function so that
 * every field that clears it clears it the same way.
 */
export function edited(held: AnswerDraft, patch: Partial<AnswerDraft>): AnswerDraft {
  return { ...held, ...patch, drafted: '' };
}

/** One alternative of a new question: the class to declare, the member that
 *  places it in the root, its one-line description, and whether the recorded
 *  lean points at it. */
export interface AskAlternative {
  symbol: string;
  label: string;
  description: string;
  preferred: boolean;
}

export const ASK_ALTERNATIVE_EMPTY: AskAlternative = Object.freeze({
  symbol: '', label: '', description: '', preferred: false,
});

/** A new question, as spec section 6.2 asks for it. */
export interface AskDraft {
  /** The class to declare, for example `PinAudit`. */
  symbol: string;
  /** The root member that places it, for example `pin_audit`. */
  label: string;
  /** The docstring, which is the question itself in the owner's words. */
  docstring: string;
  /** Qualified slots of existing questions this one requires. */
  requires: string[];
  /** Qualified slots of existing triggers that gate it. */
  gates: string[];
  alternatives: AskAlternative[];
}

export const ASK_EMPTY: AskDraft = Object.freeze({
  symbol: '',
  label: '',
  docstring: '',
  requires: [],
  gates: [],
  // Two rows to start with: a question that offers one alternative offers no
  // choice, which is a shape this window can say out loud before Gyld has to.
  alternatives: [{ ...ASK_ALTERNATIVE_EMPTY }, { ...ASK_ALTERNATIVE_EMPTY }],
});

function blank(text: string): boolean {
  return text.trim() === '';
}

/** Shape only. Every line here is "something is empty" or "more than one is
 *  chosen"; nothing here is a judgement about the graph. */
export function answerShapeFaults(draft: AnswerDraft): string[] {
  const faults: string[] = [];
  if (draft.question === '') {
    faults.push('choose the question this answers');
  }
  if (draft.alternative === '') {
    faults.push('choose one offered alternative');
  }
  if (blank(draft.text)) {
    faults.push('write the ruling text');
  }
  if (blank(draft.principal)) {
    faults.push('name the principal this ruling is recorded for');
  }
  if (blank(draft.stamp)) {
    faults.push('stamp the ruling');
  }
  return faults;
}

export function askShapeFaults(draft: AskDraft): string[] {
  const faults: string[] = [];
  if (blank(draft.symbol)) {
    faults.push('name the class this question is declared as');
  }
  if (blank(draft.label)) {
    faults.push('name the member that places it in the root');
  }
  if (blank(draft.docstring)) {
    faults.push('write the question itself as the docstring');
  }
  const alternatives = filledAlternatives(draft);
  if (alternatives.length < 2) {
    faults.push('offer at least two alternatives, each with a class and a member');
  }
  const partial = draft.alternatives.filter(
    (alternative) => !blank(alternative.symbol) !== !blank(alternative.label),
  );
  if (partial.length > 0) {
    faults.push('give every alternative both a class and a member, or neither');
  }
  if (alternatives.filter((alternative) => alternative.preferred).length > 1) {
    faults.push('mark at most one alternative preferred; a lean names one');
  }
  return faults;
}

/** The alternative rows that carry both names. An empty row is a row the
 *  owner has not filled in, not an alternative with no name. */
export function filledAlternatives(draft: AskDraft): AskAlternative[] {
  return draft.alternatives.filter(
    (alternative) => !blank(alternative.symbol) && !blank(alternative.label),
  );
}

/** The alternative a recorded lean would point at, or undefined when the
 *  question is Open. At most one, which `askShapeFaults` is what enforces. */
export function preferredAlternative(draft: AskDraft): AskAlternative | undefined {
  return filledAlternatives(draft).find((alternative) => alternative.preferred);
}

/** The sources of an answer, one per line, blank lines dropped. */
export function sourceLines(draft: AnswerDraft): string[] {
  return draft.sources.split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

/**
 * The sources field with an agent's tags added: one per line, and none twice.
 *
 * Section 8 is explicit that the agent never writes this field — the tags are
 * OFFERED beside it and the reader takes them — so this is the reader's act
 * and not the take's, and it leaves the `drafted` mark alone: adding the
 * evidence the draft cited is not editing what it drafted.
 */
export function withSources(sources: string, tags: readonly string[]): string {
  const held = sources.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  for (const tag of tags) {
    const one = tag.trim();
    if (one !== '' && !held.includes(one)) {
      held.push(one);
    }
  }
  return held.join('\n');
}
