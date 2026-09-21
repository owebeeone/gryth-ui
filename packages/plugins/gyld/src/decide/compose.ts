import type { DecideNowQuestion } from '../contract';
import type { GyldOps, GyldOpsResponse } from '../ops/ops';
import type { GyldRecords } from '../records/records';
import { answerShapeFaults, askShapeFaults, type AnswerDraft, type AskDraft } from './drafts';
import {
  answerFragment, answerOverlay, askFragment, askFragments,
  type AnswerComposition, type AskComposition, type AskFragments,
  type OverlayFragment, type OverlayTarget,
} from './overlay';
import { declaredSymbol, declaredSymbols } from './symbols';

// The overlay text, composed ONCE (step 4.4).
//
// The export button puts this text in the box and the submit button puts the
// same text on the wire. That is the whole point of pulling it out of the
// window: there is one composition, so what was read before it was sent is
// what was sent, and a test that pins one pins the other.
//
// An empty string means "this draft does not compose", which is the same
// answer the export path has always given: the shape check failed, the
// projection that carries a record's declared class is not there, or the
// stream is not an overlay of anything. Nothing half-composed is ever exported
// and nothing half-composed is ever submitted.

/**
 * Why no overlay can be composed on this window at all, or the empty string
 * when one can.
 *
 * The classes an overlay names are read out of the stream's own
 * `projection.json`, and that file is one of the two a glade root never
 * carries: the supplier publishes the stream record, the decide-now list and
 * the lens pointers, and not the projection. A window with no projection can
 * compose nothing, and both buttons say that rather than composing an empty
 * text and sending it, or looking ready and doing nothing.
 */
export function composeRefusal(records: GyldRecords | undefined): string {
  if (records === undefined || records.status === 'unset') {
    return 'the projection this stream declares its classes in has not been read yet';
  }
  // The test is the DEFINITIONS, not the status. A bundle whose stream record
  // landed reads `ok` whether or not a projection came with it, and a glade
  // root is exactly that: the record is on its share and the projection is on
  // no share at all. A status test would call that composable and hand the
  // reader an empty box.
  if (records.definitions.size > 0) {
    return '';
  }
  return 'this stream carries no projection here, and the classes an overlay names '
    + `are declared in it (the bundle reads as ${records.status}). On a glade root `
    + 'that is expected: the supplier publishes no projection.json, so add the '
    + 'build directory as a static root to compose here';
}

/**
 * Why this draft may be EXPORTED but not SUBMITTED, or the empty string when
 * it may be both.
 *
 * A submit no longer writes the module whole. It sends a FRAGMENT — the records
 * this draft adds, as imports, class text and member lines — and a Gyld host
 * folds them into the notebook that is already there
 * (`gyld/scripts/manage_decision_streams.py merge`, spec section 4.8). So a
 * stream whose module already declares records is the ORDINARY case now and
 * refuses nothing: that is the whole point, because the owner has several
 * questions to answer and wants them in one notebook. Answering the SAME
 * question twice is refused by that host as `NOTEBOOK_ALREADY_HAS`, which is the
 * one place that can read the file and see it.
 *
 * What is left here is the ROOT NAME. A fragment's member lines are folded into
 * the top-level class the stream REGISTERED as its root, so a module declaring
 * its root under any other name has nowhere for them to go. The window says
 * which two names disagree rather than sending a fragment that cannot land:
 * which of them is right is the stream manager's to settle.
 *
 * What a module declares is read, not guessed: a placed record's qualified slot
 * is `<module>:<Root>.<member>`, so the slot whose module is this stream's and
 * which has no `.member` after the module prefix is its root class — the one
 * memberless occurrence slot a module contributes.
 */
export function overwriteRefusal(
  records: GyldRecords | undefined,
  target: OverlayTarget | undefined,
): string {
  if (records === undefined || target === undefined) {
    return '';
  }
  const prefix = `${target.module}:`;
  // After the module prefix, so a dotted module name is not read as a member.
  const foreign = [...records.occurrenceBySlot.keys()]
    .filter((slot) => slot.startsWith(prefix))
    .filter((slot) => !slot.slice(prefix.length).includes('.') && slot !== `${prefix}${target.root}`)
    .map((slot) => slot.slice(prefix.length));
  if (foreign.length > 0) {
    return `${target.module} declares its root class as ${foreign.join(', ')} and `
      + `${target.stream} registers ${target.root}, so a submit has nowhere to place `
      + 'this record: a fragment is folded into the root the stream registered. '
      + 'Settle the two in the stream manager, or export this text and merge it by hand';
  }
  return '';
}

