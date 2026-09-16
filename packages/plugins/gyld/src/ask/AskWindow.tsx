import { useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import type { GyldSources } from '../contract';
import {
  GYLD_ASK_STREAM, GYLD_BUNDLE, GYLD_DECIDE_NOW, GYLD_DEST_PERSPECTIVE, GYLD_DEST_REF,
  GYLD_DEST_STREAM, GYLD_LENS, GYLD_OPS, GYLD_OPS_STATUS, GYLD_RECORD, GYLD_RECORDS,
  GYLD_SOURCES, GYLD_TAB_ASK_ANSWER, GYLD_TAB_ASK_ANSWER_TAP,
  GYLD_TAB_ASK_CONVERSATION, GYLD_TAB_ASK_CONVERSATION_TAP, GYLD_TAB_ASK_DRAFT,
  GYLD_TAB_ASK_DRAFT_TAP, GYLD_TAB_ID,
} from '../grips';
import type { GyldOpsResponse } from '../ops/ops';
import type { GyldValue } from '../store/state';
import {
  NO_CONVERSATION, movedOff, startConversation, turnConversation,
  type AskConversation, type AskConversationOn,
} from './conversation';
import { askEnvelope, type GyldAskContext } from './envelope';
import {
  foldAskReply, hasReply,
  type AskReply, type AskTurn, type GyldAskCitation,
} from './reply';
import { explainGate, explainSubmit } from './submit';

// The gyld.ask window (GyldAskAgent.md section 6), at step 2.1: the record it
// is on, the conversation it is in, the turns that conversation has taken —
// each with its own question, run id, prose, citations and close — and the
// box the next question is typed into, under the last reply.
//
// Every line of the envelope is composed by `askEnvelope()`, a pure function
// over this window's grips, and every line of the REPLY is folded by
// `foldAskReply()`, a pure function over the records the `gyld.ask` log
// carried. The window itself folds nothing and decides nothing: the prose is
// the model's chunks in sequence order, a citation is the passage the
// supplier resolved, the exit is the run's own.
//
// A REFUSAL IS DATA AND IS DRAWN AS DATA — never a toast, never an alert. The
// three that arrive before a run starts (no model key, no source index, an
// envelope that did not decode) are this window's own answer, printed beside
// the question that drew them; one that stops a turn mid-stream closes it with
// a line and a non-zero exit, and whatever prose had already arrived is kept.

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
  const status = useGrip(GYLD_OPS_STATUS) ?? '';
  const conversation = useGrip(GYLD_TAB_ASK_CONVERSATION) ?? NO_CONVERSATION;
  const conversationTap = useGrip(GYLD_TAB_ASK_CONVERSATION_TAP) as
    AtomTapHandle<AskConversation> | undefined;
  // The browser this window is wired to, which is the tab a conversation id
  // names — '' on a window that stands alone, exactly as `askOn` mints it.
  const wiredTo = useGrip(GYLD_TAB_ID) ?? '';
  const question = useGrip(GYLD_TAB_ASK_DRAFT) ?? '';
  const draftTap = useGrip(GYLD_TAB_ASK_DRAFT_TAP) as AtomTapHandle<string> | undefined;
  const answer = useGrip(GYLD_TAB_ASK_ANSWER) ?? null;
  const answerTap = useGrip(GYLD_TAB_ASK_ANSWER_TAP) as
    AtomTapHandle<GyldOpsResponse | null> | undefined;
  const reply = foldAskReply(useGrip(GYLD_ASK_STREAM), conversation.id);

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
    conversation: conversation.id,
    question,
  });
  const gate = explainGate(ops, status, conversation.id, question);
  const answered = hasReply(reply);
  /** What one gesture of this window mints or keeps a conversation ON. The
   *  stamp is read AT THE PRESS: a clock read in a render is not this
   *  package's to take. */
  const on = (): AskConversationOn => (
    { tabId: wiredTo, slot: ref, stamp: Date.now() }
  );
  return (
    <div className="gyld-ask">
      <header className="gyld-ask-head">
        <span className="gyld-detail-label">{envelope.record.label}</span>
        <StatusLine envelope={envelope} />
      </header>
      <p className="gyld-detail-slot">{envelope.record.slot}</p>
      <div className="gyld-chrome-row gyld-ask-conversation">
        <span className="gyld-note">
          {conversation.id === ''
            ? 'no conversation on this window yet'
            : `conversation ${conversation.id}`}
        </span>
        {/* Starting over is the reader's, and it is the one other way an id
            is minted (section 6): the turns already asked stay on the log
            under the id they were asked in, and this window stops folding
            them. */}
        <button
          type="button"
          className="gyld-ask-restart"
          disabled={conversationTap === undefined}
          title={'start a new conversation on this record; the turns already asked '
            + 'stay on the log, under the id they were asked in'}
          onClick={() => startConversation(conversationTap, on())}
        >
          {conversation.id === '' ? 'Start a conversation' : 'Start over'}
        </button>
      </div>
      {movedOff(conversation, ref) && (
        <p className="gyld-note gyld-ask-moved">
          {`this conversation was opened on ${conversation.slot}, and this window has been `
            + 'moved since: the next question opens a new conversation on this record'}
        </p>
      )}
      {/* The conversation as the log carried it, in turn order, and then the
          box the next turn is typed into: a follow-up is asked UNDER the
          reply it follows (section 6). */}
      <Reply reply={reply} />
      <Answered answer={answer} />
      <label className="gyld-ask-question">
        <span>{answered ? 'your follow-up' : 'your question'}</span>
        <textarea
          className="gyld-ask-draft"
          rows={3}
          value={question}
          disabled={draftTap === undefined}
          placeholder={answered ? 'and what does that turn on?' : 'why is this blocked?'}
          onChange={(event) => draftTap?.set(event.target.value)}
        />
      </label>
      <div className="gyld-chrome-row gyld-ask-acts">
        <button
          type="button"
          className="gyld-ask-send"
          disabled={!gate.ready}
          title={gate.ready
            ? 'send this context and this question to the agent, on the gyld.ops exchange'
            : gate.reason}
          // The press sends the envelope this window composed, with the
          // question it was pressed with and in the conversation the turn is
          // settled into, and writes whatever came back into this window's
          // own atom. Nothing is decided here: a refusal is an answer, and it
          // is drawn above.
          onClick={() => {
            const inConversation = turnConversation(conversationTap, on(), conversation);
            void explainSubmit(
              ops, { ...envelope, conversation: inConversation.id }, question,
            ).then((response) => {
              if (response === undefined) {
                return;
              }
              answerTap?.set(response);
              // An ACCEPTED turn keeps its question on the log, where the
              // fold draws it, so the box is emptied for the follow-up. A
              // REFUSED one leaves the text where the reader can fix it.
              if (response.ok) {
                draftTap?.set('');
              }
            });
          }}
        >
          Ask
        </button>
        {!gate.ready && <span className="gyld-note gyld-ask-blocked">{gate.reason}</span>}
      </div>
      <Sources envelope={envelope} index={sources} />
      {/* The envelope STAYS, and folds away once a reply exists: what was sent
          is as much a fact as what came back, and hiding it outright would
          make the answer unauditable (6.7). */}
      <details className="gyld-ask-envelope-fold" open={!answered}>
        <summary className="gyld-ask-envelope-title">{envelope.format}</summary>
        <pre className="gyld-ask-envelope">{JSON.stringify(envelope, null, 2)}</pre>
      </details>
    </div>
  );
}

