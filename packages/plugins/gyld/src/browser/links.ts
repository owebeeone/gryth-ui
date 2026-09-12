import type { ToolLink } from '@grythjs/plugin-api';
import type { GyldLens } from '../contract';
import { NO_FOCUS, type GyldFocus } from '../focus';
import { toggleSelected, type GyldSelection } from '../lens/camera';
import { slotOf } from '../lens/scene';
import { PreviewPerspective } from '../preview/neighbourhood';
import { GYLD_BROWSER_TOOL } from '../tools';
import { emittedMemberFor, type PerspectiveOption } from './perspectives';

// The links a browser window writes, as PURE functions. A link is the
// serializable bundle that locates a view (GrythPluginContract.md); building
// one is arithmetic over strings, so it is tested without a desktop.

/** The parameterised family spec section 5.1 reserves for a drill-in. */
export const NEIGHBOURHOOD_PERSPECTIVE = PreviewPerspective.FAMILY;

export interface BrowserTarget {
  stream: string;
  perspective: string;
  focus: string;
  /** The question the new window lays a preview out for, when it opens on one
   *  rather than on emitted geometry. */
  preview?: string;
}

export function browserLink(target: BrowserTarget): ToolLink {
  return {
    toolId: GYLD_BROWSER_TOOL,
    params: {
      stream: target.stream,
      perspective: target.perspective,
      focus: target.focus,
      preview: target.preview ?? '',
    },
  };
}

/**
 * Drill-in (MDV-6): a NEW window seeded with the selected record, the parent
 * window untouched.
 *
 * Three outcomes, in order of how much of the picture Gyld emitted:
 *
 * 1. The stream emitted a member of the `neighbourhood` family FOR THIS
 *    question. The window opens on it, and the geometry is pinned Gyld
 *    geometry. A preview never replaces an emitted member.
 * 2. It did not, but it emitted the `decisions` lens the members are
 *    restricted out of. The window opens on THAT lens with a preview of this
 *    question, which the browser lays out from its records.
 * 3. It emitted neither. The window opens on the SAME perspective with the
 *    focus set, and the emitted geometry there dims to the focus record and
 *    its emitted neighbours. That is a window-level omission, said as one in
 *    the omission strip; it is not a neighbourhood lens and is never labelled
 *    as one.
 */
export function neighbourhoodLink(
  target: BrowserTarget & { options: readonly PerspectiveOption[] },
): ToolLink {
  const member = emittedMemberFor(target.options, target.focus);
  if (member !== undefined) {
    return browserLink({
      stream: target.stream, perspective: member.perspective, focus: target.focus,
    });
  }
  const source = target.options.find(
    (option) => option.emitted && option.perspective === PreviewPerspective.SOURCE,
  );
  if (source === undefined || target.focus === '') {
    return browserLink({
      stream: target.stream, perspective: target.perspective, focus: target.focus,
    });
  }
  return browserLink({
    stream: target.stream,
    perspective: PreviewPerspective.SOURCE,
    focus: target.focus,
    preview: target.focus,
  });
}

/** The params a `gyld.detail` or `gyld.decidenow` window opens standalone on. */
export function recordParams(stream: string, ref: string): Record<string, unknown> {
  return { stream, ref };
}

export function streamParams(stream: string): Record<string, unknown> {
  return { stream };
}

/**
 * The params a `gyld.decide` window opens standalone on. Spec section 2 spells
 * the record `question` there, where `gyld.detail` spells it `ref` and the
 * browser spells it `focus`; `decideTabTaps` reads all three into the one
 * destination grip, and this helper writes the spelling that section names.
 */
export function questionParams(stream: string, question: string): Record<string, unknown> {
  return { stream, question };
}

/** What a Decide button will do, said before it is pressed: a window wired to a
 *  browser answers in the decide window wired to that same browser, and a
 *  standalone one opens a decide window of its own on this stream and this
 *  question. Here rather than in a view because both views say it. */
export function decideTitle(wiredTo: string): string {
  return wiredTo === ''
    ? 'answer this question in a decide window of its own'
    : `answer this question in the decide window wired to ${wiredTo}`;
}

/**
 * What one click on the picture changes. Three writes, one rule: the selection
 * is the window's own, the ref is the record this window is ON (what a wired
 * detail sink resolves), and the focus is the same record for every gyld
 * window that follows it (MDV-5).
 *
 * A pick that DESELECTS clears the ref and the focus rather than leaving a
 * stale record behind, and a lens id with no emitted slot leaves them empty:
 * the slot is the identity that survives a restream, and this package will not
 * put an occurrence id where a slot belongs.
 */
export interface PickOutcome {
  selection: GyldSelection;
  ref: string;
  focus: GyldFocus;
}

/**
 * What this window has selected, as a PROJECTION rather than as a write.
 *
 * A window opened on a focus record has that record in its seeded ref and
 * nothing in its selection yet. Rather than writing a selection at mount (an
 * effect, which this repository bans, and a write nobody asked for), the
 * selection the picture is drawn with is the window's own when it has one and
 * the seeded record otherwise. Nothing is invented: a ref that names no drawn
 * box selects nothing, and the omission strip still says what is dimmed.
 */
export function effectiveSelection(
  lens: GyldLens,
  selection: GyldSelection,
  ref: string,
): GyldSelection {
  if (selection.ids.length > 0 || ref === '') {
    return selection;
  }
  const node = lens.nodes.find((entry) => entry.slot === ref);
  if (node !== undefined) {
    return { ids: [node.id] };
  }
  const edge = lens.edges.find((entry) => entry.slot === ref);
  return edge === undefined ? selection : { ids: [edge.id] };
}

export function pickOutcome(
  lens: GyldLens,
  held: GyldSelection,
  stream: string,
  lensId: string,
  additive: boolean,
): PickOutcome {
  const selection = lensId === '' ? { ids: [] } : toggleSelected(held, lensId, additive);
  const last = selection.ids[selection.ids.length - 1];
  const ref = last === undefined ? null : slotOf(lens, last);
  if (ref === null || ref === '') {
    return { selection, ref: '', focus: NO_FOCUS };
  }
  return { selection, ref, focus: { stream, ref } };
}
