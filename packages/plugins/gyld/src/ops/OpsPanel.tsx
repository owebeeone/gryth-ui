import { useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import {
  GYLD_OPS_RESULT, GYLD_OPS_STREAM, GYLD_SET, GYLD_SET_TAP,
} from '../grips';
import type { GyldSet } from '../store/state';
import { buildUrl, retargetToBuild } from './submit';

// What came back, and what is still coming (step 4.4).
//
// Every fact drawn here is on the answer or on the log. The panel never
// decides that a run worked, never parses stdout for a meaning, and never
// invents a build directory: `ok` is the supplier's, the exit code is the
// run's, the lines are the ones the log folded, in the order it folded them.
//
// One panel, shared by the windows that submit, because the supplier is one
// and a run is one: a rebuild started from the stream manager is the same run
// the decide window is watching.

/** The last answer, by verb, with the reason when it was refused. */
function Answer() {
  const result = useGrip(GYLD_OPS_RESULT);
  const set = useGrip(GYLD_SET);
  const setTap = useGrip(GYLD_SET_TAP) as AtomTapHandle<GyldSet> | undefined;
  if (result === null || result === undefined) {
    return <p className="gyld-note">nothing has been submitted from this desk yet</p>;
  }
  const { verb, response } = result;
  const url = buildUrl(response.output_dir);
  return (
    <div className="gyld-ops-answer" data-verb={verb} data-ok={response.ok ? 'ok' : 'failed'}>
      <p className={response.ok ? 'gyld-note' : 'gyld-fault'}>
        {`${verb}: ${response.ok ? 'accepted' : 'refused'}`}
        {response.exit === undefined ? '' : `, exit ${response.exit}`}
        {response.run_id === undefined ? '' : `, run ${response.run_id}`}
        {response.attributed_to === undefined ? '' : `, attributed to ${response.attributed_to}`}
      </p>
      {response.error !== undefined && (
        <p className="gyld-fault gyld-ops-error">{response.error}</p>
      )}
      {response.stderr !== undefined && response.stderr !== '' && (
        <pre className="gyld-ops-stderr">{response.stderr}</pre>
      )}
      {response.stdout !== undefined && response.stdout !== '' && (
        <pre className="gyld-ops-stdout">{response.stdout}</pre>
      )}
      {/* The file the ruling was left in, as the supplier named it. "Not
          committed" is the supplier's contract and not a reading of this
          answer: it writes files and never runs git, so a notebook it names is
          always one the owner still has to commit. */}
      {response.overlay_file !== undefined && (
        <p className="gyld-note gyld-ops-saved">
          {`Saved to ${response.overlay_file}. Not committed.`}
        </p>
      )}
      {response.output_dir !== undefined && (
        <p className="gyld-note gyld-ops-built">
          {`built ${response.output_dir}`}
          {url === undefined
            ? ' (no URL on this origin resolves to it)'
            : (
              <>
                {', served at '}
                <code>{url}</code>
                {' '}
                <button
                  type="button"
                  className="gyld-ops-retarget"
                  disabled={setTap === undefined}
                  title={'read this build as a static root, so every file of it is here, '
                    + 'including the projection and the validation no share carries. '
                    + 'This path is grazel\'s, so it loads where grazel serves this page '
                    + 'or proxies to it'}
                  onClick={() => setTap?.update(
                    (held) => retargetToBuild(held, response.output_dir).set,
                  )}
                >
                  Read this build
                </button>
              </>
            )}
        </p>
      )}
      {set !== undefined && set.roots.length === 0 && (
        <p className="gyld-note">this desk has no root to read the result from</p>
      )}
    </div>
  );
}

/** The run's lines as the log folded them. An absent line is an absent line. */
function Output() {
  const records = useGrip(GYLD_OPS_STREAM) ?? [];
  if (records.length === 0) {
    return null;
  }
  return (
    <ol className="gyld-ops-output">
      {records.map((record) => (
        <li
          key={`${record.run_id}-${record.seq}`}
          className="gyld-ops-line"
          data-stream={record.stream}
        >
          {record.stream === 'end'
            ? `end, exit ${record.exit ?? 'not emitted'}`
            : record.line ?? ''}
        </li>
      ))}
    </ol>
  );
}

/** The panel a submitting window puts under its form. */
export function OpsPanel({ title }: { title?: string }) {
  return (
    <section className="gyld-ops-panel">
      <h4>{title ?? 'The supplier'}</h4>
      <Answer />
      <Output />
    </section>
  );
}