/**
 * What the supplier answered THIS window's last `explain` with.
 *
 * It is the run's own outcome, printed the way `src/ops/OpsPanel.tsx` prints
 * one, because this is a Gyld window (section 6). Three of the four refusals
 * of section 4 arrive here, before any run started: no model key, no source
 * index, and an envelope that did not decode. Each is rendered AS THE DATA IT
 * IS — the supplier's own sentence, in the window, with the run it belongs to.
 */
function Answered({ answer }: { answer: GyldOpsResponse | null }) {
  if (answer === null) {
    return (
      <p className="gyld-note gyld-ask-unsent">
        nothing has been asked from this window yet
      </p>
    );
  }
  return (
    <div className="gyld-ask-answer" data-ok={answer.ok ? 'ok' : 'failed'}>
      <p className={answer.ok ? 'gyld-note' : 'gyld-fault'}>
        {`explain: ${answer.ok ? 'accepted' : 'refused'}`}
        {answer.run_id === undefined ? '' : `, run ${answer.run_id}`}
        {answer.exit === undefined ? '' : `, exit ${answer.exit}`}
        {answer.attributed_to === undefined ? '' : `, attributed to ${answer.attributed_to}`}
      </p>
      {answer.error !== undefined && (
        <p className="gyld-fault gyld-ask-refusal">{answer.error}</p>
      )}
    </div>
  );
}

