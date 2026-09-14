import { describe, it, expect } from 'vitest';
import { createAtomValueTap, type AtomTapHandle, type Drip, type Grip } from '@owebeeone/grip-react';
import { grok } from '@grythjs/plugin-api';
import { GYLD_LANDING, GYLD_NODE, GYLD_OPS_STATUS, GYLD_SET, GYLD_SET_TAP } from '../grips';
import { EMPTY_SET, type GyldSet } from '../store/state';
import { GyldLandingTap } from './GyldLandingTap';
import { GladePresence, landingSays, landsGladeRoot, type GyldLanding } from './landing';

// What an empty desk lands on when the glade session comes up.
//
// The complaint this answers: a glade node was answering the whole time and
// the desk still opened on the set picker. The rule is an EDGE — becoming
// ready with no root of any kind — taken in the tap layer, so it happens once
// per desk whatever windows are open, and a root the reader takes off stays
// off while the session stays up.

const SHARE_ROOT = { kind: 'share' } as const;
const STATIC_ROOT = { kind: 'static', baseUrl: 'https://example.test/out' } as const;

/** The graph holds contexts by WeakRef; what a test mounts is held here. */
const mounted: unknown[] = [];
let desks = 0;

/**
 * A desk with the two mirrored values as plain atoms.
 *
 * In the application `Gyld.Ops.Status` and `Gyld.Node` are function taps over
 * `@grythjs/glade` (src/live.ts); here they are atoms with the same grips, so
 * the tap under test sees exactly what it sees in the desktop and the test
 * needs no DOM, no socket and no glade module.
 */
function landingDesk(set: GyldSet = EMPTY_SET, status = 'connecting', node = '') {
  const ctx = grok.mainPresentationContext
    .getOrCreateMatchingContext(`gyld-landing-${desks += 1}`);
  const home = ctx.getGripHomeContext();
  const statusTap = createAtomValueTap(GYLD_OPS_STATUS, { initial: status });
  const nodeTap = createAtomValueTap(GYLD_NODE, { initial: node });
  home.registerTap(createAtomValueTap(GYLD_SET, { initial: set, handleGrip: GYLD_SET_TAP }));
  home.registerTap(statusTap);
  home.registerTap(nodeTap);
  const landing = new GyldLandingTap();
  home.registerTap(landing);
  mounted.push(ctx, home, landing);
  const read = <T,>(grip: Grip<T>): Drip<T> => {
    const drip = ctx.getGripConsumerContext().getOrCreateConsumer(grip);
    drip.subscribe(() => {});
    mounted.push(drip);
    return drip;
  };
  const setDrip = read(GYLD_SET);
  const landingDrip = read(GYLD_LANDING);
  return {
    statusTap,
    nodeTap,
    roots: () => (setDrip.get() ?? EMPTY_SET).roots,
    landing: () => landingDrip.get() as GyldLanding | undefined,
    setTap: () => read(GYLD_SET_TAP).get() as AtomTapHandle<GyldSet> | undefined,
  };
}

describe('the glade presence is what the desk waits for', () => {
  it('reads the mirrored status, and an empty one as no glade at all', () => {
    expect(GladePresence.of('live')).toBe(GladePresence.LIVE);
    expect(GladePresence.of('connecting')).toBe(GladePresence.CONNECTING);
    expect(GladePresence.of('offline')).toBe(GladePresence.OFFLINE);
    expect(GladePresence.of('')).toBe(GladePresence.ABSENT);
    // ready is the edge; settling is the state that accuses nothing
    expect(GladePresence.LIVE.ready).toBe(true);
    expect(GladePresence.CONNECTING.settling).toBe(true);
    expect(GladePresence.OFFLINE.settling).toBe(false);
    expect(GladePresence.ABSENT.settling).toBe(false);
  });

  it('lands only on the edge into ready, and only onto an empty desk', () => {
    const empty = EMPTY_SET;
    const held: GyldSet = { roots: [STATIC_ROOT] };
    expect(landsGladeRoot(GladePresence.CONNECTING, GladePresence.LIVE, empty)).toBe(true);
    expect(landsGladeRoot(GladePresence.ABSENT, GladePresence.LIVE, empty)).toBe(true);
    // a desk that already has a root chose that root
    expect(landsGladeRoot(GladePresence.CONNECTING, GladePresence.LIVE, held)).toBe(false);
    // not an edge: already ready
    expect(landsGladeRoot(GladePresence.LIVE, GladePresence.LIVE, empty)).toBe(false);
    // never ready at all
    expect(landsGladeRoot(GladePresence.CONNECTING, GladePresence.OFFLINE, empty)).toBe(false);
    expect(landsGladeRoot(GladePresence.CONNECTING, GladePresence.ABSENT, empty)).toBe(false);
  });
});

