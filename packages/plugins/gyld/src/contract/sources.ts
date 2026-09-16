import {
  atPath, readArray, readBoolean, readCount, readEnvelope, readIdentifier,
  readIdentifiers, readObject, readOptionalIdentifier, readText,
  type QualifiedSlot,
} from './common';
import { GyldContractViolation, reject } from './errors';

// The SOURCE INDEX, `sources.json` (GyldAskAgent.md section 5, step 0.1).
//
// It is the grounding: it maps a source tag to the document, heading and
// passage it names, and it is the ONLY emitted place a QUESTION's own `sources`
// and `matrix` citations appear at all — no bundle carries an `authoring`
// sidecar, so `cited_by` is the citation and not decoration.
//
// Read like every other artefact: nothing is substituted, nothing is repaired,
// and an UNRESOLVED tag is a first-class entry with the emitter's own reason
// rather than a tag quietly missing from `tags`.

export const SOURCES_FORMAT = 'gyld.sources.v1';

/**
 * The workzone the document paths are relative to, as the emitter recorded it.
 *
 * `documents[].path` and `tags[].path` are relative to this, and `name` is the
 * prefix that makes them whole. It is carried, never resolved here: this
 * package reads bundles over HTTP and has no filesystem to resolve against.
 */
export interface SourcesRoot {
  /** The option that named the root on the emitting host's command line. */
  option: string;
  given: string;
  /** The workzone name that prefixes every path below. */
  name: string;
  found: boolean;
}

/** One document the index was pointed at, and what it was keyed on. */
export interface SourceDocument {
  id: string;
  /** Relative to `root`. */
  path: string;
  /** The resolvers this document is indexed with, for example
   *  `table-row-id` and `heading-number`. */
  keys: string[];
  found: boolean;
  /** Lowercase hex sha256 of the document's bytes, when it was found. */
  digest?: string;
  /** Why it was not, when it was not. */
  reason?: string;
}

/** One tag the index resolved to a passage. */
export interface SourceTag {
  tag: string;
  /** The family the tag's SHAPE belongs to (`row-id`, `matrix-row`,
   *  `heading`, `decision-log`, `iroh-mapping`, `requirement`). */
  family: string;
  /** The `id` of the document in `documents` that declares it. */
  document: string;
  /** That document's path, relative to `root`, repeated so one entry is whole. */
  path: string;
  /** WHICH resolver matched it: `table-row-id`, `heading-number` or
   *  `log-prose`. The family is the tag's shape; this is how it was found. */
  resolver: string;
  heading: string;
  /** The inclusive first and last line of the passage, 1-based. */
  lines: [number, number];
  passage: string;
  digest: string;
  /** True when the emitter capped the passage at its length limit, so the
   *  text is a prefix of what the document says. Said, never hidden. */
  truncated: boolean;
}

/** One record's citation of one or more tags, by the field that declared it. */
export interface SourceCitation {
  stream: string;
  slot: QualifiedSlot;
  /** The declaration the tags came from: `sources`, `matrix` or `ruling`. */
  field: string;
  tags: string[];
}

/** One tag this build's index resolved to nothing, with the emitter's reason.
 *  Rendered, never dropped: hiding it would be a window inventing a Gyld fact
 *  by omission (GyldGrythPlugins.md 6.7, MDV-7). */
export interface UnresolvedTag {
  tag: string;
  family: string;
  reason: string;
  /** The qualified slots that cite it. */
  cited_by: QualifiedSlot[];
}

export interface GyldSources {
  format: typeof SOURCES_FORMAT;
  written: string;
  root: SourcesRoot;
  documents: SourceDocument[];
  tags: SourceTag[];
  cited_by: SourceCitation[];
  unresolved: UnresolvedTag[];
}

/** The inclusive line range of a passage: two counts, in order. */
function readLineRange(value: unknown, path: string): [number, number] {
  const items = readArray(value, path);
  if (items.length !== 2) {
    reject(GyldContractViolation.WrongTupleLength, {
      path, expected: 'a line range of 2 numbers', actual: `${items.length}`,
    });
  }
  return [readCount(items[0], atPath(path, 0)), readCount(items[1], atPath(path, 1))];
}

function readRoot(value: unknown, path: string): SourcesRoot {
  const raw = readObject(value, path);
  return {
    option: readIdentifier(raw.option, atPath(path, 'option')),
    given: readIdentifier(raw.given, atPath(path, 'given')),
    name: readIdentifier(raw.name, atPath(path, 'name')),
    found: readBoolean(raw.found, atPath(path, 'found')),
  };
}

