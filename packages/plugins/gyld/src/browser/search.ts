import type { GyldLens } from '../contract';
import type { GyldRecords } from '../records/records';
import { recordIdOf } from '../lens/scene';
import type { SceneSearch } from '../lens/scene';

// Search, as a PURE projection over emitted strings (spec section 3.5: "filter
// and search over emitted labels, descriptions and attributes" is allowed).
//
// What is matched, and nothing else:
//  - a node's own emitted `slot`, `label` and box `text` lines;
//  - the indexed occurrence's `label` and `source.qualified_slot`, when this
//    destination's projection carries the record the node draws;
//  - an edge's own emitted `slot`, `relation` and `label`.
//
// An edge also counts as a match when BOTH its endpoints matched, because an
// edge between two matched boxes is an emitted assertion between two matched
// records, not an inference. Nothing else is matched: no substring of an id,
// no definition the node does not name, no neighbour of a match.

export interface GyldSearchMatch extends SceneSearch {
  /** How many DRAWN nodes matched, against how many the lens drew. */
  nodes: number;
  drawn: number;
}

export const NO_SEARCH: GyldSearchMatch = Object.freeze({
  query: '', active: false, ids: new Set<string>(), nodes: 0, drawn: 0,
});

function hit(needle: string, ...values: (string | undefined)[]): boolean {
  for (const value of values) {
    if (value !== undefined && value.toLowerCase().includes(needle)) {
      return true;
    }
  }
  return false;
}

export function searchLens(
  lens: GyldLens,
  records: GyldRecords | undefined,
  query: string,
): GyldSearchMatch {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return { ...NO_SEARCH, drawn: lens.nodes.length };
  }
  const ids = new Set<string>();
  for (const node of lens.nodes) {
    const recordId = recordIdOf(node.id);
    const occurrence = recordId === null ? undefined : records?.occurrences.get(recordId);
    if (hit(needle, node.slot, node.label, ...node.text,
      occurrence?.label, occurrence?.source.qualified_slot)) {
      ids.add(node.id);
    }
  }
  const nodes = ids.size;
  for (const edge of lens.edges) {
    if (hit(needle, edge.slot, edge.relation, edge.label)
      || (ids.has(edge.tail) && ids.has(edge.head))) {
      ids.add(edge.id);
    }
  }
  return { query, active: true, ids, nodes, drawn: lens.nodes.length };
}
