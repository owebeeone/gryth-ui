import { describe, it, expect } from 'vitest';
import { createAtomValueTap } from '@owebeeone/grip-react';
import { DESKTOP_OPEN_TOOL, DESKTOP_OPEN_WIRED } from '@grythjs/plugin-api';
import { GYLD_BUNDLE, GYLD_DECIDE_NOW, GYLD_RECORDS } from '../grips';
import { browserTabTaps } from '../browser/browserTabTaps';
import { questionParams } from '../browser/links';
import { DecideNowList } from './DecideNowList';
import { decideNowTabTaps } from './decideNowTabTaps';
import { readProjection, type GyldDecideNow } from '../contract';
import { indexProjection, slotTitle, type GyldRecords } from '../records/records';
import type { GyldBundle, GyldValue } from '../store/state';
import { mountDesk, wireSink } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';
import decideNow from '../../test/fixtures/bundle/streams/base/decide-now.json';
import projection from '../../test/fixtures/bundle/streams/base/projection.json';
import streamRecord from '../../test/fixtures/bundle/streams/base/stream.json';
import validation from '../../test/fixtures/bundle/streams/base/validation.json';

// Step 1.5: gyld.decidenow. The list is the EMITTED list: which questions are
// answerable now, what blocks the blocked ones and what gates the gated ones
// are read out of decide-now.json, never folded here (spec section 6.7).

const settled = async <T,>(read: () => T, done: (value: T) => boolean): Promise<T> => {
  await expect.poll(() => done(read())).toBe(true);
  return read();
};

/** Every `data-slot` inside one group of the rendered list, in render order. */
function slotsIn(markup: string, group: string): string[] {
  const section = new RegExp(`<section[^>]*data-group="${group}"[\\s\\S]*?</section>`).exec(markup);
  if (section === null) {
    return [];
  }
  const slots: string[] = [];
  const slot = /data-slot="([^"]*)"/g;
  for (let m = slot.exec(section[0]); m !== null; m = slot.exec(section[0])) {
    slots.push(m[1]);
  }
  return slots;
}

function mount(tabId: string, stream: string, bundle = new FakeBundle()) {
  const desk = mountDesk(undefined, bundle);
  const tab = desk.tab(tabId, decideNowTabTaps(tabId, { stream }));
  return {
    value: () => tab.read(GYLD_DECIDE_NOW).get() as GyldValue<GyldDecideNow>,
    bundle: () => tab.read(GYLD_BUNDLE).get() as GyldBundle,
    // The projection index, read only so a test can wait for the titles the
    // list leads its rows with; the list itself reads the same grip.
    records: () => tab.read(GYLD_RECORDS).get() as GyldRecords | undefined,
    render: () => tab.render(<DecideNowList />),
  };
}

