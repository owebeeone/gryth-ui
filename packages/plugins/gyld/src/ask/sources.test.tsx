import { describe, it, expect } from 'vitest';
import type { AtomTapHandle, Drip, Grip } from '@owebeeone/grip-react';
import {
  GyldContractViolation, SOURCES_FORMAT, attempt, readDecideNow, readSources,
  type GyldContractError, type GyldSources,
} from '../contract';
import { GYLD_RECORD, GYLD_SOURCES, GYLD_TAB_ASK_DRAFT_TAP } from '../grips';
import { SOURCES_INDEX_PATH } from '../store/layout';
import { AskWindow } from './AskWindow';
import { askTabTaps } from './askTabTaps';
import { CITED_BY_RULING, askEnvelope } from './envelope';
import type { GyldRecordView } from '../records/records';
import type { GyldValue } from '../store/state';
import { STATIC_SET, mountDesk } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';
import sourcesFixture from '../../test/fixtures/bundle/sources.json';
import streamBDecideNowFixture from '../../test/fixtures/bundle/streams/stream-b/decide-now.json';

// Step 0.4 of GyldAskAgent.md: the source index, `gyld.sources.v1`.
//
// The fixture is the REAL index, copied from the v7 run rather than written by
// hand, so what these tests assert is what Gyld emits. Two facts of that run
// matter here and are asserted rather than assumed: `AZ-7` RESOLVES (the
// design's example predates the emitter pointing at `GladeAuthzModel.md`), and
// the unresolved case is `Q2a` — the id a stream minted in the matrix
// namespace for a row the base matrix does not have.

const KEY_CUSTODY = 'glade_decisions:GladeDecisions.key_custody';
const LIFECYCLE = 'glade_decisions:GladeDecisions.lifecycle_composition';
const PIN_AUDIT = 'glade_decisions_stream_a:GladeDecisionsStreamA.pin_audit';

const index = readSources(sourcesFixture);
const streamBDecideNow = readDecideNow(streamBDecideNowFixture);

/** ONE bundle image for the file: nothing here rewrites a byte of it, bar the
 *  one case that mounts its own to take a file away. */
const image = new FakeBundle();
const desk = () => mountDesk(STATIC_SET, image);

const settled = async <T,>(read: () => T, done: (value: T) => boolean): Promise<T> => {
  await expect.poll(() => done(read())).toBe(true);
  return read();
};

const askTab = (
  id: string,
  mounted: ReturnType<typeof mountDesk> = desk(),
) => mounted.tab(id, askTabTaps(id, {
  stream: 'base', perspective: 'decisions', ref: KEY_CUSTODY, conversation: `conv-${id}`,
}));

const recorded = async (tab: { read: <T>(grip: Grip<T>) => Drip<T> }): Promise<void> => {
  await settled(
    () => tab.read(GYLD_RECORD).get() as GyldRecordView | undefined,
    (view) => view?.status === 'ok',
  );
  await settled(
    () => tab.read(GYLD_SOURCES).get() as GyldValue<GyldSources> | undefined,
    (value) => value !== undefined && value.status !== 'unset' && value.status !== 'loading',
  );
};

