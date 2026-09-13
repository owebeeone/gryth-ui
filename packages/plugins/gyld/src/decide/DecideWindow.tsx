import { useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import type { DecideNowQuestion, GyldValidation, ValidationFinding } from '../contract';
import {
  GYLD_ANSWER_DRAFT, GYLD_ANSWER_DRAFT_TAP, GYLD_ANSWER_EXPORT, GYLD_ANSWER_EXPORT_TAP,
  GYLD_ASK_DRAFT, GYLD_ASK_DRAFT_TAP, GYLD_ASK_EXPORT, GYLD_ASK_EXPORT_TAP,
  GYLD_DECIDE_NOW, GYLD_DEST_REF, GYLD_DEST_STREAM, GYLD_OPS, GYLD_OPS_STATUS,
  GYLD_RECORDS, GYLD_STREAMS, GYLD_TAB_ID, GYLD_VALIDATION,
} from '../grips';
import { OpsPanel } from '../ops/OpsPanel';
import { opsGate } from '../ops/submit';
import type { GyldRecords } from '../records/records';
import type { GyldValue } from '../store/state';
import { rebuildCommand } from '../streams/operations';
import {
  ANSWER_EMPTY, ASK_ALTERNATIVE_EMPTY, ASK_EMPTY, answerShapeFaults, askShapeFaults,
  filledAlternatives, type AnswerDraft, type AskDraft,
} from './drafts';
import {
  askJoin, isRefusal, overlayTarget, type AskFragments, type OverlayTarget,
} from './overlay';
import {
  answerSubmit, askSubmit, composeAnswer, composeAsk, composeRefusal,
  overwriteRefusal,
} from './compose';

// The gyld.decide window (step 2.4): answer a question, or ask a new one, and
// export what makes it.
//
// Nothing is submitted and nothing is validated here. The form checks are
// shape only (spec risk R5): a question chosen, an alternative chosen, the
// text there, at most one alternative preferred. Everything a reader is told
// about the graph is emitted: the questions come from `decide-now.json`, each
// question's alternatives from its own `offers`, the declared class of every
// record from the projection's definitions, and the last capture result from
// `validation.json`, shown by code with its details as Gyld wrote them.
//
// The principal is a per-tab field rather than the glade stub. The stub is
// computed from `location.search` when `@grythjs/glade` is first imported and
// that module owns the glade runtime, so importing it here would put a DOM
// read and a session client into a package that needs neither. Owner ruling O6
// says a ruling carries the stage-one principal as DATA until real principals
// land; a field the owner fills in is exactly that, and the export shows what
// will be stamped.

/** The emitted decide-now rows, or none with the reason. */
function questionsOf(value: GyldValue<import('../contract').GyldDecideNow> | undefined): {
  rows: DecideNowQuestion[];
  reason?: string;
} {
  const status = value?.status ?? 'unset';
  if (status === 'ok' && value?.value !== undefined) {
    return { rows: value.value.questions };
  }
  const said: Record<string, string> = {
    unset: 'no stream on this window yet',
    loading: 'reading the decide-now file',
    absent: 'this stream emitted no decide-now list, so there is no question to pick',
    invalid: 'the decide-now file did not read',
  };
  return { rows: [], reason: said[status] ?? status };
}

/** What a slot is called in the picture, when the projection says; the slot
 *  itself when it does not. Never a name spelled out of the slot. */
function labelOf(records: GyldRecords | undefined, slot: string): string {
  if (records === undefined) {
    return slot;
  }
  const id = records.occurrenceBySlot.get(slot);
  const occurrence = id === undefined ? undefined : records.occurrences.get(id);
  return occurrence?.label ?? slot;
}

function Finding({ finding }: { finding: ValidationFinding }) {
  const details = Object.entries(finding.details ?? {});
  return (
    <li className="gyld-finding" data-code={finding.code}>
      <span className="gyld-finding-code">{finding.code}</span>
      <span>{finding.message}</span>
      {details.length > 0 && (
        <dl className="gyld-detail-facts">
          {details.map(([key, value]) => [
            <dt key={`${key}-k`}>{key}</dt>,
            <dd key={`${key}-v`}><code>{JSON.stringify(value)}</code></dd>,
          ])}
        </dl>
      )}
    </li>
  );
}

/** The last capture result for this stream, by code, with its details. The
 *  window shows it; it never decides what it means. */
function ValidationPanel() {
  const value = useGrip(GYLD_VALIDATION) as GyldValue<GyldValidation> | undefined;
  const status = value?.status ?? 'unset';
  if (status !== 'ok' || value?.value === undefined) {
    const said: Record<string, string> = {
      unset: 'no stream on this window yet',
      loading: 'reading the validation file',
      absent: 'this stream emitted no validation file',
      invalid: 'the validation file did not read',
    };
    return (
      <section className="gyld-decide-validation" data-validation={status}>
        <h4>Validation</h4>
        <p className="gyld-note">{said[status] ?? status}</p>
      </section>
    );
  }
  const validation = value.value;
  const findings = validation.findings ?? [];
  return (
    <section
      className="gyld-decide-validation"
      data-validation={validation.ok ? 'ok' : 'invalid'}
    >
      <h4>{`Validation of ${validation.stream}`}</h4>
      <p className={validation.ok ? 'gyld-note' : 'gyld-fault'}>
        {validation.ok
          ? `ok, built ${validation.built}`
          : `${validation.code ?? 'no code'}: ${validation.message ?? ''}`}
      </p>
      <ul className="gyld-findings">
        {findings.map((finding, index) => (
          <Finding key={`${finding.code}-${index}`} finding={finding} />
        ))}
      </ul>
      {findings.length === 0 && (
        <p className="gyld-note">no findings emitted</p>
      )}
    </section>
  );
}

function AnswerForm({ target, rows, reason }: {
  target: OverlayTarget | undefined;
  rows: DecideNowQuestion[];
  reason?: string;
}) {
  const draft = useGrip(GYLD_ANSWER_DRAFT) ?? ANSWER_EMPTY;
  const draftTap = useGrip(GYLD_ANSWER_DRAFT_TAP) as AtomTapHandle<AnswerDraft> | undefined;
  const exported = useGrip(GYLD_ANSWER_EXPORT) ?? '';
  const exportTap = useGrip(GYLD_ANSWER_EXPORT_TAP) as AtomTapHandle<string> | undefined;
  const records = useGrip(GYLD_RECORDS);
  const seeded = useGrip(GYLD_DEST_REF) ?? '';
  const ops = useGrip(GYLD_OPS);
  const gate = opsGate(ops, useGrip(GYLD_OPS_STATUS) ?? '');
  // Nothing composes without the projection, so nothing is offered without it.
  const uncomposable = composeRefusal(records);
  // And nothing is SENT over a module that already declares records: a submit
  // writes the module whole, and this one holds the draft's record alone.
  const unsendable = uncomposable === '' ? overwriteRefusal(records, target) : '';

  // A window opened on a record answers THAT question until the reader picks
  // another: a projection of the seed, not a write at mount.
  const chosen = draft.question !== '' ? draft.question
    : (rows.some((row) => row.slot === seeded) ? seeded : '');
  const question = rows.find((row) => row.slot === chosen);
  const effective: AnswerDraft = { ...draft, question: chosen };
  const faults = answerShapeFaults(effective);
  // Read through the HANDLE, never the render closure: a press straight after
  // the last keystroke would otherwise compose the draft before it
  // (CodingRules.md, "Gesture handlers read via tap handles").
  const compose = (): string => {
    const held = { ...(draftTap?.get() ?? draft) };
    held.question = held.question === '' ? chosen : held.question;
    return composeAnswer({ target, draft: held, rows, records });
  };

  return (
    <section className="gyld-decide-form" data-form="answer">
      <h4>Answer a question</h4>
      {reason !== undefined && <p className="gyld-note">{reason}</p>}
      <label className="gyld-chrome-field">
        question
        <select
          className="gyld-pick-question"
          value={chosen}
          onChange={(event) => draftTap?.update((held) => ({
            ...held, question: event.target.value, alternative: '',
          }))}
        >
          <option value="">choose a question</option>
          {rows.map((row) => (
            <option key={row.slot} value={row.slot}>
              {`${row.label} · ${row.effective_status} · ${row.tier}`}
              {row.answerable_now ? ' · answerable now' : ''}
            </option>
          ))}
        </select>
      </label>
      {question !== undefined && (
        <div className="gyld-decide-offers">
          <span className="gyld-note">
            {`declared ${question.declared_status}, effective ${question.effective_status}`}
            {question.blocked_by.length > 0
              ? ` · blocked by ${question.blocked_by.join(', ')}` : ''}
            {question.gated_by.length > 0
              ? ` · gated by ${question.gated_by.join(', ')}` : ''}
          </span>
          {question.offers.map((offer) => (
            <label key={offer} className="gyld-decide-offer">
              <input
                type="radio"
                name="gyld-alternative"
                value={offer}
                checked={draft.alternative === offer}
                onChange={() => draftTap?.update((held) => ({ ...held, alternative: offer }))}
              />
              {labelOf(records, offer)}
              {question.preferred === offer && (
                <span className="gyld-chip">the recorded lean</span>
              )}
            </label>
          ))}
          {question.offers.length === 0 && (
            <span className="gyld-note">this question offers no alternative</span>
          )}
        </div>
      )}
      <label className="gyld-chrome-field">
        principal
        <input
          type="text"
          className="gyld-answer-principal"
          placeholder="who this ruling is recorded for"
          value={draft.principal}
          onChange={(event) => draftTap?.update((held) => ({
            ...held, principal: event.target.value,
          }))}
        />
      </label>
      <label className="gyld-chrome-field">
        stamp
        <input
          type="text"
          className="gyld-answer-stamp"
          placeholder="2026-09-13T01:00:00Z"
          value={draft.stamp}
          onChange={(event) => draftTap?.update((held) => ({
            ...held, stamp: event.target.value,
          }))}
        />
      </label>
      <label className="gyld-chrome-field gyld-decide-wide">
        sources, one per line
        <textarea
          className="gyld-answer-sources"
          rows={2}
          value={draft.sources}
          onChange={(event) => draftTap?.update((held) => ({
            ...held, sources: event.target.value,
          }))}
        />
      </label>
      <label className="gyld-chrome-field gyld-decide-wide">
        ruling
        <textarea
          className="gyld-answer-text"
          rows={3}
          placeholder="what was ruled, and on what evidence"
          value={draft.text}
          onChange={(event) => draftTap?.update((held) => ({
            ...held, text: event.target.value,
          }))}
        />
      </label>
      <ul className="gyld-omissions">
        {faults.map((fault) => (
          <li key={fault}>{fault}</li>
        ))}
      </ul>
      <div className="gyld-chrome-row">
        <button
          type="button"
          className="gyld-answer-export"
          disabled={faults.length > 0 || target === undefined || uncomposable !== ''}
          title={uncomposable}
          onClick={() => exportTap?.set(compose())}
        >
          Export overlay
        </button>
        <button
          type="button"
          className="gyld-answer-submit"
          disabled={faults.length > 0 || target === undefined
            || uncomposable !== '' || unsendable !== '' || !gate.ready}
          title={[uncomposable, unsendable, gate.reason].find((said) => said !== '') ?? ''}
          onClick={() => {
            // The text is exported AND sent: what the reader can read is what
            // went, and a refusal leaves it there to fix.
            const text = compose();
            exportTap?.set(text);
            if (ops !== undefined) {
              void answerSubmit(ops, target, text);
            }
          }}
        >
          Submit answer
        </button>
        {!gate.ready && <span className="gyld-note gyld-ops-reason">{gate.reason}</span>}
      </div>
      {uncomposable !== '' && (
        <p className="gyld-fault gyld-decide-uncomposable">{uncomposable}</p>
      )}
      {unsendable !== '' && (
        <p className="gyld-fault gyld-decide-unsendable">{unsendable}</p>
      )}
      <textarea
        className="gyld-decide-overlay"
        readOnly
        rows={12}
        value={exported}
        placeholder="the overlay module text appears here"
      />
    </section>
  );
}

function AskForm({ target, rows }: { target: OverlayTarget | undefined; rows: DecideNowQuestion[] }) {
  const draft = useGrip(GYLD_ASK_DRAFT) ?? ASK_EMPTY;
  const draftTap = useGrip(GYLD_ASK_DRAFT_TAP) as AtomTapHandle<AskDraft> | undefined;
  const exported = useGrip(GYLD_ASK_EXPORT) ?? '';
  const exportTap = useGrip(GYLD_ASK_EXPORT_TAP) as AtomTapHandle<string> | undefined;
  const records = useGrip(GYLD_RECORDS);
  const ops = useGrip(GYLD_OPS);
  const gate = opsGate(ops, useGrip(GYLD_OPS_STATUS) ?? '');
  const uncomposable = composeRefusal(records);
  const unsendable = uncomposable === '' ? overwriteRefusal(records, target) : '';
  const faults = askShapeFaults(draft);

  // The gates a question may be given are the triggers the emitted rows
  // already name, and nothing else: a trigger this bundle never mentioned is
  // not offered, because the window does not know it exists.
  const triggers = [...new Set(rows.flatMap((row) => row.gated_by))].sort();
  // The composition is the supplier's two operands; the box holds the join of
  // them, which is the module the supplier writes, byte for byte.
  const compose = (): AskFragments | undefined => composeAsk({
    target, draft: draftTap?.get() ?? draft, records,
  });
  const toggle = (list: 'requires' | 'gates', slot: string) => {
    draftTap?.update((held) => {
      const chosen = held[list];
      return {
        ...held,
        [list]: chosen.includes(slot)
          ? chosen.filter((held2) => held2 !== slot)
          : [...chosen, slot],
      };
    });
  };
  const setAlternative = (index: number, patch: Partial<AskDraft['alternatives'][number]>) => {
    draftTap?.update((held) => ({
      ...held,
      alternatives: held.alternatives.map(
        (alternative, at) => (at === index ? { ...alternative, ...patch } : alternative),
      ),
    }));
  };

  return (
    <section className="gyld-decide-form" data-form="ask">
      <h4>Ask a new question</h4>
      <label className="gyld-chrome-field">
        class
        <input
          type="text"
          className="gyld-ask-symbol"
          placeholder="PinAudit"
          value={draft.symbol}
          onChange={(event) => draftTap?.update((held) => ({
            ...held, symbol: event.target.value,
          }))}
        />
      </label>
      <label className="gyld-chrome-field">
        member
        <input
          type="text"
          className="gyld-ask-label"
          placeholder="pin_audit"
          value={draft.label}
          onChange={(event) => draftTap?.update((held) => ({
            ...held, label: event.target.value,
          }))}
        />
      </label>
      <label className="gyld-chrome-field gyld-decide-wide">
        docstring
        <textarea
          className="gyld-ask-docstring"
          rows={2}
          placeholder="the question itself, in one line"
          value={draft.docstring}
          onChange={(event) => draftTap?.update((held) => ({
            ...held, docstring: event.target.value,
          }))}
        />
      </label>
      <fieldset className="gyld-ask-picks">
        <legend>prerequisites</legend>
        {rows.map((row) => (
          <label key={row.slot} className="gyld-decide-offer">
            <input
              type="checkbox"
              className="gyld-ask-requires"
              value={row.slot}
              checked={draft.requires.includes(row.slot)}
              onChange={() => toggle('requires', row.slot)}
            />
            {row.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="gyld-ask-picks">
        <legend>gates</legend>
        {triggers.map((slot) => (
          <label key={slot} className="gyld-decide-offer">
            <input
              type="checkbox"
              className="gyld-ask-gates"
              value={slot}
              checked={draft.gates.includes(slot)}
              onChange={() => toggle('gates', slot)}
            />
            {labelOf(records, slot)}
          </label>
        ))}
        {triggers.length === 0 && (
          <span className="gyld-note">no emitted row names a gate in this stream</span>
        )}
      </fieldset>
      <fieldset className="gyld-ask-picks">
        <legend>alternatives</legend>
        {/* The row's POSITION is its identity: rows are only ever appended,
            never reordered or removed, so the index is stable for as long as
            the row is. */}
        {draft.alternatives.map((alternative, index) => (
          <div key={`alternative-${index}`} className="gyld-ask-alternative">
            <input
              type="text"
              className="gyld-ask-alt-symbol"
              placeholder="AuditOnBump"
              value={alternative.symbol}
              onChange={(event) => setAlternative(index, { symbol: event.target.value })}
            />
            <input
              type="text"
              className="gyld-ask-alt-label"
              placeholder="audit_on_bump"
              value={alternative.label}
              onChange={(event) => setAlternative(index, { label: event.target.value })}
            />
            <input
              type="text"
              className="gyld-ask-alt-description"
              placeholder="one line"
              value={alternative.description}
              onChange={(event) => setAlternative(index, { description: event.target.value })}
            />
            <label className="gyld-decide-offer">
              <input
                type="checkbox"
                className="gyld-ask-alt-preferred"
                checked={alternative.preferred}
                onChange={() => setAlternative(index, { preferred: !alternative.preferred })}
              />
              preferred
            </label>
          </div>
        ))}
        <button
          type="button"
          className="gyld-ask-add"
          onClick={() => draftTap?.update((held) => ({
            ...held, alternatives: [...held.alternatives, { ...ASK_ALTERNATIVE_EMPTY }],
          }))}
        >
          Add an alternative
        </button>
      </fieldset>
      <p className="gyld-note">
        {filledAlternatives(draft).some((alternative) => alternative.preferred)
          ? 'one alternative is marked preferred, so the question is declared Lean'
          : 'no alternative is marked preferred, so the question is declared Open'}
      </p>
      <ul className="gyld-omissions">
        {faults.map((fault) => (
          <li key={fault}>{fault}</li>
        ))}
      </ul>
      <div className="gyld-chrome-row">
        <button
          type="button"
          className="gyld-ask-export"
          disabled={faults.length > 0 || target === undefined || uncomposable !== ''}
          title={uncomposable}
          onClick={() => {
            const parts = compose();
            exportTap?.set(parts === undefined ? '' : askJoin(parts));
          }}
        >
          Export overlay
        </button>
        <button
          type="button"
          className="gyld-ask-submit"
          disabled={faults.length > 0 || target === undefined
            || uncomposable !== '' || unsendable !== '' || !gate.ready}
          title={[uncomposable, unsendable, gate.reason].find((said) => said !== '') ?? ''}
          onClick={() => {
            // The text is exported AND sent: what the reader can read is what
            // went, and a refusal leaves it there to fix.
            const parts = compose();
            exportTap?.set(parts === undefined ? '' : askJoin(parts));
            if (ops !== undefined) {
              void askSubmit(ops, target, parts);
            }
          }}
        >
          Submit question
        </button>
        {!gate.ready && <span className="gyld-note gyld-ops-reason">{gate.reason}</span>}
      </div>
      {uncomposable !== '' && (
        <p className="gyld-fault gyld-decide-uncomposable">{uncomposable}</p>
      )}
      {unsendable !== '' && (
        <p className="gyld-fault gyld-decide-unsendable">{unsendable}</p>
      )}
      <textarea
        className="gyld-decide-overlay"
        readOnly
        rows={12}
        value={exported}
        placeholder="the overlay module text appears here"
      />
    </section>
  );
}

export function DecideWindow() {
  const stream = useGrip(GYLD_DEST_STREAM) ?? '';
  const census = useGrip(GYLD_STREAMS);
  const decideNow = useGrip(GYLD_DECIDE_NOW);
  const wiredTo = useGrip(GYLD_TAB_ID) ?? '';
  const resolved = overlayTarget(census, stream);
  const target = isRefusal(resolved) ? undefined : resolved;
  const { rows, reason } = questionsOf(decideNow);

  return (
    <div className="gyld-decide">
      <header className="gyld-decidenow-head">
        <span className="gyld-detail-label">
          {stream === '' ? 'no stream on this window' : `stream ${stream}`}
        </span>
        {wiredTo !== '' && (
          <span className="gyld-chip gyld-chip-wired">{`wired to ${wiredTo}`}</span>
        )}
        {target !== undefined && (
          <span className="gyld-note">
            {`overlay ${target.module}.${target.root} over ${target.parent}`}
          </span>
        )}
      </header>
      {target === undefined
        ? <p className="gyld-fault gyld-decide-refusal">{(resolved as { reason: string }).reason}</p>
        : (
          <p className="gyld-note">
            The text below is the overlay module for this one record. Submit
            sends it to the supplier, which writes it as the stream&apos;s
            overlay module and rebuilds; the run&apos;s output and its answer
            appear below. Export puts the same text in the box instead, to
            merge by hand and rebuild with
            {' '}
            <code className="gyld-decide-command">{rebuildCommand()}</code>
            . Either way Gyld captures and validates it, and what comes back is
            the validation shown here.
          </p>
        )}
      <ValidationPanel />
      <OpsPanel title="The last submission" />
      <AnswerForm target={target} rows={rows} reason={reason} />
      <AskForm target={target} rows={rows} />
    </div>
  );
}
