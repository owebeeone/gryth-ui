import { useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import type { GyldSources } from '../contract';
import {
  GYLD_ASK_STREAM, GYLD_BUNDLE, GYLD_DECIDE_NOW, GYLD_DEST_PERSPECTIVE, GYLD_DEST_REF,
  GYLD_DEST_STREAM, GYLD_LENS, GYLD_OPS, GYLD_OPS_STATUS, GYLD_RECORD, GYLD_RECORDS,
  GYLD_SOURCES, GYLD_TAB_ASK_ANSWER, GYLD_TAB_ASK_ANSWER_TAP,
  GYLD_TAB_ASK_AT_END, GYLD_TAB_ASK_AT_END_TAP,
  GYLD_TAB_ASK_CITES, GYLD_TAB_ASK_CITES_TAP,
  GYLD_TAB_ASK_CONVERSATION, GYLD_TAB_ASK_CONVERSATION_TAP, GYLD_TAB_ASK_DRAFT,
  GYLD_TAB_ASK_DRAFT_TAP, GYLD_TAB_DRAFT_TAKEN_TAP, GYLD_TAB_ID,
} from '../grips';
import type { GyldOpsResponse } from '../ops/ops';
import type { GyldValue } from '../store/state';
import { useBrowserFocus } from '../browser/useBrowserFocus';
import type { TakenDraft } from '../decide/drafts';
import workingStill from '../assets/working-96-still.png';
import workingUrl from '../assets/working-96.gif';
import { AskPhase, acceptShown, conversationBusy } from './busy';
import {
  NOTHING_OPEN, boxCopied, boxOpen, boxSaid, browserClipboard, chipOpen,
  citationWhere, closeBox, collapseAll, collapsesOnKey, copyCitation, toggleBox,
  toggleChip, type AskCitationsOpen,
} from './citations';
import {
  NO_CONVERSATION, movedOff, startConversation, turnConversation,
  type AskConversation, type AskConversationOn,
} from './conversation';
import {
  draftOffer, takeDraft, takeRefusal,
  type DraftOffer, type TakeDraftHandles,
} from './draft';
import { askEnvelope, type GyldAskContext } from './envelope';
import { markProse, type CitationMark } from './markers';
import {
  endLine, foldAskReply, hasReply, latestNote, spoken,
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
// A CITATION IS A MARKER IN THE PROSE, not a list under it. The supplier sends
// every citation before the answer, and the answer names the tags it leant on;
// so the tags the reply itself cited are marked `[n]` where the prose names
// them (./markers.ts) and each marker opens its passage in a box UNDER ITS OWN
// PARAGRAPH (./citations.ts), with Copy and Collapse. A footer chip expands
// every citation of a turn at once, so a source the prose never names is one
// press away and nothing the supplier sent is lost. The metadata is one muted
// line per reply — the run and its end state, the exit and the attribution in
// its tooltip — and the endpoint's own notes sit once under the composer,
// because they are about the endpoint and repeat on every turn.
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
  // Which citation boxes this reader has open, and what their last Copy did.
  const cites: CiteActs = {
    open: useGrip(GYLD_TAB_ASK_CITES) ?? NOTHING_OPEN,
    handle: useGrip(GYLD_TAB_ASK_CITES_TAP) as
      AtomTapHandle<AskCitationsOpen> | undefined,
  };
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
              // The boxes were opened on the turns of the conversation being
              // left, and this window stops folding those: an open box keyed
              // to a run it no longer draws is state with nothing behind it.
              collapseAll(cites.handle);
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
          cites={cites}
          acts={{
            envelope,
            refusal: takeRefusal(takes),
            take: (offer: DraftOffer) => {
              takeDraft(takes, offer);
            },
          }}
        />
        <Answered answer={answer} shown={acceptShown(answer, reply)} />
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
      {/* What the ENDPOINT had to do differently — the output budget a local
          model was given, a setting nobody has heard of. It comes back on
          every turn of a conversation, so it is one line here and not the same
          sentence over every answer in the transcript. The latest, because the
          answer a reader is looking at is the last turn's. */}
      <Noted note={latestNote(reply)} />
    </div>
  );
}

