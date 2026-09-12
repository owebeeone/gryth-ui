import { describe, it, expect } from 'vitest';
import { readComparison, readEvaluatorRun } from '../contract';
import type { GyldComparison, GyldEvaluatorRun } from '../contract';
import { GYLD_COMPARISON, GYLD_LENS, GYLD_RUN } from '../grips';
import type { GyldLensState, GyldValue } from '../store/state';
import { CompareWindow } from './CompareWindow';
import { compareTabTaps } from './compareTabTaps';
import { COMPARE_SIDES, CompareSide } from './sides';
import { reportSource } from './report';
import { mountDesk } from '../../test/mount';
import { FakeBundle, RUN_URL } from '../../test/fakeBundle';
import runFixture from '../../test/fixtures/evaluator/run.json';
import carrierFixture from '../../test/fixtures/evaluator/carrier/comparison.json';

// Step 3.2: gyld.compare. The window reads an evaluator run's own index and
// one proposal's comparison record, and shows what they say. It never ranks
// proposals, never adds an unknown cost into a subtotal, and never turns the
// evaluator's null winner into a judgement of its own (spec section 6.5).

const run = readEvaluatorRun(runFixture);
const comparison = readComparison(carrierFixture);
const carrier = run.proposals.find((proposal) => proposal.id === 'carrier')!;

/** Emitted text as RENDERED markup carries it. React escapes the five HTML
 *  characters, and Gyld's prose is full of apostrophes, so an assertion about
 *  an emitted sentence compares the escaped form of it. */
const escaped = (text: string): string => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#x27;');

const settled = async <T,>(read: () => T, done: (value: T) => boolean): Promise<T> => {
  await expect.poll(() => done(read())).toBe(true);
  return read();
};

function mount(tabId: string, params: Record<string, unknown>, image?: FakeBundle) {
  const desk = mountDesk(undefined, new FakeBundle(), image);
  const tab = desk.tab(tabId, compareTabTaps(tabId, params));
  return {
    tab,
    run: () => tab.read(GYLD_RUN).get() as GyldValue<GyldEvaluatorRun>,
    comparison: () => tab.read(GYLD_COMPARISON).get() as GyldValue<GyldComparison>,
    render: () => tab.render(<CompareWindow tabId={tabId} params={params} />),
    /** One side's lens, read in that side's own child context, which the
     *  window creates and seeds on its first render. */
    lens: (side: CompareSide) => {
      const context = tab.ctx.getGripConsumerContext()
        .getOrCreateMatchingContext(side.contextKey(tabId));
      const drip = context.getGripConsumerContext().getOrCreateConsumer(GYLD_LENS);
      drip.subscribe(() => {});
      return drip;
    },
  };
}

const OPEN = { run: RUN_URL, proposal: 'carrier' };

describe('the run index is the only enumeration of a run there is', () => {
  it('reads the run the window was opened on, and lists its proposals', async () => {
    const window = mount('cmp-run', OPEN);
    const value = await settled(window.run, (held) => held?.status === 'ok');
    expect(value.value!.run).toBe('iroh-integration-v2');
    const markup = window.render();
    for (const proposal of run.proposals) {
      expect(markup).toContain(`value="${proposal.id}"`);
    }
    // the run's own limits, read out rather than summarised
    for (const limit of run.limits) {
      expect(markup).toContain(escaped(limit));
    }
  });

  it('renders a proposal the index names but this run did not write as absent', async () => {
    const window = mount('cmp-absent', { run: RUN_URL, proposal: 'docs' });
    await settled(window.comparison, (held) => held?.status === 'absent');
    const markup = window.render();
    expect(markup).toContain('this run carries no comparison for that proposal');
    expect(markup).not.toContain('iroh-carrier-frame');
  });

  it('renders a proposal no run index names as absent too', async () => {
    const window = mount('cmp-unknown', { run: RUN_URL, proposal: 'no-such-proposal' });
    await settled(window.comparison, (held) => held?.status === 'absent');
    expect(window.render()).toContain('no-such-proposal');
  });

  it('says there is no run rather than inventing one', () => {
    const window = mount('cmp-none', {});
    const markup = window.render();
    expect(markup).toContain('no evaluator run on this window yet');
    expect(markup).not.toContain('<iframe');
  });
});