/** The conversation as the log carried it: one block per turn, in turn order,
 *  each with its own run id. Nothing yet is nothing drawn. */
function Reply({ reply }: { reply: AskReply }) {
  if (reply.turns.length === 0) {
    return null;
  }
  return (
    <section className="gyld-ask-reply">
      {reply.turns.map((turn) => <Turn key={turn.runId} turn={turn} />)}
    </section>
  );
}

/** One turn: the question it was asked with, the prose as it streamed, the
 *  passages it cited, whatever else the supplier said, and the run's close. */
function Turn({ turn }: { turn: AskTurn }) {
  return (
    <article className="gyld-ask-turn" data-run={turn.runId}>
      {/* The question as the LOG carried it, not as this window's box holds
          it: what was asked is what the supplier recorded being asked. */}
      {turn.question !== '' && <p className="gyld-ask-asked">{turn.question}</p>}
      {turn.prose !== '' && <p className="gyld-ask-prose">{turn.prose}</p>}
      {turn.citations.length > 0 && (
        <ul className="gyld-ask-citations">
          {turn.citations.map((citation, index) => (
            <Citation
              // A conversation can legitimately cite one tag twice, so the
              // position in the fold is the identity here, as it is for the
              // host's drawn lines.
              key={`${turn.runId}-cite-${index}`}
              citation={citation}
            />
          ))}
        </ul>
      )}
      {turn.said.map((said, index) => (
        <p
          key={`${turn.runId}-said-${index}`}
          className={said.stream === 'stderr' ? 'gyld-fault gyld-ask-said' : 'gyld-note gyld-ask-said'}
          data-stream={said.stream}
        >
          {said.text}
        </p>
      ))}
      <p className="gyld-note gyld-ask-end" data-exit={turn.exit}>
        {turn.ended
          ? `end, exit ${turn.exit ?? 'not emitted'}`
          : 'answering…'}
        {turn.principal === '' ? '' : `, attributed to ${turn.principal}`}
        {` (run ${turn.runId})`}
      </p>
    </article>
  );
}

/**
 * One cited passage: the tag, the file it is in, and the passage itself.
 *
 * An UNRESOLVED citation is rendered as one, with the supplier's reason: the
 * answer cited a tag this build's index resolves to nothing, and dropping it
 * would be the window hiding an omission (MDV-7).
 */
function Citation({ citation }: { citation: GyldAskCitation }) {
  const resolved = citation.resolved !== false;
  return (
    <li
      className="gyld-ask-citation"
      data-tag={citation.tag}
      data-resolved={resolved ? 'yes' : 'no'}
    >
      <span className="gyld-chip">{citation.tag}</span>
      {citation.path !== undefined && (
        <span className="gyld-note">
          {citation.path}
          {citation.heading === undefined || citation.heading === ''
            ? ''
            : ` · ${citation.heading}`}
          {citation.lines === undefined || citation.lines.length !== 2
            ? ''
            : ` · lines ${citation.lines[0]}-${citation.lines[1]}`}
          {citation.truncated === true ? ' · passage capped' : ''}
        </span>
      )}
      {resolved
        ? (citation.passage !== undefined
          && <q className="gyld-ask-passage">{citation.passage}</q>)
        : (
          <span className="gyld-fault">
            unresolved: {citation.reason ?? 'no reason was emitted'}
          </span>
        )}
    </li>
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
