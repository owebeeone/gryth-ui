import { describe, it, expect } from 'vitest';
import type { AtomTapHandle } from '@owebeeone/grip-react';
import { readStreamsIndex } from '../contract';
import {
  GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP, GYLD_DEST_STREAM, GYLD_LENS,
  GYLD_STREAMS, GYLD_TAB_PICKED,
} from '../grips';
import { GyldBrowser } from '../GyldBrowser';
import type { CensusStream, GyldLensState, GyldStreamsCensus } from '../store/state';
import { browserTabTaps } from './browserTabTaps';
import { NOTHING_PICKED, OPENING_PERSPECTIVE, firstPick, type GyldFirstPick } from './firstPick';
import { EMPTY_ROOTS, mountDesk } from '../../test/mount';
import streamsFixture from '../../test/fixtures/bundle/streams.json';

// A window with a root and no destination used to draw nothing and wait for
// two picks. It now opens on what the bundle itself puts first, and every
// choice comes off the census: the first stream `streams.json` lists, and
// `decisions` where that stream emitted it.

const index = readStreamsIndex(streamsFixture);

const settled = async <T,>(read: () => T, done: (value: T) => boolean): Promise<T> => {
  await expect.poll(() => done(read())).toBe(true);
  return read();
};

/** A census of streams with the perspectives each one emitted. */
function census(...streams: { id: string; perspectives?: string[] }[]): GyldStreamsCensus {
  return {
    status: 'ready',
    loadedAt: '',
    collisions: [],
    streams: streams.map(({ id, perspectives }) => {
      const entry = { id, rootIndex: 0, record: { id } } as unknown as CensusStream;
      if (perspectives !== undefined) {
        entry.perspectives = perspectives;
      }
      return entry;
    }),
  };
}

describe('what a window with no destination opens on', () => {
  it('takes the first stream the census lists and its decisions lens', () => {
    const listing = census(
      { id: 'base', perspectives: ['decisions', 'tiers', 'status'] },
      { id: 'stream-a', perspectives: ['decisions'] },
    );
    expect(firstPick(listing, '', '')).toEqual({
      stream: 'base', perspective: OPENING_PERSPECTIVE,
    });
    // and the first stream is the first one the LISTING has, not a sorted one
    expect(firstPick(census({ id: 'zeta', perspectives: ['decisions'] },
      { id: 'alpha', perspectives: ['decisions'] }), '', '').stream).toBe('zeta');
  });

  it('takes the manifest\'s first entry when the stream emitted no decisions lens', () => {
    const listing = census({ id: 'architecture', perspectives: ['dependencies', 'lifecycle'] });
    expect(firstPick(listing, '', '')).toEqual({
      stream: 'architecture', perspective: 'dependencies',
    });
  });

  it('fills only what the window has not chosen', () => {
    const listing = census(
      { id: 'base', perspectives: ['decisions', 'tiers'] },
      { id: 'architecture', perspectives: ['dependencies'] },
    );
    // the reader chose a stream: the perspective is chosen for THAT stream
    expect(firstPick(listing, 'architecture', '')).toEqual({
      stream: '', perspective: 'dependencies',
    });
    // the reader chose a perspective: only the stream is filled
    expect(firstPick(listing, '', 'tiers')).toEqual({ stream: 'base', perspective: '' });
    // the reader chose both: nothing is touched, ever
    expect(firstPick(listing, 'architecture', 'tiers')).toBe(NOTHING_PICKED);
  });

  it('chooses nothing off a census that named nothing', () => {
    expect(firstPick(undefined, '', '')).toBe(NOTHING_PICKED);
    expect(firstPick({ status: 'empty' }, '', '')).toBe(NOTHING_PICKED);
    expect(firstPick({ status: 'loading' }, '', '')).toBe(NOTHING_PICKED);
    expect(firstPick(census(), '', '')).toBe(NOTHING_PICKED);
    // a stream whose perspectives are not known opens on none
    expect(firstPick(census({ id: 'base' }), '', '')).toEqual({
      stream: 'base', perspective: '',
    });
    // a window on a stream this set does not carry keeps it and says so
    expect(firstPick(census({ id: 'base', perspectives: ['decisions'] }), 'gone', ''))
      .toBe(NOTHING_PICKED);
  });
});