describe('the comparison, exactly as the evaluator wrote it', () => {
  it('renders every gate of the frame with both sides statuses', async () => {
    const window = mount('cmp-gates', OPEN);
    await settled(window.comparison, (held) => held?.status === 'ok');
    const markup = window.render();
    expect(markup).toContain(`frame ${comparison.frame.id}`);
    for (const gate of comparison.frame.hard_gates) {
      const baseline = comparison.baseline.gates.find((item) => item.id === gate.id)!;
      const candidate = comparison.candidate.gates.find((item) => item.id === gate.id)!;
      const row = new RegExp(
        `<tr[^>]*data-gate="${gate.id}"[\\s\\S]*?</tr>`,
      ).exec(markup)?.[0] ?? '';
      expect(row).toContain(baseline.status);
      expect(row).toContain(candidate.status);
    }
    // and the hard gates are pinned as the frame pinned them
    expect(markup).toContain(`${comparison.frame.hard_gates.length} hard gates`);
    expect(markup).toContain(`${comparison.frame.obligation_ids.length} obligations pinned`);
  });

  it('renders the obligations with retained and satisfaction per side', async () => {
    const window = mount('cmp-obligations', OPEN);
    await settled(window.comparison, (held) => held?.status === 'ok');
    const markup = window.render();
    const rows = markup.match(/data-obligation="[^"]*"/g) ?? [];
    expect(rows).toHaveLength(comparison.frame.obligation_ids.length);
    for (const obligation of comparison.candidate.obligations) {
      const row = new RegExp(
        `<tr[^>]*data-obligation="${obligation.id}"[\\s\\S]*?</tr>`,
      ).exec(markup)?.[0] ?? '';
      expect(row).toContain(obligation.satisfaction);
      expect(row).toContain(obligation.retained ? 'retained' : 'dropped');
    }
  });

  it('never puts an unknown cost in a subtotal', async () => {
    const window = mount('cmp-costs', OPEN);
    await settled(window.comparison, (held) => held?.status === 'ok');
    const markup = window.render();
    const unknown = comparison.candidate.costs.unknown_ids;
    expect(unknown.length).toBeGreaterThan(0);
    for (const id of unknown) {
      expect(markup).toContain(`data-unknown="${id}"`);
    }
    // every subtotal the window draws names the exact records it covers, and
    // no unknown one is among them, on this side or in any future
    const covered = (markup.match(/data-cost-ids="([^"]*)"/g) ?? [])
      .flatMap((attribute) => attribute.slice('data-cost-ids="'.length, -1).split(' '));
    expect(covered.length).toBeGreaterThan(0);
    const everyUnknown = [
      ...unknown,
      ...comparison.futures.flatMap((future) => future.candidate.costs.unknown_ids),
    ];
    for (const id of everyUnknown) {
      expect(covered).not.toContain(id);
    }
    // a side with nothing it could add up says so; it never shows a zero
    expect(markup).toContain('no subtotal: every cost of this side is unknown');
  });

  it('renders each future with its gates, its subtotal and its note', async () => {
    const window = mount('cmp-futures', OPEN);
    await settled(window.comparison, (held) => held?.status === 'ok');
    const markup = window.render();
    for (const future of comparison.futures) {
      const section = new RegExp(
        `<section[^>]*data-future="${future.id}"[\\s\\S]*?</section>`,
      ).exec(markup)?.[0] ?? '';
      expect(section).not.toBe('');
      expect(section).toContain(future.probability.state);
      expect(section).toContain(escaped(future.probability.reason));
      expect(section).toContain(future.authority);
      for (const gate of future.candidate.gates) {
        expect(section).toContain(gate.id);
      }
    }
    const priced = comparison.futures.find((future) => future.id === 'iroh-services-pro')!;
    const subtotal = priced.candidate.costs.conditional_subtotals[0];
    expect(markup).toContain(`${subtotal.value} ${subtotal.unit}`);
    expect(markup).toContain(subtotal.condition);
  });

  it('renders the null winner as null, with the evaluator reason', async () => {
    const window = mount('cmp-winner', OPEN);
    await settled(window.comparison, (held) => held?.status === 'ok');
    const markup = window.render();
    const decision = /<dl[^>]*class="gyld-compare-decision"[\s\S]*?<\/dl>/.exec(markup)?.[0] ?? '';
    expect(decision).toContain('winner');
    expect(decision).toContain('null');
    expect(decision).toContain(comparison.winner_reason);
    expect(decision).toContain('architecture superiority');
    expect(markup).not.toContain('wins');
  });

  it('renders the evidence provenance, the impact and the summary rows', async () => {
    const window = mount('cmp-rest', OPEN);
    await settled(window.comparison, (held) => held?.status === 'ok');
    const markup = window.render();
    for (const record of comparison.candidate.evidence) {
      const provenance = comparison.evidence_provenance![record.id];
      expect(markup).toContain(record.id);
      expect(markup).toContain(escaped(provenance.basis));
      expect(markup).toContain(record.applicability);
    }
    expect(markup).toContain('structural impact');
    expect(markup).toContain(escaped(comparison.summary!.narrative));
    for (const row of comparison.summary!.rows) {
      expect(markup).toContain(String(row[0]));
    }
  });
});

