import { describe, it, expect } from 'vitest';
import { createAtomValueTap, type AtomTapHandle, type Grip } from '@owebeeone/grip-react';
import { grok } from '@grythjs/plugin-api';
import {
  GYLD_BUNDLE, GYLD_DECIDE_NOW, GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP,
  GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP, GYLD_LENS, GYLD_SET, GYLD_SET_TAP,
  GYLD_STORE_STATUS, GYLD_STREAMS, GYLD_VALIDATION,
} from '../grips';
import { GyldStoreTap } from './GyldStoreTap';
import { DirectoryStore, StaticStore, parseAutoindexNames } from './stores';
import { lensPath, perspectiveOf, streamFilePath } from './layout';
import type { GyldBundle, GyldLensState, GyldRootStatus, GyldStreamsCensus, GyldSet } from './state';
import { FakeBundle, FakeClock, fakeDirectory, fakeFetch } from '../../test/fakeBundle';

const BASE_URL = 'https://example.test/out';

// No network and no disk anywhere in this file: every read goes through the
// FakeBundle byte image, and the watch loop runs on a clock the test advances.

describe('the bundle layout', () => {
  it('names the files of spec section 4.6', () => {
    expect(streamFilePath('base', 'record')).toBe('streams/base/stream.json');
    expect(streamFilePath('base', 'decideNow')).toBe('streams/base/decide-now.json');
    expect(streamFilePath('keys-2026', 'validation')).toBe('streams/keys-2026/validation.json');
    expect(lensPath('base', 'decisions')).toBe('streams/base/lenses/decisions.lens.json');
  });

  it('reads a perspective only out of a lens file name', () => {
    expect(perspectiveOf('decisions.lens.json')).toBe('decisions');
    expect(perspectiveOf('decisions.json0.json')).toBeNull();
    expect(perspectiveOf('decisions.svg')).toBeNull();
    expect(perspectiveOf('decisions.dot')).toBeNull();
    expect(perspectiveOf('.lens.json')).toBeNull();
  });
});

describe('StaticStore', () => {
  it('reads bundle paths under its base url', async () => {
    const bundle = new FakeBundle();
    const store = new StaticStore(BASE_URL, { fetch: fakeFetch(bundle) });
    const raw = await store.read('streams/base/validation.json');
    expect(JSON.parse(raw).format).toBe('gyld.validation.v1');
  });

  it('reports the HTTP status of a path that is not there', async () => {
    const store = new StaticStore(BASE_URL, { fetch: fakeFetch(new FakeBundle()) });
    await expect(store.read('streams/nope/stream.json')).rejects.toThrow('HTTP 404');
  });

  it('lists perspectives from an autoindex page, and only the lens files', async () => {
    const store = new StaticStore(BASE_URL, { fetch: fakeFetch(new FakeBundle()) });
    expect(await store.listPerspectives('base')).toEqual(['branch', 'decisions', 'status', 'tiers']);
  });

  it('reports NOT ENUMERABLE, not an empty list, when the host has no listing', async () => {
    const bundle = new FakeBundle();
    const plain = async (url: string) => (url.endsWith('/')
      ? { ok: false, status: 403, text: async () => '' }
      : fakeFetch(bundle)(url));
    const store = new StaticStore(BASE_URL, { fetch: plain });
    expect(await store.listPerspectives('base')).toBeNull();
  });

  it('keeps only file names of this directory out of an autoindex page', () => {
    const html = '<ul><li><a href="../">../</a><a href="?C=N">sort</a>'
      + '<a href="sub/">sub/</a><a href="decisions.lens.json">x</a></li></ul>';
    expect(parseAutoindexNames(html)).toEqual(['decisions.lens.json']);
  });

  it('appends a nonce only when cache busting is on', async () => {
    const seen: string[] = [];
    const spy = async (url: string) => {
      seen.push(url);
      return { ok: true, status: 200, text: async () => '{}' };
    };
    await new StaticStore(BASE_URL, { fetch: spy }).read('streams.json');
    await new StaticStore(BASE_URL, { fetch: spy, cacheBust: true }).read('streams.json');
    expect(seen[0]).toBe(`${BASE_URL}/streams.json`);
    expect(seen[1]).toMatch(/^https:\/\/example\.test\/out\/streams\.json\?gyld_bust=/);
  });
});

