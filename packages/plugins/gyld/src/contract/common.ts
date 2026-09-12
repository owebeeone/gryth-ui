import { GyldContractViolation, reject } from './errors';

// Shared readers for the Gyld artefact contract. Every reader is pure, has no
// grip and no DOM, and NEVER substitutes a value: a field that is absent stays
// absent (undefined), and a field that is present but wrong is rejected. The
// UI must not invent a Gyld fact (spec section 6.7), and that rule starts here.

/** A record's stable cross-stream identity, for example
 *  `glade_decisions:GladeDecisions.scope_model` (spec R1, correspondence is
 *  by qualified slot). Checked for shape only, never parsed. */
export type QualifiedSlot = string;

/** The snapshot a bundle was built from (spec sections 4.3 and 7.3).
 *  `digest` is the `checksum` of the `gyld.snapshot.v1` envelope. */
export interface SnapshotRef {
  lineage: string;
  revision: string;
  digest: string;
}

/**
 * The one "checksum matched" operation section 7 actually defines. No format
 * in sections 7.1 to 7.6 carries a checksum over its own bytes, so there is
 * nothing to verify inside a single envelope. What the spec does define is a
 * comparison ACROSS envelopes: a stream's `parent_snapshot` is the digest it
 * was built against, and when the parent's current digest differs the stream
 * manager reports "parent moved since build" (spec section 4.3). This is that
 * comparison, and nothing more: it reports, it does not repair.
 */
export function snapshotRefMatches(a: SnapshotRef, b: SnapshotRef): boolean {
  return a.lineage === b.lineage && a.revision === b.revision && a.digest === b.digest;
}

function at(path: string, key: string | number): string {
  return typeof key === 'number' ? `${path}[${key}]` : `${path}.${key}`;
}

