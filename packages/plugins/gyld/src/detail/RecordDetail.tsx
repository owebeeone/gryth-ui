import { useGrip } from '@owebeeone/grip-react';
import type { ToolViewProps } from '@grythjs/plugin-api';
import type { ProjectionAssertion } from '../contract';
import {
  GYLD_BUNDLE, GYLD_DEST_PERSPECTIVE, GYLD_DEST_REF, GYLD_DEST_STREAM,
  GYLD_RECORD, GYLD_RECORDS,
} from '../grips';
import { useBrowserFocus } from '../browser/useBrowserFocus';
import type { GyldRecordView, GyldRecords } from '../records/records';
import type { GyldBundle } from '../store/state';

// The gyld.detail window (step 1.5): one record, as the bundle emitted it.
//
// EVERY line below comes out of `Gyld.Record`, which is the index over the
// emitted projection plus the emitted decide-now row, or out of the bundle's
// own stream record. Nothing is folded: the status and the tier are the
// capture host's answers read whole, the relations are the emitted assertions
// with the emitted references, and a field no bundle carries is written down
// as not emitted rather than left blank or computed from something else.

/** What no bundle emits for a record yet, said once so every reader sees the
 *  same list rather than wondering why a field is missing. */
const NOT_EMITTED = [
  'classification: not emitted in gyld.projection.v1, which carries it on lens '
  + 'nodes only, so this window shows none',
  'obligations: not emitted by any bundle yet, so the obligations half of '
  + 'gyld.inspect-record.v1 is absent here',
  'the snapshot context and history blocks of gyld.inspect-record.v1 are not '
  + 'emitted, so this view is composed by indexing',
];

function Absent({ view, stream, bundle }: {
  view: GyldRecordView | undefined;
  stream: string;
  bundle: GyldBundle | undefined;
}) {
  const status = view?.status ?? 'unset';
  const reason: Record<string, string> = {
    unset: 'no record on this window yet',
    loading: 'reading the bundle this record lives in',
    absent: 'this stream carries no such record',
    invalid: 'the bundle this record lives in did not read',
  };
  return (
    <div className="gyld-detail gyld-detail-empty">
      <p className="gyld-note">{reason[status] ?? status}</p>
      {view?.ref !== undefined && view.ref !== '' && (
        <p className="gyld-note">{`asked for ${view.ref} in stream ${stream}`}</p>
      )}
      {view?.fault !== undefined && (
        <p className="gyld-fault">{view.fault.message}</p>
      )}
      {bundle !== undefined && bundle.status !== 'ok' && (
        <p className="gyld-note">{`bundle ${bundle.status}`}</p>
      )}
      {(bundle?.faults ?? []).map((fault) => (
        <p key={fault.path} className="gyld-fault">{`${fault.path}: ${fault.message}`}</p>
      ))}
    </div>
  );
}

/** One connected record, as a button that moves the browser to it. */
function Connected({ records, occurrence, onOpen }: {
  records: GyldRecords | undefined;
  occurrence: string;
  onOpen: (slot: string) => void;
}) {
  const record = records?.occurrences.get(occurrence);
  if (record === undefined) {
    return (
      <span className="gyld-unresolved" title="this projection does not carry that occurrence">
        {`${occurrence} (not in this projection)`}
      </span>
    );
  }
  const slot = record.source.qualified_slot;
  return (
    <button
      type="button"
      className="gyld-open-record"
      data-slot={slot}
      title={slot}
      onClick={() => onOpen(slot)}
    >
      {record.label}
    </button>
  );
}

function Relation({ assertion, records, onOpen }: {
  assertion: ProjectionAssertion;
  records: GyldRecords | undefined;
  onOpen: (slot: string) => void;
}) {
  const definition = records?.definitions.get(assertion.relation);
  return (
    <li className="gyld-relation" data-relation={definition?.label ?? assertion.relation}>
      <div className="gyld-relation-head">
        <span className="gyld-relation-name">{definition?.label ?? assertion.relation}</span>
        <code>{assertion.source.qualified_slot}</code>
        <span className="gyld-note">{assertion.mode}</span>
      </div>
      <div className="gyld-relation-role">
        <span className="gyld-role-name">owner</span>
        <Connected records={records} occurrence={assertion.owner.occurrence} onOpen={onOpen} />
      </div>
      {Object.entries(assertion.roles).map(([role, value]) => (
        <div key={role} className="gyld-relation-role">
          <span className="gyld-role-name">{role}</span>
          <span className="gyld-note">{value.state}</span>
          {value.refs.map((ref) => (
            <Connected
              key={ref.occurrence}
              records={records}
              occurrence={ref.occurrence}
              onOpen={onOpen}
            />
          ))}
        </div>
      ))}
    </li>
  );
}

