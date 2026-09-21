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

/** The module `model` and `use` come from. An ordinary module name, which is what
 *  lets a FRAGMENT name it beside the vocabularies: a link-generated notebook
 *  imports `model` alone, and the merge host unions `use` into that statement. */
export const GYLD_MODULE = 'gyld';

/** Where `model` and `use` come from. */
export const GYLD_IMPORT = `from ${GYLD_MODULE} import model, use`;

/**
 * The line that introduces a stream's registration block, exactly
 * (`gyld/scripts/capture_decision_stream.py`, `REGISTRATION_MARKER`).
 *
 * No host holds a list of streams: an overlay says which stream it is in its
 * own module docstring, and every `*.gyld.py` of the repository's `examples/`
 * that carries one of these is a stream. An overlay this window rewrites
 * therefore has to carry the block the stream already declares, or the module
 * the supplier writes stops being that stream.
 */
export const REGISTRATION_MARKER = 'gyld-stream-record:';

/** The fields a registration block declares, in the order the host writes
 *  them (`DECLARED`). Exactly these: a block with a field more or a field
 *  fewer is `STREAM_REGISTRATION_INVALID`. */
export const REGISTRATION_FIELDS = Object.freeze([
  'id', 'kind', 'parent', 'follows', 'imports', 'revision', 'root', 'note',
] as const);

/** The stream an overlay is written for, the parent it records and the stream
 *  it follows. Every field is read off the emitted stream records. */
export interface OverlayTarget {
  stream: string;
  module: string;
  root: string;
  /** `fork` or `link`, as the record declares it. */
  kind: string;
  /** What the capture is filed under, as the record declares it. */
  revision: string;
  /** One line of provenance. The host allows this one to be empty. */
  note: string;
  /** The stream this one's records came from. For a fork that is provenance
   *  and nothing else: a fork imports the base. */
  parent: string;
  /** The stream whose overlay module this one IMPORTS, which is what the
   *  declaration chain walks. A link follows its parent; a fork follows the
   *  base. */
  follows: string;
  /** The followed stream's overlay module, which is where its root class is
   *  declared and therefore what this overlay imports it from. */
  followsModule: string;
  followsRoot: string;
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
 *
 * The stream an overlay IMPORTS is the one it FOLLOWS, which is not always its
 * parent: a link follows its parent, and a fork restates what still stands
 * over the base and follows the base, keeping its parent as provenance only
 * (spec section 4.4). The record's own `follows` field is read when the host
 * emits one; today it does not, and the emitted `chain` is the authority
 * instead, because the host builds that chain by walking `follows`
 * (`capture_decision_stream.chain`). So the entry before this stream in its
 * own chain IS the stream it follows, read rather than guessed from `parent`.
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
  const followed = record.follows ?? record.chain[record.chain.length - 2];
  if (followed === undefined || followed === '') {
    return {
      reason: `${record.id} emitted neither a follows field nor a chain that names the `
        + 'stream its overlay imports',
    };
  }
  const follows = census.streams.find((held) => held.id === followed);
  if (follows === undefined) {
    return { reason: `the census carries no stream ${followed}, which ${record.id} follows` };
  }
  if (follows.record.overlay === undefined) {
    return { reason: `${follows.id} emitted no overlay block, so its root class is unknown` };
  }
  return {
    stream: record.id,
    module: record.overlay.module,
    root: record.overlay.root,
    kind: record.kind,
    revision: record.revision,
    note: record.note ?? '',
    parent: record.parent,
    follows: follows.id,
    followsModule: follows.record.overlay.module,
    followsRoot: follows.record.overlay.root,
  };
}

/**
 * The registration block an overlay carries at the end of its own module
 * docstring: the marker line, then one JSON object of exactly
 * `REGISTRATION_FIELDS` (`capture_decision_stream.registration_text`).
 *
 * Every value is the emitted record's own. The window declares no stream it
 * was not told about and repairs nothing: a note the record left empty is
 * written empty, which is the one field the host allows to be.
 */
export function registrationBlock(target: OverlayTarget): string {
  const declared: Record<string, string> = {
    id: target.stream,
    kind: target.kind,
    parent: target.parent,
    follows: target.follows,
    imports: target.followsModule,
    revision: target.revision,
    root: target.root,
    note: target.note,
  };
  return `${REGISTRATION_MARKER}\n${JSON.stringify(declared, [...REGISTRATION_FIELDS], 2)}`;
}

/** The module docstring: one line of prose, then the registration block the
 *  stream already declares, which is what makes the module that stream. */
