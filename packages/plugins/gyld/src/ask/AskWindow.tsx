import { useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import type { GyldSources } from '../contract';
import {
  GYLD_ASK_STREAM, GYLD_BUNDLE, GYLD_DECIDE_NOW, GYLD_DEST_PERSPECTIVE, GYLD_DEST_REF,
  GYLD_DEST_STREAM, GYLD_LENS, GYLD_OPS, GYLD_OPS_STATUS, GYLD_RECORD, GYLD_RECORDS,
  GYLD_SOURCES, GYLD_TAB_ASK_ANSWER, GYLD_TAB_ASK_ANSWER_TAP,
  GYLD_TAB_ASK_AT_END, GYLD_TAB_ASK_AT_END_TAP,
  GYLD_TAB_ASK_CONVERSATION, GYLD_TAB_ASK_CONVERSATION_TAP, GYLD_TAB_ASK_DRAFT,
  GYLD_TAB_ASK_DRAFT_TAP, GYLD_TAB_DRAFT_TAKEN_TAP, GYLD_TAB_ID,
} from '../grips';
import type { GyldOpsResponse } from '../ops/ops';
import type { GyldValue } from '../store/state';
import { useBrowserFocus } from '../browser/useBrowserFocus';
import type { TakenDraft } from '../decide/drafts';
import workingStill from '../assets/working-96-still.png';
import workingUrl from '../assets/working-96.gif';
import { AskPhase, conversationBusy } from './busy';
import {
  NO_CONVERSATION, movedOff, startConversation, turnConversation,
  type AskConversation, type AskConversationOn,
} from './conversation';
import {
  draftOffer, takeDraft, takeRefusal,
  type DraftOffer, type TakeDraftHandles,
} from './draft';
import { askEnvelope, type GyldAskContext } from './envelope';
import {
  foldAskReply, hasReply,
  type AskReply, type AskTurn, type GyldAskCitation, type GyldAskDraft,
} from './reply';
import { explainGate, explainSubmit, sendsOnKey } from './submit';
import { followScroll, keepAtEnd } from './transcript';

// The gyld.ask window (GyldAskAgent.md section 6), at step 2.1, LAID OUT AS A
// CHAT, which is what a conversation is and what every reader already knows
// how to read:
//
//  - a HEADER: the record this conversation is about, its id, Start over, and
//    the context it rides in — the envelope and the sources — folded away
//    behind one disclosure, because what was sent stays auditable (6.7)
//    without being the first thing in the window;
//  - a TRANSCRIPT that scrolls and grows: the turns in order, each the
//    reader's question and then the agent's reply, the open turn last;
//  - a COMPOSER pinned to the bottom: ONE box for the first question and
//    every follow-up, Enter to send, Shift+Enter for a newline.
//
// The transcript FOLLOWS what arrives while the reader is at its end and stays
// where they put it once they have scrolled up (./transcript.ts). That fact is
// an atom written by the scroll handler and read here; the scroll itself is
// performed in the transcript's ref callback. Neither is a hook
// (CodingRules.md).
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
  // Whether the transcript is at its end, which is whether it follows what
  // arrives. The scroll handler writes it and the ref callback acts on it.
  const following = useGrip(GYLD_TAB_ASK_AT_END) ?? true;
  const followTap = useGrip(GYLD_TAB_ASK_AT_END_TAP) as
    AtomTapHandle<boolean> | undefined;
  const reply = foldAskReply(useGrip(GYLD_ASK_STREAM), conversation.id);
  // Taking a draft writes the BROWSER's hand-off atom and opens the decide
  // window wired to that same browser — the acts this window already has on
  // it, and the one context both sinks resolve (section 8).
  const takes: TakeDraftHandles = {
    taken: useGrip(GYLD_TAB_DRAFT_TAKEN_TAP) as AtomTapHandle<TakenDraft> | undefined,
    browser: useBrowserFocus(),
  };

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
  // The turn this window already has in flight, out of the fold and the
  // accept (`./busy.ts`). Nothing here is timed and nothing here is a hook:
  // the phase is what has ARRIVED, so it changes when a record lands and goes
  // away when the `end` record closes the turn.
  const busy = conversationBusy(reply, answer);
  const gate = explainGate(ops, status, conversation.id, question, busy);
  // The same gate asked AS IF a question were typed, which is what separates
  // "this window cannot ask at all" — no supplier, no conversation — from an
  // empty box, which the composer already says by being empty.
  const standing = explainGate(ops, status, conversation.id, 'a question');
  const answered = hasReply(reply);
  /** What one gesture of this window mints or keeps a conversation ON. The
   *  stamp is read AT THE PRESS: a clock read in a render is not this
   *  package's to take. */
  const on = (): AskConversationOn => (
    { tabId: wiredTo, slot: ref, stamp: Date.now() }
  );
  /**
   * Send what is in the box, in the conversation the turn settles into.
   *
   * The button and the Enter key are one act. The question is read through the
   * DRAFT'S OWN HANDLE and the gate is asked again against it: a keystroke and
   * the Enter that follows it can land inside one notification cycle, so the
   * render closure is the last paint's text and not the reader's
   * (CodingRules.md, "gesture handlers read via tap handles").
   */
  const send = (): void => {
    const typed = draftTap?.get() ?? question;
    if (!explainGate(ops, status, conversation.id, typed, busy).ready) {
      return;
    }
    const inConversation = turnConversation(conversationTap, on(), conversation);
    void explainSubmit(
      ops, { ...envelope, conversation: inConversation.id }, typed,
    ).then((response) => {
      if (response === undefined) {
        return;
      }
      answerTap?.set(response);
      // An ACCEPTED turn keeps its question on the log, where the fold draws
      // it, so the box is emptied for the follow-up. A REFUSED one leaves the
      // text where the reader can fix it.
      if (response.ok) {
        draftTap?.set('');
      }
      // The answer belongs at the end of the transcript, so a send takes the
      // reader back there whatever they were reading when they pressed.
      followTap?.set(true);
    });
  };
  return (
    <div className="gyld-ask">
      <header className="gyld-ask-head">
        <div className="gyld-chrome-row gyld-ask-on">
          <span className="gyld-detail-label">{envelope.record.label}</span>
          <span className="gyld-chip">{stream}</span>
          <StatusLine envelope={envelope} />
          <span className="gyld-note gyld-ask-conversation">
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
            onClick={() => {
              startConversation(conversationTap, on());
              // The accept belonged to the conversation being left, and the
              // new one has had nothing asked in it. Clearing it is what makes
              // that true of the window as well as of the log — and it is what
              // stops an indicator from waiting on a turn this window no
              // longer folds.
              answerTap?.set(null);
              followTap?.set(true);
            }}
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
        {/* What this conversation RIDES IN, folded away: the record's own
            slot, the sources it cites and the envelope itself. It stays
            reachable because what was sent is as much a fact as what came
            back, and it is closed because it is not what a reader reads
            (6.7). */}
        <details className="gyld-ask-context">
          <summary>context</summary>
          <p className="gyld-detail-slot">{envelope.record.slot}</p>
          <Sources envelope={envelope} index={sources} />
          <p className="gyld-ask-envelope-title">{envelope.format}</p>
          <pre className="gyld-ask-envelope">{JSON.stringify(envelope, null, 2)}</pre>
        </details>
      </header>
      {/* The conversation as the log carried it, in turn order, the open turn
          last — and the scroll that follows it, performed where a DOM reach is
          sanctioned and nowhere else. */}
      <div
        className="gyld-ask-transcript"
        data-following={following ? 'yes' : 'no'}
        onScroll={(event) => {
          followScroll(followTap, event.currentTarget);
        }}
        ref={(el) => {
          keepAtEnd(el, following);
        }}
      >
        <Transcript
          reply={reply}
          busy={busy}
          acts={{
            envelope,
            refusal: takeRefusal(takes),
            take: (offer: DraftOffer) => {
              takeDraft(takes, offer);
            },
          }}
        />
        <Answered answer={answer} />
      </div>
      <div className="gyld-chrome-row gyld-ask-composer">
        {/* The reader has scrolled up and the transcript has stayed where they
            put it. Setting the fact back is the whole of coming back: the ref
            callback does the scrolling on the render that follows. */}
        {!following && (
          <button
            type="button"
            className="gyld-ask-jump"
            title="scroll to the end of this conversation and follow it again"
            onClick={() => followTap?.set(true)}
          >
            jump to latest ↓
          </button>
        )}
        <textarea
          className="gyld-ask-draft"
          rows={2}
          value={question}
          // One box for the first question and every follow-up, and it is shut
          // while a turn is in flight with the reason where the reader is
          // looking.
          disabled={draftTap === undefined || busy !== undefined}
          placeholder={composerSays(busy, answered)}
          onChange={(event) => draftTap?.set(event.target.value)}
          onKeyDown={(event) => {
            const sends = sendsOnKey({
              key: event.key,
              shiftKey: event.shiftKey,
              altKey: event.altKey,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              isComposing: event.nativeEvent.isComposing,
            });
            if (!sends) {
              return;
            }
            // Never a newline as well as a send.
            event.preventDefault();
            send();
          }}
        />
        <button
          type="button"
          className="gyld-ask-send"
          disabled={!gate.ready}
          title={gate.ready
            ? 'send this context and this question to the agent, on the gyld.ops exchange'
            : gate.reason}
          onClick={send}
        >
          Send
        </button>
        {!standing.ready && (
          <span className="gyld-note gyld-ask-blocked">{standing.reason}</span>
        )}
      </div>
    </div>
  );
}

