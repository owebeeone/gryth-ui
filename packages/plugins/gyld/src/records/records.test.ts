import { describe, it, expect } from 'vitest';
import { createAtomValueTap, type Grip } from '@owebeeone/grip-react';
import { grok } from '@grythjs/plugin-api';
import { readDecideNow, readProjection } from '../contract';
import {
  GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP, GYLD_DEST_REF, GYLD_DEST_REF_TAP,
  GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP, GYLD_RECORD, GYLD_RECORDS, GYLD_SET, GYLD_SET_TAP,
} from '../grips';
import { GyldStoreTap } from '../store/GyldStoreTap';
import type { GyldSet } from '../store/state';
import { GyldIndexTap, GyldRecordTap } from './taps';
import {
  definitionClosure, indexProjection, recordView, recordsOf, referencedOccurrences,
  type GyldRecordView, type GyldRecords,
} from './records';
import { FakeBundle, fakeFetch } from '../../test/fakeBundle';
import projectionFixture from '../../test/fixtures/bundle/streams/base/projection.json';
import decideNowFixture from '../../test/fixtures/bundle/streams/base/decide-now.json';

// Everything asserted here must be findable in the emitted files. Where a test
// states a number it is a count OF the fixture, and where it states an id or a
// slot the same test shows the record it came out of.

const projection = readProjection(projectionFixture);
const decideNow = readDecideNow(decideNowFixture);
const index = indexProjection(projection, 'base');

const SCOPE_MODEL = 'glade_decisions:GladeDecisions.scope_model';

describe('indexing the emitted projection', () => {
  it('indexes every emitted record by its id, and nothing else', () => {
    expect(index.counts).toEqual({ occurrences: 75, assertions: 36, definitions: 83 });
    expect(index.occurrences.size).toBe(projection.occurrences.length);
    expect(index.assertions.size).toBe(projection.assertions.length);
    for (const occurrence of projection.occurrences) {
      expect(index.occurrences.get(occurrence.id)).toBe(occurrence);
    }
    for (const assertion of projection.assertions) {
      expect(index.assertions.get(assertion.id)).toBe(assertion);
    }
  });

  it('indexes by qualified slot, the identity that survives a restream', () => {
    const id = index.occurrenceBySlot.get(SCOPE_MODEL);
    expect(id).toBeDefined();
    expect(index.occurrences.get(id as string)?.source.qualified_slot).toBe(SCOPE_MODEL);
    expect(index.occurrenceBySlot.size).toBe(projection.occurrences.length);
    expect(index.assertionBySlot.size).toBeLessThanOrEqual(projection.assertions.length);
    expect(index.collisions).toEqual([]);
  });

  it('builds adjacency from the emitted references only', () => {
    for (const [occurrenceId, assertionIds] of index.incident) {
      for (const assertionId of assertionIds) {
        const assertion = index.assertions.get(assertionId);
        expect(assertion).toBeDefined();
        expect(referencedOccurrences(assertion!)).toContain(occurrenceId);
      }
    }
    // and the other way: every reference of every assertion is indexed
    for (const assertion of projection.assertions) {
      for (const id of referencedOccurrences(assertion)) {
        expect(index.incident.get(id)).toContain(assertion.id);
      }
      expect(index.owned.get(assertion.owner.occurrence)).toContain(assertion.id);
    }
  });

  it('builds the parent chain from the emitted parents only', () => {
    let counted = 0;
    for (const [parent, kids] of index.children) {
      for (const kid of kids) {
        expect(index.occurrences.get(kid)?.parent).toBe(parent);
        counted += 1;
      }
    }
    expect(counted).toBe(projection.occurrences.filter((o) => o.parent !== undefined).length);
  });

  it('reports a slot two records claim rather than picking one', () => {
    const twin = { ...projection.occurrences[1], id: 'occ:twin' };
    twin.source = { ...projection.occurrences[1].source };
    const clashing = indexProjection(
      { ...projection, occurrences: [...projection.occurrences, twin] }, 'base',
    );
    expect(clashing.collisions).toHaveLength(1);
    expect(clashing.collisions[0].slot).toBe(projection.occurrences[1].source.qualified_slot);
    expect(clashing.collisions[0].ids).toHaveLength(2);
  });

  it('carries the bundle status when there is no projection to index', () => {
    const loading = recordsOf({ status: 'loading', stream: 'base' });
    expect(loading.status).toBe('loading');
    expect(loading.counts.occurrences).toBe(0);
    const absent = recordsOf({ status: 'absent', stream: 'ghost' });
    expect(absent.status).toBe('absent');
    expect(absent.stream).toBe('ghost');
  });
});

