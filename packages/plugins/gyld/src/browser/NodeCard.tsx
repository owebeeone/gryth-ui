import { useGrip } from '@owebeeone/grip-react';
import { DESKTOP_OPEN_TOOL } from '@grythjs/plugin-api';
import {
  GYLD_DECIDE_NOW, GYLD_DEST_STREAM, GYLD_RECORDS, GYLD_STREAMS,
} from '../grips';
import { isRefusal, overlayTarget } from '../decide/overlay';
import { overwriteRefusal } from '../decide/compose';
import type { SceneNode } from '../lens/scene';
import { cardFor } from './card';
import { linkForRulingLink } from './links';
import { useBrowserFocus } from './useBrowserFocus';

// The node card: the question, on the question.
//
// Answering used to be three windows away from the thing being answered — a
// click wrote a selection, the reader pressed Decide in the chrome, and the
// question had to be picked AGAIN from a dropdown. The card puts the act on
// the box: hover one and the question's own text, its alternatives with the
// lean marked and the three things a reader can do with it are right there
// (GyldUiSimplification.md 2.2, owner ruling U3 of 2026-09-16: on hover).
//
// It decides nothing. Every word in it is emitted — the box text is the
// host's, the alternatives are the row's own `offers`, the lean is its
// `preferred`, and the reason it cannot be answered is its own `blocked_by`,
// `gated_by` or `ruling`. The three buttons only open windows.
//
// The hover itself is `Gyld.Tab.Hover`, the atom the picture already writes
// on a mouse move. There is no React state here and no effect.

export function NodeCard({ node }: { node: SceneNode }) {
  const decideNow = useGrip(GYLD_DECIDE_NOW);
  const records = useGrip(GYLD_RECORDS);
  const census = useGrip(GYLD_STREAMS);
  const stream = useGrip(GYLD_DEST_STREAM) ?? '';
  const openTool = useGrip(DESKTOP_OPEN_TOOL);
  const browser = useBrowserFocus();

  const card = cardFor(
    node,
    decideNow?.status === 'ok' ? decideNow.value : undefined,
    records,
  );
  // Why a submit on THIS stream would be refused, in the decide window's own
  // words: the supplier writes an overlay module whole, so a stream whose
  // module already declares records needs a stream of its own for the ruling.
  // Said here, before the refusal, instead of after it (2.2).
  const resolved = overlayTarget(census, stream);
  const target = isRefusal(resolved) ? undefined : resolved;
  const refusal = overwriteRefusal(records, target);
  const needsItsOwn = card.listed && refusal !== '';

  return (
    <div className="gyld-node-card" data-slot={card.slot}>
      <header className="gyld-node-card-head">
        <span className="gyld-detail-label">{card.label}</span>
        {card.listed
          ? <span className="gyld-chip" data-status={card.status}>{card.status}</span>
          : <span className="gyld-note">not a question this stream lists</span>}
      </header>
      <p className="gyld-detail-slot">{card.slot}</p>
      <ul className="gyld-node-card-text">
        {card.lines.map((line, index) => (
          // The drawn lines are the host's, in the host's order, so the
          // position IS the identity: nothing is reordered or removed.
          <li key={`${card.id}-line-${index}`}>{line}</li>
        ))}
      </ul>
      {card.alternatives.length > 0 && (
        <ul className="gyld-node-card-offers">
          {card.alternatives.map((alternative) => (
            <li
              key={alternative.slot}
              className="gyld-node-card-offer"
              data-preferred={alternative.preferred ? 'yes' : undefined}
            >
              {alternative.label}
              {alternative.preferred && (
                <span className="gyld-chip">the recorded lean</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {card.blocked !== '' && (
        <p className="gyld-note gyld-node-card-blocked">{card.blocked}</p>
      )}
      {needsItsOwn && (
        <p className="gyld-fault gyld-node-card-refusal">{refusal}</p>
      )}
      <div className="gyld-chrome-row gyld-node-card-acts">
        {card.listed && (
          <button
            type="button"
            className="gyld-card-answer"
            disabled={!browser.decideReady || !card.answerable}
            title={card.answerable
              ? (needsItsOwn ? refusal : 'answer this question in the decide window')
              : card.blocked}
            onClick={() => browser.decide(card.slot)}
          >
            {needsItsOwn ? 'Answer (needs its own stream)' : 'Answer'}
          </button>
        )}
        {card.listed && (
          <button
            type="button"
            className="gyld-card-ask"
            disabled={!browser.decideReady}
            title="ask a new question in the decide window, which lists this one to tick as a prerequisite"
            onClick={() => browser.decide(card.slot)}
          >
            Ask a follow-up
          </button>
        )}
        <button
          type="button"
          className="gyld-card-detail"
          disabled={!browser.detailReady}
          title="this record in the detail window"
          onClick={() => browser.detail(card.slot)}
        >
          Details
        </button>
        {needsItsOwn && (
          <button
            type="button"
            className="gyld-card-link"
            disabled={openTool === undefined}
            title={`a stream manager with link, parent ${stream} and a name for this ruling`}
            onClick={() => openTool?.(linkForRulingLink(stream, card.label))}
          >
            Link a stream for this ruling
          </button>
        )}
      </div>
    </div>
  );
}
