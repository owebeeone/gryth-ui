import type { GyldStreamsCensus } from '../store/state';
import type { AnswerDraft, AskDraft } from './drafts';
import { filledAlternatives, preferredAlternative, sourceLines } from './drafts';
import type { DeclaredSymbol } from './symbols';

// The overlay module text, composed in the shape spec section 4.2 writes down
// and the shape `examples/glade-decisions-stream-a.gyld.py` actually has: a
// module docstring, the imports, the records this draft adds, and the `@model`
// root that subclasses the parent's root and places each record with `use`.
//
// Everything about the GRAPH comes from emitted data: the module and root of
// the stream and of its parent from the two stream records' own `overlay`
// blocks, and every class name and its module from the projection's
// definitions. What is not emitted, and is declared here once, is the
// VOCABULARY: the names of the two example modules a stream overlay is written
// against and the symbols it imports from them. Section 4.2 writes those lines
// down, this composes them, and nothing about them is guessed from a record.
//
// The text is a DRAFT for the owner to read, edit and run. It is not a Gyld
// fact and never becomes one here: Gyld captures it, Gyld validates it, and
// what comes back is `validation.json`.

/** The vocabulary module a stream's rulings are written against (owner ruling
 *  O1: a separate module, so the v1 capture stays byte-identical). */
export const STREAM_VOCABULARY = 'decision_stream_concepts';

/** The vocabulary module the decision graph itself is declared against. */
export const DECISION_VOCABULARY = 'glade_decision_concepts';

/** Where `model` and `use` come from. */
export const GYLD_IMPORT = 'from gyld import model, use';

/** The stream an overlay is written for, and the parent it is written over.
 *  Every field is read off the two emitted stream records. */
export interface OverlayTarget {
  stream: string;
  module: string;
  root: string;
  parent: string;
  /** The parent's overlay module, which is where its root class is declared
   *  and therefore what this overlay imports it from. */
  parentModule: string;
  parentRoot: string;
}

/** Why an overlay cannot be composed for a stream, in the reader's terms. */
export interface OverlayRefusal {
  reason: string;
}

export function isRefusal(value: OverlayTarget | OverlayRefusal): value is OverlayRefusal {
  return (value as OverlayRefusal).reason !== undefined;
}

/**
 * The overlay target for one stream of the census, or why there is none.
 *
 * A stream with no parent is not an overlay of anything: the base declaration
 * is the graph itself, and adding a ruling to it would be editing the graph
 * the ruling points at, which is the one thing section 4.1 says a stream
 * exists to avoid. Forking or linking it first is the stream manager's job,
 * and the window says so rather than writing text into the base module.
 */
export function overlayTarget(
  census: GyldStreamsCensus | undefined,
  stream: string,
): OverlayTarget | OverlayRefusal {
  if (census === undefined || census.status !== 'ready') {
    return { reason: 'the census has not landed yet' };
  }
  const entry = census.streams.find((held) => held.id === stream);
  if (entry === undefined) {
    return { reason: `the census carries no stream ${stream === '' ? 'on this window' : stream}` };
  }
  const record = entry.record;
  if (record.parent === undefined) {
    return {
      reason: `${record.id} has no parent, so it is a declaration rather than an overlay: `
        + 'fork or link it in the stream manager, then answer on the new stream',
    };
  }
  if (record.overlay === undefined) {
    return { reason: `${record.id} emitted no overlay block, so its module and root are unknown` };
  }
  const parent = census.streams.find((held) => held.id === record.parent);
  if (parent === undefined) {
    return { reason: `the census carries no parent ${record.parent} for ${record.id}` };
  }
  if (parent.record.overlay === undefined) {
    return { reason: `${parent.id} emitted no overlay block, so its root class is unknown` };
  }
  return {
    stream: record.id,
    module: record.overlay.module,
    root: record.overlay.root,
    parent: parent.id,
    parentModule: parent.record.overlay.module,
    parentRoot: parent.record.overlay.root,
  };
}

/** One `from <module> import <names>` line per module, modules and names
 *  sorted, so the same draft always composes the same text. */
function imports(needed: Map<string, Set<string>>): string[] {
  return [...needed.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([module, names]) => `from ${module} import ${[...names].sort().join(', ')}`);
}

function need(into: Map<string, Set<string>>, module: string, ...names: string[]): void {
  const held = into.get(module);
  if (held === undefined) {
    into.set(module, new Set(names));
    return;
  }
  for (const name of names) {
    held.add(name);
  }
}

/** A Python string literal for a line of prose. Double quotes, with the two
 *  characters that would break out of one escaped. */