describe('the source index reads as Gyld emitted it', () => {
  it('carries the envelope, the root and the four lists', () => {
    expect(index.format).toBe(SOURCES_FORMAT);
    expect(index.written).not.toBe('');
    expect(index.root).toEqual({
      option: '--sources-root', given: '../../glade-wz', name: 'glade-wz', found: true,
    });
    expect(index.documents).toHaveLength(9);
    expect(index.tags).toHaveLength(43);
    expect(index.unresolved).toHaveLength(21);
    expect(index.cited_by.length).toBeGreaterThan(0);
  });

  it('keys each document on the resolvers it was indexed with', () => {
    const matrix = index.documents.find((entry) => entry.id === 'GladeBuyBuildMatrix')!;
    expect(matrix.path).toBe('dev-docs/GladeBuyBuildMatrix.md');
    expect(matrix.keys).toEqual(['table-row-id', 'heading-number']);
    expect(matrix.found).toBe(true);
    expect(matrix.digest).toMatch(/^[0-9a-f]{64}$/);
    // `reason: null` is genuinely absent, never defaulted to a sentence
    expect(matrix.reason).toBeUndefined();
  });

  it('reads the two fields beyond the design sketch: resolver and truncated', () => {
    const q11 = index.tags.find((tag) => tag.tag === 'Q11')!;
    expect(q11.family).toBe('matrix-row');
    // the family is the tag's SHAPE; the resolver is how it was found
    expect(q11.resolver).toBe('table-row-id');
    expect(q11.document).toBe('GladeBuyBuildMatrix');
    expect(q11.path).toBe('dev-docs/GladeBuyBuildMatrix.md');
    expect(q11.lines[0]).toBe(q11.lines[1]);
    expect(q11.passage).toContain('Q11');
    expect(q11.truncated).toBe(false);
    // and a capped passage says it is capped rather than reading as whole
    const capped = index.tags.filter((tag) => tag.truncated);
    expect(capped.map((tag) => tag.tag)).toEqual(['IrohGladeMapping §4.2']);
  });

  it('RESOLVES AZ-7, which the design named as unresolvable', () => {
    // GyldAskAgent.md section 5 used AZ-7 as the example of a tag with no
    // home; the emitter points the index at GladeAuthzModel.md, which declares
    // it as a table row, so the index resolves it and this asserts THAT.
    const az7 = index.tags.find((tag) => tag.tag === 'AZ-7');
    expect(az7?.document).toBe('GladeAuthzModel');
    expect(index.unresolved.some((entry) => entry.tag === 'AZ-7')).toBe(false);
  });

  it('carries Q2a as unresolved, with the emitter`s own reason', () => {
    const q2a = index.unresolved.find((entry) => entry.tag === 'Q2a')!;
    expect(q2a.reason).toBe('no document in this index declares it');
    expect(q2a.cited_by).toContain(PIN_AUDIT);
  });

  it('records a question`s own sources and matrix citations, which no other file does', () => {
    const cited = index.cited_by.filter((entry) => entry.slot === KEY_CUSTODY);
    expect(cited.map((entry) => `${entry.field}: ${entry.tags.join(', ')}`)).toEqual([
      'matrix: Q11',
      'sources: WD-1, AZ-7, SEC-55-D5',
    ]);
    expect(cited.every((entry) => entry.stream === 'base')).toBe(true);
  });

  it('refuses a file of another format rather than reading it', () => {
    const result = attempt(() => readSources({ ...sourcesFixture, format: 'gyld.streams.v1' }));
    expect(result.ok).toBe(false);
    expect((result as { error: GyldContractError }).error.code)
      .toBe(GyldContractViolation.WrongFormat.code);
  });

  it('refuses a tag with no `truncated`, rather than assuming it is whole', () => {
    const tags = sourcesFixture.tags.map((tag, i) => (
      i === 0 ? Object.fromEntries(Object.entries(tag).filter(([k]) => k !== 'truncated')) : tag
    ));
    const result = attempt(() => readSources({ ...sourcesFixture, tags }));
    expect(result.ok).toBe(false);
    expect((result as { error: GyldContractError }).error.path)
      .toBe('gyld.sources.v1.tags[0].truncated');
  });
});

describe('Gyld.Sources through the store tap', () => {
  it('reads the build`s index off the root that carries the window`s stream', async () => {
    const tab = askTab('sources-ok');
    const value = await settled(
      () => tab.read(GYLD_SOURCES).get() as GyldValue<GyldSources>,
      (held) => held !== undefined && held.status !== 'unset' && held.status !== 'loading',
    );
    expect(value.status).toBe('ok');
    expect(value.value?.format).toBe(SOURCES_FORMAT);
    expect(value.value?.tags).toHaveLength(43);
  });

  it('publishes ABSENCE as a rendered state when the build emitted none', async () => {
    const bare = new FakeBundle();
    bare.remove(SOURCES_INDEX_PATH);
    const tab = askTab('sources-absent', mountDesk(STATIC_SET, bare));
    const value = await settled(
      () => tab.read(GYLD_SOURCES).get() as GyldValue<GyldSources>,
      (held) => held !== undefined && held.status !== 'unset' && held.status !== 'loading',
    );
    expect(value.status).toBe('absent');
    expect(value.value).toBeUndefined();
    // and the reason is carried rather than an index being composed
    expect(value.fault?.path).toBe(SOURCES_INDEX_PATH);
  });

  it('publishes INVALID, with the violation, for an index that does not read', async () => {
    const broken = new FakeBundle();
    broken.write(SOURCES_INDEX_PATH, { ...sourcesFixture, format: 'gyld.sources.v2' });
    const tab = askTab('sources-invalid', mountDesk(STATIC_SET, broken));
    const value = await settled(
      () => tab.read(GYLD_SOURCES).get() as GyldValue<GyldSources>,
      (held) => held !== undefined && held.status !== 'unset' && held.status !== 'loading',
    );
    expect(value.status).toBe('invalid');
    expect(value.fault?.code).toBe(GyldContractViolation.WrongFormat.code);
  });
});

