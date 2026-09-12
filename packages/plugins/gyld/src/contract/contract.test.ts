import { describe, it, expect } from 'vitest';
import {
  GyldContractError, GyldContractViolation, attempt, snapshotRefMatches,
  readDecideNow, readLens, readStream, readStreamDiff, readStreamsIndex, readValidation,
} from './index';
import streamsFixture from '../../test/fixtures/bundle/streams.json';
import streamFixture from '../../test/fixtures/bundle/streams/base/stream.json';
import lensFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';
import branchLensFixture from '../../test/fixtures/bundle/streams/base/lenses/branch.lens.json';
import tiersLensFixture from '../../test/fixtures/bundle/streams/base/lenses/tiers.lens.json';
import statusLensFixture from '../../test/fixtures/bundle/streams/base/lenses/status.lens.json';
import lifecycleLensFixture from '../../test/fixtures/bundle/streams/architecture/lenses/lifecycle.lens.json';
import allocationLensFixture from '../../test/fixtures/bundle/streams/architecture/lenses/allocation.lens.json';
import decideNowFixture from '../../test/fixtures/bundle/streams/base/decide-now.json';
import streamADecideNowFixture from '../../test/fixtures/bundle/streams/stream-a/decide-now.json';
import streamBDecideNowFixture from '../../test/fixtures/bundle/streams/stream-b/decide-now.json';
import validationFixture from '../../test/fixtures/bundle/streams/base/validation.json';
import invalidValidationFixture from '../../test/fixtures/provisional/validation-invalid.json';
import diffFixture from '../../test/fixtures/provisional/diff.json';

// Every fixture under `bundle/` and `architecture/` is REAL Gyld output copied
// verbatim (test/fixtures/README.md). The two files under `provisional/` are
// still hand written from spec section 7 because no host emits them yet: the
// diff needs a second stream, and the base capture validates so there is no
// rejected bundle to copy.

type Json = Record<string, unknown>;

/** A deep copy a test may mutate without touching the shared fixture. */
function copy<T>(value: T): T {
  return structuredClone(value);
}

/** Walk a dotted path with numeric segments and hand back the owning object. */
function owner(root: Json, path: string): { parent: Json; key: string } {
  const parts = path.split('.');
  let node: Json = root;
  for (const part of parts.slice(0, -1)) {
    node = node[part] as Json;
  }
  return { parent: node, key: parts[parts.length - 1] };
}

function mutate<T>(fixture: T, path: string, value: unknown): T {
  const next = copy(fixture) as unknown as Json;
  const { parent, key } = owner(next, path);
  parent[key] = value;
  return next as unknown as T;
}

function drop<T>(fixture: T, path: string): T {
  const next = copy(fixture) as unknown as Json;
  const { parent, key } = owner(next, path);
  delete parent[key];
  return next as unknown as T;
}

/** Assert a reader rejects a mutation with one NAMED violation at one path. */
function rejects(read: () => unknown, violation: GyldContractViolation, path: string) {
  const result = attempt(read);
  expect(result.ok, `expected ${violation.code} at ${path}, but the read succeeded`).toBe(false);
  const error = (result as { ok: false; error: GyldContractError }).error;
  expect(error).toBeInstanceOf(GyldContractError);
  expect(error.violation).toBe(violation);
  expect(error.code).toBe(violation.code);
  expect(error.path).toBe(path);
}

