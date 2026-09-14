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
 * The supplier's `answer` and `ask` write the overlay MODULE, whole
 * (`glade-gyld/src/verbs.rs`: the text is written as the stream's overlay
 * module and the stream is rebuilt). This window composes a module holding the
 * one record the draft adds, which is right for the export path, because
 * merging it into a module that already holds others is the owner's. Sent
 * instead of merged, that same text would DELETE every other record the module
 * declares, which a live run showed: a fork of stream-a went from three
 * rulings to one.
 *
 * So a stream whose own overlay module already declares records refuses the
 * submit and says which module and how many. What it declares is read, not
 * guessed: a placed record's qualified slot is `<module>:<Root>.<member>`, and
 * the ones whose module is this stream's are the records this stream's overlay
 * wrote.
 *
 * The module's own ROOT CLASS is not one of them. Its slot is `<module>:<Root>`
 * with no `.member` after the module prefix - the one memberless occurrence
 * slot a module contributes, and every generated overlay declares it, so
 * counting it refused every fork and every link ever made for one ruling,
 * which is exactly the flow this refusal advises (live, 2026-09-14: the link
 * `demo-keys-ruling` owned one slot,
 * `glade_decisions_demo_keys_ruling:GladeDecisionsDemoKeysRuling`, and was
 * refused with "already declares 1 record"). Nothing is lost by rewriting that
 * class, because the composed module declares it again - PROVIDED it declares
 * it under the same name. So a module whose declared root is not the root the
 * stream registered is refused too, naming both: that class would be dropped,
 * and which of the two names is right is the stream manager's to settle.
 */
export function overwriteRefusal(
  records: GyldRecords | undefined,
  target: OverlayTarget | undefined,
): string {
  if (records === undefined || target === undefined) {
    return '';
  }
  const prefix = `${target.module}:`;
  const owned = [...records.occurrenceBySlot.keys()]
    .filter((slot) => slot.startsWith(prefix));
  // After the module prefix, so a dotted module name is not read as a member.
  const declared = owned.filter((slot) => slot.slice(prefix.length).includes('.'));
  if (declared.length > 0) {
    return `${target.module} already declares ${declared.length} `
      + `record${declared.length === 1 ? '' : 's'}, and a submit writes this module `
      + 'whole, so it would drop them. Export this text and merge it into the '
      + 'stream\'s own overlay module instead, or answer on a stream forked or '
      + 'linked for this ruling';
  }
  const foreign = owned
    .filter((slot) => !slot.slice(prefix.length).includes('.') && slot !== `${prefix}${target.root}`)
    .map((slot) => slot.slice(prefix.length));
  if (foreign.length > 0) {
    return `${target.module} declares its root class as ${foreign.join(', ')} and `
      + `${target.stream} registers ${target.root}, so a submit would write the `
      + 'registered root and drop that class. Settle the two in the stream '
      + 'manager, or export this text and merge it by hand';
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