describe('the envelope`s sources[], filled from cited_by', () => {
  const envelope = askEnvelope({
    stream: 'base',
    perspective: 'decisions',
    slot: KEY_CUSTODY,
    sources: index,
  });

  it('carries every tag the index says this record cites, in the index`s order', () => {
    expect(envelope.sources.map((source) => `${source.cites}/${source.tag}`)).toEqual([
      'matrix/Q11',
      'sources/WD-1',
      'sources/AZ-7',
      'sources/SEC-55-D5',
    ]);
    expect(envelope.sources.every((source) => source.stream === 'base')).toBe(true);
  });

  it('takes a resolved tag`s entry whole, so the passage travels with it', () => {
    const q11 = envelope.sources.find((source) => source.tag === 'Q11')!;
    const emitted = index.tags.find((tag) => tag.tag === 'Q11')!;
    expect(q11).toEqual({
      tag: 'Q11',
      cites: 'matrix',
      stream: 'base',
      resolved: true,
      document: emitted.document,
      path: emitted.path,
      root: 'glade-wz',
      heading: emitted.heading,
      lines: emitted.lines,
      passage: emitted.passage,
      digest: emitted.digest,
      truncated: false,
    });
  });

  it('says an unresolved tag, with the index`s own reason', () => {
    const pinAudit = askEnvelope({
      stream: 'stream-a', perspective: 'decisions', slot: PIN_AUDIT, sources: index,
    });
    const q2a = pinAudit.sources.find((source) => source.tag === 'Q2a')!;
    expect(q2a.resolved).toBe(false);
    expect(q2a.reason).toBe('no document in this index declares it');
    expect(q2a.passage).toBeUndefined();
  });

  it('says the ABSENCE of the index itself, which is a different fact', () => {
    const none = askEnvelope({
      stream: 'base', perspective: 'decisions', slot: KEY_CUSTODY,
    });
    expect(none.sources).toEqual([]);
    const ruled = askEnvelope({
      stream: 'stream-b',
      perspective: 'decisions',
      slot: LIFECYCLE,
      decideNow: streamBDecideNow,
    });
    expect(ruled.sources.map((source) => source.reason))
      .toEqual(['this build emitted no source index', 'this build emitted no source index']);
  });

  it('adds the ruling row`s own tags for anything cited_by did not account for', () => {
    const ruled = askEnvelope({
      stream: 'stream-b',
      perspective: 'decisions',
      slot: LIFECYCLE,
      decideNow: streamBDecideNow,
      sources: index,
    });
    const fromRuling = ruled.sources.filter((source) => source.cites === CITED_BY_RULING);
    expect(fromRuling.length).toBeGreaterThan(0);
    // and the index resolves them the same way it resolves a record's own
    expect(fromRuling.some((source) => source.resolved)).toBe(true);
  });
});

describe('the ask window lists resolved against unresolved', () => {
  it('names each tag, its document and its passage, and marks the unresolved', async () => {
    const tab = askTab('sources-draw');
    await recorded(tab);
    (tab.read(GYLD_TAB_ASK_DRAFT_TAP).get() as AtomTapHandle<string>).set('why is this blocked?');
    const markup = tab.render(<AskWindow />);
    expect(markup).toContain('data-tag="Q11" data-resolved="yes"');
    expect(markup).toContain('data-tag="AZ-7" data-resolved="yes"');
    expect(markup).toContain('glade-wz/dev-docs/GladeBuyBuildMatrix.md');
    expect(markup).toContain('cited by matrix in base');
    expect(markup).toContain('cited by sources in base');
  });

  it('marks Q2a unresolved with the index`s reason rather than dropping it', async () => {
    const mounted = desk();
    const tab = mounted.tab('sources-unresolved', askTabTaps('sources-unresolved', {
      stream: 'stream-a', perspective: 'decisions', ref: PIN_AUDIT,
    }));
    await settled(
      () => tab.read(GYLD_SOURCES).get() as GyldValue<GyldSources> | undefined,
      (held) => held?.status === 'ok',
    );
    const markup = tab.render(<AskWindow />);
    expect(markup).toContain('data-tag="Q2a" data-resolved="no"');
    expect(markup).toContain('unresolved: no document in this index declares it');
  });

  it('says a build with no index cannot resolve, rather than showing nothing', async () => {
    const bare = new FakeBundle();
    bare.remove(SOURCES_INDEX_PATH);
    const tab = askTab('sources-none', mountDesk(STATIC_SET, bare));
    await recorded(tab);
    const markup = tab.render(<AskWindow />);
    expect(markup).toContain('this build emitted no source index');
    expect(markup).not.toContain('gyld-ask-source"');
  });
});