/** The endpoint's own latest note, under the composer and out of the turns. */
function Noted({ note }: { note: string }) {
  if (note === '') {
    return null;
  }
  return (
    <p className="gyld-note gyld-ask-noted" data-stream="note" title={
      'what the endpoint had to do differently on this conversation\'s last turn'
    }>
      {note}
    </p>
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
 *
 * An ACCEPT is drawn only while it is the only thing this window knows — from
 * the press to the first record of the turn (`./busy.ts`, `acceptShown`).
 * After that the reply's own footer line names the run and the indicator names
 * the phase, and a third line saying both would only push the answer up.
 */
function Answered({ answer, shown }: {
  answer: GyldOpsResponse | null;
  shown: boolean;
}) {
  if (answer === null) {
    return (
      <p className="gyld-note gyld-ask-unsent gyld-ask-row-system">
        nothing has been asked from this window yet
      </p>
    );
  }
  if (!shown) {
    return null;
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
function Transcript({ reply, busy, cites, acts }: {
  reply: AskReply;
  busy: AskPhase | undefined;
  cites: CiteActs;
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
          cites={cites}
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
 *  its prose with the sources it names marked in it, the rulings it drafted,
 *  whatever else the supplier said, the chip that opens every source at once,
 *  and one muted line for the run and its close. */
function Turn({ turn, cites, acts, phase }: {
  turn: AskTurn;
  cites: CiteActs;
  acts: DraftActs;
  phase: AskPhase | undefined;
}) {
  const end = endLine(turn);
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
          {turn.prose !== '' && <Prose turn={turn} cites={cites} />}
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
          {/* Everything the supplier said on this turn EXCEPT its notes,
              which are about the endpoint and sit under the composer. */}
          {spoken(turn).map((said, index) => (
            <p
              key={`${turn.runId}-said-${index}`}
              className={said.stream === 'stderr' ? 'gyld-fault gyld-ask-said' : 'gyld-note gyld-ask-said'}
              data-stream={said.stream}
            >
              {said.text}
            </p>
          ))}
          <Sourced turn={turn} cites={cites} />
          {/* The run and its close, in one muted line. The exit and the
              attribution are still here, on the tooltip: a reader reads the
              answer, and audits the run. */}
          <p className="gyld-note gyld-ask-end" data-exit={turn.exit} title={end.title}>
            {end.text}
          </p>
        </div>
      </div>
    </article>
  );
}

/** The boxes this reader has open, and the atom every press writes through. */
interface CiteActs {
  open: AskCitationsOpen;
  handle?: AtomTapHandle<AskCitationsOpen>;
}

/**
 * The answer's prose, paragraph by paragraph, with its own citations marked.
 *
 * The marked-up prose is the model's text UNCHANGED (./markers.ts): where it
 * names a tag this reply cited, the mention is kept exactly as written and a
 * marker follows it. The box a marker opens is rendered HERE, under the
 * paragraph the mention is in and not at the reply's footer, so the passage
 * lands beside the sentence that leant on it.
 */
function Prose({ turn, cites }: { turn: AskTurn; cites: CiteActs }) {
  const marked = markProse(turn.prose, turn.citations);
  return (
    <>
      {marked.paragraphs.map((paragraph, index) => (
        <div className="gyld-ask-para" key={`${turn.runId}-para-${index}`}>
          <p className="gyld-ask-prose">
            {paragraph.parts.map((part, at) => (
              <span
                key={`${turn.runId}-part-${index}-${at}`}
                className={part.mark === undefined ? undefined : 'gyld-ask-mention'}
              >
                {part.text}
                {part.mark !== undefined && (
                  <Marker runId={turn.runId} mark={part.mark} cites={cites} />
                )}
              </span>
            ))}
          </p>
          {paragraph.marks
            .map((number) => turn.citations[number - 1])
            .filter((citation) => boxOpen(cites.open, turn.runId, citation.tag))
            .map((citation) => (
              <CitationBox
                key={`${turn.runId}-box-${index}-${citation.tag}`}
                runId={turn.runId}
                citation={citation}
                cites={cites}
              />
            ))}
        </div>
      ))}
    </>
  );
}

/**
 * One marker: `[n]`, after the tag the prose named.
 *
 * It is a BUTTON and not a link, because it goes nowhere — it opens the
 * passage under this paragraph and closes it again. The tag is its tooltip, so
 * a reader who only wants to know which source it is need not open anything,
 * and Escape closes the box from the marker that opened it without a listener
 * on the window (CodingRules.md).
 */
function Marker({ runId, mark, cites }: {
  runId: string;
  mark: CitationMark;
  cites: CiteActs;
}) {
  const open = boxOpen(cites.open, runId, mark.tag);
  return (
    <button
      type="button"
      className="gyld-ask-mark"
      data-cite={mark.number}
      data-tag={mark.tag}
      aria-expanded={open}
      title={mark.tag}
      onClick={() => toggleBox(cites.handle, runId, mark.tag)}
      onKeyDown={(event) => {
        if (collapsesOnKey(event)) {
          closeBox(cites.handle, runId, mark.tag);
        }
      }}
    >
      {`[${mark.number}]`}
    </button>
  );
}

/**
 * One cited passage, expanded: the citation line, the passage, and the two
 * things a reader does with it.
 *
 * An UNRESOLVED citation is rendered as one, with the supplier's reason: the
 * answer cited a tag this build's index resolves to nothing, and dropping it
 * would be the window hiding an omission (MDV-7).
 *
 * COPY writes the passage with its citation line first, because a passage
 * pasted without one is a quote from nowhere. It is `navigator.clipboard` in
 * the click handler and nothing else; a browser that offers none says so here,
 * beside the button that could not do it.
 */
function CitationBox({ runId, citation, cites }: {
  runId: string;
  citation: GyldAskCitation;
  cites: CiteActs;
}) {
  const resolved = citation.resolved !== false;
  const copied = boxCopied(cites.open, runId, citation.tag);
  const said = boxSaid(cites.open, runId, citation.tag);
  return (
    <div
      className="gyld-ask-cite"
      data-tag={citation.tag}
      data-resolved={resolved ? 'yes' : 'no'}
      onKeyDown={(event) => {
        if (collapsesOnKey(event)) {
          closeBox(cites.handle, runId, citation.tag);
        }
      }}
    >
      <p className="gyld-ask-cite-head">
        <span className="gyld-chip">{citation.tag}</span>
        <span className={resolved ? 'gyld-note' : 'gyld-fault'}>
          {citationWhere(citation)}
        </span>
      </p>
      {resolved && citation.passage !== undefined && (
        <q className="gyld-ask-passage">{citation.passage}</q>
      )}
      <p className="gyld-ask-cite-acts">
        <button
          type="button"
          className="gyld-ask-copy"
          data-copied={copied ? 'yes' : 'no'}
          title="copy this passage, with its citation line above it"
          onClick={() => {
            void copyCitation(
              { handle: cites.handle, clipboard: browserClipboard() },
              runId,
              citation,
            );
          }}
        >
          {copied ? 'copied' : 'Copy'}
        </button>
        <button
          type="button"
          className="gyld-ask-collapse"
          title="fold this passage away again — Escape does the same"
          onClick={() => closeBox(cites.handle, runId, citation.tag)}
        >
          Collapse
        </button>
        {said !== '' && <span className="gyld-fault gyld-ask-uncopied">{said}</span>}
      </p>
    </div>
  );
}

/**
 * Every source the turn leant on, behind one small chip.
 *
 * The markers cover the sources the prose NAMES. This is the rest of the
 * grounding: a citation the model never mentioned is still a citation the
 * supplier resolved and the answer was grounded on, and hiding it because the
 * prose forgot it would be the window losing a fact (6.7, MDV-7). So the chip
 * counts them all, and opens them all, as the same boxes.
 */
function Sourced({ turn, cites }: { turn: AskTurn; cites: CiteActs }) {
  const count = turn.citations.length;
  if (count === 0) {
    return null;
  }
  const open = chipOpen(cites.open, turn.runId);
  return (
    <div className="gyld-ask-sourced" data-open={open ? 'yes' : 'no'}>
      <button
        type="button"
        className="gyld-ask-chip"
        aria-expanded={open}
        title={open
          ? 'fold these sources away again'
          : 'every source this answer was grounded on, including the ones its '
            + 'prose does not name'}
        onClick={() => toggleChip(cites.handle, turn.runId)}
      >
        {`${count} source${count === 1 ? '' : 's'}`}
      </button>
      {open && turn.citations.map((citation, index) => (
        <CitationBox
          // A turn can legitimately cite one tag twice, so the position in the
          // fold is the identity here, as it is for the host's drawn lines.
          key={`${turn.runId}-all-${index}`}
          runId={turn.runId}
          citation={citation}
          cites={cites}
        />
      ))}
    </div>
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
