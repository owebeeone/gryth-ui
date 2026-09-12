import type { GyldRecords } from '../records/records';

// What a record is DECLARED as, out of the emitted projection.
//
// A qualified slot names the member (`glade_decisions:GladeDecisions.version_pin`)
// and not the class, and an overlay is written against the class
// (`Decides[VersionPin]`). The class is emitted: it is the `label` of the
// definition the occurrence points at, and the module it was declared in is
// that definition's own `source.module`. Both are read, never derived: turning
// `version_pin` into `VersionPin` by spelling rules would be inventing a name
// Gyld did not write, and it would be wrong the first time a declaration did
// not follow the rule.

export interface DeclaredSymbol {
  /** The class the record is declared as, for example `VersionPin`. */
  symbol: string;
  /** The module it is declared in, for example `glade_decisions`. */
  module: string;
}

/**
 * The class one qualified slot is declared as, or undefined when this bundle
 * cannot say. Undefined is a rendered state: a stream whose projection was not
 * emitted has no definitions, so the window says the overlay cannot be
 * composed rather than composing one out of a guess.
 */
export function declaredSymbol(
  records: GyldRecords,
  slot: string,
): DeclaredSymbol | undefined {
  const id = records.occurrenceBySlot.get(slot);
  if (id === undefined) {
    return undefined;
  }
  const occurrence = records.occurrences.get(id);
  if (occurrence === undefined) {
    return undefined;
  }
  const definition = records.definitions.get(occurrence.definition);
  if (definition === undefined) {
    return undefined;
  }
  return { symbol: definition.label, module: definition.source.module };
}

/** Every slot's symbol, or the slots that have none. One pass, so a composer
 *  either has all the names it needs or can say exactly which it lacks. */
export function declaredSymbols(
  records: GyldRecords,
  slots: readonly string[],
): { found: DeclaredSymbol[]; missing: string[] } {
  const found: DeclaredSymbol[] = [];
  const missing: string[] = [];
  for (const slot of slots) {
    const declared = declaredSymbol(records, slot);
    if (declared === undefined) {
      missing.push(slot);
    } else {
      found.push(declared);
    }
  }
  return { found, missing };
}