describe('the two pictures and the report', () => {
  it('resolves one lens per side, from the file the run index names', async () => {
    const window = mount('cmp-lenses', OPEN);
    await settled(window.run, (held) => held?.status === 'ok');
    window.render();
    for (const side of COMPARE_SIDES) {
      const state = await settled(
        () => window.lens(side).get() as GyldLensState,
        (held) => held?.status === 'ok',
      );
      expect(state.perspective).toBe(side.name);
      // an evaluator lens is of a SNAPSHOT, so it names no stream
      expect(state.value!.stream).toBeUndefined();
      expect(state.value!.perspective).toBe(run.lens.perspective);
    }
    const markup = window.render();
    expect(markup).toContain('data-side="baseline"');
    expect(markup).toContain('data-side="candidate"');
    // what each picture is, in the run's own words, and what both leave out
    expect(markup).toContain(escaped(run.lens.baseline));
    expect(markup).toContain(escaped(run.lens.candidate));
    for (const omission of run.lens.omissions) {
      expect(markup).toContain(escaped(omission));
    }
  });

  it('iframes the report this run names, in the run that holds it', async () => {
    const window = mount('cmp-report', OPEN);
    await settled(window.comparison, (held) => held?.status === 'ok');
    const markup = window.render();
    const source = reportSource(RUN_URL, run, carrier)!;
    expect(source.url).toBe('https://example.test/runs/iroh-integration-v1/carrier/report.html');
    expect(markup).toContain(`src="${source.url}"`);
    // and the window says where that came from rather than implying it
    expect(markup).toContain(run.reports.run!);
    expect(markup).toContain(escaped(run.reports.note!));
  });

  it('composes the report path from the run own index, and none without one', () => {
    // a run that emitted its own report names the file, and that wins
    const emitted = structuredClone(run);
    emitted.proposals[0].files.report_html = 'carrier/report.html';
    expect(reportSource(RUN_URL, emitted, emitted.proposals[0])!.url)
      .toBe(`${RUN_URL}/carrier/report.html`);
    // a run that emitted none and names none has no report to show
    const orphan = structuredClone(run);
    delete orphan.reports.run;
    expect(reportSource(RUN_URL, orphan, orphan.proposals[0])).toBeUndefined();
  });
});