describe('the record view', () => {
  it('resolves a qualified slot to its occurrence and the emitted closure', () => {
    const view = recordView(index, SCOPE_MODEL, decideNow);
    expect(view.status).toBe('ok');
    expect(view.sort).toBe('occurrence');
    expect(view.occurrence?.label).toBe('scope_model');
    expect(view.occurrence?.source.qualified_slot).toBe(SCOPE_MODEL);
    // the closure starts at the record's own definition and every id in it is
    // a definition this projection carries
    expect(view.definitionClosure?.[0]).toBe(view.occurrence?.definition);
    for (const id of view.definitionClosure ?? []) {
      expect(index.definitions.has(id)).toBe(true);
    }
  });

  it('carries only assertions that actually reference the record', () => {
    const view = recordView(index, SCOPE_MODEL);
    const id = view.id as string;
    expect((view.assertions ?? []).length).toBeGreaterThan(0);
    for (const assertion of view.assertions ?? []) {
      expect(referencedOccurrences(assertion)).toContain(id);
      expect(projection.assertions).toContain(assertion);
    }
    // nothing incident is left out
    expect(view.assertions).toHaveLength((index.incident.get(id) ?? []).length);
  });

  it('reads the decide-now row whole, and folds no part of it', () => {
    const view = recordView(index, SCOPE_MODEL, decideNow);
    const emitted = decideNow.questions.find((q) => q.slot === SCOPE_MODEL);
    expect(view.question).toBe(emitted);
    // and nothing is invented for a record the decide-now list does not carry
    const alternative = recordView(
      index, 'glade_decisions:GladeDecisions.node_trust', decideNow,
    );
    expect(alternative.status).toBe('ok');
    expect('question' in alternative).toBe(false);
  });

  it('resolves a record id as well as a slot, and names the sort it found', () => {
    const id = index.occurrenceBySlot.get(SCOPE_MODEL) as string;
    expect(recordView(index, id).id).toBe(id);
    const assertion = projection.assertions[0];
    const byId = recordView(index, assertion.id);
    expect(byId.sort).toBe('assertion');
    expect(byId.assertion).toBe(assertion);
    expect(byId.assertions).toEqual([assertion]);
    const definitionId = projection.occurrences[0].definition;
    const byDefinition = recordView(index, definitionId);
    expect(byDefinition.sort).toBe('definition');
    expect(byDefinition.definition).toBe(projection.definitions[definitionId]);
  });

  it('selects a definition\'s assertions by relation, as query.inspect does', () => {
    const relation = projection.assertions[0].relation;
    const view = recordView(index, relation);
    expect(view.sort).toBe('definition');
    expect((view.assertions ?? []).length).toBeGreaterThan(0);
    for (const assertion of view.assertions ?? []) {
      expect(assertion.relation).toBe(relation);
    }
  });

  it('says nothing resolves rather than guessing', () => {
    const view = recordView(index, 'glade_decisions:GladeDecisions.not_a_question');
    expect(view.status).toBe('absent');
    expect(view.fault?.code).toBe('MISSING_REFERENCE');
    expect(view.occurrence).toBeUndefined();
    expect(view.definitionClosure).toBeUndefined();
  });

  it('reports an ambiguous ref instead of choosing a sort', () => {
    const shared = projection.occurrences[0].id;
    const muddled: GyldRecords = {
      ...index,
      definitions: new Map([...index.definitions, [shared, Object.values(projection.definitions)[0]]]),
    };
    const view = recordView(muddled, shared);
    expect(view.status).toBe('absent');
    expect(view.fault?.code).toBe('AMBIGUOUS_REFERENCE');
  });

  it('passes an unsettled index through as its own status', () => {
    expect(recordView(index, '').status).toBe('unset');
    const loading = recordsOf({ status: 'loading', stream: 'base' });
    expect(recordView(loading, SCOPE_MODEL).status).toBe('loading');
  });

  it('follows only emitted references when walking a definition closure', () => {
    const relation = projection.assertions[0].relation;
    const closure = definitionClosure(index.definitions, relation);
    expect(closure[0]).toBe(relation);
    const definition = index.definitions.get(relation);
    for (const base of definition?.bases ?? []) {
      expect(closure).toContain(base);
    }
    expect(definitionClosure(index.definitions, 'not-a-definition')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The two taps over the real store, so the whole chain is exercised: store tap
// to bundle, index tap to records, record tap to the view.
// ---------------------------------------------------------------------------

const BASE_URL = 'https://example.test/out';
const STATIC_SET: GyldSet = { roots: [{ kind: 'static', baseUrl: BASE_URL }] };
let harnessCount = 0;

function harness() {
  const bundle = new FakeBundle();
  const id = `gyld-records-${harnessCount++}`;
  const root = grok.mainPresentationContext.getOrCreateMatchingContext(id);
  const home = root.getGripHomeContext();
  home.registerTap(createAtomValueTap(GYLD_SET, { initial: STATIC_SET, handleGrip: GYLD_SET_TAP }));
  home.registerTap(new GyldStoreTap({ watch: false, fetch: fakeFetch(bundle) }));
  home.registerTap(new GyldIndexTap());
  home.registerTap(new GyldRecordTap());

  function tab(key: string, stream: string, ref: string) {
    const context = root.getGripConsumerContext().getOrCreateMatchingContext(`tab:${key}`);
    const tabHome = context.getGripHomeContext();
    tabHome.registerTap(createAtomValueTap(GYLD_DEST_STREAM, {
      initial: stream, handleGrip: GYLD_DEST_STREAM_TAP,
    }));
    tabHome.registerTap(createAtomValueTap(GYLD_DEST_PERSPECTIVE, {
      initial: '', handleGrip: GYLD_DEST_PERSPECTIVE_TAP,
    }));
    tabHome.registerTap(createAtomValueTap(GYLD_DEST_REF, {
      initial: ref, handleGrip: GYLD_DEST_REF_TAP,
    }));
    return <T,>(grip: Grip<T>) => {
      const drip = context.getGripConsumerContext().getOrCreateConsumer(grip);
      drip.subscribe(() => {});
      return drip;
    };
  }

  return { tab };
}

describe('GyldIndexTap and GyldRecordTap over the store', () => {
  it('indexes the destination bundle and resolves the destination ref', async () => {
    const read = harness().tab('one', 'base', SCOPE_MODEL);
    const records = read(GYLD_RECORDS);
    const record = read(GYLD_RECORD);
    await expect.poll(() => (records.get() as GyldRecords).status).toBe('ok');
    expect((records.get() as GyldRecords).counts.occurrences).toBe(75);
    await expect.poll(() => (record.get() as GyldRecordView).status).toBe('ok');
    const view = record.get() as GyldRecordView;
    expect(view.occurrence?.label).toBe('scope_model');
    expect(view.question?.slot).toBe(SCOPE_MODEL);
    expect(view.question?.tier).toBe('roots');
  });

  it('keeps one index per unchanged bundle rather than rebuilding it', async () => {
    const read = harness().tab('memo', 'base', '');
    const records = read(GYLD_RECORDS);
    await expect.poll(() => (records.get() as GyldRecords).status).toBe('ok');
    const first = records.get();
    await Promise.resolve();
    expect(records.get()).toBe(first);
  });

  it('gives a window with no destination an unset index and an unset record', async () => {
    const read = harness().tab('empty', '', '');
    const records = read(GYLD_RECORDS);
    const record = read(GYLD_RECORD);
    await expect.poll(() => (records.get() as GyldRecords).status).toBe('unset');
    await expect.poll(() => (record.get() as GyldRecordView).status).toBe('unset');
  });

  it('says ABSENT for a ref no record of the destination stream carries', async () => {
    const read = harness().tab('ghost', 'base', 'glade_decisions:GladeDecisions.nope');
    const record = read(GYLD_RECORD);
    await expect.poll(() => (record.get() as GyldRecordView).status).toBe('absent');
    expect((record.get() as GyldRecordView).fault?.code).toBe('MISSING_REFERENCE');
  });
});