function readDocument(value: unknown, path: string): SourceDocument {
  const raw = readObject(value, path);
  const document: SourceDocument = {
    id: readIdentifier(raw.id, atPath(path, 'id')),
    path: readIdentifier(raw.path, atPath(path, 'path')),
    keys: readIdentifiers(raw.keys, atPath(path, 'keys')),
    found: readBoolean(raw.found, atPath(path, 'found')),
  };
  const digest = readOptionalIdentifier(raw.digest, atPath(path, 'digest'));
  if (digest !== undefined) {
    document.digest = digest;
  }
  const reason = readOptionalIdentifier(raw.reason, atPath(path, 'reason'));
  if (reason !== undefined) {
    document.reason = reason;
  }
  return document;
}

function readTag(value: unknown, path: string): SourceTag {
  const raw = readObject(value, path);
  return {
    tag: readIdentifier(raw.tag, atPath(path, 'tag')),
    family: readIdentifier(raw.family, atPath(path, 'family')),
    document: readIdentifier(raw.document, atPath(path, 'document')),
    path: readIdentifier(raw.path, atPath(path, 'path')),
    resolver: readIdentifier(raw.resolver, atPath(path, 'resolver')),
    // A passage under a document's own title legitimately has no heading
    // above it, so this is text that may be empty rather than an identifier.
    heading: readText(raw.heading, atPath(path, 'heading')),
    lines: readLineRange(raw.lines, atPath(path, 'lines')),
    passage: readText(raw.passage, atPath(path, 'passage')),
    digest: readIdentifier(raw.digest, atPath(path, 'digest')),
    // Whether the emitter capped it is the emitter's answer, so a missing
    // flag is a violation rather than a cheerful `false`.
    truncated: readBoolean(raw.truncated, atPath(path, 'truncated')),
  };
}

function readCitation(value: unknown, path: string): SourceCitation {
  const raw = readObject(value, path);
  return {
    stream: readIdentifier(raw.stream, atPath(path, 'stream')),
    slot: readIdentifier(raw.slot, atPath(path, 'slot')),
    field: readIdentifier(raw.field, atPath(path, 'field')),
    tags: readIdentifiers(raw.tags, atPath(path, 'tags')),
  };
}

function readUnresolved(value: unknown, path: string): UnresolvedTag {
  const raw = readObject(value, path);
  return {
    tag: readIdentifier(raw.tag, atPath(path, 'tag')),
    family: readIdentifier(raw.family, atPath(path, 'family')),
    // The emitter's own sentence about why it resolved to nothing. Required:
    // an unresolved tag with no reason would be an omission with no account.
    reason: readIdentifier(raw.reason, atPath(path, 'reason')),
    cited_by: readIdentifiers(raw.cited_by, atPath(path, 'cited_by')),
  };
}

/**
 * Read one `sources.json`.
 *
 * No referential check runs across `cited_by` and `tags`: a citation whose tag
 * is in `unresolved` is exactly the case the file exists to record, and a
 * cross-check would reject the file for saying what it is meant to say.
 */
export function readSources(value: unknown): GyldSources {
  const raw = readEnvelope(value, SOURCES_FORMAT);
  const path = SOURCES_FORMAT;
  const documentsPath = atPath(path, 'documents');
  const tagsPath = atPath(path, 'tags');
  const citedPath = atPath(path, 'cited_by');
  const unresolvedPath = atPath(path, 'unresolved');
  return {
    format: SOURCES_FORMAT,
    written: readIdentifier(raw.written, atPath(path, 'written')),
    root: readRoot(raw.root, atPath(path, 'root')),
    documents: readArray(raw.documents, documentsPath).map(
      (item, i) => readDocument(item, atPath(documentsPath, i)),
    ),
    tags: readArray(raw.tags, tagsPath).map(
      (item, i) => readTag(item, atPath(tagsPath, i)),
    ),
    cited_by: readArray(raw.cited_by, citedPath).map(
      (item, i) => readCitation(item, atPath(citedPath, i)),
    ),
    unresolved: readArray(raw.unresolved, unresolvedPath).map(
      (item, i) => readUnresolved(item, atPath(unresolvedPath, i)),
    ),
  };
}