function describe(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `an array of ${value.length}`;
  }
  if (typeof value === 'string') {
    return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}...` : value);
  }
  return `${typeof value} ${String(value)}`;
}

export function readObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || value === undefined) {
    reject(GyldContractViolation.MissingField, { path });
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    reject(GyldContractViolation.WrongType, { path, expected: 'an object', actual: describe(value) });
  }
  return value as Record<string, unknown>;
}

export function readArray(value: unknown, path: string): unknown[] {
  if (value === null || value === undefined) {
    reject(GyldContractViolation.MissingField, { path });
  }
  if (!Array.isArray(value)) {
    reject(GyldContractViolation.WrongType, { path, expected: 'an array', actual: describe(value) });
  }
  return value;
}

/** A string field that may legitimately be empty prose (a ruling's text). */
export function readText(value: unknown, path: string): string {
  if (value === null || value === undefined) {
    reject(GyldContractViolation.MissingField, { path });
  }
  if (typeof value !== 'string') {
    reject(GyldContractViolation.WrongType, { path, expected: 'a string', actual: describe(value) });
  }
  return value;
}

/** An id, a qualified slot, a relation name or any other identifying string. */
export function readIdentifier(value: unknown, path: string): string {
  const text = readText(value, path);
  if (text === '') {
    reject(GyldContractViolation.EmptyIdentifier, { path });
  }
  return text;
}

export function readBoolean(value: unknown, path: string): boolean {
  if (value === null || value === undefined) {
    reject(GyldContractViolation.MissingField, { path });
  }
  if (typeof value !== 'boolean') {
    reject(GyldContractViolation.WrongType, { path, expected: 'a boolean', actual: describe(value) });
  }
  return value;
}

export function readFinite(value: unknown, path: string): number {
  if (value === null || value === undefined) {
    reject(GyldContractViolation.MissingField, { path });
  }
  if (typeof value !== 'number') {
    reject(GyldContractViolation.WrongType, { path, expected: 'a number', actual: describe(value) });
  }
  if (!Number.isFinite(value)) {
    reject(GyldContractViolation.NonFiniteNumber, { path, actual: String(value) });
  }
  return value;
}

/** A count: finite, integral and not negative. */
export function readCount(value: unknown, path: string): number {
  const n = readFinite(value, path);
  if (!Number.isInteger(n) || n < 0) {
    reject(GyldContractViolation.WrongType, { path, expected: 'a count', actual: String(n) });
  }
  return n;
}

function readTuple(value: unknown, path: string, length: number, label: string): number[] {
  const items = readArray(value, path);
  if (items.length !== length) {
    reject(GyldContractViolation.WrongTupleLength, {
      path,
      expected: `${label} of ${length} numbers`,
      actual: `${items.length}`,
    });
  }
  return items.map((item, i) => readFinite(item, at(path, i)));
}

/** A Graphviz point in points, or a size in inches: `[x, y]`. */
export function readPoint(value: unknown, path: string): [number, number] {
  const [x, y] = readTuple(value, path, 2, 'a point');
  return [x, y];
}

/** A Graphviz bounding box: `[x0, y0, x1, y1]`. */
export function readBoundingBox(value: unknown, path: string): [number, number, number, number] {
  const [x0, y0, x1, y1] = readTuple(value, path, 4, 'a bounding box');
  return [x0, y0, x1, y1];
}

export function readIdentifiers(value: unknown, path: string): string[] {
  return readArray(value, path).map((item, i) => readIdentifier(item, at(path, i)));
}

export function readTexts(value: unknown, path: string): string[] {
  return readArray(value, path).map((item, i) => readText(item, at(path, i)));
}

/** Present and a string, or genuinely absent. Never defaulted. */
export function readOptionalIdentifier(value: unknown, path: string): string | undefined {
  return value === null || value === undefined ? undefined : readIdentifier(value, path);
}

export function readOptionalPoint(value: unknown, path: string): [number, number] | undefined {
  return value === null || value === undefined ? undefined : readPoint(value, path);
}

export function readOptionalFinite(value: unknown, path: string): number | undefined {
  return value === null || value === undefined ? undefined : readFinite(value, path);
}

export function readOptionalCount(value: unknown, path: string): number | undefined {
  return value === null || value === undefined ? undefined : readCount(value, path);
}

export function readOptionalIdentifiers(value: unknown, path: string): string[] | undefined {
  return value === null || value === undefined ? undefined : readIdentifiers(value, path);
}

export function readOptionalTexts(value: unknown, path: string): string[] | undefined {
  return value === null || value === undefined ? undefined : readTexts(value, path);
}

/** A value drawn from the closed set the spec writes down in prose. */
export function readOneOf<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
): T {
  const text = readIdentifier(value, path);
  if (!(allowed as readonly string[]).includes(text)) {
    reject(GyldContractViolation.UnknownValue, {
      path,
      expected: allowed.join(' or '),
      actual: JSON.stringify(text),
    });
  }
  return text as T;
}

export function readSnapshotRef(value: unknown, path: string): SnapshotRef {
  const raw = readObject(value, path);
  return {
    lineage: readIdentifier(raw.lineage, at(path, 'lineage')),
    revision: readIdentifier(raw.revision, at(path, 'revision')),
    digest: readIdentifier(raw.digest, at(path, 'digest')),
  };
}

/** The envelope gate: `format` must be exactly the string this reader accepts. */
export function readEnvelope(
  value: unknown,
  format: string,
  path = format,
): Record<string, unknown> {
  const raw = readObject(value, path);
  const found = readIdentifier(raw.format, at(path, 'format'));
  if (found !== format) {
    reject(GyldContractViolation.WrongFormat, {
      path: at(path, 'format'),
      expected: format,
      actual: JSON.stringify(found),
    });
  }
  return raw;
}

export function requirePrefix(id: string, prefix: string, path: string): string {
  if (!id.startsWith(prefix)) {
    reject(GyldContractViolation.WrongIdPrefix, {
      path,
      expected: `"${prefix}"`,
      actual: JSON.stringify(id),
    });
  }
  return id;
}

export function requireKnown(id: string, known: ReadonlySet<string>, what: string, path: string): string {
  if (!known.has(id)) {
    reject(GyldContractViolation.DanglingReference, {
      path,
      expected: what,
      actual: JSON.stringify(id),
    });
  }
  return id;
}

export function requireCount(declared: number, actual: number, path: string): number {
  if (declared !== actual) {
    reject(GyldContractViolation.CountMismatch, {
      path,
      expected: String(actual),
      actual: String(declared),
    });
  }
  return declared;
}

export { at as atPath };