describe('gyld.decidenow lists exactly what the stream emitted', () => {
  it('answers now with the emitted roots, in the emitted order', async () => {
    const list = mount('dn-roots', 'base');
    await settled(list.value, (value) => value?.status === 'ok');
    const markup = list.render();
    expect(slotsIn(markup, 'answerable')).toEqual(streamRecord.roots);
    // the tier of each is the emitted tier, not a position in this list
    for (const slot of streamRecord.roots) {
      const question = decideNow.questions.find((q) => q.slot === slot)!;
      expect(markup).toContain(`${question.label} · ${question.tier}`);
    }
  });

  it('says what blocks the blocked and what gates the gated', async () => {
    const list = mount('dn-blocked', 'base');
    await settled(list.value, (value) => value?.status === 'ok');
    const markup = list.render();
    const blocked = decideNow.questions
      .filter((q) => !q.answerable_now && q.blocked_by.length > 0).map((q) => q.slot);
    const gated = decideNow.questions
      .filter((q) => !q.answerable_now && q.blocked_by.length === 0 && q.gated_by.length > 0)
      .map((q) => q.slot);
    expect(slotsIn(markup, 'blocked')).toEqual(blocked);
    expect(slotsIn(markup, 'gated')).toEqual(gated);
    // every emitted blocker and gate is named, and none is invented
    for (const question of decideNow.questions) {
      for (const blocker of question.blocked_by) {
        expect(markup).toContain(`blocked by ${blocker}`);
      }
      for (const gate of question.gated_by) {
        expect(markup).toContain(`gated by ${gate}`);
      }
    }
  });

  it('says why the answerable ones are answerable, not only that they are', async () => {
    const list = mount('dn-because', 'base');
    await settled(list.value, (value) => value?.status === 'ok');
    const markup = list.render();
    // Every answerable row carries its own emitted reason, and every
    // prerequisite that reason names is named on the row.
    for (const question of decideNow.questions.filter((q) => q.answerable_now)) {
      const because = question.answerable_because!;
      expect(because).toBeDefined();
      for (const prerequisite of because.prerequisites) {
        expect(markup).toContain(prerequisite.slot);
      }
    }
    expect(markup).toContain('answerable now: no prerequisite at all');
    expect(markup).toContain(
      'answerable now: every prerequisite is decided ('
      + 'glade_decisions:GladeDecisions.grants_as_data, '
      + 'glade_decisions:GladeDecisions.iroh_transport'
      + '), nothing gates it, not branch-induced',
    );
  });

  it('puts a branch a ruling opened in the answerable group, saying whose choice', async () => {
    // `metadata_exposure` is branch-induced: the fixture has it unanswerable in
    // tier `branch-induced`, which is what a stream that chose nothing emits.
    // A stream whose ruling chose `node_trust`, which implies it, emits it as
    // answerable with that choice as the reason. The grouping is a read of
    // `answerable_now`, so the row lands beside the other answerable ones and
    // the tier it still carries is printed rather than used to sort it.
    const slot = 'glade_decisions:GladeDecisions.metadata_exposure';
    const dormant = decideNow.questions.find((q) => q.slot === slot)!;
    expect(dormant.answerable_now).toBe(false);
    expect(dormant.tier).toBe('branch-induced');
    const ruling = 'glade_decisions_rulings:GladeDecisionsRulings.scope_model_ruling';
    const bundle = new FakeBundle();
    bundle.write('streams/base/decide-now.json', {
      ...decideNow,
      questions: decideNow.questions.map((question) => (question.slot === slot ? {
        ...question,
        answerable_now: true,
        answerable_because: {
          prerequisites: [],
          gated_by: [],
          induced_by: [{ slot: 'glade_decisions:GladeDecisions.node_trust', ruling }],
        },
      } : question)),
    });
    const list = mount('dn-opened', 'base', bundle);
    await settled(list.value, (value) => value?.status === 'ok');
    const markup = list.render();
    expect(slotsIn(markup, 'answerable')).toContain(slot);
    expect(slotsIn(markup, 'other')).not.toContain(slot);
    expect(markup).toContain(
      'answerable now: no prerequisite at all, nothing gates it, opened by your choice of '
      + `glade_decisions:GladeDecisions.node_trust by ruling ${ruling}`,
    );
    // The row keeps the two lines it always had: its own tier and its own edges.
    expect(markup).toContain(`${dormant.label} · branch-induced`);
    expect(markup).toContain('induced by glade_decisions:GladeDecisions.node_trust');
  });

  it('shows every emitted row, including the ones in no other group', async () => {
    const list = mount('dn-rest', 'base');
    await settled(list.value, (value) => value?.status === 'ok');
    const markup = list.render();
    const shown = ['answerable', 'blocked', 'gated', 'other'].flatMap((g) => slotsIn(markup, g));
    expect(shown.sort()).toEqual(decideNow.questions.map((q) => q.slot).sort());
    expect(markup).toContain(`${decideNow.questions.length} emitted rows`);
  });

  it('shows the stream, the built stamp, the validation and the emitted limits', async () => {
    const list = mount('dn-head', 'base');
    await settled(list.value, (value) => value?.status === 'ok');
    // the built stamp and the validation come from the stream's own record,
    // so the whole bundle has to have landed before the header is complete
    await settled(list.bundle, (bundle) => bundle?.status === 'ok');
    const markup = list.render();
    expect(markup).toContain(`built ${streamRecord.built}`);
    expect(markup).toContain(`validation ${validation.ok ? 'ok' : 'invalid'}`);
    for (const limit of decideNow.limits) {
      expect(markup).toContain(limit);
    }
  });

  it('names the preferred alternative only where the stream recorded one', async () => {
    const list = mount('dn-lean', 'base');
    await settled(list.value, (value) => value?.status === 'ok');
    const markup = list.render();
    // the emitted file writes a missing lean as null; the reader drops it,
    // and the window says there is none rather than printing the null
    const lean = decideNow.questions.find((q) => q.answerable_now && q.preferred !== null)!;
    expect(markup).toContain(`prefers ${lean.preferred}`);
    const none = decideNow.questions.find((q) => q.answerable_now && q.preferred === null)!;
    expect(none.slot).toBe('glade_decisions:GladeDecisions.key_custody');
    expect(markup).toContain('no lean recorded');
  });
});

