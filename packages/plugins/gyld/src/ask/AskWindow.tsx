import { useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import type { GyldSources } from '../contract';
import {
  GYLD_BUNDLE, GYLD_DECIDE_NOW, GYLD_DEST_PERSPECTIVE, GYLD_DEST_REF, GYLD_DEST_STREAM,
  GYLD_LENS, GYLD_OPS, GYLD_RECORD, GYLD_RECORDS, GYLD_SOURCES,
  GYLD_TAB_ASK_CONVERSATION, GYLD_TAB_ASK_DRAFT, GYLD_TAB_ASK_DRAFT_TAP,
} from '../grips';
import type { GyldValue } from '../store/state';
import { askEnvelope, type GyldAskContext } from './envelope';

// The gyld.ask window (GyldAskAgent.md section 6), at step 0.3: the record it
// is on, the question box, and the exact envelope that WOULD be sent.
//
// NOTHING IS SENT. There is no submit here and no verb behind it: step 0.3's
// whole milestone is that a reader can see the context before any model call
// or API key exists anywhere. The window says that rather than showing a
// button that does nothing.
//
// Every line of the envelope is composed by `askEnvelope()`, a pure function
// over this window's grips, so what is printed here is exactly what a golden
// test asserts. The window itself folds nothing.

/** Why there is no envelope, said in the window's own words. The record is
 *  what the envelope is OF, so a window with none has nothing to compose. */
function NoRecord({ stream }: { stream: string }) {
  return (
    <div className="gyld-placeholder">
      <dl>
        <dt>stream</dt>
        <dd className={stream === '' ? 'gyld-unset' : undefined}>
          {stream === '' ? 'not set by the opening link' : stream}
        </dd>
        <dt>record</dt>
        <dd className="gyld-unset">
          no record on this window yet — ask about a box from the graph&apos;s menu
        </dd>
      </dl>
    </div>
  );
}

/** The record's own status line, out of the envelope's status block and
 *  nothing else: what the stream emitted, or the absence said as one. */
function StatusLine({ envelope }: { envelope: GyldAskContext }) {
  const { status } = envelope;
  if (!status.emitted) {
    return <span className="gyld-note">this stream emitted no decide-now list</span>;
  }
  if (!status.listed) {
    return <span className="gyld-note">not a question this stream lists</span>;
  }
  return (
    <>
      <span className="gyld-chip" data-status={status.effective}>{status.effective}</span>
      <span className="gyld-chip">{status.tier}</span>
      {status.reason !== '' && <span className="gyld-note">{status.reason}</span>}
    </>
  );
}

export function AskWindow() {
  const stream = useGrip(GYLD_DEST_STREAM) ?? '';
  const perspective = useGrip(GYLD_DEST_PERSPECTIVE) ?? '';
  const ref = useGrip(GYLD_DEST_REF) ?? '';
  const lens = useGrip(GYLD_LENS);
  const decideNow = useGrip(GYLD_DECIDE_NOW);
  const records = useGrip(GYLD_RECORDS);
  const record = useGrip(GYLD_RECORD);
  const bundle = useGrip(GYLD_BUNDLE);
  const sources = useGrip(GYLD_SOURCES);
  const ops = useGrip(GYLD_OPS);
  const conversation = useGrip(GYLD_TAB_ASK_CONVERSATION) ?? '';
  const question = useGrip(GYLD_TAB_ASK_DRAFT) ?? '';
  const draftTap = useGrip(GYLD_TAB_ASK_DRAFT_TAP) as AtomTapHandle<string> | undefined;

  if (ref === '') {
    return (
      <div className="gyld-ask">
        <NoRecord stream={stream} />
      </div>
    );
  }
  const envelope = askEnvelope({
    stream,
    perspective,
    slot: ref,
    lens: lens?.status === 'ok' ? lens.value : undefined,
    decideNow: decideNow?.status === 'ok' ? decideNow.value : undefined,
    records,
    record,
    bundle,
    sources: sources?.status === 'ok' ? sources.value : undefined,
    principal: ops?.principal,
    conversation,
    question,
  });
  return (
    <div className="gyld-ask">
      <header className="gyld-ask-head">
        <span className="gyld-detail-label">{envelope.record.label}</span>
        <StatusLine envelope={envelope} />
      </header>
      <p className="gyld-detail-slot">{envelope.record.slot}</p>
      <p className="gyld-note gyld-ask-conversation">
        {conversation === ''
          ? 'no conversation on this window yet'
          : `conversation ${conversation}`}
      </p>
      <label className="gyld-ask-question">
        <span>your question</span>
        <textarea
          className="gyld-ask-draft"
          rows={3}
          value={question}
          disabled={draftTap === undefined}
          placeholder="why is this blocked?"
          onChange={(event) => draftTap?.set(event.target.value)}
        />
      </label>
      {/* Step 0.3 has no verb behind it and says so, rather than offering a
          Submit that would do nothing (MDV-7). */}
      <p className="gyld-note gyld-ask-nosubmit">
        Nothing is sent yet: this window shows the context that WOULD go to the
        agent, and the `explain` verb that carries it lands in Phase 1.
      </p>
      <Sources envelope={envelope} index={sources} />
      <h4 className="gyld-ask-envelope-title">{envelope.format}</h4>
      <pre className="gyld-ask-envelope">{JSON.stringify(envelope, null, 2)}</pre>
    </div>
  );
}

/**
 * The tags this record cites, RESOLVED ones beside UNRESOLVED ones.
 *
 * An unresolved tag is the point of the list, not an error in it: the record
 * cites it and this build's index resolves it to nothing, and hiding that
 * would be the window inventing a Gyld fact by omission (6.7, MDV-7). The
 * absence of the index itself is said the same way.
 */
function Sources({ envelope, index }: {
  envelope: GyldAskContext;
  index: GyldValue<GyldSources> | undefined;
}) {
  const status = index?.status ?? 'unset';
  if (envelope.sources.length === 0) {
    return (
      <p className="gyld-note gyld-ask-sources-empty">
        {status === 'ok'
          ? "this build's source index records no citation for this record"
          : `${SOURCES_STATE[status] ?? status} — this record's citations cannot be resolved`}
      </p>
    );
  }
  return (
    <ul className="gyld-ask-sources">
      {envelope.sources.map((source) => (
        <li
          key={`${source.cites}/${source.stream}/${source.tag}`}
          className="gyld-ask-source"
          data-tag={source.tag}
          data-resolved={source.resolved ? 'yes' : 'no'}
        >
          <span className="gyld-chip">{source.tag}</span>
          <span className="gyld-note">
            cited by {source.cites} in {source.stream}
          </span>
          {source.resolved
            ? (
              <>
                <span className="gyld-note">
                  {source.root}/{source.path}
                  {source.heading === '' ? '' : ` · ${source.heading}`}
                  {source.lines === undefined ? '' : ` · lines ${source.lines[0]}-${source.lines[1]}`}
                  {source.truncated === true ? ' · passage capped' : ''}
                </span>
                <q className="gyld-ask-passage">{source.passage}</q>
              </>
            )
            : <span className="gyld-fault">unresolved: {source.reason}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Why there is no index to resolve against, in the store's own vocabulary. */
const SOURCES_STATE: Record<string, string> = {
  unset: 'no stream on this window yet',
  loading: 'reading the source index',
  absent: 'this build emitted no source index',
  invalid: 'the source index did not read',
};