function quoted(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** A Python tuple literal, with the trailing comma a one-element tuple needs. */
function tuple(values: readonly string[]): string {
  const items = values.map(quoted).join(', ');
  return values.length === 1 ? `(${items},)` : `(${items})`;
}

function docstring(text: string): string {
  return `    """${text.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"').trim()}"""`;
}

/** The class an answer's ruling is declared as, and the member that places it.
 *  These two names are THIS WINDOW's spelling, composed from the question's
 *  own emitted class and member; everything else in the text is Gyld's. */
export function rulingNames(question: DeclaredSymbol, label: string): {
  symbol: string;
  member: string;
} {
  return { symbol: `${question.symbol}Ruling`, member: `${label}_ruling` };
}

export interface AnswerComposition {
  target: OverlayTarget;
  draft: AnswerDraft;
  /** The question's declared class, from the projection. */
  question: DeclaredSymbol;
  /** Its member name, as the emitted decide-now row labels it. */
  label: string;
  /** The chosen alternative's declared class, from the projection. */
  alternative: DeclaredSymbol;
}

/**
 * The overlay module for one answer: a `Ruling` that `Decides` the question
 * and `Selects` the alternative, placed in the stream's root.
 *
 * The module holds THIS draft's record and no other. A stream's overlay
 * normally holds several, and merging is the owner's, which the window says
 * beside the box.
 */
export function answerOverlay(composition: AnswerComposition): string {
  const { target, draft, question, label, alternative } = composition;
  const names = rulingNames(question, label);
  const needed = new Map<string, Set<string>>();
  need(needed, STREAM_VOCABULARY, 'Decides', 'Ruling', 'Selects');
  need(needed, question.module, question.symbol);
  need(needed, alternative.module, alternative.symbol);
  need(needed, target.parentModule, target.parentRoot);
  const sources = sourceLines(draft);
  const lines = [
    `"""Stream ${target.stream}: rulings and questions added over ${target.parent}."""`,
    '',
    ...imports(needed),
    '',
    GYLD_IMPORT,
    '',
    '',
    `class ${names.symbol}(Ruling):`,
    docstring(draft.text),
    `    principal = ${quoted(draft.principal.trim())}`,
    `    stamp = ${quoted(draft.stamp.trim())}`,
  ];
  if (sources.length > 0) {
    lines.push(`    sources = ${tuple(sources)}`);
  }
  lines.push(
    `    decides = Decides[${question.symbol}]`,
    `    selects = Selects[${alternative.symbol}]`,
    '',
    '',
    '@model',
    `class ${target.root}(${target.parentRoot}):`,
    docstring(`Stream ${target.stream} root: every member of ${target.parent}, `
      + 'plus this stream\'s records.'),
    `    ${names.member} = use(${names.symbol})`,
    '',
  );
  return lines.join('\n');
}

export interface AskComposition {
  target: OverlayTarget;
  draft: AskDraft;
  /** The declared classes of the questions this one requires. */
  requires: DeclaredSymbol[];
  /** The declared classes of the triggers that gate it. */
  gates: DeclaredSymbol[];
}

/**
 * The overlay module for one new question: the `Question` class, one
 * `Alternative` class per offered answer, and the root that places them all.
 *
 * `status` is `Lean` when exactly one alternative is marked preferred and
 * `Open` when none is, which is the shape section 6.2 states and the shape
 * `PREFERRED_INCONSISTENT` reports when it is broken. The mark itself is
 * `preference = Preferred` on the alternative, as the base declaration writes
 * it.
 */
export function askOverlay(composition: AskComposition): string {
  const { target, draft, requires, gates } = composition;
  const alternatives = filledAlternatives(draft);
  const preferred = preferredAlternative(draft);
  const needed = new Map<string, Set<string>>();
  need(needed, DECISION_VOCABULARY, 'Alternative', 'Offers', 'Question');
  need(needed, DECISION_VOCABULARY, preferred === undefined ? 'Open' : 'Lean');
  if (preferred !== undefined) {
    need(needed, DECISION_VOCABULARY, 'Preferred');
  }
  if (requires.length > 0) {
    need(needed, DECISION_VOCABULARY, 'Requires');
  }
  if (gates.length > 0) {
    need(needed, DECISION_VOCABULARY, 'GatedBy');
  }
  for (const declared of [...requires, ...gates]) {
    need(needed, declared.module, declared.symbol);
  }
  need(needed, target.parentModule, target.parentRoot);
  const lines = [
    `"""Stream ${target.stream}: rulings and questions added over ${target.parent}."""`,
    '',
    ...imports(needed),
    '',
    GYLD_IMPORT,
    '',
    '',
    `class ${draft.symbol.trim()}(Question):`,
    docstring(draft.docstring),
    `    status = ${preferred === undefined ? 'Open' : 'Lean'}`,
  ];
  if (requires.length > 0) {
    lines.push(`    requires = Requires[${requires.map((r) => r.symbol).join(', ')}]`);
  }
  if (gates.length > 0) {
    lines.push(`    gated_by = GatedBy[${gates.map((g) => g.symbol).join(', ')}]`);
  }
  lines.push(
    `    offers = Offers[${alternatives.map((a) => a.symbol.trim()).join(', ')}]`,
  );
  for (const alternative of alternatives) {
    lines.push('', '', `class ${alternative.symbol.trim()}(Alternative):`, docstring(alternative.description));
    if (alternative.preferred) {
      lines.push('    preference = Preferred');
    }
  }
  lines.push(
    '',
    '',
    '@model',
    `class ${target.root}(${target.parentRoot}):`,
    docstring(`Stream ${target.stream} root: every member of ${target.parent}, `
      + 'plus this stream\'s records.'),
    `    ${draft.label.trim()} = use(${draft.symbol.trim()})`,
    ...alternatives.map((a) => `    ${a.label.trim()} = use(${a.symbol.trim()})`),
    '',
  );
  return lines.join('\n');
}
