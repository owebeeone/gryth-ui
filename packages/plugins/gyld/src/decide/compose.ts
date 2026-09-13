import type { DecideNowQuestion } from '../contract';
import type { GyldOps, GyldOpsResponse } from '../ops/ops';
import type { GyldRecords } from '../records/records';
import { answerShapeFaults, askShapeFaults, type AnswerDraft, type AskDraft } from './drafts';
import {
  answerOverlay, askFragments, type AskFragments, type OverlayTarget,
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
  if (records.status !== 'ok') {
    return 'this stream\'s projection.json reads as '
      + `${records.status}, and the classes an overlay names are declared in it. `
      + 'On a glade root that is expected: the supplier publishes no projection, '
      + 'so add the build directory as a static root to compose here';
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

export function composeAnswer({ target, draft, rows, records }: AnswerInput): string {
  if (target === undefined || records === undefined || answerShapeFaults(draft).length > 0) {
    return '';
  }
  const row = rows.find((entry) => entry.slot === draft.question);
  const question = declaredSymbol(records, draft.question);
  const alternative = declaredSymbol(records, draft.alternative);
  if (row === undefined || question === undefined || alternative === undefined) {
    return '';
  }
  return answerOverlay({ target, draft, question, label: row.label, alternative });
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
export function composeAsk({ target, draft, records }: AskInput): AskFragments | undefined {
  if (target === undefined || records === undefined || askShapeFaults(draft).length > 0) {
    return undefined;
  }
  const requires = declaredSymbols(records, draft.requires);
  const gates = declaredSymbols(records, draft.gates);
  if (requires.missing.length > 0 || gates.missing.length > 0) {
    return undefined;
  }
  return askFragments({ target, draft, requires: requires.found, gates: gates.found });
}

/** Send an answer. Text that did not compose is not sent at all: the window
 *  never asks the supplier to build nothing. */
export async function answerSubmit(
  ops: GyldOps,
  target: OverlayTarget | undefined,
  overlay: string,
): Promise<GyldOpsResponse | undefined> {
  if (target === undefined || overlay === '') {
    return undefined;
  }
  return ops.answer({ stream: target.stream, overlay });
}

/**
 * Send a new question.
 *
 * The supplier's `ask` takes an `overlay` and a `question` fragment and writes
 * the second under the first. Those two are exactly what the composition
 * produced, and `askJoin` of them is exactly what the export box holds, so the
 * module the supplier writes is the module the reader read. A draft that did
 * not compose is not sent at all.
 */
export async function askSubmit(
  ops: GyldOps,
  target: OverlayTarget | undefined,
  fragments: AskFragments | undefined,
): Promise<GyldOpsResponse | undefined> {
  if (target === undefined || fragments === undefined) {
    return undefined;
  }
  return ops.ask({
    stream: target.stream,
    overlay: fragments.overlay,
    question: fragments.question,
  });
}