describe('gyld.streams.v1 and gyld.stream.v1', () => {
  it('reads the emitted index whole, both lineages of it', () => {
    const index = readStreamsIndex(streamsFixture);
    expect(index.lineage).toBe('glade-decision-graph');
    expect(index.lineages).toEqual(['glade-decision-graph', 'glade-architecture-candidate-1']);
    expect(index.streams.map((s) => s.id)).toEqual([
      'base', 'stream-a', 'stream-b', 'architecture',
    ]);
    const base = index.streams[0];
    expect(base.kind).toBe('fork');
    expect(base.chain).toEqual(['base']);
    expect(base.overlay?.module).toBe('glade_decisions');
    expect(base.overlay?.root).toBe('GladeDecisions');
    expect(base.status).toBe('ok');
    expect(base.principal).toBe('gianni');
    // `kind` is deliberately an open string: the last stream is neither a
    // fork nor a link, and the reader takes the host's word for it.
    const architecture = index.streams[3];
    expect(architecture.kind).toBe('declaration');
    expect(architecture.lineage).toBe('glade-architecture-candidate-1');
    expect('overlay' in architecture).toBe(false);
  });

  it('reads the chain each linked stream records, and what it was built against', () => {
    const index = readStreamsIndex(streamsFixture);
    const base = index.streams[0];
    const a = index.streams[1];
    const b = index.streams[2];
    // section 4.4: a link names its parent, carries the parent's chain and
    // pins the parent snapshot it was built against.
    expect([a.kind, b.kind]).toEqual(['link', 'link']);
    expect([a.parent, b.parent]).toEqual(['base', 'stream-a']);
    expect(a.chain).toEqual(['base', 'stream-a']);
    expect(b.chain).toEqual(['base', 'stream-a', 'stream-b']);
    expect(a.parent_snapshot).toEqual(base.snapshot);
    expect(b.parent_snapshot).toEqual(a.snapshot);
    expect(a.overlay?.module).toBe('glade_decisions_stream_a');
    expect(b.overlay?.root).toBe('GladeDecisionsStreamB');
    // the question stream A adds is in its own module, and keeps its own slot
    expect(a.questions?.map((q) => q.slot)).toContain(
      'glade_decisions_stream_a:GladeDecisionsStreamA.pin_audit',
    );
    // R1: an answer is an added assertion, so the RULED question keeps its
    // declared status in the record and states its effective one beside it
    const ruled = a.questions?.find(
      (q) => q.slot === 'glade_decisions:GladeDecisions.version_pin',
    );
    expect(ruled?.declared_status).toBe('Lean');
    expect(ruled?.effective_status).toBe('Decided');
  });

  it('reads the lens manifest a stream record carries, not-emitted entries and all', () => {
    const architecture = readStreamsIndex(streamsFixture).streams[3];
    const manifest = architecture.lenses;
    expect(manifest).toBeDefined();
    const emitted = (manifest ?? []).filter((lens) => lens.emitted);
    expect(emitted.map((lens) => lens.perspective)).toEqual([
      'dependencies', 'cooperation', 'state', 'composition', 'bindings',
      'lifecycle', 'allocation', 'journeys', 'requirements',
    ]);
    expect(emitted[0].file).toBe('streams/architecture/lenses/dependencies.lens.json');
    expect(emitted[0].relations).toEqual(['DependsOn', 'MayUse', 'ReuseCandidate']);
    expect('stream' in emitted[0]).toBe(false);
    // the host states what it did NOT emit and why, and the reader keeps it
    const withheld = (manifest ?? []).filter((lens) => !lens.emitted);
    expect(withheld.map((lens) => lens.perspective)).toEqual(['full']);
    expect(withheld[0].reason).toContain('mints no record ids');
    expect('file' in withheld[0]).toBe(false);
    // the base stream carries no manifest, and none is invented for it
    expect('lenses' in readStreamsIndex(streamsFixture).streams[0]).toBe(false);
  });

  it('reads a standalone stream record behind its own envelope', () => {
    const stream = readStream(streamFixture);
    expect(stream.id).toBe('base');
    expect(stream.snapshot.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(stream.snapshot.revision).toBe('v1');
  });

  it('reads the emitted answers this host carries beside the section 4.3 record', () => {
    const stream = readStream(streamFixture);
    expect(stream.roots).toContain('glade_decisions:GladeDecisions.key_custody');
    expect(stream.tiers?.anchors).toContain('glade_decisions:GladeDecisions.iroh_transport');
    expect(stream.questions).toHaveLength(24);
    const bulk = stream.questions
      ?.find((q) => q.slot === 'glade_decisions:GladeDecisions.bulk_transfer');
    expect(bulk?.declared_status).toBe('Lean');
    expect(bulk?.effective_status).toBe('Lean');
    expect(bulk?.tier).toBe('gated');
    expect(bulk?.preferred).toBe('glade_decisions:GladeDecisions.iroh_blobs_port');
  });

  it('leaves a question with no lean without one, and a spec-shaped record without answers', () => {
    const stream = readStream(streamFixture);
    const open = stream.questions
      ?.find((q) => q.slot === 'glade_decisions:GladeDecisions.key_custody');
    expect(open?.declared_status).toBe('Open');
    expect(open !== undefined && 'preferred' in open).toBe(false);
    // Section 4.3 does not name questions, roots or tiers; a host that emits
    // only the record still reads.
    const bare = drop(drop(drop(streamFixture, 'questions'), 'roots'), 'tiers');
    const read = readStream(bare);
    expect('questions' in read).toBe(false);
    expect('roots' in read).toBe(false);
    expect('tiers' in read).toBe(false);
  });

  it('invents nothing for a stream that has no parent', () => {
    const base = readStreamsIndex(streamsFixture).streams[0];
    expect('parent' in base).toBe(false);
    expect('parent_snapshot' in base).toBe(false);
  });

  it('rejects a wrong format string', () => {
    rejects(
      () => readStreamsIndex(mutate(streamsFixture, 'format', 'gyld.streams.v2')),
      GyldContractViolation.WrongFormat, 'gyld.streams.v1.format',
    );
  });

  it('rejects a missing required field', () => {
    rejects(
      () => readStreamsIndex(drop(streamsFixture, 'written')),
      GyldContractViolation.MissingField, 'gyld.streams.v1.written',
    );
  });

  it('rejects a dangling parent id', () => {
    rejects(
      () => readStreamsIndex(mutate(streamsFixture, 'streams.0.parent', 'no-such-stream')),
      GyldContractViolation.DanglingReference, 'gyld.streams.v1.streams[0].parent',
    );
  });

  it('rejects an empty identifier', () => {
    rejects(
      () => readStreamsIndex(mutate(streamsFixture, 'streams.0.id', '')),
      GyldContractViolation.EmptyIdentifier, 'gyld.streams.v1.streams[0].id',
    );
  });

  it('rejects a status outside the set section 7.2 writes down', () => {
    rejects(
      () => readStreamsIndex(mutate(streamsFixture, 'streams.0.status', 'stale')),
      GyldContractViolation.UnknownValue, 'gyld.streams.v1.streams[0].status',
    );
  });

  it('rejects the wrong JSON kind', () => {
    rejects(
      () => readStreamsIndex(mutate(streamsFixture, 'streams', {})),
      GyldContractViolation.WrongType, 'gyld.streams.v1.streams',
    );
  });
});

describe('gyld.lens.v1', () => {
  it('reads the emitted decisions lens whole', () => {
    const lens = readLens(lensFixture);
    expect(lens.perspective).toBe('decisions');
    expect(lens.stream).toBe('base');
    expect(lens.title).toContain('Buy/build decision graph');
    expect(lens.relations).toEqual(['Requires', 'Implies', 'GatedBy']);
    expect(lens.text_relations).toEqual(['Offers']);
    expect(lens.engine).toEqual({ name: 'dot', version: '14.1.4', pinned: true });
    expect(lens.bb).toEqual([0, 0, 2242.8, 633.32]);
    expect(lens.nodes).toHaveLength(29);
    expect(lens.edges).toHaveLength(32);
    expect(lens.groups).toHaveLength(2);
    expect(lens.counts).toEqual({
      nodes: 29, edges: 32, groups: 2, omitted_occurrences: 46, omitted_assertions: 15,
    });
    expect(lens.nodes[0].slot).toBe('glade_decisions:GladeDecisions.simulator_tooling');
    expect(lens.nodes[0].pos).toEqual([265.23, 35.76]);
    expect(lens.nodes[0].size).toEqual([2.1862, 0.99333]);
    expect(lens.nodes[0].text[0]).toBe('simulator_tooling [Q13]');
  });

  it('reads the three legend relations and their emitted styling', () => {
    const lens = readLens(lensFixture);
    expect(lens.legend.edges.map((e) => e.relation)).toEqual(['Requires', 'Implies', 'GatedBy']);
    expect(lens.legend.edges[0].color).toBe('#1f4e79');
    expect(lens.legend.edges[0].style).toBe('solid');
    expect(lens.legend.edges[0].definition).toMatch(/^[0-9a-f]{64}$/);
    expect(lens.legend.edges[2].label).toBe('gate');
    expect('label' in lens.legend.edges[0]).toBe(false);
    expect(lens.legend.nodes[0]).toEqual({
      kind: 'Question', status: 'Decided', shape: 'box', fill: '#e2e8f0',
    });
  });

  it('reads the per-node classification and cluster membership the emitter carries', () => {
    const lens = readLens(lensFixture);
    const grouped = lens.nodes.find((n) => n.group !== undefined);
    expect(grouped?.group).toBe('grp:decided-anchors-ratified');
    expect(grouped?.fill).toBe('#e2e8f0');
    expect(grouped?.style).toBe('rounded,filled');
    // every node of this graph carries a null classification, and null is absence
    expect(lens.nodes.every((n) => n.classification === undefined)).toBe(true);
    const architecture = readLens(lifecycleLensFixture);
    const adapter = architecture.nodes.find((n) => n.slot.endsWith('.iroh'));
    expect(adapter?.classification).toBe('IOAdapter');
    expect(adapter !== undefined && 'status' in adapter).toBe(false);
  });

  it('reads the per-edge reference index, owner and drawn style', () => {
    const lens = readLens(lensFixture);
    expect(lens.edges[0].slot).toBe('glade_decisions:AsyncWitness.requires');
    expect(lens.edges[0].ref_index).toBe(1);
    expect(lens.edges[0].style).toEqual({ color: '#1f4e79', penwidth: 1.4 });
    expect(lens.edges[0].owner).toBe(lens.edges[0].head);
    const implies = lens.edges.find((e) => e.relation === 'Implies' && e.label !== undefined);
    expect(implies?.label).toBe('if cryptography');
    expect(implies?.label_pos).toEqual([1133.3, 268.66]);
    expect(implies?.style).toEqual({ color: '#b45309', style: 'dashed' });
    // README, "lens geometry": in the decisions and status lenses an Implies
    // edge is drawn from the alternative's OWNING QUESTION while `owner` names
    // the alternative, so the two legitimately differ.
    expect(implies?.owner).not.toBe(implies?.tail);
  });

  it('reads a lens whose stream is null and whose groups are declared containment', () => {
    const architecture = readLens(lifecycleLensFixture);
    expect('stream' in architecture).toBe(false);
    expect(architecture.perspective).toBe('lifecycle');
    const allocation = readLens(allocationLensFixture);
    const declared = allocation.groups?.find((g) => g.kind === 'declared');
    expect(declared?.occurrence).toMatch(/^occ:[0-9a-f]{64}$/);
    // the area a declared group stands for is not drawn as a node of the lens
    expect(allocation.nodes.some((n) => n.id === declared?.occurrence)).toBe(false);
    const aid = allocation.groups?.find((g) => g.kind === 'reading-aid');
    expect(aid !== undefined && 'occurrence' in aid).toBe(false);
  });

  it('reads the other three emitted perspectives of the base stream', () => {
    for (const [fixture, perspective, counts] of [
      [tiersLensFixture, 'tiers', { nodes: 24, edges: 20, groups: 6 }],
      [statusLensFixture, 'status', { nodes: 29, edges: 32, groups: 4 }],
      [branchLensFixture, 'branch', { nodes: 10, edges: 10, groups: 0 }],
    ] as const) {
      const lens = readLens(fixture);
      expect(lens.perspective).toBe(perspective);
      expect(lens.nodes).toHaveLength(counts.nodes);
      expect(lens.edges).toHaveLength(counts.edges);
      expect(lens.groups ?? []).toHaveLength(counts.groups);
    }
  });

  it('leaves an absent optional absent rather than defaulting it', () => {
    const lens = readLens(lensFixture);
    // the Trigger nodes carry status: null; a null is absence, not a value
    const trigger = lens.nodes.find((n) => n.kind === 'Trigger');
    expect(trigger !== undefined && 'status' in trigger).toBe(false);
    // an unlabelled edge carries label: null and label_pos: null
    expect('label' in lens.edges[0]).toBe(false);
    expect('label_pos' in lens.edges[0]).toBe(false);
    // a lens with no groups key gets no empty array
    const bare = readLens(drop(branchLensFixture, 'groups'));
    expect(bare.groups).toBeUndefined();
  });

  it('rejects a wrong format string', () => {
    rejects(
      () => readLens(mutate(lensFixture, 'format', 'gyld.lens.v2')),
      GyldContractViolation.WrongFormat, 'gyld.lens.v1.format',
    );
  });

  it('rejects a non-finite geometry number', () => {
    rejects(
      () => readLens(mutate(lensFixture, 'nodes.0.pos', [265.23, Number.NaN])),
      GyldContractViolation.NonFiniteNumber, 'gyld.lens.v1.nodes[0].pos[1]',
    );
    rejects(
      () => readLens(mutate(lensFixture, 'bb', [0, 0, Number.POSITIVE_INFINITY, 633.32])),
      GyldContractViolation.NonFiniteNumber, 'gyld.lens.v1.bb[2]',
    );
    rejects(
      () => readLens(mutate(lensFixture, 'edges.0.style', { color: '#1f4e79', penwidth: Number.NaN })),
      GyldContractViolation.NonFiniteNumber, 'gyld.lens.v1.edges[0].style.penwidth',
    );
  });

  it('rejects a bounding box of the wrong length', () => {
    rejects(
      () => readLens(mutate(lensFixture, 'bb', [0, 0, 2242.8])),
      GyldContractViolation.WrongTupleLength, 'gyld.lens.v1.bb',
    );
  });

  it('rejects a dangling edge endpoint', () => {
    rejects(
      () => readLens(mutate(lensFixture, 'edges.0.head', 'occ:not-in-this-lens')),
      GyldContractViolation.DanglingReference, 'gyld.lens.v1.edges[0].head',
    );
  });

  it('rejects a dangling group member', () => {
    rejects(
      () => readLens(mutate(lensFixture, 'groups.0.members', ['occ:ghost'])),
      GyldContractViolation.DanglingReference, 'gyld.lens.v1.groups[0].members[0]',
    );
  });

  it('rejects a node whose cluster is not a group of this lens', () => {
    rejects(
      () => readLens(mutate(lensFixture, 'nodes.4.group', 'grp:no-such-cluster')),
      GyldContractViolation.DanglingReference, 'gyld.lens.v1.nodes[4].group',
    );
  });

  it('rejects an id without the prefix section 7.3 requires', () => {
    rejects(
      () => readLens(mutate(lensFixture, 'nodes.0.id', 'q-simulator-tooling')),
      GyldContractViolation.WrongIdPrefix, 'gyld.lens.v1.nodes[0].id',
    );
    rejects(
      () => readLens(mutate(lensFixture, 'edges.0.id', 'occ:req-scope-keys')),
      GyldContractViolation.WrongIdPrefix, 'gyld.lens.v1.edges[0].id',
    );
    rejects(
      () => readLens(mutate(lensFixture, 'groups.0.id', 'decided-anchors')),
      GyldContractViolation.WrongIdPrefix, 'gyld.lens.v1.groups[0].id',
    );
    rejects(
      () => readLens(mutate(lensFixture, 'nodes.4.group', 'decided-anchors-ratified')),
      GyldContractViolation.WrongIdPrefix, 'gyld.lens.v1.nodes[4].group',
    );
    rejects(
      () => readLens(mutate(allocationLensFixture, 'groups.0.occurrence', 'grp:authority')),
      GyldContractViolation.WrongIdPrefix, 'gyld.lens.v1.groups[0].occurrence',
    );
  });

  it('rejects counts that disagree with what the file carries', () => {
    rejects(
      () => readLens(mutate(lensFixture, 'counts.nodes', 28)),
      GyldContractViolation.CountMismatch, 'gyld.lens.v1.counts.nodes',
    );
    rejects(
      () => readLens(mutate(lensFixture, 'counts.groups', 0)),
      GyldContractViolation.CountMismatch, 'gyld.lens.v1.counts.groups',
    );
  });

  it('does not check the omitted counts, which are not in the file to count', () => {
    const lens = readLens(mutate(lensFixture, 'counts.omitted_occurrences', 999));
    expect(lens.counts.omitted_occurrences).toBe(999);
  });

  it('rejects a missing required field', () => {
    rejects(
      () => readLens(drop(lensFixture, 'omissions')),
      GyldContractViolation.MissingField, 'gyld.lens.v1.omissions',
    );
    rejects(
      () => readLens(drop(lensFixture, 'engine')),
      GyldContractViolation.MissingField, 'gyld.lens.v1.engine',
    );
  });
});

describe('gyld.decide-now.v1', () => {
  it('reads the emitted decide-now list whole', () => {
    const now = readDecideNow(decideNowFixture);
    expect(now.stream).toBe('base');
    expect(now.snapshot.revision).toBe('v1');
    expect(now.questions).toHaveLength(24);
    expect(now.rulings).toEqual([]);
    expect(now.limits).toEqual([
      'dependencies and alternatives only', 'no ruling', 'no schedule',
    ]);
    const answerable = now.questions.filter((q) => q.answerable_now);
    expect(answerable.map((q) => q.slot)).toContain('glade_decisions:GladeDecisions.key_custody');
    const witness = now.questions[0];
    expect(witness.slot).toBe('glade_decisions:GladeDecisions.async_witness');
    expect(witness.answerable_now).toBe(false);
    expect(witness.blocked_by).toEqual(['glade_decisions:GladeDecisions.lifecycle_composition']);
    expect(witness.offers).toHaveLength(2);
  });

  it('treats a null lean and a null ruling as absent', () => {
    const now = readDecideNow(decideNowFixture);
    expect('preferred' in now.questions[0]).toBe(false);
    expect('ruling' in now.questions[0]).toBe(false);
    const leaning = now.questions
      .find((q) => q.slot === 'glade_decisions:GladeDecisions.bulk_transfer');
    expect(leaning?.preferred).toBe('glade_decisions:GladeDecisions.iroh_blobs_port');
    expect(leaning !== undefined && 'ruling' in leaning).toBe(false);
  });

  it('rejects a wrong format string', () => {
    rejects(
      () => readDecideNow(mutate(decideNowFixture, 'format', 'gyld.decide-now.v2')),
      GyldContractViolation.WrongFormat, 'gyld.decide-now.v1.format',
    );
  });

  it('rejects a missing answerable_now rather than assuming false', () => {
    rejects(
      () => readDecideNow(drop(decideNowFixture, 'questions.0.answerable_now')),
      GyldContractViolation.MissingField, 'gyld.decide-now.v1.questions[0].answerable_now',
    );
  });

  it('rejects a non-boolean answerable_now', () => {
    rejects(
      () => readDecideNow(mutate(decideNowFixture, 'questions.0.answerable_now', 'yes')),
      GyldContractViolation.WrongType, 'gyld.decide-now.v1.questions[0].answerable_now',
    );
  });

  it('rejects an empty qualified slot', () => {
    rejects(
      () => readDecideNow(mutate(decideNowFixture, 'questions.0.slot', '')),
      GyldContractViolation.EmptyIdentifier, 'gyld.decide-now.v1.questions[0].slot',
    );
  });

  // The v2 capture host emits a ruling with more than the four fields section
  // 7.4 sketches, and with three of them legitimately null: a record that only
  // marks a trigger as occurred decides nothing and selects nothing. The
  // reader reads what is there and leaves a null absent; it does not reject a
  // ruling for being the shape the host actually writes.
  it('reads a chain of rulings, the occurrence record and all', () => {
    const now = readDecideNow(streamADecideNowFixture);
    expect(now.stream).toBe('stream-a');
    expect(now.rulings).toHaveLength(3);
    const occurred = now.rulings.find((r) => r.label === 'bulk_supplier_arrived');
    expect(occurred).toBeDefined();
    // decides, selects and reopens are null on this record and stay absent
    expect(occurred !== undefined && 'decides' in occurred).toBe(false);
    expect(occurred !== undefined && 'selects' in occurred).toBe(false);
    expect(occurred !== undefined && 'reopens' in occurred).toBe(false);
    expect(occurred?.occurred).toEqual(['glade_decisions:GladeDecisions.first_bulk_supplier']);
    expect(occurred?.live).toBe(true);
    expect(occurred?.principal).toBe('gianni');
    expect(occurred?.stamp).toBe('2026-09-13T01:10:00Z');
    expect(occurred?.sources).toEqual(['GQ-9']);
    expect(occurred?.stream).toBe('stream-a');
    const pin = now.rulings.find((r) => r.label === 'version_pin_ruling');
    expect(pin?.decides).toBe('glade_decisions:GladeDecisions.version_pin');
    expect(pin?.selects).toBe('glade_decisions:GladeDecisions.bump_to_current');
    expect(pin?.occurred).toEqual([]);
  });

  it('reads a retired ruling as the chain recorded it, rather than dropping it', () => {
    const now = readDecideNow(streamBDecideNowFixture);
    expect(now.rulings).toHaveLength(4);
    // stream B reopens the lifecycle answer: A's ruling is emitted with
    // `live: false` because that is what the chain says happened
    const retired = now.rulings.find((r) => r.label === 'lifecycle_composition_ruling');
    expect(retired?.live).toBe(false);
    expect(retired?.stream).toBe('stream-a');
    const reopened = now.rulings.find((r) => r.label === 'lifecycle_reopened');
    expect(reopened?.live).toBe(true);
    expect(reopened?.reopens).toBe('glade_decisions:GladeDecisions.lifecycle_composition');
    expect(reopened?.selects).toBe('glade_decisions:GladeDecisions.tokio_primitives');
  });

  it('rejects a ruling with no live flag rather than assuming it is live', () => {
    rejects(
      () => readDecideNow(drop(streamADecideNowFixture, 'rulings.0.live')),
      GyldContractViolation.MissingField, 'gyld.decide-now.v1.rulings[0].live',
    );
  });
});

describe('gyld.validation.v1', () => {
  it('reads the emitted ok result, empty findings and all, and adds no diagnostic', () => {
    const ok = readValidation(validationFixture);
    expect(ok.ok).toBe(true);
    expect(ok.stream).toBe('base');
    expect(ok.findings).toEqual([]);
    expect('code' in ok).toBe(false);
    expect('message' in ok).toBe(false);
    expect('details' in ok).toBe(false);
    expect('location' in ok).toBe(false);
  });

  it('leaves findings absent when a host does not write the list', () => {
    const spec = readValidation(drop(validationFixture, 'findings'));
    expect('findings' in spec).toBe(false);
  });

  it('reads a failure whole, with the GyldError shape intact', () => {
    const bad = readValidation(invalidValidationFixture);
    expect(bad.ok).toBe(false);
    expect(bad.code).toBe('PREREQUISITE_OPEN');
    expect(bad.message).toContain('key_custody');
    expect(bad.details).toEqual({
      question: 'glade_decisions:GladeDecisions.key_custody',
      open: ['glade_decisions:GladeDecisions.scope_model'],
    });
    expect(bad.findings).toHaveLength(1);
    expect(bad.findings?.[0].code).toBe('PREREQUISITE_OPEN');
    expect(bad.findings?.[0].details).toEqual(bad.details);
    expect(bad.location).toEqual({ module: 'stream_keys_2026_09_13', line: 12 });
  });

  it('rejects a failure with no code, which tells the stream manager nothing', () => {
    rejects(
      () => readValidation(drop(invalidValidationFixture, 'code')),
      GyldContractViolation.MissingField, 'gyld.validation.v1.code',
    );
  });

  it('rejects a finding with no code', () => {
    rejects(
      () => readValidation(drop(invalidValidationFixture, 'findings.0.code')),
      GyldContractViolation.MissingField, 'gyld.validation.v1.findings[0].code',
    );
  });

  it('rejects a non-finite source line', () => {
    rejects(
      () => readValidation(mutate(invalidValidationFixture, 'location.line', Number.NaN)),
      GyldContractViolation.NonFiniteNumber, 'gyld.validation.v1.location.line',
    );
  });

  it('rejects a missing ok flag rather than assuming success', () => {
    rejects(
      () => readValidation(drop(validationFixture, 'ok')),
      GyldContractViolation.MissingField, 'gyld.validation.v1.ok',
    );
  });
});

describe('gyld.stream-diff.v1', () => {
  it('reads the fixture whole', () => {
    const diff = readStreamDiff(diffFixture);
    expect(diff.left.stream).toBe('base');
    expect(diff.right.stream).toBe('keys-2026-09-13');
    expect(diff.correspondence).toBe('qualified_slot');
    expect(diff.occurrences.added).toHaveLength(2);
    expect(diff.occurrences.unchanged).toBe(75);
    expect(diff.assertions.added[0].relation).toBe('Decides');
    expect(diff.effective_status[0]).toEqual({
      slot: 'glade_decisions:GladeDecisions.key_custody',
      left: 'Open', right: 'Decided',
      ruling: 'glade_decisions_stream:Stream.r_key_custody',
    });
  });

  it('rejects a wrong format string', () => {
    rejects(
      () => readStreamDiff(mutate(diffFixture, 'format', 'gyld.stream-diff.v2')),
      GyldContractViolation.WrongFormat, 'gyld.stream-diff.v1.format',
    );
  });

  it('rejects a missing side', () => {
    rejects(
      () => readStreamDiff(drop(diffFixture, 'right')),
      GyldContractViolation.MissingField, 'gyld.stream-diff.v1.right',
    );
  });

  it('rejects a non-integral unchanged count', () => {
    rejects(
      () => readStreamDiff(mutate(diffFixture, 'occurrences.unchanged', 75.5)),
      GyldContractViolation.WrongType, 'gyld.stream-diff.v1.occurrences.unchanged',
    );
  });

  it('rejects a non-finite unchanged count', () => {
    rejects(
      () => readStreamDiff(mutate(diffFixture, 'assertions.unchanged', Number.NaN)),
      GyldContractViolation.NonFiniteNumber, 'gyld.stream-diff.v1.assertions.unchanged',
    );
  });
});

describe('reading as data, and the one match the spec defines', () => {
  it('attempt turns a violation into failure as data, and a read into a value', () => {
    const good = attempt(() => readValidation(validationFixture));
    expect(good.ok).toBe(true);
    const bad = attempt(() => readValidation(mutate(validationFixture, 'format', 'nope')));
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.violation).toBe(GyldContractViolation.WrongFormat);
      expect(bad.error.message).toContain('gyld.validation.v1.format');
    }
  });

  it('a violation describes itself with its path and what was found', () => {
    const failed = attempt(() => readStreamsIndex(mutate(streamsFixture, 'streams.0.status', 'stale')));
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.error.message).toContain('ok or invalid');
      expect(failed.error.message).toContain('gyld.streams.v1.streams[0].status');
      expect(failed.error.message).toContain('"stale"');
    }
  });

  it('reports whether the bundle files agree on the snapshot they were built from', () => {
    const index = readStreamsIndex(streamsFixture);
    const record = readStream(streamFixture);
    const lens = readLens(lensFixture);
    const now = readDecideNow(decideNowFixture);
    expect(snapshotRefMatches(index.streams[0].snapshot, record.snapshot)).toBe(true);
    expect(snapshotRefMatches(lens.snapshot, record.snapshot)).toBe(true);
    expect(snapshotRefMatches(now.snapshot, record.snapshot)).toBe(true);
    // a different lineage is a different graph, and says so
    expect(snapshotRefMatches(readLens(lifecycleLensFixture).snapshot, record.snapshot)).toBe(false);
  });

  it('rejects a value that is not an envelope at all', () => {
    rejects(() => readLens(null), GyldContractViolation.MissingField, 'gyld.lens.v1');
    rejects(() => readLens([]), GyldContractViolation.WrongType, 'gyld.lens.v1');
    rejects(() => readLens('gyld.lens.v1'), GyldContractViolation.WrongType, 'gyld.lens.v1');
  });
});