describe('an empty desk lands on the glade node', () => {
  it('adds the glade root when the session becomes ready', async () => {
    const desk = landingDesk(EMPTY_SET, 'connecting', 'ws://127.0.0.1:9106');
    await expect.poll(() => desk.landing()?.presence).toBe(GladePresence.CONNECTING);
    expect(desk.roots()).toEqual([]);
    desk.statusTap.set('live');
    await expect.poll(() => desk.roots()).toEqual([SHARE_ROOT]);
    const landing = desk.landing()!;
    expect(landing.presence).toBe(GladePresence.LIVE);
    expect(landing.landed).toBe(true);
    expect(landing.node).toBe('ws://127.0.0.1:9106');
  });

  it('adds nothing when the desk already has a root of its own', async () => {
    const desk = landingDesk({ roots: [STATIC_ROOT] }, 'connecting');
    await expect.poll(() => desk.landing()?.presence).toBe(GladePresence.CONNECTING);
    desk.statusTap.set('live');
    await expect.poll(() => desk.landing()?.presence).toBe(GladePresence.LIVE);
    expect(desk.roots()).toEqual([STATIC_ROOT]);
    expect(desk.landing()?.landed).toBe(false);
  });

  it('does not put back a root the reader removed while the session stays up', async () => {
    const desk = landingDesk();
    desk.statusTap.set('live');
    await expect.poll(() => desk.roots()).toEqual([SHARE_ROOT]);
    desk.setTap()!.set(EMPTY_SET);
    await expect.poll(() => desk.roots()).toEqual([]);
    // the session never stopped being ready, so the edge never comes again
    desk.nodeTap.set('ws://127.0.0.1:9099');
    await expect.poll(() => desk.landing()?.node).toBe('ws://127.0.0.1:9099');
    expect(desk.roots()).toEqual([]);
  });

  it('changes nothing when the session never becomes ready', async () => {
    const desk = landingDesk(EMPTY_SET, 'connecting', 'ws://127.0.0.1:9099');
    desk.statusTap.set('offline');
    await expect.poll(() => desk.landing()?.presence).toBe(GladePresence.OFFLINE);
    expect(desk.roots()).toEqual([]);
    expect(desk.landing()?.landed).toBe(false);
  });

  it('lands a desk that finds the session already up', async () => {
    // A desk mounted against a composition that connected before this plugin
    // was asked anything: the first change it sees is still the edge into
    // ready, because it had never seen a ready session before.
    const desk = landingDesk(EMPTY_SET, '');
    desk.statusTap.set('live');
    await expect.poll(() => desk.roots()).toEqual([SHARE_ROOT]);
  });
});

describe('what the picker is told to say', () => {
  it('names the node it is still connecting to, and offers nothing', () => {
    const says = landingSays({
      presence: GladePresence.CONNECTING, node: 'ws://127.0.0.1:9106', landed: false,
    });
    expect(says.lead).toBe('connecting to the glade node at ws://127.0.0.1:9106');
    expect(says.fix).toBe('');
    expect(says.offers).toBe(false);
  });

  it('leads with the fact and the fix when nothing answered', () => {
    for (const presence of [GladePresence.OFFLINE, GladePresence.ABSENT]) {
      const says = landingSays({ presence, node: 'ws://127.0.0.1:9099', landed: false });
      expect(says.lead).toBe(
        'No glade node answered at ws://127.0.0.1:9099, so this desk has nothing to read.',
      );
      expect(says.fix).toContain('python3 gyld-ui.py start');
      expect(says.fix).toContain('gryth-ui');
      expect(says.offers).toBe(true);
    }
  });

  it('names no URL it has not resolved', () => {
    expect(landingSays({ presence: GladePresence.ABSENT, node: '', landed: false }).lead)
      .toContain('the node URL this page would use');
    expect(landingSays({ presence: GladePresence.CONNECTING, node: '', landed: false }).lead)
      .toBe('connecting to the glade node at the node URL this page would use');
  });

  it('offers the node back to a live desk the reader emptied', () => {
    const says = landingSays({
      presence: GladePresence.LIVE, node: 'ws://127.0.0.1:9106', landed: true,
    });
    expect(says.lead).toContain('is live');
    expect(says.offers).toBe(true);
    expect(says.fix).toBe('');
  });
});
