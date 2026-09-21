import type { GyldOpsResult, GyldOutputRecord, GyldRefusal } from './ops';

// What the desk knows about the last WRITE, and the one sentence it says.
//
// The defect this answers: the result line said "Saved to <path>. Not
// committed." the moment the supplier took the press. A streamed `answer` is
// accepted and THEN run, so at that moment Gyld has not seen the text — and a
// notebook Gyld went on to reject was announced as saved, put back behind the
// reader's back, and never mentioned again.
//
// So the line follows the RUN. Three states and no more: the write is being
// checked, the write is saved, the write was refused. Every one of them is read
// off the supplier's own words — the accept, and the run's terminal record on
// `gyld.output` — and none of them is a reading of stdout.
//
// Pure: a test asks it without a desk, without a window and without a wire.

/** The sentence the supplier's contract puts under a saved notebook. It writes
 *  files and never runs git, so a notebook it names is always one the owner
 *  still has to commit. */
const NOT_COMMITTED = 'Not committed.';

/**
 * One of the three things a write can be, as a VALUE.
 *
 * A value object and not a string, so no caller branches on spelling
 * (`AGENTS.md`; the same rule `AskPhase` follows). `says` is the line to draw
 * and `working` is whether the run is still going, which is all a window needs.
 */
export class WriteOutcome {
  private constructor(
    readonly name: string,
    readonly says: string,
    readonly working: boolean,
  ) {}

  /** Accepted, and the run has not closed yet: Gyld has still to see the text. */
  static checking(): WriteOutcome {
    return new WriteOutcome('checking', 'Checking with Gyld…', true);
  }

  /** The run named the notebook it left, which is the only word for "saved". */
  static saved(overlayFile: string): WriteOutcome {
    return new WriteOutcome('saved', `Saved to ${overlayFile}. ${NOT_COMMITTED}`, false);
  }

  /**
   * Gyld rejected the write. The reason is Gyld's own, and what became of the
   * notebook is said too, because that is the reader's next question.
   *
   * Three tails, one per state the supplier reports: the notebook is back, there
   * was no notebook (a `rebuild` writes none), or putting it back FAILED — which
   * is the one case the reader has to act on, so it never reads like the first.
   */
  static refused(refusal: GyldRefusal): WriteOutcome {
    const said = `Refused: ${refusal.message} (${refusal.code}).`;
    return new WriteOutcome('refused', `${said}${tail(refusal)}`, false);
  }
}

/** What became of the notebook, as a clause or as nothing. */
function tail(refusal: GyldRefusal): string {
  if (refusal.restored) {
    return ' Your notebook was not changed.';
  }
  if (refusal.stream === undefined || refusal.stream === '') {
    return '';
  }
  return ` Your notebook ${refusal.stream} could NOT be put back — check it.`;
}

/**
 * What the desk may say about the last write, or nothing.
 *
 * `undefined` is a real answer and the common one: a `list` says nothing about a
 * notebook, a `rebuild` that worked is described by its build line, and a verb
 * refused before it ran is already named by the head line and its error.
 */
export function writeOutcome(
  result: GyldOpsResult | null | undefined,
  records: readonly GyldOutputRecord[],
): WriteOutcome | undefined {
  if (result === null || result === undefined) {
    return undefined;
  }
  const { response } = result;
  // A STREAMED run: the accept knows nothing yet, whatever it carries. The
  // accept's own `overlay_file` is deliberately not read here — the file is
  // written, but written is not checked.
  if (response.ok && response.done === false) {
    const end = terminalOf(records, response.run_id ?? '');
    if (end === undefined) {
      return WriteOutcome.checking();
    }
    if (end.refusal !== undefined) {
      return WriteOutcome.refused(end.refusal);
    }
    return end.overlay_file === undefined
      ? undefined
      : WriteOutcome.saved(end.overlay_file);
  }
  // A SYNCHRONOUS run: the answer is the whole outcome, and its validation
  // document is Gyld's own reason (`GyldGrythPlugins.md` 4.7).
  if (!response.ok) {
    return refusalOf(response.validation) === undefined
      ? undefined
      : WriteOutcome.refused(refusalOf(response.validation) as GyldRefusal);
  }
  return response.overlay_file === undefined
    ? undefined
    : WriteOutcome.saved(response.overlay_file);
}

/** The terminal record of THIS run, if the fold has it yet. */
function terminalOf(
  records: readonly GyldOutputRecord[],
  runId: string,
): GyldOutputRecord | undefined {
  if (runId === '') {
    return undefined;
  }
  return records.find((record) => record.run_id === runId && record.done === true);
}

/**
 * A refusal read off a validation document.
 *
 * It says nothing about the notebook, because the document does not: the
 * synchronous answer carries Gyld's finding and not the supplier's account of
 * what it put back. A document with no code is no reason, and reads as none.
 */
function refusalOf(
  validation: Record<string, unknown> | undefined,
): GyldRefusal | undefined {
  if (validation === undefined) {
    return undefined;
  }
  const code = validation.code;
  const message = validation.message;
  if (typeof code !== 'string' || typeof message !== 'string') {
    return undefined;
  }
  return {
    stream: '', code, message, restored: false,
  };
}