describe('DirectoryStore', () => {
  it('walks the bundle layout to read a nested file', async () => {
    const bundle = new FakeBundle();
    const store = new DirectoryStore(fakeDirectory(bundle));
    const raw = await store.read('streams/base/lenses/decisions.lens.json');
    expect(JSON.parse(raw).perspective).toBe('decisions');
  });

  it('names the path that is not there rather than failing anonymously', async () => {
    const store = new DirectoryStore(fakeDirectory(new FakeBundle()));
    await expect(store.read('streams/base/diffs.json')).rejects.toThrow(
      'streams/base/diffs.json absent or unreadable',
    );
  });

  it('lists perspectives from the real directory listing', async () => {
    const store = new DirectoryStore(fakeDirectory(new FakeBundle()));
    expect(await store.listPerspectives('base')).toEqual([
      'branch', 'decisions', 'status', 'tiers',
    ]);
  });

  it('reports an empty list, not a failure, for a stream with no lenses', async () => {
    const store = new DirectoryStore(fakeDirectory(new FakeBundle()));
    expect(await store.listPerspectives('no-such-stream')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The tap. One harness per test, each with its own contexts, so two taps never
// share a cache.
// ---------------------------------------------------------------------------

let harnessCount = 0;

interface HarnessOptions {
  set?: GyldSet;
  clock?: FakeClock;
  bundle?: FakeBundle;
  directory?: boolean;
}

function harness(options: HarnessOptions = {}) {
  const bundle = options.bundle ?? new FakeBundle();
  const clock = options.clock ?? new FakeClock();
  const id = `gyld-store-${harnessCount++}`;
  const tap = new GyldStoreTap({
    pollMs: 10,
    timers: clock.host,
    fetch: fakeFetch(bundle),
  });
  const setTap = createAtomValueTap(GYLD_SET, {
    initial: options.set ?? { roots: [] },
    handleGrip: GYLD_SET_TAP,
  });
  const root = grok.mainPresentationContext.getOrCreateMatchingContext(id);
  const home = root.getGripHomeContext();
  home.registerTap(setTap);
  home.registerTap(tap);
  if (options.directory) {
    tap.setDirectoryHandle('gyld-out', fakeDirectory(bundle));
  }

  const tabs = new Map<string, { read: <T>(grip: Grip<T>) => { get(): T | undefined } }>();
  function tab(key: string, stream: string, perspective = '') {
    const held = tabs.get(key);
    if (held) {
      return held;
    }
    const context = root.getGripConsumerContext().getOrCreateMatchingContext(`tab:${key}`);
    const tabHome = context.getGripHomeContext();
    tabHome.registerTap(createAtomValueTap(GYLD_DEST_STREAM, {
      initial: stream, handleGrip: GYLD_DEST_STREAM_TAP,
    }));
    tabHome.registerTap(createAtomValueTap(GYLD_DEST_PERSPECTIVE, {
      initial: perspective, handleGrip: GYLD_DEST_PERSPECTIVE_TAP,
    }));
    const read = <T,>(grip: Grip<T>) => {
      const drip = context.getGripConsumerContext().getOrCreateConsumer(grip);
      drip.subscribe(() => {});
      return drip;
    };
    const made = { read };
    tabs.set(key, made);
    return made;
  }

  const readHome = <T,>(grip: Grip<T>) => {
    const drip = root.getGripConsumerContext().getOrCreateConsumer(grip);
    drip.subscribe(() => {});
    return drip;
  };

  return { tap, bundle, clock, tab, readHome };
}

const STATIC_SET: GyldSet = { roots: [{ kind: 'static', baseUrl: BASE_URL }] };
const DIRECTORY_SET: GyldSet = { roots: [{ kind: 'directory', name: 'gyld-out' }] };

describe('GyldStoreTap census and status', () => {
  it('publishes an empty census and no status for a set with no roots', async () => {
    const { readHome } = harness();
    const census = readHome(GYLD_STREAMS);
    await expect.poll(() => (census.get() as GyldStreamsCensus).status).toBe('empty');
    expect(readHome(GYLD_STORE_STATUS).get()).toEqual([]);
  });

  it('censuses the emitted streams and their perspectives from a static root', async () => {
    const { readHome } = harness({ set: STATIC_SET });
    const census = readHome(GYLD_STREAMS);
    await expect.poll(() => (census.get() as GyldStreamsCensus).status).toBe('ready');
    const ready = census.get() as GyldStreamsCensus & { status: 'ready' };
    expect(ready.streams.map((s) => s.id)).toEqual([
      'base', 'stream-a', 'stream-b', 'architecture',
    ]);
    expect(ready.streams[0].record.lineage).toBe('glade-decision-graph');
    expect(ready.streams[3].record.lineage).toBe('glade-architecture-candidate-1');
    // the base record carries no manifest, so the store is asked what is there
    expect(ready.streams[0].perspectives).toEqual(['branch', 'decisions', 'status', 'tiers']);
    expect('notEmitted' in ready.streams[0]).toBe(false);
    expect(ready.collisions).toEqual([]);
  });

  it('prefers the stream record\'s own lens manifest over listing the directory', async () => {
    const image = new FakeBundle();
    const { readHome } = harness({ set: STATIC_SET, bundle: image });
    const census = readHome(GYLD_STREAMS);
    await expect.poll(() => (census.get() as GyldStreamsCensus).status).toBe('ready');
    const ready = census.get() as GyldStreamsCensus & { status: 'ready' };
    const architecture = ready.streams[3];
    // nine perspectives are named in the manifest; only two are in this
    // fixture's lenses directory, so a listing could not have produced them
    expect(architecture.perspectives).toHaveLength(9);
    expect(architecture.perspectives).toContain('dependencies');
    expect(image.names('streams/architecture/lenses')).toHaveLength(2);
    // and the one the host declined to emit is carried with its reason
    expect(architecture.notEmitted).toHaveLength(1);
    expect(architecture.notEmitted?.[0].perspective).toBe('full');
    expect(architecture.notEmitted?.[0].reason).toContain('mints no record ids');
  });

  it('reads a stream of the second lineage that emits no decide-now list', async () => {
    const { tab } = harness({ set: STATIC_SET });
    const view = tab('arch', 'architecture', 'lifecycle');
    const bundle = view.read(GYLD_BUNDLE);
    const lens = view.read(GYLD_LENS);
    await expect.poll(() => (bundle.get() as GyldBundle).status).toBe('ok');
    const value = bundle.get() as GyldBundle;
    expect(value.record?.kind).toBe('declaration');
    expect(value.validation?.ok).toBe(true);
    // the files this stream does not carry are named, not invented
    expect('decideNow' in value).toBe(false);
    expect(value.faults?.map((fault) => fault.path)).toEqual([
      'streams/architecture/projection.json',
      'streams/architecture/decide-now.json',
    ]);
    expect(value.faults?.every((fault) => fault.code === undefined)).toBe(true);
    await expect.poll(() => (lens.get() as GyldLensState).status).toBe('ok');
    expect((lens.get() as GyldLensState).value?.perspective).toBe('lifecycle');
  });

  it('censuses a picked directory once its handle is registered', async () => {
    const { readHome } = harness({ set: DIRECTORY_SET, directory: true });
    const census = readHome(GYLD_STREAMS);
    await expect.poll(() => (census.get() as GyldStreamsCensus).status).toBe('ready');
    const status = readHome(GYLD_STORE_STATUS).get() as GyldRootStatus[];
    expect(status[0].status).toBe('ready');
    expect(status[0].streams).toEqual(['base', 'stream-a', 'stream-b', 'architecture']);
  });

  it('says loudly that a directory root has no handle rather than reading nothing', async () => {
    const { readHome } = harness({ set: DIRECTORY_SET });
    const status = readHome(GYLD_STORE_STATUS);
    await expect.poll(() => (status.get() as GyldRootStatus[])[0]?.status).toBe('error');
    expect((status.get() as GyldRootStatus[])[0].error).toContain('pick the directory again');
  });

  it('carries a census failure as a root status and keeps the desk standing', async () => {
    const bundle = new FakeBundle();
    bundle.remove('streams.json');
    const { readHome } = harness({ set: STATIC_SET, bundle });
    const status = readHome(GYLD_STORE_STATUS);
    await expect.poll(() => (status.get() as GyldRootStatus[])[0]?.status).toBe('error');
    expect((status.get() as GyldRootStatus[])[0].error).toContain('HTTP 404');
  });
});

describe('GyldStoreTap per destination resolution', () => {
  it('resolves the destination stream into a bundle of emitted values', async () => {
    const { tab } = harness({ set: STATIC_SET });
    const bundle = tab('a', 'base').read(GYLD_BUNDLE);
    await expect.poll(() => (bundle.get() as GyldBundle).status).toBe('ok');
    const value = bundle.get() as GyldBundle;
    expect(value.stream).toBe('base');
    expect(value.record?.id).toBe('base');
    expect(value.record?.status).toBe('ok');
    expect(value.projection?.occurrences).toHaveLength(75);
    expect(value.decideNow?.questions).toHaveLength(24);
    expect(value.validation?.ok).toBe(true);
    expect(value.perspectives).toEqual(['branch', 'decisions', 'status', 'tiers']);
    expect('faults' in value).toBe(false);
  });

  it('publishes an unset bundle for a window with no destination', async () => {
    const { tab, readHome } = harness({ set: STATIC_SET });
    await expect.poll(
      () => (readHome(GYLD_STREAMS).get() as GyldStreamsCensus).status,
    ).toBe('ready');
    const bundle = tab('none', '').read(GYLD_BUNDLE);
    await expect.poll(() => (bundle.get() as GyldBundle).status).toBe('unset');
  });

  it('publishes ABSENT for a stream the census does not carry', async () => {
    const { tab } = harness({ set: STATIC_SET });
    const bundle = tab('ghost', 'keys-2026-09-13').read(GYLD_BUNDLE);
    await expect.poll(() => (bundle.get() as GyldBundle).status).toBe('absent');
    expect((bundle.get() as GyldBundle).stream).toBe('keys-2026-09-13');
  });

  it('resolves the destination perspective into the emitted lens', async () => {
    const { tab } = harness({ set: STATIC_SET });
    const lens = tab('lens', 'base', 'decisions').read(GYLD_LENS);
    await expect.poll(() => (lens.get() as GyldLensState).status).toBe('ok');
    const state = lens.get() as GyldLensState;
    expect(state.perspective).toBe('decisions');
    expect(state.value?.nodes).toHaveLength(29);
    expect(state.value?.engine.pinned).toBe(true);
  });

  it('publishes ABSENT for a perspective this stream did not emit', async () => {
    const { tab } = harness({ set: STATIC_SET });
    const lens = tab('missing', 'base', 'neighbourhood').read(GYLD_LENS);
    await expect.poll(() => (lens.get() as GyldLensState).status).toBe('absent');
    expect((lens.get() as GyldLensState).fault?.path)
      .toBe('streams/base/lenses/neighbourhood.lens.json');
  });

  it('publishes the decide-now list and the validation result per destination', async () => {
    const { tab } = harness({ set: STATIC_SET });
    const view = tab('now', 'base');
    const now = view.read(GYLD_DECIDE_NOW);
    const validation = view.read(GYLD_VALIDATION);
    await expect.poll(() => now.get()?.status).toBe('ok');
    await expect.poll(() => validation.get()?.status).toBe('ok');
    expect(now.get()?.value?.limits).toContain('no ruling');
    expect(validation.get()?.value?.findings).toEqual([]);
  });

  it('gives two windows on two streams their own answers', async () => {
    const bundle = new FakeBundle();
    bundle.write('streams.json', {
      ...(JSON.parse(bundle.read('streams.json')) as Record<string, unknown>),
    });
    const { tab } = harness({ set: STATIC_SET, bundle });
    const base = tab('one', 'base').read(GYLD_BUNDLE);
    const other = tab('two', 'fork').read(GYLD_BUNDLE);
    await expect.poll(() => (base.get() as GyldBundle).status).toBe('ok');
    await expect.poll(() => (other.get() as GyldBundle).status).toBe('absent');
    expect((base.get() as GyldBundle).stream).toBe('base');
    expect((other.get() as GyldBundle).stream).toBe('fork');
  });

  it('renders an unreadable file as INVALID with the contract violation attached', async () => {
    const bundle = new FakeBundle();
    bundle.write('streams/base/decide-now.json', { format: 'gyld.decide-now.v1' });
    const { tab } = harness({ set: STATIC_SET, bundle });
    const view = tab('bad', 'base');
    const state = view.read(GYLD_BUNDLE);
    await expect.poll(() => (state.get() as GyldBundle).status).toBe('invalid');
    const value = state.get() as GyldBundle;
    expect(value.faults?.[0].path).toBe('streams/base/decide-now.json');
    expect(value.faults?.[0].code).toBe('MISSING_FIELD');
    expect(value.faults?.[0].at).toBe('gyld.decide-now.v1.snapshot');
    // the files that DID read are still there: one bad file does not blank the
    // window, and nothing is substituted for the one that failed
    expect(value.record?.id).toBe('base');
    expect('decideNow' in value).toBe(false);
  });

  it('renders bytes that are not JSON as INVALID, naming the file', async () => {
    const bundle = new FakeBundle();
    bundle.writeText('streams/base/validation.json', 'not json at all');
    const { tab } = harness({ set: STATIC_SET, bundle });
    const validation = tab('junk', 'base').read(GYLD_VALIDATION);
    await expect.poll(() => validation.get()?.status).toBe('invalid');
    expect(validation.get()?.fault?.message).toContain('not valid JSON');
  });
});

describe('GyldStoreTap watch loop', () => {
  it('runs only while the tap has destinations', async () => {
    const clock = new FakeClock();
    const { tab } = harness({ set: STATIC_SET, clock });
    expect(clock.running).toBe(0);
    const bundle = tab('watch', 'base').read(GYLD_BUNDLE);
    await expect.poll(() => (bundle.get() as GyldBundle).status).toBe('ok');
    expect(clock.running).toBe(1);
  });

  it('re-reads on a tick and publishes only when the bytes changed', async () => {
    const clock = new FakeClock();
    const image = new FakeBundle();
    const { tab } = harness({ set: STATIC_SET, clock, bundle: image });
    const view = tab('tick', 'base');
    const bundle = view.read(GYLD_BUNDLE);
    await expect.poll(() => (bundle.get() as GyldBundle).status).toBe('ok');

    const before = bundle.get() as GyldBundle;
    image.reads.length = 0;
    clock.tick();
    await expect.poll(() => image.reads.length > 0).toBe(true);
    await expect.poll(() => (bundle.get() as GyldBundle).status).toBe('ok');
    // unchanged bytes: the very same value object, so no consumer re-renders
    expect(bundle.get()).toBe(before);

    const rebuilt = JSON.parse(image.read('streams/base/validation.json')) as Record<string, unknown>;
    image.write('streams/base/validation.json', { ...rebuilt, built: '2026-09-14T00:00:00Z' });
    clock.tick();
    await expect.poll(
      () => (bundle.get() as GyldBundle).validation?.built,
    ).toBe('2026-09-14T00:00:00Z');
    expect(bundle.get()).not.toBe(before);
  });

  it('turns a file that disappears into ABSENT rather than keeping a stale value', async () => {
    const clock = new FakeClock();
    const image = new FakeBundle();
    const { tab } = harness({ set: STATIC_SET, clock, bundle: image });
    const lens = tab('gone', 'base', 'tiers').read(GYLD_LENS);
    await expect.poll(() => (lens.get() as GyldLensState).status).toBe('ok');
    image.remove('streams/base/lenses/tiers.lens.json');
    clock.tick();
    await expect.poll(() => (lens.get() as GyldLensState).status).toBe('absent');
    expect((lens.get() as GyldLensState).value).toBeUndefined();
  });

  it('reports the watch as live in the root status', async () => {
    const clock = new FakeClock();
    const { tab, readHome } = harness({ set: STATIC_SET, clock });
    const status = readHome(GYLD_STORE_STATUS);
    const bundle = tab('live', 'base').read(GYLD_BUNDLE);
    await expect.poll(() => (bundle.get() as GyldBundle).status).toBe('ok');
    await expect.poll(() => (status.get() as GyldRootStatus[])[0]?.watchLive).toBe(true);
  });
});

describe('GyldStoreTap set changes', () => {
  it('re-censuses when the set gains a root, and drops what the old set held', async () => {
    const { readHome, tab } = harness();
    const census = readHome(GYLD_STREAMS);
    const bundle = tab('late', 'base').read(GYLD_BUNDLE);
    await expect.poll(() => (census.get() as GyldStreamsCensus).status).toBe('empty');
    await expect.poll(() => (bundle.get() as GyldBundle).status).toBe('absent');
    const handle = readHome(GYLD_SET_TAP).get() as AtomTapHandle<GyldSet>;
    handle.set(STATIC_SET);
    await expect.poll(() => (census.get() as GyldStreamsCensus).status).toBe('ready');
    await expect.poll(() => (bundle.get() as GyldBundle).status).toBe('ok');
    handle.set({ roots: [] });
    await expect.poll(() => (census.get() as GyldStreamsCensus).status).toBe('empty');
    await expect.poll(() => (bundle.get() as GyldBundle).status).toBe('absent');
  });
});

describe('GyldStoreTap value identity', () => {
  it('hands the same object back for every answer that has not changed', async () => {
    const clock = new FakeClock();
    const image = new FakeBundle();
    const { tab } = harness({ set: STATIC_SET, clock, bundle: image });
    const view = tab('stable', 'base', 'decisions');
    const bundle = view.read(GYLD_BUNDLE);
    const lens = view.read(GYLD_LENS);
    // a window with no destination, and one on a stream the census has not got
    const unset = tab('nowhere', '', '').read(GYLD_BUNDLE);
    const missing = tab('ghost-stream', 'fork', 'decisions').read(GYLD_LENS);
    await expect.poll(() => (bundle.get() as GyldBundle).status).toBe('ok');
    await expect.poll(() => (lens.get() as GyldLensState).status).toBe('ok');
    const held = [bundle.get(), lens.get(), unset.get(), missing.get()];

    // a whole watch tick over unchanged bytes, which re-produces every
    // destination, must not manufacture a single new value
    image.reads.length = 0;
    clock.tick();
    await expect.poll(() => image.reads.length > 0).toBe(true);
    await Promise.resolve();
    expect([bundle.get(), lens.get(), unset.get(), missing.get()]).toEqual(held);
    expect(bundle.get()).toBe(held[0]);
    expect(lens.get()).toBe(held[1]);
    expect(unset.get()).toBe(held[2]);
    expect(missing.get()).toBe(held[3]);
  });
});