describe('gyld.decidenow when there is nothing to list', () => {
  it('renders the diagnosis for a stream whose bundle has no decide-now file', async () => {
    const bundle = new FakeBundle();
    bundle.remove('streams/base/decide-now.json');
    const list = mount('dn-absent', 'base', bundle);
    await settled(list.value, (value) => value?.status === 'absent');
    const markup = list.render();
    expect(markup).toContain('this stream emitted no decide-now list');
    expect(markup).toContain('streams/base/decide-now.json');
    expect(markup).not.toContain('data-group="answerable"');
  });

  it('renders the diagnosis for a stream the census does not carry', async () => {
    const list = mount('dn-nostream', 'no-such-stream');
    await settled(list.value, (value) => value?.status === 'absent');
    const markup = list.render();
    expect(markup).toContain('no-such-stream');
    expect(markup).toContain('bundle absent');
  });

  it('renders the diagnosis, not an empty list, when the file does not read', async () => {
    const bundle = new FakeBundle();
    bundle.writeText('streams/base/decide-now.json', '{ not json');
    const list = mount('dn-invalid', 'base', bundle);
    await settled(list.value, (value) => value?.status === 'invalid');
    const markup = list.render();
    expect(markup).toContain('the decide-now file did not read');
    expect(markup).toContain('not valid JSON');
  });
});

describe('a row opens the decide window on that question', () => {
  it('refuses the row button when no desktop can open a window', async () => {
    const list = mount('dn-nodesk', 'base');
    await settled(list.value, (value) => value?.status === 'ok');
    const markup = list.render();
    expect(/<button[^>]*class="gyld-open-decide"[^>]*disabled/.test(markup)).toBe(true);
  });

  it('offers a decide button per row when this window is standalone', async () => {
    const desk = mountDesk();
    desk.ctx.getGripHomeContext().registerTap(createAtomValueTap(DESKTOP_OPEN_TOOL, {
      initial: () => {},
    }));
    const tab = desk.tab('dn-decide', decideNowTabTaps('dn-decide', { stream: 'base' }));
    await settled(
      () => tab.read(GYLD_DECIDE_NOW).get() as GyldValue<GyldDecideNow>,
      (value) => value?.status === 'ok',
    );
    const markup = tab.render(<DecideNowList />);
    expect(/<button[^>]*class="gyld-open-decide"[^>]*disabled/.test(markup)).toBe(false);
    // one per emitted row, and no row invented
    expect(markup.match(/class="gyld-open-decide"/g)?.length)
      .toBe(decideNow.questions.length);
    expect(markup).toContain('answer this question in a decide window of its own');
    // the link a row writes is the spec's own `{ stream, question }`
    expect(questionParams('base', decideNow.questions[0].slot))
      .toEqual({ stream: 'base', question: decideNow.questions[0].slot });
  });

  it('says it will open the decide window wired to the browser it follows', async () => {
    const desk = mountDesk();
    desk.ctx.getGripHomeContext().registerTap(createAtomValueTap(DESKTOP_OPEN_WIRED, {
      initial: () => {},
    }));
    const browser = desk.tab('dn-source', browserTabTaps('dn-source', { stream: 'base' }));
    const sink = wireSink(browser, 'tab:dn-sink', decideNowTabTaps('dn-sink'));
    await settled(
      () => sink.read(GYLD_DECIDE_NOW).get() as GyldValue<GyldDecideNow>,
      (value) => value?.status === 'ok',
    );
    const markup = sink.render(<DecideNowList />);
    expect(markup).toContain('wired to dn-source');
    expect(markup).toContain('answer this question in the decide window wired to dn-source');
    expect(/<button[^>]*class="gyld-open-decide"[^>]*disabled/.test(markup)).toBe(false);
  });
});

describe('gyld.decidenow leads each row with the question it asks', () => {
  it('renders the emitted docstring first paragraph above the identifier', async () => {
    const list = mount('dn-title', 'base');
    await settled(list.value, (value) => value?.status === 'ok');
    await settled(list.records, (value) => value?.status === 'ok');
    const markup = list.render();
    const index = indexProjection(readProjection(projection), 'base');
    const slot = streamRecord.roots[0];
    const title = slotTitle(index, slot);
    expect(title).not.toBe('');
    expect(markup).toContain(`<p class="gyld-question-title">${title}</p>`);
    // The identifier and tier line the list already had is still there.
    const question = decideNow.questions.find((q) => q.slot === slot)!;
    expect(markup).toContain(`${question.label} \u00b7 ${question.tier}`);
  });
});