function moduleDocstring(target: OverlayTarget): string[] {
  return [
    `"""Stream ${target.stream}: rulings and questions added over ${target.parent}.`,
    '',
    ...registrationBlock(target).split('\n'),
    '"""',
  ];
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

/** The indent a class body's docstring stands at, which a second paragraph of
 *  one has to stand at too. */
const BODY_INDENT = '    ';

function docstring(text: string): string {
  return `${BODY_INDENT}"""${text.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"').trim()}"""`;
}

/**
 * The line a ruling still marked as an agent's draft carries into the overlay
 * (GyldAskAgent.md section 8).
 *
 * "Accepted", not "edited": the mark is cleared the moment the reader changes
 * the alternative or the ruling text (`drafts.ts`, `edited`), so a submit
 * that still carries one is a submit of the model's own words. The principal
 * is the reader's field and what the overlay records either way (owner ruling
 * O6); this line says who accepted them.
 */
export function draftedStamp(draft: AnswerDraft): string {
  return `Drafted by ${draft.drafted.trim()}, accepted by ${draft.principal.trim()}.`;
}

/**
 * The ruling's prose as the record will carry it: what the reader wrote, and
 * the drafting stamp when the text is still an agent's draft.
 *
 * ONE composition, as everything else about this text is: the export box and
 * the wire carry the same bytes, so the stamp is as readable before a submit
 * as it is in the ruling afterwards.
 */
export function rulingProse(draft: AnswerDraft): string {
  const text = draft.text.trim();
  if (draft.drafted.trim() === '') {
    return text;
  }
  return `${text}\n\n${BODY_INDENT}${draftedStamp(draft)}`;
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

/**
 * The three things a FRAGMENT declares (spec section 4.8): the names the records
 * it adds have to import, the Python text of those records, and the member lines
 * that place them in the stream's root.
 *
 * It is what a submit sends. A Gyld host folds it into the notebook that is
 * already there — by line span, with every other byte of that file carried over —
 * so one notebook holds as many answers as the owner makes. Nothing here merges
 * anything: composing the pieces is this window's, folding them in is Gyld's.
 *
 * `gyld` is an ordinary key of `imports`: a link-generated module imports `model`
 * alone and needs `use` added, which the host does by unioning the names into the
 * statement that is there.
 */
export interface OverlayFragment {
  /** Module -> the names to import from it. */
  imports: Record<string, string[]>;
  /** One or more top-level classes, as Python text. */
  classes: string;
  /** One assignment per line, each placing one class in the root. */
  members: string[];
}

/** The needed-imports map as a fragment declares it: modules and names sorted, so
 *  the same draft always composes the same document. */
function fragmentImports(needed: Map<string, Set<string>>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const module of [...needed.keys()].sort()) {
    out[module] = [...(needed.get(module) ?? [])].sort();
  }
  return out;
}

/** The pieces one draft contributes to a module, which is all a fragment is.
 *  `use` is needed by every member line, and a fragment says so for itself. */
interface Pieces {
  needed: Map<string, Set<string>>;
  classes: string[];
  members: string[];
}

/** Those pieces as the fragment a submit sends. */
function fragmentOf(pieces: Pieces): OverlayFragment {
  need(pieces.needed, GYLD_MODULE, 'use');
  return {
    imports: fragmentImports(pieces.needed),
    classes: `${pieces.classes.join('\n')}\n`,
    members: pieces.members,
  };
}

/** The root class a whole module ends with: the `@model` declaration and one
 *  member line per record the draft placed. */
function rootClass(target: OverlayTarget, members: readonly string[]): string[] {
  return [
    '',
    '',
    '@model',
    `class ${target.root}(${target.followsRoot}):`,
    docstring(`Stream ${target.stream} root: every member of ${target.parent}, `
      + 'plus this stream\'s records.'),
    ...members.map((member) => `    ${member}`),
    '',
  ];
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
 * What one answer adds: a `Ruling` that `Decides` the question and `Selects` the
 * alternative, and the member that places it.
 *
 * ONE composition, two readers — the whole module the export box shows and the
 * fragment the submit sends are built from exactly these pieces, so what a reader
 * reads before pressing is what the notebook ends up carrying.
 */
function answerPieces(composition: AnswerComposition): Pieces {
  const { draft, question, label, alternative } = composition;
  const names = rulingNames(question, label);
  const needed = new Map<string, Set<string>>();
  need(needed, STREAM_VOCABULARY, 'Decides', 'Ruling', 'Selects');
  need(needed, question.module, question.symbol);
  need(needed, alternative.module, alternative.symbol);
  const sources = sourceLines(draft);
  const classes = [
    `class ${names.symbol}(Ruling):`,
    docstring(rulingProse(draft)),
    `    principal = ${quoted(draft.principal.trim())}`,
    `    stamp = ${quoted(draft.stamp.trim())}`,
  ];
  if (sources.length > 0) {
    classes.push(`    sources = ${tuple(sources)}`);
  }
  classes.push(
    `    decides = Decides[${question.symbol}]`,
    `    selects = Selects[${alternative.symbol}]`,
  );
  return { needed, classes, members: [`${names.member} = use(${names.symbol})`] };
}

/**
 * The overlay module for one answer, holding THIS draft's record and no other.
 *
 * It is the EXPORT text: a module to read, edit and merge into a notebook by
 * hand. A submit sends [`answerFragment`] instead, which is the same pieces as a
 * fragment for a Gyld host to fold into the notebook that is there.
 */
export function answerOverlay(composition: AnswerComposition): string {
  const { target } = composition;
  const pieces = answerPieces(composition);
  // The whole module subclasses the followed stream's root, so it imports it; a
  // fragment does not, because the module it is folded into already has it.
  need(pieces.needed, target.followsModule, target.followsRoot);
  return [
    ...moduleDocstring(target),
    '',
    ...imports(pieces.needed),
    '',
    GYLD_IMPORT,
    '',
    '',
    ...pieces.classes,
    ...rootClass(target, pieces.members),
  ].join('\n');
}

/** The same answer as the fragment a submit sends. */
export function answerFragment(composition: AnswerComposition): OverlayFragment {
  return fragmentOf(answerPieces(composition));
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
 * The two operands the supplier's `ask` takes, which together are the module.
 *
 * `ask` writes `overlay` and appends `question` to it, so a window that has
 * one module has to say where the seam in it is rather than hand the same text
 * twice. The seam is the obvious one: the head that says which stream this is
 * and what it imports, and the records this ask adds under it.
 */
export interface AskFragments {
  /** The module head: the docstring with its registration block, and the
   *  imports. */
  overlay: string;
  /** The records this ask adds and the root that places them. It BEGINS with
   *  a blank line, because the supplier's join puts exactly one newline
   *  between the two and a top-level class stands two blank lines under the
   *  imports. */
  question: string;
}

/**
 * The supplier's own join of the two, character for character
 * (`glade-wz/glade-gyld/src/verbs.rs`, `overlay_text`: `format!("{}\n\n{}\n",
 * overlay.trim_end(), question.trim_end())`).
 *
 * The export composes the module THIS way, so the text a reader reads in the
 * box is the module the supplier writes, byte for byte, rather than one that
 * merely looks like it. There is one composition and one text.
 */
export function askJoin(fragments: AskFragments): string {
  return `${trimEnd(fragments.overlay)}\n\n${trimEnd(fragments.question)}\n`;
}

/** Rust's `str::trim_end`, for the characters this composition can produce. */
function trimEnd(text: string): string {
  return text.replace(/\s+$/, '');
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
  return askJoin(askFragments(composition));
}

/** What one ask adds: the `Question` class, one `Alternative` per offered answer,
 *  and the member lines that place them all. The same pieces the export box's
 *  module is built from and the fragment a submit sends. */
function askPieces(composition: AskComposition): Pieces {
  const { draft, requires, gates } = composition;
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
  const classes = [
    `class ${draft.symbol.trim()}(Question):`,
    docstring(draft.docstring),
    `    status = ${preferred === undefined ? 'Open' : 'Lean'}`,
  ];
  if (requires.length > 0) {
    classes.push(`    requires = Requires[${requires.map((r) => r.symbol).join(', ')}]`);
  }
  if (gates.length > 0) {
    classes.push(`    gated_by = GatedBy[${gates.map((g) => g.symbol).join(', ')}]`);
  }
  classes.push(
    `    offers = Offers[${alternatives.map((a) => a.symbol.trim()).join(', ')}]`,
  );
  for (const alternative of alternatives) {
    classes.push('', '', `class ${alternative.symbol.trim()}(Alternative):`, docstring(alternative.description));
    if (alternative.preferred) {
      classes.push('    preference = Preferred');
    }
  }
  return {
    needed,
    classes,
    members: [
      `${draft.label.trim()} = use(${draft.symbol.trim()})`,
      ...alternatives.map((a) => `${a.label.trim()} = use(${a.symbol.trim()})`),
    ],
  };
}

/** The same module, as the head and the records the supplier's `ask` takes
 *  separately. `askJoin` puts them back together. */
export function askFragments(composition: AskComposition): AskFragments {
  const { target } = composition;
  const pieces = askPieces(composition);
  need(pieces.needed, target.followsModule, target.followsRoot);
  const head = [
    ...moduleDocstring(target),
    '',
    ...imports(pieces.needed),
    '',
    GYLD_IMPORT,
  ];
  const lines = [
    '',
    ...pieces.classes,
    ...rootClass(target, pieces.members),
  ];
  return { overlay: head.join('\n'), question: lines.join('\n') };
}

/** The same ask as the fragment a submit sends: its classes and its members,
 *  folded into the notebook that is already there rather than written over it. */
export function askFragment(composition: AskComposition): OverlayFragment {
  return fragmentOf(askPieces(composition));
}