describe('a browser window draws on landing', () => {
  it('opens on the census\'s first stream and its decisions lens, with no click', async () => {
    const desk = mountDesk();
    const tab = desk.tab('landing', browserTabTaps('landing'));
    const state = await settled(
      () => tab.read(GYLD_LENS).get() as GyldLensState,
      (value) => value?.status === 'ok',
    );
    expect(tab.read(GYLD_DEST_STREAM).get()).toBe(index.streams[0].id);
    expect(tab.read(GYLD_DEST_PERSPECTIVE).get()).toBe('decisions');
    expect(state.value?.perspective).toBe('decisions');
    // and the window says what it chose for itself
    expect(tab.read(GYLD_TAB_PICKED).get() as GyldFirstPick)
      .toEqual({ stream: 'base', perspective: 'decisions' });
    expect(tab.render(<GyldBrowser tabId="landing" />)).toContain('gyld-lens-svg');
  });

  it('keeps the link\'s own stream and opens it on a perspective it emitted', async () => {
    // The architecture lineage emits no `decisions` lens, so the first entry
    // of its OWN manifest is what the window opens on. (The trimmed fixture
    // carries two of that stream's nine lens files, so the picture then reads
    // as absent — which is the store's answer about a file, not this tap's
    // about a choice.)
    const first = index.streams.find((entry) => entry.id === 'architecture')!
      .lenses!.filter((lens) => lens.emitted)[0].perspective;
    const desk = mountDesk();
    const tab = desk.tab('arch-landing', browserTabTaps('arch-landing', {
      stream: 'architecture',
    }));
    await settled(
      () => tab.read(GYLD_TAB_PICKED).get() as GyldFirstPick,
      (value) => value?.perspective !== '',
    );
    expect(tab.read(GYLD_DEST_STREAM).get()).toBe('architecture');
    expect(tab.read(GYLD_DEST_PERSPECTIVE).get()).toBe(first);
    expect(tab.read(GYLD_TAB_PICKED).get() as GyldFirstPick)
      .toEqual({ stream: '', perspective: first });
  });

  it('never overwrites a pick the reader made', async () => {
    const desk = mountDesk();
    const tab = desk.tab('chosen', browserTabTaps('chosen', {
      stream: 'base', perspective: 'tiers',
    }));
    await settled(
      () => tab.read(GYLD_LENS).get() as GyldLensState,
      (value) => value?.status === 'ok',
    );
    expect(tab.read(GYLD_DEST_PERSPECTIVE).get()).toBe('tiers');
    expect(tab.read(GYLD_TAB_PICKED).get() as GyldFirstPick).toEqual(NOTHING_PICKED);
    // and a pick made LATER stands: the census is still there and still says
    // decisions, and nothing puts the window back on it
    const handle = tab.read(GYLD_DEST_PERSPECTIVE_TAP).get() as AtomTapHandle<string>;
    handle.set('status');
    await expect.poll(() => tab.read(GYLD_DEST_PERSPECTIVE).get()).toBe('status');
    await expect.poll(() => (tab.read(GYLD_LENS).get() as GyldLensState)?.status).toBe('ok');
    expect(tab.read(GYLD_DEST_PERSPECTIVE).get()).toBe('status');
  });

  it('chooses nothing on a desk with no root, which is the picker\'s state', async () => {
    const desk = mountDesk(EMPTY_ROOTS);
    const tab = desk.tab('rootless', browserTabTaps('rootless'));
    await settled(
      () => tab.read(GYLD_STREAMS).get() as GyldStreamsCensus,
      (value) => value?.status === 'empty',
    );
    expect(tab.read(GYLD_DEST_STREAM).get()).toBe('');
    expect(tab.read(GYLD_TAB_PICKED).get() as GyldFirstPick).toEqual(NOTHING_PICKED);
  });
});
