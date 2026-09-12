import {
  atPath, readArray, readCount, readEnvelope, readIdentifier, readIdentifiers,
  readObject, readOptionalCount, readOptionalIdentifier, readSnapshotRef, readText,
  type QualifiedSlot, type SnapshotRef,
} from './common';

// `gyld.projection.v1`, written by `query.project`. Spec section 7 lists it
// among the formats that exist and do not change, and section 7.7 makes it the
// record source: when a bundle carries no `inspect/<slot>.json`, the UI's
// record view is composed from the projection by INDEXING only.
//
// The reader types what the UI joins on and passes the rest through untouched.
// Untouched means untouched: a pass-through object is data this package does
// not interpret, never a shape it invented.

export const PROJECTION_FORMAT = 'gyld.projection.v1';

/** Where a record was declared. `qualified_slot` is the cross-stream identity
 *  (spec R1) and the join key the lens files carry as `slot`. */
export interface RecordSource {
  module: string;
  text_fingerprint: string;
  qualified_slot: QualifiedSlot;
  line?: number;
  column?: number;
  end_line?: number;
  end_column?: number;
  /** The authoring sidecar: declared properties (a question's `status`, its
   *  matrix row, its sources), bases and overrides, exactly as captured. */
  authoring?: Record<string, unknown>;
}

export interface ProjectionOccurrence {
  id: string;
  definition: string;
  label: string;
  source: RecordSource;
  /** The owning occurrence in the parent chain; absent at the root. */
  parent?: string;
}

/** One reference inside an assertion role. Every emitted ref names an
 *  occurrence; a ref of another sort would be rejected rather than dropped. */
export interface AssertionRef {
  occurrence: string;
}

export interface AssertionRole {
  state: string;
  refs: AssertionRef[];
}

export interface ProjectionAssertion {
  id: string;
  /** The relation DEFINITION id. The readable name is that definition's
   *  `label`; nothing here folds one into the other. */
  relation: string;
  owner: AssertionRef;
  /** The declaring slot's definition id. */
  slot: string;
  mode: string;
  roles: Record<string, AssertionRole>;
  source: RecordSource;
  /** Where the assertion entered the snapshot: `{ declaration, source }`. */
  origin?: Record<string, unknown>;
}

export interface ProjectionDefinition {
  kind: string;
  label: string;
  description: string;
  bases: string[];
  source: RecordSource;
  effective_members: string[];
  effective_assertions: string[];
  /** Relation schema, on relation definitions only. Passed through. */
  owner?: Record<string, unknown>;
  roles?: Record<string, unknown>;
}

export interface ProjectionOmissions {
  unknown_ids: string[];
  outside_scope_ids: string[];
  scope_counts: Record<string, number>;
  filter_counts: Record<string, number>;
  page_counts: Record<string, number>;
}

export interface GyldProjection {
  format: typeof PROJECTION_FORMAT;
  snapshot: SnapshotRef;
  structural_status: string;
  occurrences: ProjectionOccurrence[];
  assertions: ProjectionAssertion[];
  definitions: Record<string, ProjectionDefinition>;
  /** Not typed yet: no fixture bundle carries one. Present as data so nothing
   *  is silently dropped; a typed reader lands with the first bundle that has
   *  obligations in it. The same holds for `boundary_stubs`, which only a
   *  PARTIAL projection (a neighbourhood) carries. */
  obligations: Record<string, unknown>[];
  boundary_stubs: Record<string, unknown>[];
  omissions?: ProjectionOmissions;
}

function readSource(value: unknown, path: string): RecordSource {
  const raw = readObject(value, path);
  const source: RecordSource = {
    module: readIdentifier(raw.module, atPath(path, 'module')),
    text_fingerprint: readIdentifier(raw.text_fingerprint, atPath(path, 'text_fingerprint')),
    qualified_slot: readIdentifier(raw.qualified_slot, atPath(path, 'qualified_slot')),
  };
  for (const key of ['line', 'column', 'end_line', 'end_column'] as const) {
    const n = readOptionalCount(raw[key], atPath(path, key));
    if (n !== undefined) {
      source[key] = n;
    }
  }
  if (raw.authoring !== null && raw.authoring !== undefined) {
    source.authoring = readObject(raw.authoring, atPath(path, 'authoring'));
  }
  return source;
}

function readRef(value: unknown, path: string): AssertionRef {
  const raw = readObject(value, path);
  return { occurrence: readIdentifier(raw.occurrence, atPath(path, 'occurrence')) };
}

function readOccurrence(value: unknown, path: string): ProjectionOccurrence {
  const raw = readObject(value, path);
  const occurrence: ProjectionOccurrence = {
    id: readIdentifier(raw.id, atPath(path, 'id')),
    definition: readIdentifier(raw.definition, atPath(path, 'definition')),
    label: readIdentifier(raw.label, atPath(path, 'label')),
    source: readSource(raw.source, atPath(path, 'source')),
  };
  const parent = readOptionalIdentifier(raw.parent, atPath(path, 'parent'));
  if (parent !== undefined) {
    occurrence.parent = parent;
  }
  return occurrence;
}

