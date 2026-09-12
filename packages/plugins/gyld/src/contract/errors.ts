// Named failures for the Gyld artefact contract (spec section 7).
//
// AGENTS.md bans enums and forbids working around that with magic strings or
// other passive tags, so a violation is an OBJECT that owns its code and its
// own message wording. Tests compare instances (err.violation ===
// GyldContractViolation.WrongFormat), never loose text.

export interface ViolationContext {
  /** Where in the envelope the violation is, as a dotted path from the root. */
  readonly path: string;
  /** What the contract requires there, in plain words. */
  readonly expected?: string;
  /** What was actually found, already rendered for a human reader. */
  readonly actual?: string;
}

export class GyldContractViolation {
  private constructor(
    readonly code: string,
    private readonly render: (context: ViolationContext) => string,
  ) {}

  describe(context: ViolationContext): string {
    const tail = context.actual === undefined ? '' : `, found ${context.actual}`;
    return `${this.render(context)} at ${context.path}${tail}`;
  }

  toString(): string {
    return this.code;
  }

  /** The envelope's `format` field is not the string this reader accepts. */
  static readonly WrongFormat = new GyldContractViolation(
    'WRONG_FORMAT',
    (c) => `not a ${c.expected ?? 'known'} envelope`,
  );

  /** A field the contract requires is absent (null and undefined both count). */
  static readonly MissingField = new GyldContractViolation(
    'MISSING_FIELD',
    () => 'required field is absent',
  );

  /** A field is present but carries the wrong JSON kind. */
  static readonly WrongType = new GyldContractViolation(
    'WRONG_TYPE',
    (c) => `expected ${c.expected ?? 'another type'}`,
  );

  /** An id, a qualified slot or another identifying string is empty. */
  static readonly EmptyIdentifier = new GyldContractViolation(
    'EMPTY_IDENTIFIER',
    () => 'identifier must be a non-empty string',
  );

  /** A geometry number is NaN or infinite, so nothing can be drawn from it. */
  static readonly NonFiniteNumber = new GyldContractViolation(
    'NON_FINITE_NUMBER',
    () => 'geometry number must be finite',
  );

  /** A fixed-length tuple (a point, a size, a bounding box) is the wrong length. */
  static readonly WrongTupleLength = new GyldContractViolation(
    'WRONG_TUPLE_LENGTH',
    (c) => `expected ${c.expected ?? 'a fixed-length tuple'}`,
  );

  /** A lens id does not carry the prefix section 7.3 requires. */
  static readonly WrongIdPrefix = new GyldContractViolation(
    'WRONG_ID_PREFIX',
    (c) => `id must start with ${c.expected ?? 'the contract prefix'}`,
  );

  /** A reference points at an id that this envelope does not carry. */
  static readonly DanglingReference = new GyldContractViolation(
    'DANGLING_REFERENCE',
    (c) => `reference does not resolve to ${c.expected ?? 'a record in this envelope'}`,
  );

  /** A declared count disagrees with what the envelope actually carries. */
  static readonly CountMismatch = new GyldContractViolation(
    'COUNT_MISMATCH',
    (c) => `declared count disagrees with the envelope, expected ${c.expected ?? 'the actual length'}`,
  );

  /** A field carries a value outside the closed set the spec writes down. */
  static readonly UnknownValue = new GyldContractViolation(
    'UNKNOWN_VALUE',
    (c) => `value is outside the set the contract defines, expected ${c.expected ?? 'a defined value'}`,
  );
}

export class GyldContractError extends Error {
  constructor(
    readonly violation: GyldContractViolation,
    readonly context: ViolationContext,
  ) {
    super(violation.describe(context));
    this.name = 'GyldContractError';
  }

  get code(): string {
    return this.violation.code;
  }

  get path(): string {
    return this.context.path;
  }
}

export function reject(violation: GyldContractViolation, context: ViolationContext): never {
  throw new GyldContractError(violation, context);
}

/** Failure as data, for callers that render an invalid bundle instead of throwing. */
export type ContractResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: GyldContractError };

export function attempt<T>(read: () => T): ContractResult<T> {
  try {
    return { ok: true, value: read() };
  } catch (err) {
    if (err instanceof GyldContractError) {
      return { ok: false, error: err };
    }
    throw err;
  }
}
