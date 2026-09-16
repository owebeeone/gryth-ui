import { describe, it, expect } from 'vitest';
import { createAtomValueTap, type AtomTapHandle, type Drip } from '@owebeeone/grip-react';
import { DESKTOP_OPEN_TOOL } from '@grythjs/plugin-api';
import {
  GYLD_DEST_REF, GYLD_DEST_REF_TAP, GYLD_FOCUS_TAP, GYLD_RECORD, GYLD_TAB_FOLLOW,
  GYLD_TAB_FOLLOW_TAP,
} from '../grips';
import type { GyldFocus } from '../focus';
import { browserTabTaps } from '../browser/browserTabTaps';
import { DETAIL_FOCUS_CONTEXT, RecordDetail } from './RecordDetail';
import { detailTabTaps } from './detailTabTaps';
import type { GyldRecordView } from '../records/records';
import { FakeBundle } from '../../test/fakeBundle';
import { mountDesk, wireSink, type MountedDesk } from '../../test/mount';
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

function standalone(tabId: string, ref: string, bundle?: FakeBundle) {
  const desk = mountDesk(undefined, bundle);
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
    // why it is answerable now, and not only that it is
    expect(emitted.question.answerable_now).toBe(true);
    expect(markup).toContain(
      'yes, every prerequisite is decided ('
      + 'glade_decisions:GladeDecisions.grants_as_data, '
      + 'glade_decisions:GladeDecisions.iroh_transport'
      + '), nothing gates it, not branch-induced',
    );
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
    // the projection WAS read and does not carry it, which is the only case
    // "no such record" is true of
    expect(markup).toContain('no record of this stream carries that slot or id');
    expect(markup).not.toContain('not readable on this root');
    expect(markup).not.toContain('data-relation=');
  });

  it('says the records did not read, not that the record is missing, with no projection', async () => {
    // The glade-root case before the supplier published `gyld.file`: the
    // stream record read and the projection did not, so every record of the
    // stream read as missing when none of them had been looked for.
    const bundle = new FakeBundle();
    bundle.remove('streams/base/projection.json');
    const detail = standalone('detail-unreadable', SCOPE_MODEL, bundle);
    await settled(detail.view, (view) => view?.status === 'absent');
    const markup = detail.render();
    expect(markup).toContain('the records of this stream are not readable on this root');
    // and why, in the store's own words
    expect(markup).toContain('streams/base/projection.json');
    expect(markup).not.toContain('no record of this stream carries that slot or id');
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

describe('gyld.detail opens the decide window on the record it shows', () => {
  it('refuses the button when no desktop can open a window', async () => {
    const detail = standalone('detail-nodesk', SCOPE_MODEL);
    await settled(detail.view, (view) => view?.status === 'ok');
    const markup = detail.render();
    expect(/<button[^>]*class="gyld-open-decide"[^>]*disabled/.test(markup)).toBe(true);
  });

  it('offers the button for a record this stream lists a decide-now row for', async () => {
    const desk = mountDesk();
    desk.ctx.getGripHomeContext().registerTap(createAtomValueTap(DESKTOP_OPEN_TOOL, {
      initial: () => {},
    }));
    const tab = desk.tab('detail-decide', detailTabTaps('detail-decide', {
      stream: 'base', ref: SCOPE_MODEL,
    }));
    await settled(
      () => tab.read(GYLD_RECORD).get() as GyldRecordView,
      (view) => view?.status === 'ok',
    );
    const markup = tab.render(<RecordDetail />);
    expect(/<button[^>]*class="gyld-open-decide"[^>]*disabled/.test(markup)).toBe(false);
    expect(markup).toContain('answer this question in a decide window of its own');
  });

  it('refuses the button for a record no decide-now row names', async () => {
    const desk = mountDesk();
    desk.ctx.getGripHomeContext().registerTap(createAtomValueTap(DESKTOP_OPEN_TOOL, {
      initial: () => {},
    }));
    // an alternative, not a question: the emitted decide-now list has no row
    // for it, so there is nothing to answer and the window says so
    const alternative = 'glade_decisions:ScopeModel.offers';
    const tab = desk.tab('detail-noquestion', detailTabTaps('detail-noquestion', {
      stream: 'base', ref: alternative,
    }));
    await settled(
      () => tab.read(GYLD_RECORD).get() as GyldRecordView,
      (view) => view?.status === 'ok',
    );
    const markup = tab.render(<RecordDetail />);
    expect(/<button[^>]*class="gyld-open-decide"[^>]*disabled/.test(markup)).toBe(true);
    expect(markup).toContain('this stream lists no decide-now row for this record');
  });
});

describe('gyld.detail following the shared focus', () => {
  /**
   * The record view inside the window's FOCUS context, which the window
   * creates on its first render, exactly as the diff window's panes are.
   *
   * HELD, one per tab, for the life of this file. The graph holds contexts and
   * drips by WeakRef (`test/mount.tsx`, "the harness is the holder"), and this
   * reader is called on every tick of a poll: a consumer only the last tick
   * knew about can be collected between two ticks, and the poll then reads a
   * brand new consumer that has not been produced to yet, for ever. Holding it
   * is what makes the wait a wait rather than a race with the collector.
   */
  const heldFocus = new Map<unknown, { context: unknown; drip: Drip<GyldRecordView> }>();
  const followed = (tab: ReturnType<MountedDesk['tab']>): Drip<GyldRecordView> => {
    const known = heldFocus.get(tab);
    if (known !== undefined) {
      return known.drip;
    }
    const context = tab.ctx.getGripConsumerContext()
      .getOrCreateMatchingContext(DETAIL_FOCUS_CONTEXT);
    const drip = context.getGripConsumerContext()
      .getOrCreateConsumer(GYLD_RECORD) as Drip<GyldRecordView>;
    drip.subscribe(() => {});
    heldFocus.set(tab, { context, drip });
    return drip;
  };

  /**
   * Turn this window's `follow focus` on, AFTER its seed has published.
   *
   * `createAtomValueTap` publishes its initial value on its first produce, and
   * a write that lands before that produce is overwritten by it. Writing the
   * handle the instant the tab is built is therefore a race the loaded machine
   * loses: the window renders with following OFF, reads its own empty ref and
   * draws the empty state. Waiting for the seeded `false` is waiting for the
   * tap to have produced, which is the only thing that makes the write stick.
   */
  const startFollowing = async (tab: ReturnType<MountedDesk['tab']>): Promise<void> => {
    await expect.poll(() => tab.read(GYLD_TAB_FOLLOW).get()).toBe(false);
    (tab.read(GYLD_TAB_FOLLOW_TAP).get() as AtomTapHandle<boolean>).set(true);
    expect(tab.read(GYLD_TAB_FOLLOW).get()).toBe(true);
  };

  it('offers the toggle on a standalone window, off, with nothing on it', async () => {
    const desk = mountDesk();
    const tab = desk.tab('detail-follow-off', detailTabTaps('detail-follow-off'));
    await expect.poll(() => tab.read(GYLD_TAB_FOLLOW_TAP).get()).toBeDefined();
    expect(tab.read(GYLD_TAB_FOLLOW).get()).toBe(false);
    const markup = tab.render(<RecordDetail />);
    expect(markup).toContain('follow focus');
    expect(markup).toContain('no record on this window yet');
    expect(/<input[^>]*class="gyld-follow-focus"[^>]*checked/.test(markup)).toBe(false);
  });

  it('shows the record last focused in any browser once it is on', async () => {
    const desk = mountDesk();
    const tab = desk.tab('detail-follow', detailTabTaps('detail-follow'));
    await startFollowing(tab);
    // what a click in a browser writes: a stream and a qualified slot
    (desk.read(GYLD_FOCUS_TAP).get() as AtomTapHandle<GyldFocus>)
      .set({ stream: 'base', ref: SCOPE_MODEL });
    tab.render(<RecordDetail />);
    const view = await settled(
      () => followed(tab).get(),
      (held) => held?.status === 'ok',
    );
    expect(view?.ref).toBe(SCOPE_MODEL);
    const markup = tab.render(<RecordDetail />);
    expect(markup).toContain(emitted.occurrence.label);
    expect(markup).toContain('following the shared focus');
    expect(/<input[^>]*class="gyld-follow-focus"[^>]*checked/.test(markup)).toBe(true);
  });

  it('follows the focus onto another stream, not just another record', async () => {
    const desk = mountDesk();
    const tab = desk.tab('detail-follow-stream', detailTabTaps('detail-follow-stream'));
    await startFollowing(tab);
    const focus = desk.read(GYLD_FOCUS_TAP).get() as AtomTapHandle<GyldFocus>;
    focus.set({ stream: 'base', ref: SCOPE_MODEL });
    tab.render(<RecordDetail />);
    await settled(
      () => followed(tab).get(),
      (held) => held?.status === 'ok' && held.ref === SCOPE_MODEL,
    );
    // a question stream A added, which the base does not carry at all
    const PIN_AUDIT = 'glade_decisions_stream_a:GladeDecisionsStreamA.pin_audit';
    focus.set({ stream: 'stream-a', ref: PIN_AUDIT });
    await settled(
      () => followed(tab).get(),
      (held) => held?.status === 'ok' && held.ref === PIN_AUDIT,
    );
    expect(tab.render(<RecordDetail />)).toContain('pin_audit');
  });

  it('leaves a wired window on its browser, whatever the focus says', async () => {
    const desk = mountDesk();
    const browser = desk.tab('follow-source', browserTabTaps('follow-source', {
      stream: 'base', perspective: 'decisions',
    }));
    const sink = wireSink(browser, 'sink:follow', detailTabTaps('sink:follow'));
    await startFollowing(sink);
    (browser.read(GYLD_DEST_REF_TAP).get() as AtomTapHandle<string>).set(SCOPE_MODEL);
    // the shared focus is somewhere else entirely; a wired window follows the
    // browser it is wired to and says which one, and offers no toggle at all
    (desk.read(GYLD_FOCUS_TAP).get() as AtomTapHandle<GyldFocus>)
      .set({ stream: 'base', ref: 'glade_decisions:GladeDecisions.node_trust' });
    await settled(
      () => sink.read(GYLD_RECORD).get() as GyldRecordView,
      (view) => view?.ref === SCOPE_MODEL && view.status === 'ok',
    );
    const markup = sink.render(<RecordDetail />);
    expect(markup).toContain('wired to follow-source');
    expect(markup).toContain(emitted.occurrence.label);
    expect(markup).not.toContain('follow focus');
  });
});