/** What the composer says when it is empty: while a turn is in flight, the
 *  reason it cannot be typed in; otherwise what it is for and how it sends. */
function composerSays(busy: AskPhase | undefined, answered: boolean): string {
  if (busy !== undefined) {
    return `${busy.name}… the next question can be asked once this turn closes`;
  }
  return answered
    ? 'ask a follow-up — Enter sends, Shift+Enter for a new line'
    : 'ask about this record — Enter sends, Shift+Enter for a new line';
}

/**
 * That a turn is in flight, and what of it has arrived.
 *
 * The animation is the visible half and the WORD is the load-bearing half: a
 * spinner says only that something is happening, and this window's whole
 * manner is to say what it actually knows (6.7). So the phase comes out of the
 * fold (`./busy.ts`) and is printed beside the turning gear, and it changes as
 * records land rather than on a timer.
 *
 * REDUCED MOTION is honoured without a hook and without a second code path:
 * the `<source>` swaps the animation for its own first frame under
 * `prefers-reduced-motion: reduce`, so a reader who has asked for stillness
 * gets the same picture, still, with the same words next to it.
 *
 * The image is decorative and carries no information the text does not, so its
 * `alt` is empty and the live region is the text.
 */
function Working({ phase }: { phase: AskPhase }) {
  return (
    <span className="gyld-ask-working" data-phase={phase.name}>
      <picture>
        <source srcSet={workingStill} media="(prefers-reduced-motion: reduce)" />
        <img className="gyld-ask-working-turn" src={workingUrl} alt="" />
      </picture>
      <span className="gyld-note gyld-ask-working-said" role="status" title={phase.means}>
        {phase.name}
      </span>
    </span>
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
      <p className="gyld-note gyld-ask-unsent gyld-ask-row-system">
        nothing has been asked from this window yet
      </p>
    );
  }
  return (
    <div
      className="gyld-ask-answer gyld-ask-row-system"
      data-ok={answer.ok ? 'ok' : 'failed'}
    >
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

/** What this window can do with a draft a turn offered: resolve it against
 *  the envelope this window holds NOW, and take it into the decide form. */
interface DraftActs {
  envelope: GyldAskContext;
  /** Why no draft can be taken from this window at all, or '' when one can. */
  refusal: string;
  take(offer: DraftOffer): void;
}

/**
 * The conversation as the log carried it: the turns in order, and the turn in
 * flight last.
 *
 * The IN-FLIGHT TURN is the last reply row and not a bar somewhere else: while
 * the log has nothing of it, the row is the gear and the phase alone; once
 * records land, the same row is the turn the fold built and the prose streams
 * into it. So the gear belongs to the last turn while that turn is open, and
 * to a row of its own only in the gap between the accept and the first record
 * — which is the one moment the fold cannot see (./busy.ts).
 */
function Transcript({ reply, busy, acts }: {
  reply: AskReply;
  busy: AskPhase | undefined;
  acts: DraftActs;
}) {
  const last = reply.turns.length - 1;
  const open = last >= 0 && !reply.turns[last].ended;
  if (last < 0 && busy === undefined) {
    // Nothing asked in this conversation yet: nothing drawn, never a blank
    // transcript full of empty rows.
    return null;
  }
  return (
    <section className="gyld-ask-reply">
      {reply.turns.map((turn, index) => (
        <Turn
          key={turn.runId}
          turn={turn}
          acts={acts}
          phase={index === last && open ? busy : undefined}
        />
      ))}
      {busy !== undefined && !open && (
        <article className="gyld-ask-turn gyld-ask-turn-pending">
          <div className="gyld-ask-row gyld-ask-row-reply">
            <div className="gyld-ask-bubble"><Working phase={busy} /></div>
          </div>
        </article>
      )}
    </section>
  );
}

/** One turn, as two rows: the reader's question, and then the agent's reply —
 *  its prose, the passages it cited, the rulings it drafted, whatever else the
 *  supplier said, and the run's close as the reply's own footer. */
function Turn({ turn, acts, phase }: {
  turn: AskTurn;
  acts: DraftActs;
  phase: AskPhase | undefined;
}) {
  return (
    <article className="gyld-ask-turn" data-run={turn.runId}>
      {/* The question as the LOG carried it, not as this window's box holds
          it: what was asked is what the supplier recorded being asked. */}
      {turn.question !== '' && (
        <div className="gyld-ask-row gyld-ask-row-asked">
          <p className="gyld-ask-asked">{turn.question}</p>
        </div>
      )}
      <div className="gyld-ask-row gyld-ask-row-reply">
        <div className="gyld-ask-bubble">
          {/* While this turn is the one in flight, the gear and the word for
              what has arrived stand where its prose will be, and stay above
              the prose once it starts to stream into this same row. */}
          {phase !== undefined && <Working phase={phase} />}
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
          {turn.drafts.length > 0 && (
            <ul className="gyld-ask-drafts">
              {turn.drafts.map((draft, index) => (
                <Drafted
                  // A turn can legitimately offer two drafts, so the position
                  // in the fold is the identity, as it is for the citations
                  // above.
                  key={`${turn.runId}-draft-${index}`}
                  draft={draft}
                  acts={acts}
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
        </div>
      </div>
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
        ? (citation.passage !== undefined && (
          // The passage is EXPANDABLE: a transcript of six turns with six
          // passages open is a wall, and a citation whose passage cannot be
          // read is not a citation. So it is one line, and one click.
          <details className="gyld-ask-passage-fold">
            <summary>passage</summary>
            <q className="gyld-ask-passage">{citation.passage}</q>
          </details>
        ))
        : (
          <span className="gyld-fault">
            unresolved: {citation.reason ?? 'no reason was emitted'}
          </span>
        )}
    </li>
  );
}

/**
 * One ruling the agent DRAFTED, as an offer (GyldAskAgent.md section 8).
 *
 * It is drawn as what it is: a model's proposal, named by the model that made
 * it, with the alternative it chose and the text it wrote. Taking it fills
 * the decide form of the window wired to the same browser and nothing else —
 * no principal, no stamp, no sources, no submit.
 *
 * A draft this window cannot take is SHOWN and REFUSED, never dropped: the
 * button is offered with the reason on it, whether the reason is the
 * supplier's (this record does not offer that alternative) or this window's
 * (there is no graph window wired to take it into).
 */
function Drafted({ draft, acts }: { draft: GyldAskDraft; acts: DraftActs }) {
  const offer = draftOffer(draft, acts.envelope);
  const blocked = offer.takeable ? acts.refusal : offer.reason;
  return (
    <li
      className="gyld-ask-draft"
      data-alternative={offer.alternative}
      data-resolved={offer.takeable ? 'yes' : 'no'}
    >
      <span className="gyld-chip">{offer.takeable ? offer.label : offer.alternative}</span>
      <span className="gyld-note">
        {offer.drafted === '' ? 'drafted by a model it did not name' : `drafted by ${offer.drafted}`}
      </span>
      <q className="gyld-ask-passage">{offer.text}</q>
      {offer.sources.length > 0 && (
        <span className="gyld-note">{`leaning on ${offer.sources.join(', ')}`}</span>
      )}
      <button
        type="button"
        className="gyld-ask-take"
        disabled={blocked !== ''}
        title={blocked === ''
          ? 'fill the decide form of the graph window this one is wired to: the '
            + 'alternative and the ruling text, marked as this model\'s draft'
          : blocked}
        onClick={() => acts.take(offer)}
      >
        Take this draft
      </button>
      {!offer.takeable && (
        <span className="gyld-fault gyld-ask-unresolved">{`unresolved: ${offer.reason}`}</span>
      )}
      {offer.takeable && acts.refusal !== '' && (
        <span className="gyld-note gyld-ask-untakeable">{acts.refusal}</span>
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