function readAssertion(value: unknown, path: string): ProjectionAssertion {
  const raw = readObject(value, path);
  const rolesPath = atPath(path, 'roles');
  const rawRoles = readObject(raw.roles, rolesPath);
  const roles: Record<string, AssertionRole> = {};
  for (const name of Object.keys(rawRoles)) {
    const rolePath = atPath(rolesPath, name);
    const role = readObject(rawRoles[name], rolePath);
    const refsPath = atPath(rolePath, 'refs');
    roles[name] = {
      state: readIdentifier(role.state, atPath(rolePath, 'state')),
      refs: readArray(role.refs, refsPath).map((item, i) => readRef(item, atPath(refsPath, i))),
    };
  }
  const assertion: ProjectionAssertion = {
    id: readIdentifier(raw.id, atPath(path, 'id')),
    relation: readIdentifier(raw.relation, atPath(path, 'relation')),
    owner: readRef(raw.owner, atPath(path, 'owner')),
    slot: readIdentifier(raw.slot, atPath(path, 'slot')),
    mode: readIdentifier(raw.mode, atPath(path, 'mode')),
    roles,
    source: readSource(raw.source, atPath(path, 'source')),
  };
  if (raw.origin !== null && raw.origin !== undefined) {
    assertion.origin = readObject(raw.origin, atPath(path, 'origin'));
  }
  return assertion;
}

function readDefinition(value: unknown, path: string): ProjectionDefinition {
  const raw = readObject(value, path);
  const definition: ProjectionDefinition = {
    kind: readIdentifier(raw.kind, atPath(path, 'kind')),
    label: readIdentifier(raw.label, atPath(path, 'label')),
    // Prose. A definition may legitimately carry none, so an empty string is
    // data rather than a violation.
    description: readText(raw.description, atPath(path, 'description')),
    bases: readIdentifiers(raw.bases, atPath(path, 'bases')),
    source: readSource(raw.source, atPath(path, 'source')),
    effective_members: readIdentifiers(raw.effective_members, atPath(path, 'effective_members')),
    effective_assertions: readIdentifiers(
      raw.effective_assertions, atPath(path, 'effective_assertions'),
    ),
  };
  if (raw.owner !== null && raw.owner !== undefined) {
    definition.owner = readObject(raw.owner, atPath(path, 'owner'));
  }
  if (raw.roles !== null && raw.roles !== undefined) {
    definition.roles = readObject(raw.roles, atPath(path, 'roles'));
  }
  return definition;
}

function readCountMap(value: unknown, path: string): Record<string, number> {
  const raw = readObject(value, path);
  const counts: Record<string, number> = {};
  for (const key of Object.keys(raw)) {
    counts[key] = readCount(raw[key], atPath(path, key));
  }
  return counts;
}

function readOmissions(value: unknown, path: string): ProjectionOmissions | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const raw = readObject(value, path);
  return {
    unknown_ids: readIdentifiers(raw.unknown_ids, atPath(path, 'unknown_ids')),
    outside_scope_ids: readIdentifiers(raw.outside_scope_ids, atPath(path, 'outside_scope_ids')),
    scope_counts: readCountMap(raw.scope_counts, atPath(path, 'scope_counts')),
    filter_counts: readCountMap(raw.filter_counts, atPath(path, 'filter_counts')),
    page_counts: readCountMap(raw.page_counts, atPath(path, 'page_counts')),
  };
}

/**
 * Read one `projection.json`.
 *
 * Field shape only. NO referential check runs across the arrays, unlike the
 * lens reader: a projection may legitimately be partial (`query.project` takes
 * a selection, and `structural_status` and `boundary_stubs` say so), and in a
 * partial projection a reference out of the selected closure is expected
 * rather than broken. The index tap reports an unresolved reference as data.
 */
export function readProjection(value: unknown): GyldProjection {
  const raw = readEnvelope(value, PROJECTION_FORMAT);
  const path = PROJECTION_FORMAT;
  const occurrencesPath = atPath(path, 'occurrences');
  const assertionsPath = atPath(path, 'assertions');
  const definitionsPath = atPath(path, 'definitions');
  const obligationsPath = atPath(path, 'obligations');
  const stubsPath = atPath(path, 'boundary_stubs');
  const rawDefinitions = readObject(raw.definitions, definitionsPath);
  const definitions: Record<string, ProjectionDefinition> = {};
  for (const id of Object.keys(rawDefinitions)) {
    definitions[id] = readDefinition(rawDefinitions[id], atPath(definitionsPath, id));
  }
  const projection: GyldProjection = {
    format: PROJECTION_FORMAT,
    snapshot: readSnapshotRef(raw.snapshot, atPath(path, 'snapshot')),
    structural_status: readIdentifier(raw.structural_status, atPath(path, 'structural_status')),
    occurrences: readArray(raw.occurrences, occurrencesPath).map(
      (item, i) => readOccurrence(item, atPath(occurrencesPath, i)),
    ),
    assertions: readArray(raw.assertions, assertionsPath).map(
      (item, i) => readAssertion(item, atPath(assertionsPath, i)),
    ),
    definitions,
    obligations: readArray(raw.obligations ?? [], obligationsPath).map(
      (item, i) => readObject(item, atPath(obligationsPath, i)),
    ),
    boundary_stubs: readArray(raw.boundary_stubs ?? [], stubsPath).map(
      (item, i) => readObject(item, atPath(stubsPath, i)),
    ),
  };
  const omissions = readOmissions(raw.omissions, atPath(path, 'omissions'));
  if (omissions !== undefined) {
    projection.omissions = omissions;
  }
  return projection;
}
