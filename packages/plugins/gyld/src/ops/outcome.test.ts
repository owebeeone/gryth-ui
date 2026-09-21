import { describe, it, expect } from 'vitest';
import type { GyldOpsResult, GyldOutputRecord } from './ops';
import { WriteOutcome, writeOutcome } from './outcome';

// The three things the desk may know about a write, and the sentence for each.
//
// The defect: the desk said "Saved to <path>. Not committed." the moment the
// supplier took the press — which is BEFORE Gyld has seen the text, because a
// streamed answer is accepted and then run. A notebook Gyld went on to reject
// was announced as saved and then put back, and the reader was never told.

/** The accept a streamed writing verb answers with: ok, and not done. */
const ACCEPTED: GyldOpsResult = {
  verb: 'answer',
  response: { ok: true, run_id: 'run-3', done: false },
};

/** One record on the run's log. */
function on(seq: number, rest: Partial<GyldOutputRecord>): GyldOutputRecord {
  return { run_id: 'run-3', seq, stream: 'stdout', ...rest };
}

const NOTEBOOK = '/glade-wz/decisions/glade-decisions-stream-a.gyld.py';

describe('a streamed write the supplier has accepted', () => {
  it('is still being checked until the run closes', () => {
    expect(writeOutcome(ACCEPTED, [])?.says).toBe('Checking with Gyld…');
    // Lines arriving are not an outcome: only the terminal record is.
    const outcome = writeOutcome(ACCEPTED, [on(1, { line: 'capturing base' })]);
    expect(outcome?.says).toBe('Checking with Gyld…');
    expect(outcome?.working).toBe(true);
  });

  it('is saved once the terminal record names the notebook, and not before', () => {
    const records = [
      on(1, { line: 'capturing base' }),
      on(2, { stream: 'end', done: true, exit: 0, overlay_file: NOTEBOOK }),
    ];
    const outcome = writeOutcome(ACCEPTED, records);
    expect(outcome?.says).toBe(`Saved to ${NOTEBOOK}. Not committed.`);
    expect(outcome?.working).toBe(false);
  });

  it('is refused by the reason the terminal record carries', () => {
    const records = [on(1, {
      stream: 'end',
      done: true,
      exit: 0,
      refusal: {
        stream: 'stream-a',
        code: 'SELECTION_NOT_OFFERED',
        message: 'version_pin does not offer sdax_rs',
        restored: true,
      },
    })];
    expect(writeOutcome(ACCEPTED, records)?.says).toBe(
      'Refused: version_pin does not offer sdax_rs (SELECTION_NOT_OFFERED).'
      + ' Your notebook was not changed.',
    );
    expect(writeOutcome(ACCEPTED, records)?.working).toBe(false);
  });

  it('reads the record for ITS run and no other', () => {
    const other = [on(1, { run_id: 'run-9', stream: 'end', done: true, overlay_file: NOTEBOOK })];
    expect(writeOutcome(ACCEPTED, other)?.says).toBe('Checking with Gyld…');
  });
});

describe('a refusal with no notebook to put back', () => {
  it('says only what happened, because a rebuild wrote no notebook', () => {
    const records = [on(1, {
      stream: 'end',
      done: true,
      exit: 1,
      refusal: {
        stream: '', code: 'RUN_FAILED', message: 'no such bundle', restored: false,
      },
    })];
    const rebuild: GyldOpsResult = {
      verb: 'rebuild',
      response: { ok: true, run_id: 'run-3', done: false },
    };
    expect(writeOutcome(rebuild, records)?.says).toBe(
      'Refused: no such bundle (RUN_FAILED).',
    );
  });

  it('says so loudly when a notebook there was could NOT be put back', () => {
    const records = [on(1, {
      stream: 'end',
      done: true,
      exit: 1,
      refusal: {
        stream: 'stream-a', code: 'ROLE_TYPE_MISMATCH', message: 'the alternative', restored: false,
      },
    })];
    expect(writeOutcome(ACCEPTED, records)?.says).toBe(
      'Refused: the alternative (ROLE_TYPE_MISMATCH).'
      + ' Your notebook stream-a could NOT be put back — check it.',
    );
  });
});

describe('a run that says nothing about a notebook', () => {
  it('has no line of its own', () => {
    // A rebuild that succeeded: the `built …` line says it, and this does not.
    const done = [on(1, { stream: 'end', done: true, exit: 0 })];
    expect(writeOutcome(ACCEPTED, done)).toBeUndefined();
    expect(writeOutcome(null, [])).toBeUndefined();
    expect(writeOutcome(undefined, [])).toBeUndefined();
  });

  it('never presents the ACCEPT as a saved file', () => {
    // The accept carries `overlay_file` for the readers that have it, and the
    // desk must not draw it: Gyld has not seen the text yet.
    const promised: GyldOpsResult = {
      verb: 'answer',
      response: {
        ok: true, run_id: 'run-3', done: false, overlay_file: NOTEBOOK,
      },
    };
    expect(writeOutcome(promised, [])?.says).toBe('Checking with Gyld…');
  });
});

describe('a synchronous run, which IS its own outcome', () => {
  it('is saved by the answer it came back with', () => {
    const synchronous: GyldOpsResult = {
      verb: 'answer',
      response: {
        ok: true, run_id: 'run-3', exit: 0, overlay_file: NOTEBOOK,
      },
    };
    expect(writeOutcome(synchronous, [])?.says)
      .toBe(`Saved to ${NOTEBOOK}. Not committed.`);
  });

  it('is refused by the validation document the answer carries', () => {
    const refused: GyldOpsResult = {
      verb: 'answer',
      response: {
        ok: false,
        run_id: 'run-3',
        exit: 0,
        error: 'version_pin does not offer sdax_rs',
        validation: {
          format: 'gyld.validation.v1',
          stream: 'stream-a',
          ok: false,
          code: 'SELECTION_NOT_OFFERED',
          message: 'version_pin does not offer sdax_rs',
        },
      },
    };
    expect(writeOutcome(refused, [])?.says).toBe(
      'Refused: version_pin does not offer sdax_rs (SELECTION_NOT_OFFERED).',
    );
  });

  it('leaves a plain failure to the line that already says it', () => {
    const failed: GyldOpsResult = {
      verb: 'answer',
      response: { ok: false, error: 'no bundle has been built yet' },
    };
    expect(writeOutcome(failed, [])).toBeUndefined();
  });
});

describe('the outcome as a value', () => {
  it('is a named value and not a string to branch on', () => {
    expect(WriteOutcome.checking().name).toBe('checking');
    expect(WriteOutcome.saved(NOTEBOOK).name).toBe('saved');
    expect(WriteOutcome.refused({
      stream: 'a', code: 'C', message: 'm', restored: true,
    }).name).toBe('refused');
  });
});
