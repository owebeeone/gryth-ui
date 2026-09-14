import { describe, it, expect } from 'vitest';
import type { GyldRootStatus } from './state';
import {
  ROOT_WAITING, WAITING_REASON, anyWaiting, bootRunOf, isWaiting, rootLine, waitingSays,
} from './waiting';

// A root that is there and empty is not a root that failed.
//
// The complaint this answers: the streams window said `glade node: error
// (nothing has landed on gyld.streams for streams.json)` for the whole time
// between a fresh composition starting and its first build finishing, which is
// the ordinary state of a bundle root nobody has built into.

const root = (over: Partial<GyldRootStatus> = {}): GyldRootStatus => ({
  root: { kind: 'share' },
  describe: 'glade node',
  status: 'ready',
  watchLive: false,
  ...over,
});

describe('a root with nothing published on it yet', () => {
  it('is a waiting root, and reads as one', () => {
    expect(isWaiting(root({ status: ROOT_WAITING }))).toBe(true);
    expect(isWaiting(root({ status: 'error', error: 'boom' }))).toBe(false);
    expect(isWaiting(root())).toBe(false);
    expect(anyWaiting([root(), root({ status: ROOT_WAITING })])).toBe(true);
    expect(anyWaiting([root(), root({ status: 'error' })])).toBe(false);
    expect(anyWaiting([])).toBe(false);
  });

  it('says the reason on its status line instead of an error it does not have', () => {
    expect(rootLine(root({ status: ROOT_WAITING, watchLive: true })))
      .toBe(`glade node: waiting (${WAITING_REASON}) · watching`);
    // and every other root's line is what it always was
    expect(rootLine(root())).toBe('glade node: ready');
    expect(rootLine(root({ status: 'error', error: 'no glade node in this composition' })))
      .toBe('glade node: error (no glade node in this composition)');
    expect(rootLine(root({ describe: 'https://x.test/out', status: 'loading', watchLive: true })))
      .toBe('https://x.test/out: loading · watching');
  });
});

describe('what a waiting desk is told', () => {
  it('leads with the wait and offers Rebuild when no build is in sight', () => {
    const said = waitingSays('');
    expect(said[0]).toContain(WAITING_REASON);
    expect(said[0]).toContain('waiting state, not a failure');
    expect(said[1]).toContain('press Rebuild');
  });

  it('names the supplier\'s own first build instead, when one is visible', () => {
    const said = waitingSays('boot-1789247615547');
    expect(said[1]).toBe(
      'Its first build is running as boot-1789247615547; the run\'s own lines are below.',
    );
    expect(said[1]).not.toContain('Rebuild');
  });

  it('takes a boot run for what it is and every other run for what it is not', () => {
    expect(bootRunOf('boot-1789247615547')).toBe('boot-1789247615547');
    expect(bootRunOf('boot')).toBe('boot');
    // a run this desk started itself is not the supplier's first build
    expect(bootRunOf('run-1789247615547')).toBe('');
    expect(bootRunOf('')).toBe('');
  });
});
