import { GripProvider, useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import { grok, type ToolViewProps } from '@grythjs/plugin-api';
import type {
  CostReport, EvaluationFuture, EvaluationSide, EvidenceRecord, GyldComparison,
  GyldEvaluatorRun, RelaxationNote, RunProposal, SnapshotRef, StructuralImpact,
} from '../contract';
import {
  GYLD_COMPARISON, GYLD_DEST_PROPOSAL, GYLD_DEST_PROPOSAL_TAP, GYLD_DEST_RUN,
  GYLD_DEST_RUN_TAP, GYLD_LENS, GYLD_RUN, GYLD_RUN_DRAFT, GYLD_RUN_DRAFT_TAP,
} from '../grips';
import { useKeyedContext } from '../contexts';
import { LensView } from '../lens/LensView';
import type { GyldValue } from '../store/state';
import { sideTabTaps } from './compareTabTaps';
import { reportSource } from './report';
import { COMPARE_SIDES, CompareSide } from './sides';

// The gyld.compare window (step 3.2): one proposal of one evaluator run, as
// the run emitted it.
//
// Everything here is read out. The gate statuses, the obligation
// satisfactions, the eligibility, the costs with their unknown ids and the
// conditional subtotals with the condition that holds them are the evaluator's
// answers; the futures are its futures, with the relaxation notes the host
// wrote beside them; the summary rows are the counts it captured. This window
// adds nothing up, compares no two proposals, and never turns the emitted
// `winner: null` into a choice of its own (spec section 6.5: "The window never
// ranks proposals").
//
// The two pictures are the run's own baseline and candidate lens files, drawn
// by the same lens view every other window uses, each in its own child context
// so the two pan, zoom and dim independently. What each picture is, and what
// both leave out, is the run's own `lens` block, printed beside them.
//
// The report is an iframe, per owner ruling O7. Which document it is, is the
// run's answer: a run that emitted one names the file, and a run that did not
// names the run that holds it, which is a sibling of this one under the
// directory the runs are served from. The window prints the URL it resolved.

function Snapshot({ label, snapshot }: { label: string; snapshot: SnapshotRef }) {
  return (
    <span className="gyld-note">
      {`${label} ${snapshot.lineage} · ${snapshot.revision} · ${snapshot.digest.slice(0, 12)}`}
    </span>
  );
}

/** The run URL field and the proposal picker. The field is a draft: nothing is
 *  read until Read is pressed, and this package never invents a place to read
 *  Gyld output from. */
function CompareChrome({ run }: { run: GyldEvaluatorRun | undefined }) {
  const draft = useGrip(GYLD_RUN_DRAFT) ?? '';
  const draftTap = useGrip(GYLD_RUN_DRAFT_TAP) as AtomTapHandle<string> | undefined;
  const runTap = useGrip(GYLD_DEST_RUN_TAP) as AtomTapHandle<string> | undefined;
  const proposal = useGrip(GYLD_DEST_PROPOSAL) ?? '';
  const proposalTap = useGrip(GYLD_DEST_PROPOSAL_TAP) as AtomTapHandle<string> | undefined;
  const proposals = run?.proposals ?? [];
  return (
    <div className="gyld-chrome-row">
      <label className="gyld-chrome-field gyld-compare-run">
        run
        <input
          type="text"
          className="gyld-run-url"
          placeholder="the URL an evaluator run directory is served from"
          value={draft}
          onChange={(event) => draftTap?.set(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="gyld-run-read"
        disabled={runTap === undefined || draft === ''}
        onClick={() => runTap?.set(draftTap?.get() ?? '')}
      >
        Read run
      </button>
      <label className="gyld-chrome-field">
        proposal
        <select
          className="gyld-pick-proposal"
          value={proposal}
          onChange={(event) => proposalTap?.set(event.target.value)}
        >
          {(proposal === '' || !proposals.some((entry) => entry.id === proposal)) && (
            <option value={proposal}>
              {proposal === '' ? 'choose a proposal' : `${proposal} (not in this run)`}
            </option>
          )}
          {proposals.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.id}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** What the run says about itself, and what it says it does not cover. */
function RunFacts({ run }: { run: GyldEvaluatorRun }) {
  return (
    <section className="gyld-compare-section" data-section="run">
      <header className="gyld-detail-head">
        <span className="gyld-detail-label">{`run ${run.run}`}</span>
        <span className="gyld-chip">{run.evaluator_version}</span>
        <span className="gyld-note">{`${run.lineage} · ${run.revision}`}</span>
        <Snapshot label="base" snapshot={run.base} />
      </header>
      <p className="gyld-note">{`gates read from ${run.review}`}</p>
      <ul className="gyld-omissions">
        {run.limits.map((limit) => <li key={limit}>{limit}</li>)}
      </ul>
    </section>
  );
}

/** What the run says about THIS proposal: the frame it was evaluated under,
 *  the two snapshots, and whether the candidate is the base again. */
function ProposalFacts({ proposal }: { proposal: RunProposal }) {
  return (
    <section className="gyld-compare-section" data-section="proposal">
      <header className="gyld-detail-head">
        <span className="gyld-detail-label">{proposal.id}</span>
        <span className="gyld-chip">{`frame ${proposal.frame}`}</span>
        {proposal.candidate_equals_base && (
          <span className="gyld-chip">candidate is the base again</span>
        )}
      </header>
      <dl className="gyld-detail-facts">
        <dt>introduced</dt>
        <dd>{proposal.introduced ?? 'nothing: configuration and adapter only'}</dd>
        <dt>moved allocations</dt>
        <dd>{proposal.moved.length === 0 ? 'none' : proposal.moved.join(', ')}</dd>
      </dl>
      <div className="gyld-compare-snapshots">
        <Snapshot label="baseline" snapshot={proposal.baseline} />
        <Snapshot label="candidate" snapshot={proposal.candidate} />
      </div>
    </section>
  );
}

/** One side's picture, inside that side's own context. */
function Picture({ side, tabId }: { side: CompareSide; tabId: string }) {
  const context = useKeyedContext(side.contextKey(tabId), () => sideTabTaps(side));
  return (
    <section className="gyld-compare-pane" data-side={side.name}>
      <GripProvider grok={grok} context={context}>
        <PictureFigure side={side} tabId={tabId} />
      </GripProvider>
    </section>
  );
}

function PictureFigure({ side, tabId }: { side: CompareSide; tabId: string }) {
  const state = useGrip(GYLD_LENS);
  const lens = state?.status === 'ok' ? state.value : undefined;
  return (
    <>
      <header className="gyld-diff-pane-head">
        <span className="gyld-detail-label">{side.title}</span>
        {lens !== undefined && (
          <span className="gyld-note">
            {`${lens.counts.nodes} drawn, ${lens.counts.omitted_occurrences} omitted`}
          </span>
        )}
      </header>
      <LensView scope={`${tabId}-${side.name}`} />
    </>
  );
}

function Pictures({ run, tabId }: { run: GyldEvaluatorRun; tabId: string }) {
  return (
    <section className="gyld-compare-section" data-section="pictures">
      <h4>{`The ${run.lens.perspective} lens of each side`}</h4>
      <dl className="gyld-detail-facts">
        <dt>baseline</dt>
        <dd>{run.lens.baseline}</dd>
        <dt>candidate</dt>
        <dd>{run.lens.candidate}</dd>
      </dl>
      <div className="gyld-compare-panes">
        {COMPARE_SIDES.map((side) => (
          <Picture key={side.name} side={side} tabId={tabId} />
        ))}
      </div>
      <ul className="gyld-omissions">
        {run.lens.omissions.map((omission) => <li key={omission}>{omission}</li>)}
      </ul>
    </section>
  );
}

function Gates({ comparison }: { comparison: GyldComparison }) {
  const statusOf = (side: EvaluationSide, id: string): string => side.gates
    .find((gate) => gate.id === id)?.status ?? 'not evaluated on this side';
  return (
    <section className="gyld-compare-section" data-section="gates">
      <h4>{`Hard gates (${comparison.frame.hard_gates.length} hard gates)`}</h4>
      <table className="gyld-compare-table">
        <thead>
          <tr><th>gate</th><th>baseline</th><th>candidate</th><th>obligations</th></tr>
        </thead>
        <tbody>
          {comparison.frame.hard_gates.map((gate) => (
            <tr key={gate.id} data-gate={gate.id}>
              <td>{gate.id}</td>
              <td>{statusOf(comparison.baseline, gate.id)}</td>
              <td>{statusOf(comparison.candidate, gate.id)}</td>
              <td>{`${gate.obligation_ids.length} pinned`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Obligations({ comparison }: { comparison: GyldComparison }) {
  const held = (side: EvaluationSide, id: string) => side.obligations
    .find((obligation) => obligation.id === id);
  const say = (side: EvaluationSide, id: string): string => {
    const found = held(side, id);
    if (found === undefined) {
      return 'not evaluated on this side';
    }
    return `${found.retained ? 'retained' : 'dropped'}, ${found.satisfaction}`;
  };
  return (
    <section className="gyld-compare-section" data-section="obligations">
      <h4>{`Obligations (${comparison.frame.obligation_ids.length} obligations pinned)`}</h4>
      <table className="gyld-compare-table">
        <thead>
          <tr><th>obligation</th><th>baseline</th><th>candidate</th></tr>
        </thead>
        <tbody>
          {comparison.frame.obligation_ids.map((id) => (
            <tr key={id} data-obligation={id}>
              <td><code>{id}</code></td>
              <td>{say(comparison.baseline, id)}</td>
              <td>{say(comparison.candidate, id)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * One side's costs.
 *
 * The subtotals are the evaluator's, with the condition that holds them and
 * the exact records they cover; the unknown ids are the records it refused to
 * add. Nothing is summed here, and a side with nothing addable says so rather
 * than showing a zero, because unknown is not zero.
 */
function Costs({ costs, title }: { costs: CostReport; title: string }) {
  const noSubtotal = (): string => {
    if (costs.records.length === 0) {
      return 'no cost records on this side';
    }
    if (costs.unknown_ids.length === costs.records.length) {
      return 'no subtotal: every cost of this side is unknown';
    }
    return 'no subtotal: nothing here could be added up under one condition';
  };
  return (
    <div className="gyld-compare-costs">
      <h5>{title}</h5>
      <ul className="gyld-compare-cost-records">
        {costs.records.map((record) => (
          <li
            key={record.id}
            data-cost={record.id}
            data-unknown={costs.unknown_ids.includes(record.id) ? record.id : undefined}
          >
            <code>{record.id}</code>
            <span className="gyld-note">{`${record.dimension} · ${record.state}`}</span>
            {record.quantity === undefined
              ? <span className="gyld-note">no quantity recorded</span>
              : (
                <span className="gyld-note">
                  {`${record.quantity.value} ${record.quantity.unit}`
                    + ` × ${record.multiplicity.count} (${record.multiplicity.basis})`}
                </span>
              )}
            {record.effective_value !== undefined && (
              <span className="gyld-note">{`effective ${record.effective_value}`}</span>
            )}
            {record.reason !== undefined && (
              <span className="gyld-note">{record.reason}</span>
            )}
          </li>
        ))}
      </ul>
      {costs.conditional_subtotals.length === 0
        ? <p className="gyld-note">{noSubtotal()}</p>
        : (
          <ul className="gyld-compare-subtotals">
            {costs.conditional_subtotals.map((subtotal) => (
              <li
                key={`${subtotal.dimension}/${subtotal.unit}/${subtotal.scenario_role}`}
                data-cost-ids={subtotal.cost_ids.join(' ')}
              >
                <span className="gyld-compare-subtotal">
                  {`${subtotal.value} ${subtotal.unit}`}
                </span>
                <span className="gyld-note">
                  {`${subtotal.dimension} · ${subtotal.scenario_role} · holds under `}
                  {subtotal.condition}
                </span>
                <span className="gyld-note">{`covers ${subtotal.cost_ids.join(', ')}`}</span>
              </li>
            ))}
          </ul>
        )}
      {costs.unknown_ids.length > 0 && (
        <p className="gyld-note">{`unknown, and in no subtotal: ${costs.unknown_ids.join(', ')}`}</p>
      )}
      {costs.incompatible_ids.length > 0 && (
        <p className="gyld-note">
          {`recorded in another context, and in no subtotal: ${costs.incompatible_ids.join(', ')}`}
        </p>
      )}
      {costs.overlapping_ids.length > 0 && (
        <p className="gyld-note">
          {`overlapping, and in no subtotal: ${costs.overlapping_ids.join(', ')}`}
        </p>
      )}
    </div>
  );
}

function Future({ future, note }: { future: EvaluationFuture; note?: RelaxationNote }) {
  return (
    <section className="gyld-compare-future" data-future={future.id}>
      <header className="gyld-detail-head">
        <span className="gyld-detail-label">{future.id}</span>
        <span className="gyld-chip">{future.version}</span>
        <span className="gyld-chip">{`probability ${future.probability.state}`}</span>
        <span className="gyld-chip">{future.authority}</span>
      </header>
      <p className="gyld-note">{future.probability.reason}</p>
      <ul className="gyld-compare-gates">
        {future.candidate.gates.map((gate) => (
          <li key={gate.id}>{`${gate.id}: ${gate.status}`}</li>
        ))}
      </ul>
      <p className="gyld-note">
        {`eligible under this future: baseline ${future.baseline.eligible ? 'yes' : 'no'}`
          + `, candidate ${future.candidate.eligible ? 'yes' : 'no'}`}
      </p>
      <Costs costs={future.candidate.costs} title="candidate costs under this future" />
      {note !== undefined && (
        <div className="gyld-compare-note">
          <p>{note.reason}</p>
          <p className="gyld-note">
            {`dropped obligations: ${note.dropped_obligations.length === 0
              ? 'none' : note.dropped_obligations.join('; ')}`}
          </p>
          <p className="gyld-note">
            {`dropped gates: ${note.dropped_gates.length === 0
              ? 'none' : note.dropped_gates.join(', ')}`}
          </p>
          <p className="gyld-note">
            {`gates lifted with the obligation kept: ${note.ungated_policy.length === 0
              ? 'none' : note.ungated_policy.join(', ')}`}
          </p>
        </div>
      )}
    </section>
  );
}

function Evidence({ comparison }: { comparison: GyldComparison }) {
  const rows: { side: string; record: EvidenceRecord }[] = [
    ...comparison.baseline.evidence.map((record) => ({ side: 'baseline', record })),
    ...comparison.candidate.evidence.map((record) => ({ side: 'candidate', record })),
  ];
  return (
    <section className="gyld-compare-section" data-section="evidence">
      <h4>{`Evidence (${rows.length})`}</h4>
      <ul className="gyld-compare-evidence">
        {rows.map(({ side, record }) => {
          const provenance = comparison.evidence_provenance?.[record.id];
          return (
            <li key={`${side}/${record.id}`} data-evidence={record.id}>
              <div className="gyld-relation-head">
                <span className="gyld-relation-name">{record.gate_id}</span>
                <span className="gyld-chip">{record.result}</span>
                <span className="gyld-note">{side}</span>
                <code>{record.id}</code>
              </div>
              <p className="gyld-note">
                {`${record.applicability} (${record.applicability_reason})`
                  + ` · context ${record.context_compatibility}`
                  + ` · ${record.premises.ids.length} recorded premises`}
              </p>
              <p className="gyld-note">
                {provenance === undefined
                  ? 'no provenance recorded for this record'
                  : `${provenance.basis} · ${provenance.review}`}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Impact({ impact }: { impact: StructuralImpact | undefined }) {
  return (
    <section className="gyld-compare-section" data-section="impact">
      <h4>The structural impact of applying this proposal</h4>
      {impact === undefined
        ? <p className="gyld-note">no structural impact emitted for this proposal</p>
        : (
          <dl className="gyld-detail-facts">
            <dt>added</dt>
            <dd>{impact.added_ids.length === 0 ? 'nothing' : impact.added_ids.join(', ')}</dd>
            <dt>changed</dt>
            <dd>{impact.changed_ids.length === 0 ? 'nothing' : impact.changed_ids.join(', ')}</dd>
            <dt>changed scopes</dt>
            <dd>
              {impact.changed_scopes.length === 0 ? 'none' : impact.changed_scopes.join(', ')}
            </dd>
            <dt>complete</dt>
            <dd>{impact.complete ? 'the applier recorded its whole impact' : 'partial'}</dd>
          </dl>
        )}
    </section>
  );
}

function Decision({ comparison }: { comparison: GyldComparison }) {
  return (
    <section className="gyld-compare-section" data-section="decision">
      <h4>What the evaluator decided</h4>
      <dl className="gyld-compare-decision">
        <dt>winner</dt>
        <dd><code>null</code></dd>
        <dt>reason</dt>
        <dd>{comparison.winner_reason}</dd>
        <dt>architecture superiority</dt>
        <dd><code>null</code></dd>
        <dt>eligible under the supplied gates</dt>
        <dd>
          {`baseline ${comparison.baseline.eligible ? 'yes' : 'no'}`
            + `, candidate ${comparison.candidate.eligible ? 'yes' : 'no'}`}
        </dd>
      </dl>
    </section>
  );
}

function Summary({ comparison }: { comparison: GyldComparison }) {
  const summary = comparison.summary;
  if (summary === undefined) {
    return null;
  }
  return (
    <section className="gyld-compare-section" data-section="summary">
      <h4>Summary</h4>
      <p>{summary.narrative}</p>
      <table className="gyld-compare-table">
        <thead>
          <tr>{summary.columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {summary.rows.map((row) => (
            <tr key={String(row[0])} data-row={String(row[0])}>
              {row.map((cell, index) => (
                <td key={`${String(row[0])}/${index}`}>{String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Comparison({ comparison }: { comparison: GyldComparison }) {
  return (
    <>
      <section className="gyld-compare-section" data-section="frame">
        <h4>{`The frame both sides were evaluated under: frame ${comparison.frame.id}`}</h4>
        <dl className="gyld-detail-facts">
          <dt>context</dt>
          <dd>
            {`${comparison.frame.context.id} · platform ${comparison.frame.context.platform}`
              + ` · workload ${comparison.frame.context.workload}`}
          </dd>
          <dt>version</dt>
          <dd>{comparison.frame.version}</dd>
          <dt>evaluator</dt>
          <dd>{comparison.evaluator_version}</dd>
        </dl>
      </section>
      <Gates comparison={comparison} />
      <Obligations comparison={comparison} />
      <section className="gyld-compare-section" data-section="costs">
        <h4>Costs</h4>
        <div className="gyld-compare-panes">
          <Costs costs={comparison.baseline.costs} title="baseline" />
          <Costs costs={comparison.candidate.costs} title="candidate" />
        </div>
      </section>
      <section className="gyld-compare-section" data-section="futures">
        <h4>{`Futures (${comparison.futures.length})`}</h4>
        {comparison.futures.map((future) => (
          <Future
            key={future.id}
            future={future}
            note={comparison.relaxation_notes?.[future.id]}
          />
        ))}
      </section>
      <Evidence comparison={comparison} />
      <Impact impact={comparison.structural_impact ?? comparison.impact} />
      <Decision comparison={comparison} />
      <Summary comparison={comparison} />
    </>
  );
}

/** No comparison, and why. A proposal the index does not name and one whose
 *  file this run did not write are different absences, and both are said. */
function NoComparison({ value, run, proposal }: {
  value: GyldValue<GyldComparison> | undefined;
  run: GyldEvaluatorRun | undefined;
  proposal: string;
}) {
  const status = value?.status ?? 'unset';
  const named = run?.proposals.some((entry) => entry.id === proposal) ?? false;
  const said: Record<string, string> = {
    unset: 'no proposal on this window yet',
    loading: 'reading the comparison record',
    absent: named
      ? 'this run carries no comparison for that proposal'
      : `this run's index names no proposal ${proposal}`,
    invalid: 'the comparison record did not read',
  };
  return (
    <div className="gyld-compare-empty">
      <p className="gyld-note">{said[status] ?? status}</p>
      {value?.fault !== undefined && (
        <p className="gyld-fault">{`${value.fault.path}: ${value.fault.message}`}</p>
      )}
    </div>
  );
}

/** The inspector report, in a frame, with where it came from beside it. */
function Report({ runUrl, run, proposal }: {
  runUrl: string;
  run: GyldEvaluatorRun;
  proposal: RunProposal;
}) {
  const source = reportSource(runUrl, run, proposal);
  return (
    <section className="gyld-compare-section" data-section="report">
      <h4>The inspector report for this proposal</h4>
      {source === undefined
        ? (
          <p className="gyld-note">
            this run emitted no report and names no run that holds one
          </p>
        )
        : (
          <>
            <p className="gyld-note">{`from ${source.from}`}</p>
            {source.note !== undefined && <p className="gyld-note">{source.note}</p>}
            <p className="gyld-note"><code>{source.url}</code></p>
            <iframe className="gyld-report" title={`report for ${proposal.id}`} src={source.url} />
          </>
        )}
    </section>
  );
}

/** No run, and why: this window reads what it is pointed at and nothing else. */
function NoRun({ value }: { value: GyldValue<GyldEvaluatorRun> | undefined }) {
  const status = value?.status ?? 'unset';
  const said: Record<string, string> = {
    unset: 'no evaluator run on this window yet',
    loading: 'reading the run index',
    absent: 'no run.json at that address, so there is no run to read',
    invalid: 'the run index did not read',
  };
  return (
    <div className="gyld-compare-empty">
      <p className="gyld-note">{said[status] ?? status}</p>
      {value?.fault !== undefined && (
        <p className="gyld-fault">{`${value.fault.path}: ${value.fault.message}`}</p>
      )}
    </div>
  );
}

export function CompareWindow({ tabId }: ToolViewProps) {
  const runUrl = useGrip(GYLD_DEST_RUN) ?? '';
  const runValue = useGrip(GYLD_RUN) as GyldValue<GyldEvaluatorRun> | undefined;
  const proposalId = useGrip(GYLD_DEST_PROPOSAL) ?? '';
  const value = useGrip(GYLD_COMPARISON) as GyldValue<GyldComparison> | undefined;

  const run = runValue?.status === 'ok' ? runValue.value : undefined;
  const proposal = run?.proposals.find((entry) => entry.id === proposalId);
  const comparison = value?.status === 'ok' ? value.value : undefined;

  return (
    <div className="gyld-compare">
      <CompareChrome run={run} />
      {run === undefined
        ? <NoRun value={runValue} />
        : (
          <>
            <RunFacts run={run} />
            {proposal !== undefined && <ProposalFacts proposal={proposal} />}
            {proposal !== undefined && <Pictures run={run} tabId={tabId} />}
            {comparison === undefined
              ? <NoComparison value={value} run={run} proposal={proposalId} />
              : <Comparison comparison={comparison} />}
            {proposal !== undefined && (
              <Report runUrl={runUrl} run={run} proposal={proposal} />
            )}
          </>
        )}
    </div>
  );
}
