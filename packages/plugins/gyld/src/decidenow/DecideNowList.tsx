import { useGrip } from '@owebeeone/grip-react';
import type { DecideNowQuestion, GyldDecideNow, GyldValidation } from '../contract';
import {
  GYLD_BUNDLE, GYLD_DECIDE_NOW, GYLD_DEST_STREAM, GYLD_STORE_STATUS, GYLD_VALIDATION,
} from '../grips';
import { useBrowserFocus } from '../browser/useBrowserFocus';
import { groupQuestions } from './groups';
import type { GyldBundle, GyldValue } from '../store/state';

// The gyld.decidenow window (step 1.5): the stream's emitted decide-now list.
//
// Which questions are answerable now is `answerable_now` as Gyld wrote it,
// what blocks a question is its own `blocked_by`, what gates it is its own
// `gated_by`, and its tier is its own `tier`. None of that is computed here
// (spec section 6.7), and the grouping below is a read of those three emitted
// fields, not a judgement about them. Every emitted row appears in exactly one
// group, including the rows that are in none of the first three, so the list
// is the whole emitted list and not a selection from it.

/** The validation line, honestly: a stream with no validation file says so
 *  rather than passing for valid. */
function validationLine(validation: GyldValue<GyldValidation> | undefined): string {
  if (validation === undefined || validation.status === 'unset') {
    return 'validation not read';
  }
  if (validation.status === 'absent') {
    return 'validation not emitted';
  }
  if (validation.status === 'loading') {
    return 'validation loading';
  }
  if (validation.status === 'invalid' || validation.value === undefined) {
    return `validation file did not read: ${validation.fault?.message ?? 'no reason given'}`;
  }
  const value = validation.value;
  return value.ok
    ? 'validation ok'
    : `validation invalid: ${value.code ?? 'no code'} ${value.message ?? ''}`.trim();
}

function Question({ question, onOpen }: {
  question: DecideNowQuestion;
  onOpen: (slot: string) => void;
}) {
  return (
    <li className="gyld-question" data-slot={question.slot}>
      <button
        type="button"
        className="gyld-question-open"
        title={question.slot}
        onClick={() => onOpen(question.slot)}
      >
        {`${question.label} · ${question.tier}`}
      </button>
      <span className="gyld-note">
        {`declared ${question.declared_status}, effective ${question.effective_status}`}
      </span>
      <span className="gyld-note">
        {question.preferred === undefined
          ? 'no lean recorded'
          : `prefers ${question.preferred}`}
      </span>
      {question.ruling !== undefined && (
        <span className="gyld-note">{`ruled by ${question.ruling}`}</span>
      )}
      <ul className="gyld-question-why">
        {question.blocked_by.map((slot) => (
          <li key={`blocked:${slot}`}>{`blocked by ${slot}`}</li>
        ))}
        {question.gated_by.map((slot) => (
          <li key={`gated:${slot}`}>{`gated by ${slot}`}</li>
        ))}
        {question.induced_by.map((slot) => (
          <li key={`induced:${slot}`}>{`induced by ${slot}`}</li>
        ))}
      </ul>
    </li>
  );
}

/** No list, and why: the diagnosis a reader can act on, never an empty list
 *  that would read as "there is nothing to decide". */
function NoList({ value, stream, bundle }: {
  value: GyldValue<GyldDecideNow> | undefined;
  stream: string;
  bundle: GyldBundle | undefined;
}) {
  const status = value?.status ?? 'unset';
  const reason: Record<string, string> = {
    unset: 'no stream on this window yet',
    loading: 'reading the decide-now file',
    absent: 'this stream emitted no decide-now list',
    invalid: 'the decide-now file did not read',
  };
  const roots = useGrip(GYLD_STORE_STATUS) ?? [];
  return (
    <div className="gyld-decidenow gyld-decidenow-empty">
      <p className="gyld-note">{reason[status] ?? status}</p>
      <p className="gyld-note">
        {`stream ${stream === '' ? 'none' : stream} · bundle ${bundle?.status ?? 'unset'}`}
      </p>
      {value?.fault !== undefined && (
        <p className="gyld-fault">{`${value.fault.path}: ${value.fault.message}`}</p>
      )}
      {(bundle?.faults ?? []).map((fault) => (
        <p key={fault.path} className="gyld-fault">{`${fault.path}: ${fault.message}`}</p>
      ))}
      {roots.map((root) => (
        <p key={root.describe} className="gyld-note">
          {`${root.describe}: ${root.status}`}
          {root.error === undefined ? '' : ` (${root.error})`}
        </p>
      ))}
    </div>
  );
}

export function DecideNowList() {
  const value = useGrip(GYLD_DECIDE_NOW);
  const bundle = useGrip(GYLD_BUNDLE);
  const validation = useGrip(GYLD_VALIDATION);
  const stream = useGrip(GYLD_DEST_STREAM) ?? '';
  const browser = useBrowserFocus();

  if (value?.status !== 'ok' || value.value === undefined) {
    return <NoList value={value} stream={stream} bundle={bundle} />;
  }
  const decideNow = value.value;
  const groups = groupQuestions(decideNow);

  return (
    <div className="gyld-decidenow">
      <header className="gyld-decidenow-head">
        <span className="gyld-detail-label">{`stream ${decideNow.stream}`}</span>
        <span className="gyld-note">{`built ${bundle?.record?.built ?? 'not emitted'}`}</span>
        <span className="gyld-note">{validationLine(validation)}</span>
        <span className="gyld-note">{`${decideNow.questions.length} emitted rows`}</span>
        {browser.wiredTo !== '' && (
          <span className="gyld-chip gyld-chip-wired">{`wired to ${browser.wiredTo}`}</span>
        )}
      </header>
      <ul className="gyld-omissions">
        {decideNow.limits.map((limit) => (
          <li key={limit}>{limit}</li>
        ))}
      </ul>
      {groups.map((group) => (
        <section key={group.key} className="gyld-decidenow-group" data-group={group.key}>
          <h4>{`${group.title} (${group.questions.length})`}</h4>
          <ul className="gyld-questions">
            {group.questions.map((question) => (
              <Question key={question.slot} question={question} onOpen={browser.focus} />
            ))}
          </ul>
        </section>
      ))}
      <footer className="gyld-provenance">
        <span>
          {`${decideNow.snapshot.lineage} · ${decideNow.snapshot.revision} `
            + `· ${decideNow.snapshot.digest.slice(0, 12)}`}
        </span>
        <span>{`${decideNow.rulings.length} rulings emitted`}</span>
      </footer>
    </div>
  );
}
