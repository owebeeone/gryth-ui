// What the picture means FOR THE READER, in one module.
//
// The lens file already says what a colour and an arrow ARE: the emitted
// legend carries the relation, the kind and the status, and — where the host
// emitted one — the `doc` of the definition behind it, which is the
// declaration's own docstring. That is Gyld's word about the graph and it is
// read, never written here.
//
// This module holds the OTHER sentence: what one of them means for an owner
// who is deciding. That is a judgement about the audience and not about the
// graph, so it is authored, and it is authored in ONE place because three
// surfaces say it — the legend overlay's rows, the hover card under the status
// and the detail window — and three copies would drift.
//
// Nothing here decides a Gyld fact and nothing here is a substitute for one.
// A name this module has no sentence for gets the EMPTY STRING and the surface
// shows nothing, exactly as it shows nothing for a `doc` the host did not
// emit: absence is absence, never an invented explanation (spec 6.7).

/** One authored sentence, against the emitted name it explains. */
export class GraphNote {
  constructor(
    /** The emitted name: a status, a node kind or a relation, spelled as the
     *  lens file spells it. */
    readonly name: string,
    /** What it means for the owner, in this app's own words. */
    readonly says: string,
  ) {}
}

/** The four statuses a question's fill colour stands for. */
export const STATUS_NOTES: readonly GraphNote[] = Object.freeze([
  new GraphNote(
    'Open',
    'Nobody has decided this and no recommendation is recorded. If it is lit as '
    + 'answerable, everything it depends on is settled and it is waiting on you.',
  ),
  new GraphNote(
    'Lean',
    'A recommendation is recorded with its evidence, marked with a star on the '
    + 'preferred alternative. It is not a decision until you ratify it with a ruling.',
  ),
  new GraphNote(
    'Directed',
    'You gave direction, but ratification, publication or a witness is still '
    + 'pending, so treat it as provisional.',
  ),
  new GraphNote(
    'Decided',
    'Ruled. It is kept in the picture as an anchor because other questions depend on it.',
  ),
]);

/** The node KINDS that need a word of their own. A Question is explained by
 *  its status, which is the colour the reader is actually looking at, so the
 *  one entry here is the kind that carries no status at all. */
export const KIND_NOTES: readonly GraphNote[] = Object.freeze([
  new GraphNote(
    'Trigger',
    'Not a question. An outside need or event that must happen before the gated '
    + 'question is worth answering.',
  ),
]);

/** The relations drawn as arrows. */
export const RELATION_NOTES: readonly GraphNote[] = Object.freeze([
  new GraphNote(
    'Requires',
    'The question at the tail must be answered before the one at the head can be.',
  ),
  new GraphNote(
    'Implies',
    'Choosing that alternative makes the question at the head live, or reshapes it.',
  ),
  new GraphNote(
    'GatedBy',
    'A trigger holds this question back until it occurs.',
  ),
]);

function saysOf(notes: readonly GraphNote[], name: string | undefined): string {
  if (name === undefined || name === '') {
    return '';
  }
  return notes.find((note) => note.name === name)?.says ?? '';
}

/** What this effective status means for the owner, or '' for a status this
 *  module has no sentence for. */
export function statusSays(status: string | undefined): string {
  return saysOf(STATUS_NOTES, status);
}

/** What this node kind means, for a kind that carries no status of its own. */
export function kindSays(kind: string | undefined): string {
  return saysOf(KIND_NOTES, kind);
}

/** What this relation means for the owner, or '' for one this module has no
 *  sentence for — an architecture lens draws relations this decision-graph
 *  vocabulary says nothing about, and a window must not invent a gloss. */
export function relationSays(relation: string | undefined): string {
  return saysOf(RELATION_NOTES, relation);
}

/** One heading of the in-app help, with its paragraphs. */
export class HelpSection {
  constructor(
    readonly title: string,
    readonly lines: readonly string[],
  ) {}
}

/** What the help panel is called, on the row that opens it and on the panel. */
export const HOW_TO_READ_TITLE = 'How to read this graph';

/**
 * The help the reader can reach without leaving the app (owner's ask 2).
 *
 * It describes what this window actually does, and only that: a box's drawn
 * lines are the lines the host drew, "answerable now" is the emitted row's own
 * flag, and the two ways to answer are the two gestures the window offers.
 * Every sentence is checkable against the code beside it.
 */
export const HOW_TO_READ: readonly HelpSection[] = Object.freeze([
  new HelpSection('What a box is', [
    'A box is one question: a decision you still hold, or one already ruled and '
    + 'kept as an anchor the open ones hang from.',
    'Its first line is the identifier this graph is keyed by, with its matrix row '
    + 'in brackets. The second is the class name that declares it. The lines under '
    + 'that are the alternatives it offers, one each.',
    'A star marks the alternative the recorded evidence leans to, or the one you '
    + 'directed. Being listed is not being chosen, and a star is evidence, never '
    + 'an answer.',
    'The fill colour is the status and nothing else. Each status is a row of this '
    + 'legend, with what it means for you.',
  ]),
  new HelpSection('What "answerable now" means', [
    'A box is lit — ringed and brighter — when this stream\'s decide-now list says '
    + 'it is answerable now: no question it requires is still open, no trigger still '
    + 'gates it, and no ruling has settled it already.',
    'The window works none of that out. It reads the row Gyld emitted and joins it '
    + 'to the box by qualified slot, so a box this stream lists no row for is marked '
    + 'as neither answerable nor blocked.',
    '"Next up only" in the chrome dims every box that is not lit. It always dims and '
    + 'never hides, so nothing leaves the picture.',
  ]),
  new HelpSection('How to answer one', [
    'Hover a lit box, or right-click it, and press Answer. The decide window opens '
    + 'on that question, wired to this browser, with the alternatives it offers.',
    'A stream takes one ruling per link: where this stream has already ruled, the '
    + 'card says so and offers to link a new stream for the next ruling.',
    '"Ask a follow-up" opens the same window on a NEW question, with this one ticked '
    + 'as a prerequisite.',
  ]),
  new HelpSection('How to ask the agent', [
    'Right-click a box and press "Ask about this". The ask window opens on that '
    + 'record, with its context composed and its citations resolvable.',
    'What the agent drafts is a draft. It becomes a ruling only when you take it '
    + 'into the decide window and submit it.',
  ]),
  new HelpSection('What this legend does', [
    'Click a row to flash every box or arrow of that class in the picture for a '
    + 'moment. Click it again to flash them again.',
    'The eye beside a row switches that class off: dimmed, or hidden when "hide '
    + 'instead of dim" below is ticked.',
    'No toggle moves anything. The layout is the emitted layout either way, and '
    + 'everything you switch off is listed under the picture as an omission.',
  ]),
]);