export function RecordDetail({ params }: ToolViewProps) {
  const view = useGrip(GYLD_RECORD);
  const records = useGrip(GYLD_RECORDS);
  const bundle = useGrip(GYLD_BUNDLE);
  const stream = useGrip(GYLD_DEST_STREAM) ?? '';
  const perspective = useGrip(GYLD_DEST_PERSPECTIVE) ?? '';
  const ref = useGrip(GYLD_DEST_REF) ?? '';
  const browser = useBrowserFocus();

  if (view?.status !== 'ok') {
    return <Absent view={view} stream={stream} bundle={bundle} />;
  }
  const occurrence = view.occurrence;
  const definitionId = occurrence?.definition ?? view.id;
  const definition = view.definition
    ?? (definitionId === undefined ? undefined : records?.definitions.get(definitionId));
  const source = occurrence?.source ?? view.assertion?.source ?? definition?.source;
  const question = view.question;
  const snapshot = bundle?.record?.snapshot;

  return (
    <div className="gyld-detail">
      <header className="gyld-detail-head">
        <span className="gyld-detail-label">{occurrence?.label ?? definition?.label ?? view.ref}</span>
        <span className="gyld-chip">{view.sort}</span>
        <code className="gyld-detail-slot">{source?.qualified_slot ?? view.ref}</code>
        {browser.wiredTo !== '' && (
          <span className="gyld-chip gyld-chip-wired">{`wired to ${browser.wiredTo}`}</span>
        )}
        {params?.pinned === true && <span className="gyld-chip">pinned</span>}
      </header>

      <dl className="gyld-detail-facts">
        <dt>kind</dt>
        <dd>{definition?.kind ?? 'not emitted'}</dd>
        <dt>definition</dt>
        <dd>{definition?.label ?? 'not emitted'}</dd>
        <dt>description</dt>
        <dd>
          {definition?.description === undefined || definition.description === ''
            ? 'not emitted'
            : definition.description}
        </dd>
        <dt>record id</dt>
        <dd><code>{view.id}</code></dd>
        <dt>declared at</dt>
        <dd>
          <code>
            {source === undefined
              ? 'not emitted'
              : `${source.module}:${source.line ?? 'no line'}`}
          </code>
        </dd>
        <dt>status</dt>
        <dd>
          {question === undefined
            ? 'not emitted: this stream lists no decide-now row for this record'
            : `declared status ${question.declared_status}, `
              + `effective status ${question.effective_status}`}
        </dd>
        <dt>tier</dt>
        <dd>{question === undefined ? 'not emitted' : `tier ${question.tier}`}</dd>
        <dt>answerable now</dt>
        <dd>
          {question === undefined
            ? 'not emitted'
            : `${question.answerable_now ? 'yes' : 'no'}`
              + `${question.blocked_by.length === 0 ? '' : `, blocked by ${question.blocked_by.join(', ')}`}`
              + `${question.gated_by.length === 0 ? '' : `, gated by ${question.gated_by.join(', ')}`}`}
        </dd>
        <dt>lean</dt>
        <dd>
          {question?.preferred === undefined
            ? 'no lean recorded'
            : `prefers ${question.preferred}`}
        </dd>
        <dt>ruling</dt>
        <dd>{question?.ruling === undefined ? 'not emitted' : question.ruling}</dd>
      </dl>

      <section className="gyld-detail-section">
        <h4>{`emitted relations (${(view.assertions ?? []).length})`}</h4>
        <ul className="gyld-relations">
          {(view.assertions ?? []).map((assertion) => (
            <Relation
              key={assertion.id}
              assertion={assertion}
              records={records}
              onOpen={browser.focus}
            />
          ))}
        </ul>
      </section>

      <section className="gyld-detail-section">
        <h4>{`definition closure (${(view.definitionClosure ?? []).length})`}</h4>
        <ul className="gyld-closure">
          {(view.definitionClosure ?? []).map((id) => (
            <li key={id}>
              {records?.definitions.get(id)?.label ?? id}
              <span className="gyld-note">{records?.definitions.get(id)?.kind ?? ''}</span>
            </li>
          ))}
        </ul>
      </section>

      <ul className="gyld-omissions">
        {NOT_EMITTED.map((text) => <li key={text} className="gyld-omission-window">{text}</li>)}
      </ul>

      <footer className="gyld-provenance">
        <span>{`stream ${stream === '' ? 'none' : stream}`}</span>
        <span>
          {perspective === '' ? 'no lens on this window' : `lens ${perspective}`}
        </span>
        <span>
          {snapshot === undefined
            ? 'snapshot not emitted'
            : `${snapshot.lineage} · ${snapshot.revision} · ${snapshot.digest.slice(0, 12)}`}
        </span>
        <span>{`built ${bundle?.record?.built ?? 'not emitted'}`}</span>
        <span>{`ref ${ref === '' ? 'none' : ref}`}</span>
      </footer>
    </div>
  );
}
