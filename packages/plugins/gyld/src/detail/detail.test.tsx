import { describe, it, expect } from 'vitest';
import type { AtomTapHandle } from '@owebeeone/grip-react';
import { GYLD_DEST_REF, GYLD_DEST_REF_TAP, GYLD_RECORD } from '../grips';
import { browserTabTaps } from '../browser/browserTabTaps';
import { RecordDetail } from './RecordDetail';
import { detailTabTaps } from './detailTabTaps';
import type { GyldRecordView } from '../records/records';
import { mountDesk, wireSink } from '../../test/mount';
import projection from '../../test/fixtures/bundle/streams/base/projection.json';
import decideNow from '../../test/fixtures/bundle/streams/base/decide-now.json';

// Step 1.5: gyld.detail. Every assertion below names a string that is IN the
// emitted files, and the last one names what is not: a field the bundle does
// not carry is rendered as not emitted, never as an empty value and never
// computed from something else.

const SCOPE_MODEL = 'glade_decisions:GladeDecisions.scope_model';

const emitted = {
  occurrence: projection.occurrences.find((o) => o.source.qualified_slot === SCOPE_MODEL)!,
  question: decideNow.questions.find((q) => q.slot === SCOPE_MODEL)!,
};
const definition = (projection.definitions as Record<string, {
  kind: string; label: string; description: string;
}>)[emitted.occurrence.definition];

const settled = async <T,>(read: () => T, done: (value: T) => boolean): Promise<T> => {
  await expect.poll(() => done(read())).toBe(true);
  return read();
};

function standalone(tabId: string, ref: string) {
  const desk = mountDesk();
  const params = { stream: 'base', ref };
  const tab = desk.tab(tabId, detailTabTaps(tabId, params));
  return {
    view: () => tab.read(GYLD_RECORD).get() as GyldRecordView,
    render: () => tab.render(<RecordDetail />),
  };
}

describe('gyld.detail renders emitted facts and says so when there are none', () => {
  it('renders the record, its definition and its emitted relations', async () => {
    const detail = standalone('detail-ok', SCOPE_MODEL);
    await settled(detail.view, (view) => view?.status === 'ok');
    const markup = detail.render();

    // identity, exactly as emitted
    expect(markup).toContain(SCOPE_MODEL);
    expect(markup).toContain(emitted.occurrence.label);
    expect(markup).toContain(emitted.occurrence.id);
    // the definition behind it: kind, label and the docstring
    expect(markup).toContain(definition.kind);
    expect(markup).toContain(definition.label);
    expect(markup).toContain(definition.description);
    // the source site
    expect(markup).toContain(`${emitted.occurrence.source.module}:${emitted.occurrence.source.line}`);
    // the decide-now row, read whole and never recomputed
    expect(markup).toContain(`effective status ${emitted.question.effective_status}`);
    expect(markup).toContain(`tier ${emitted.question.tier}`);
    expect(markup).toContain(emitted.question.preferred!);
    // the emitted assertions, by relation name and by connected record
    expect(markup).toContain('data-relation="Offers"');
    expect(markup).toContain('data-relation="Requires"');
    expect(markup).toContain('glade_decisions:ScopeModel.offers');
    expect(markup).toContain('data-slot="glade_decisions:GladeDecisions.node_trust"');
    expect(markup).toContain('data-slot="glade_decisions:GladeDecisions.iroh_transport"');
    // provenance: which stream, which snapshot
    expect(markup).toContain('glade-decision-graph');
    expect(markup).toContain('94552adafc38');
  });

  it('says which parts of the record no bundle emits yet', async () => {
    const detail = standalone('detail-omits', SCOPE_MODEL);
    await settled(detail.view, (view) => view?.status === 'ok');
    const markup = detail.render();
    expect(markup).toContain('classification: not emitted');
    expect(markup).toContain('obligations: not emitted');
    expect(markup).toContain('no lens on this window');
  });

  it('reports a ref no record of the stream carries, rather than an empty view', async () => {
    const detail = standalone('detail-missing', 'glade_decisions:GladeDecisions.no_such_question');
    await settled(detail.view, (view) => view?.status === 'absent');
    const markup = detail.render();
    expect(markup).toContain('no record of this stream carries that slot or id');
    expect(markup).not.toContain('data-relation=');
  });

  it('renders nothing to look at, and says so, with no record seeded', async () => {
    const desk = mountDesk();
    const tab = desk.tab('detail-bare', detailTabTaps('detail-bare'));
    await settled(() => tab.read(GYLD_RECORD).get() as GyldRecordView, (view) => view !== undefined);
    expect(tab.render(<RecordDetail />))
      .toContain('no record on this window yet');
  });
});

describe('gyld.detail as a wired sink', () => {
  it('follows the source browser with no param copied to it', async () => {
    const desk = mountDesk();
    const browser = desk.tab('wired-source', browserTabTaps('wired-source', {
      stream: 'base', perspective: 'decisions',
    }));
    // wired: openWired passes no params, so the sink seeds nothing at all
    const sink = wireSink(browser, 'sink:detail', detailTabTaps('sink:detail'));
    const refTap = browser.read(GYLD_DEST_REF_TAP).get() as AtomTapHandle<string>;
    refTap.set(SCOPE_MODEL);
    await settled(
      () => sink.read(GYLD_RECORD).get() as GyldRecordView,
      (view) => view?.ref === SCOPE_MODEL && view.status === 'ok',
    );
    const markup = sink.render(<RecordDetail />);
    expect(markup).toContain(emitted.occurrence.label);
    expect(markup).toContain('wired to wired-source');
    // the sink inherits the browser's perspective too, so it names the lens
    expect(markup).toContain('decisions');
    expect(markup).not.toContain('no lens on this window');
  });

  it('moves the source browser when a connected record is opened', async () => {
    const desk = mountDesk();
    const browser = desk.tab('retarget-source', browserTabTaps('retarget-source', {
      stream: 'base', perspective: 'decisions',
    }));
    const sink = wireSink(browser, 'sink:retarget', detailTabTaps('sink:retarget'));
    const refTap = browser.read(GYLD_DEST_REF_TAP).get() as AtomTapHandle<string>;
    refTap.set(SCOPE_MODEL);
    await settled(
      () => sink.read(GYLD_RECORD).get() as GyldRecordView,
      (view) => view?.ref === SCOPE_MODEL,
    );
    // the sink resolves the SOURCE's handle through the graph, so writing it
    // is what retargets the browser; no param is copied and no window is made
    const inherited = sink.read(GYLD_DEST_REF_TAP).get() as AtomTapHandle<string>;
    expect(inherited).toBe(refTap);
    inherited.set('glade_decisions:GladeDecisions.node_trust');
    await expect.poll(() => browser.read(GYLD_DEST_REF).get())
      .toBe('glade_decisions:GladeDecisions.node_trust');
  });
});
