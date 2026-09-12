// The two operations that make a new stream, and the command line each one is
// in the read-only stage.
//
// Section 4.6: "the decide window ends in export: it writes the overlay module
// text and the exact CLI command". The stream manager is the same. Nothing is
// submitted here, nothing is created, and no bundle is written: the window
// composes the command the owner runs, and the watch loop picks up whatever
// that run emits.
//
// An operation is an OBJECT, not a verb string carried around (AGENTS.md, "no
// magic strings when the concept has semantics"). It owns its own name, what
// it does to a parent's overlay, and how it is spelled on a command line, so a
// third kind of stream is one more instance rather than a third branch at
// every call site.

/** How the Gyld host is run: the documented invocation of the example host
 *  (`gyld/examples/README.md`, "The base stream bundle"). */
export const HOST_COMMAND = 'PYTHONPATH=src:. python3 -B scripts/emit_decision_streams.py';

/** The output directory is the OWNER's to choose, and Gyld never overwrites
 *  one, so the command carries a placeholder rather than a path this window
 *  invented. */
export const OUTPUT_PLACEHOLDER = 'NEW_DIRECTORY';

export class StreamOperation {
  private constructor(
    /** The host's subcommand, and the value a picker carries for it. */
    readonly verb: string,
    /** What the button says. */
    readonly title: string,
    /** What the operation does to the parent, in the owner's terms. */
    readonly explains: string,
  ) {}

  /** Section 4.4: a fork flattens the parent's overlay chain into one module,
   *  so editing the parent afterwards does not reach the fork. */
  static readonly FORK = new StreamOperation(
    'fork',
    'Fork',
    'copies the parent\'s overlay chain into one module; editing the parent '
    + 'afterwards does not change this stream',
  );

  /** Section 4.4: a link imports the parent's overlay module and subclasses
   *  its root, so the parent's rulings are inherited live. */
  static readonly LINK = new StreamOperation(
    'link',
    'Link',
    'imports the parent\'s overlay module, so the parent\'s rulings and '
    + 'questions are inherited live and a rebuild re-captures the chain',
  );

  /** The exact command line for this operation. `parent` and `name` are the
   *  two operands the host's subcommand takes, in that order. */
  command(parent: string, name: string): string {
    return `${HOST_COMMAND} ${this.verb} ${parent} ${name} --output ${OUTPUT_PLACEHOLDER}`;
  }
}

export const STREAM_OPERATIONS: readonly StreamOperation[] = Object.freeze([
  StreamOperation.FORK, StreamOperation.LINK,
]);

/**
 * The command that re-captures one stream after its overlay text changed, or
 * after its parent moved (spec section 6.4: "a stream whose parent moved, or
 * whose overlay text was edited outside the UI, is rebuilt with `rebuild`").
 *
 * It is not a StreamOperation: it takes one stream rather than a parent and a
 * new name, and it makes no stream. It is here because the host and the output
 * placeholder are named here once.
 */
export function rebuildCommand(stream: string): string {
  return `${HOST_COMMAND} rebuild ${stream} --output ${OUTPUT_PLACEHOLDER}`;
}

/** The operation a picker's value names, or undefined when it names none. A
 *  value that is not an operation selects nothing rather than defaulting to
 *  one, because which of the two runs is the owner's choice, never a
 *  fallback. */
export function operationNamed(verb: string): StreamOperation | undefined {
  return STREAM_OPERATIONS.find((operation) => operation.verb === verb);
}

/** The fork or link the stream manager is composing. Class 1 atom, INSTANCE
 *  scope, one per tab (spec section 3.3, `Gyld.Streams.Draft`). */
export interface StreamDraft {
  operation: StreamOperation;
  /** The stream the new one is taken from, chosen from the census. */
  parent: string;
  /** The new stream's id. */
  name: string;
}

export const DRAFT_EMPTY: StreamDraft = Object.freeze({
  operation: StreamOperation.FORK, parent: '', name: '',
});

/**
 * The LOCAL form check, and nothing more (spec risk R5: "the decide window's
 * form checks must not grow into a second validator; the rule is that only
 * shape is checked locally"). Shape here is: a parent is chosen and a name is
 * typed. Whether the name is a legal identifier, whether it collides, whether
 * the parent can be forked and whether the capture will succeed are all Gyld's
 * answers, and this window never guesses at them.
 */
export function draftShapeFaults(draft: StreamDraft): string[] {
  const faults: string[] = [];
  if (draft.parent === '') {
    faults.push('choose the parent this stream is taken from');
  }
  if (draft.name.trim() === '') {
    faults.push('name the new stream');
  }
  return faults;
}

/** The command for a draft, or the empty string when its shape is not there
 *  yet. Nothing half-composed is ever exported. */
export function draftCommand(draft: StreamDraft): string {
  if (draftShapeFaults(draft).length > 0) {
    return '';
  }
  return draft.operation.command(draft.parent, draft.name.trim());
}
