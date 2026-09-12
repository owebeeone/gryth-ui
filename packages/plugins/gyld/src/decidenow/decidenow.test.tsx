import { describe, it, expect } from 'vitest';
import { GYLD_BUNDLE, GYLD_DECIDE_NOW } from '../grips';
import { DecideNowList } from './DecideNowList';
import { decideNowTabTaps } from './decideNowTabTaps';
import type { GyldDecideNow } from '../contract';
import type { GyldBundle, GyldValue } from '../store/state';
import { mountDesk } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';
import decideNow from '../../test/fixtures/bundle/streams/base/decide-now.json';
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
