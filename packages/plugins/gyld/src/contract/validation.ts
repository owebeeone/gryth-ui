import {
  atPath, readArray, readBoolean, readEnvelope, readFinite, readIdentifier,
  readObject, readText,
} from './common';

// Spec section 7.5: `validation.json`. The error half has the shape of
// `GyldError.to_dict()` (gyld/src/gyld/model/errors.py), which is
// `{ code, message, details }`; the file adds `location` for the source site.

export const VALIDATION_FORMAT = 'gyld.validation.v1';

export interface ValidationLocation {
  module: string;
  line: number;
}

/** One `GyldError.to_dict()` record: `{ code, message, details }`. */
export interface ValidationFinding {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface GyldValidation {
  format: typeof VALIDATION_FORMAT;
  stream: string;
  built: string;
  ok: boolean;
  /** Present when `ok` is false: the Gyld error code, verbatim. */
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
  location?: ValidationLocation;
  /**
   * Every finding of the capture, empty when the bundle is valid.
   * `emit_decision_streams.validation_document` always writes this list "so a
   * reader has one shape", but spec section 7.5 does not name it, so it is
   * read when present and left absent otherwise rather than invented.
   */
  findings?: ValidationFinding[];
}

function readFinding(value: unknown, path: string): ValidationFinding {
  const raw = readObject(value, path);
  const finding: ValidationFinding = {
    code: readIdentifier(raw.code, atPath(path, 'code')),
    message: readText(raw.message, atPath(path, 'message')),
  };
  if (raw.details !== null && raw.details !== undefined) {
    finding.details = readObject(raw.details, atPath(path, 'details'));
  }
  return finding;
}

/**
 * Read one `validation.json`.
 *
 * The conditional requirement is the one the spec states: when `ok` is false
 * the diagnostic half must be there, because an invalid stream with no code
 * and no message tells the stream manager nothing. When `ok` is true the
 * diagnostic fields are simply not read, and no empty ones are invented.
 * `details` is passed through untouched: its shape is per error code and
 * belongs to Gyld.
 */
export function readValidation(value: unknown): GyldValidation {
  const raw = readEnvelope(value, VALIDATION_FORMAT);
  const path = VALIDATION_FORMAT;
  const result: GyldValidation = {
    format: VALIDATION_FORMAT,
    stream: readIdentifier(raw.stream, atPath(path, 'stream')),
    built: readIdentifier(raw.built, atPath(path, 'built')),
    ok: readBoolean(raw.ok, atPath(path, 'ok')),
  };
  if (raw.findings !== null && raw.findings !== undefined) {
    const findingsPath = atPath(path, 'findings');
    result.findings = readArray(raw.findings, findingsPath).map(
      (item, i) => readFinding(item, atPath(findingsPath, i)),
    );
  }
  if (result.ok) {
    return result;
  }
  result.code = readIdentifier(raw.code, atPath(path, 'code'));
  result.message = readText(raw.message, atPath(path, 'message'));
  if (raw.details !== null && raw.details !== undefined) {
    result.details = readObject(raw.details, atPath(path, 'details'));
  }
  if (raw.location !== null && raw.location !== undefined) {
    const locationPath = atPath(path, 'location');
    const location = readObject(raw.location, locationPath);
    result.location = {
      module: readIdentifier(location.module, atPath(locationPath, 'module')),
      line: readFinite(location.line, atPath(locationPath, 'line')),
    };
  }
  return result;
}
