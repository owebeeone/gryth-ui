import type { GyldDecideNow, GyldLens } from '../contract';
import type { SceneNextUp } from '../lens/scene';
import type { GyldValue } from '../store/state';

// "Where do I look" — the stream's emitted decide-now list joined to the boxes
// this picture draws, by QUALIFIED SLOT.
//
// It is a JOIN and nothing more. Which questions are answerable now is
// `answerable_now` as Gyld wrote it, and a box's status is its own row's
// `effective_status`; no count here is derived from the graph, which is
// exactly what GyldGrythPlugins.md 3.5 permits ("join geometry to records by
// the emitted ids") and 6.7 forbids going beyond.
//
// A slot is the identity that survives a restream (R1), so the join is on the
// node's emitted `slot` and never on an occurrence id. A drawn box with no row
// joins nothing: it is not a question this stream lists, which is a different
// fact from "not answerable" and is marked as neither.

export interface GyldNextUp extends SceneNextUp {
  /** How many rows the FILE calls answerable now, drawn here or not. */
  rows: number;
  /** How many of them this picture actually draws. */
  count: number;
  /** How many boxes this picture draws at all. */
  drawn: number;
}

export const NO_NEXT_UP: GyldNextUp = Object.freeze({
  listed: false,
  ids: new Set<string>(),
  statuses: new Map<string, string>(),
  rows: 0,
  count: 0,
  drawn: 0,
});

/**
 * The join for one drawn lens, or nothing at all when the stream emitted no
 * decide-now list. `listed` is what tells those two apart, and a window shows
 * no glyph, no count and no filter while it is false.
 */
export function nextUpOf(
  lens: GyldLens,
  decideNow: GyldDecideNow | undefined,
): GyldNextUp {
  if (decideNow === undefined) {
    return { ...NO_NEXT_UP, drawn: lens.nodes.length };
  }
  const bySlot = new Map(decideNow.questions.map((row) => [row.slot, row]));
  const ids = new Set<string>();
  const statuses = new Map<string, string>();
  for (const node of lens.nodes) {
    const row = bySlot.get(node.slot);
    if (row === undefined) {
      continue;
    }
    statuses.set(node.id, row.effective_status);
    if (row.answerable_now) {
      ids.add(node.id);
    }
  }
  return {
    listed: true,
    ids,
    statuses,
    rows: decideNow.questions.filter((row) => row.answerable_now).length,
    count: ids.size,
    drawn: lens.nodes.length,
  };
}

/** The same join, from the grip the browser window resolves. A list that is
 *  still loading, absent or unreadable is no list: the window says so rather
 *  than marking boxes it has no rows for. */
export function nextUpFrom(
  lens: GyldLens,
  value: GyldValue<GyldDecideNow> | undefined,
): GyldNextUp {
  return nextUpOf(lens, value?.status === 'ok' ? value.value : undefined);
}