export interface AnswerInput {
  target: OverlayTarget | undefined;
  draft: AnswerDraft;
  /** The emitted decide-now rows, which is where a question's member name is. */
  rows: readonly DecideNowQuestion[];
  records: GyldRecords | undefined;
}

/** The pieces one answer composes from, or undefined when the draft does not
 *  compose. Both readers — the export box's module and the submit's fragment —
 *  are built from this one resolution, so they can never disagree. */
function answerComposition({
  target, draft, rows, records,
}: AnswerInput): AnswerComposition | undefined {
  if (target === undefined || records === undefined || answerShapeFaults(draft).length > 0) {
    return undefined;
  }
  const row = rows.find((entry) => entry.slot === draft.question);
  const question = declaredSymbol(records, draft.question);
  const alternative = declaredSymbol(records, draft.alternative);
  if (row === undefined || question === undefined || alternative === undefined) {
    return undefined;
  }
  return { target, draft, question, label: row.label, alternative };
}

export function composeAnswer(input: AnswerInput): string {
  const composition = answerComposition(input);
  return composition === undefined ? '' : answerOverlay(composition);
}

/** The fragment one answer SENDS: the ruling class, the member that places it and
 *  the names both need, for a Gyld host to fold into the notebook. */
export function composeAnswerFragment(input: AnswerInput): OverlayFragment | undefined {
  const composition = answerComposition(input);
  return composition === undefined ? undefined : answerFragment(composition);
}

export interface AskInput {
  target: OverlayTarget | undefined;
  draft: AskDraft;
  records: GyldRecords | undefined;
}

/**
 * The two operands of one ask, or undefined when the draft does not compose.
 *
 * Fragments rather than a string, because the supplier's `ask` takes the
 * module head and the records it appends to it separately, and `askJoin` is
 * what the export box shows. One composition, two readers.
 */
function askComposition({ target, draft, records }: AskInput): AskComposition | undefined {
  if (target === undefined || records === undefined || askShapeFaults(draft).length > 0) {
    return undefined;
  }
  const requires = declaredSymbols(records, draft.requires);
  const gates = declaredSymbols(records, draft.gates);
  if (requires.missing.length > 0 || gates.missing.length > 0) {
    return undefined;
  }
  return { target, draft, requires: requires.found, gates: gates.found };
}

export function composeAsk(input: AskInput): AskFragments | undefined {
  const composition = askComposition(input);
  return composition === undefined ? undefined : askFragments(composition);
}

/** The fragment one ask SENDS: the question class, its alternatives and the
 *  members that place them all. */
export function composeAskFragment(input: AskInput): OverlayFragment | undefined {
  const composition = askComposition(input);
  return composition === undefined ? undefined : askFragment(composition);
}

/**
 * Send an answer: the FRAGMENT, for a Gyld host to fold into the notebook.
 *
 * The export box still holds the whole module — a single-record module to read
 * and merge by hand — and the wire carries the records alone, so a submit adds to
 * a notebook instead of replacing it. A draft that did not compose is not sent at
 * all: the window never asks the supplier to build nothing.
 */
export async function answerSubmit(
  ops: GyldOps,
  target: OverlayTarget | undefined,
  fragment: OverlayFragment | undefined,
): Promise<GyldOpsResponse | undefined> {
  if (target === undefined || fragment === undefined) {
    return undefined;
  }
  return ops.answer({ stream: target.stream, fragment });
}

/**
 * Send a new question, the same way: the question class, its alternatives and
 * the members that place them, folded into the notebook that is there.
 *
 * `overlay` + `question` was the old pair, and the supplier still takes it; what
 * this window sends is the fragment, because a stream's notebook normally holds
 * records already and a whole-module write would drop them.
 */
export async function askSubmit(
  ops: GyldOps,
  target: OverlayTarget | undefined,
  fragment: OverlayFragment | undefined,
): Promise<GyldOpsResponse | undefined> {
  if (target === undefined || fragment === undefined) {
    return undefined;
  }
  return ops.ask({ stream: target.stream, fragment });
}
