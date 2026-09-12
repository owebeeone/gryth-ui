import type { Grip } from '@owebeeone/grip-react';
import type { AtomTapHandle } from '@owebeeone/grip-react';
import type { GyldLens } from '../contract';
import { GYLD_DEST_LEFT, GYLD_DEST_LEFT_TAP, GYLD_DEST_RIGHT, GYLD_DEST_RIGHT_TAP } from '../grips';
import type { SceneSearch } from '../lens/scene';

// The two panes of the diff window, and the one thing that relates them.
//
// A pane is an OBJECT, not the string 'left' or 'right' passed around
// (AGENTS.md, "no magic strings when the concept has semantics"): it owns
// which destination grip it reads, which handle a picker writes, what it is
// called and which side of the emitted diff document is its own. The window
// then maps over two panes instead of branching on a side at every point.

export class DiffPane {
  private constructor(
    /** The key of this pane's child context, and its data attribute. */
    readonly name: string,
    readonly title: string,
    /** The per-tab atom that names this pane's stream. */
    readonly dest: Grip<string>,
    readonly destTap: Grip<AtomTapHandle<string>>,
  ) {}

  static readonly LEFT = new DiffPane('left', 'Left', GYLD_DEST_LEFT, GYLD_DEST_LEFT_TAP);
  static readonly RIGHT = new DiffPane('right', 'Right', GYLD_DEST_RIGHT, GYLD_DEST_RIGHT_TAP);

  /** The key of this pane's child context under one tab. */
  contextKey(tabId: string): string {
    return `gyld-diff:${tabId}:${this.name}`;
  }
}

export const DIFF_PANES: readonly DiffPane[] = Object.freeze([DiffPane.LEFT, DiffPane.RIGHT]);

/**
 * The CORRESPONDENCE, and the whole of it: one qualified slot.
 *
 * Spec R1 and the diff document's own `correspondence: "qualified_slot"` say
 * the same thing, and the reason is verified: occurrence and assertion ids are
 * minted per stream and not one of the base's survives into a stream over it,
 * while an inherited member keeps its declaring slot. So the only thing that
 * means "the same record" across two pictures is the slot, and this file knows
 * no other rule: nothing is matched by id, by label, by position or by
 * neighbourhood.
 */
export const CORRESPONDENCE_FIELD = 'slot';

/**
 * What one pane draws highlighted when `slot` is the record in hand.
 *
 * The result is the shape the lens view already highlights with, so the two
 * pictures light up the same record the same way the search box does. A slot
 * this picture does not draw highlights NOTHING here: the record is absent
 * from this side, which the added and removed lists say in words, and lighting
 * up a neighbour instead would be inventing a correspondence.
 */
export function correspondenceHighlight(
  lens: GyldLens | undefined,
  slot: string,
): SceneSearch | undefined {
  if (lens === undefined || slot === '') {
    return undefined;
  }
  const ids = new Set<string>();
  for (const node of lens.nodes) {
    if (node.slot === slot) {
      ids.add(node.id);
    }
  }
  for (const edge of lens.edges) {
    if (edge.slot === slot) {
      ids.add(edge.id);
    }
  }
  // `query` is what the omission strip says the picture is showing less of.
  // Here that is the corresponding record, named by its slot.
  return { active: true, ids, query: slot };
}

/** Whether this pane's picture draws the record `slot` names at all, so the
 *  window can say "not in this stream" rather than leaving a blank. */
export function drawsSlot(lens: GyldLens | undefined, slot: string): boolean {
  if (lens === undefined || slot === '') {
    return false;
  }
  return lens.nodes.some((node) => node.slot === slot)
    || lens.edges.some((edge) => edge.slot === slot);
}
