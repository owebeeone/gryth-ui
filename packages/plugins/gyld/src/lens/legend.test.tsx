import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readLens } from '../contract';
import { CAMERA_UNFITTED, NOTHING_DIMMED } from './camera';
import { NodeFacet } from './facets';
import {
  FLASH_MS, FlashSweep, NOT_FLASHING, cleared, flashOn, isFlashing,
  type GyldFlash, type Schedule,
} from './flash';
import { ArrowEntry, BoxEntry, legendEntriesOf } from './legend';
import { buildScene } from './scene';
import { LensFigure } from './LensView';
import decisionsFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';
import allocationFixture from '../../test/fixtures/bundle/streams/architecture/lenses/allocation.lens.json';

// The legend as a MODEL: one entry per emitted class, the drawn shapes it
// stands for, how many of them this picture has, and what its eye does.
//
// The one rule everything below turns on: an entry's match set IS the set its
// eye switches off. A count that said one thing and a toggle that did another
// would be the window lying about its own picture.

const lens = readLens(decisionsFixture);
const allocation = readLens(allocationFixture);

const entryFor = (key: string) => legendEntriesOf(lens).find((entry) => entry.key === key)!;

/** A clock a test fires by hand: the sweep never waits for real time. */
function fakeClock() {
  const due: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  const schedule: Schedule = (fn, ms) => {
    const slot = { fn, ms, cancelled: false };
    due.push(slot);
    return () => { slot.cancelled = true; };
  };
  return {
    schedule,
    due,
    /** Fire every pending, uncancelled timer. */
    fire() {
      for (const slot of due) {
        if (!slot.cancelled) {
          slot.cancelled = true;
          slot.fn();
        }
      }
    },
  };
}

/** The window's flash atom, as much of the handle as the sweep needs. */
function flashAtom(initial: GyldFlash = NOT_FLASHING) {
  let held = initial;
  return {
    get: () => held,
    set: (next: GyldFlash) => { held = next; },
  };
}

describe('an entry stands for the class the host emitted', () => {
  it('offers a row per emitted arrow and box, in the emitted order', () => {
    const entries = legendEntriesOf(lens);
    expect(entries.map((entry) => entry.label)).toEqual([
      'Requires', 'Implies', 'GatedBy',
      'Question · Decided', 'Question · Directed', 'Question · Lean', 'Question · Open',
      'Trigger',
    ]);
    expect(entries.filter((entry) => entry instanceof ArrowEntry)).toHaveLength(3);
    expect(entries.filter((entry) => entry instanceof BoxEntry)).toHaveLength(5);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length);
  });

  it('samples an arrow as a line and a box as a swatch, with emitted colours', () => {
    const requires = entryFor('relation/Requires');
    const emitted = lens.legend.edges.find((entry) => entry.relation === 'Requires')!;
    expect(requires.sample.isLine).toBe(true);
    expect(requires.sample.color).toBe(emitted.color);
    expect(requires.sample.style).toBe(emitted.style);
    const open = entryFor('node/Question/Open/');
    const box = lens.legend.nodes.find((entry) => entry.status === 'Open')!;
    expect(open.sample.isLine).toBe(false);
    expect(open.sample.fill).toBe(box.fill);
  });

  it('carries the app sentence, and the emitted doc only when one was emitted', () => {
    expect(entryFor('relation/Implies').says).toContain('makes the question at the head live');
    expect(entryFor('node/Question/Open/').says).toContain('waiting on you');
    expect(entryFor('node/Trigger//').says).toContain('Not a question');
    for (const entry of legendEntriesOf(lens)) {
      expect(entry.doc, entry.key).toBeUndefined();
    }
    const documented = legendEntriesOf(readLens({
      ...decisionsFixture,
      legend: {
        edges: decisionsFixture.legend.edges.map((entry) => ({ ...entry, doc: 'the relation says' })),
        nodes: decisionsFixture.legend.nodes.map((entry) => ({ ...entry, doc: 'the trait says' })),
      },
    }));
    expect(documented[0].doc).toBe('the relation says');
    expect(documented.at(-1)?.doc).toBe('the trait says');
    // The emitted word does not replace the app's own: a row shows both.
    expect(documented.at(-1)?.says).toContain('Not a question');
  });
});

describe('an entry matches exactly what its eye switches off', () => {
  it('matches the arrows of its relation, and no box', () => {
    const implies = entryFor('relation/Implies');
    const drawn = lens.edges.filter((edge) => edge.relation === 'Implies');
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.every((edge) => implies.matchesEdge(edge))).toBe(true);
    expect(lens.edges.filter((edge) => implies.matchesEdge(edge))).toHaveLength(drawn.length);
    expect(lens.nodes.some((node) => implies.matchesNode(node))).toBe(false);
  });

  it('matches the boxes of its status, and no arrow', () => {
    const lean = entryFor('node/Question/Lean/');
    const drawn = lens.nodes.filter((node) => node.status === 'Lean');
    expect(drawn.length).toBeGreaterThan(0);
    expect(lens.nodes.filter((node) => lean.matchesNode(node))).toEqual(drawn);
    expect(lens.edges.some((edge) => lean.matchesEdge(edge))).toBe(false);
  });

  it('matches a kind that carries no status by its kind', () => {
    const trigger = entryFor('node/Trigger//');
    expect((trigger as BoxEntry).facet).toBe(NodeFacet.KIND);
    expect(lens.nodes.filter((node) => trigger.matchesNode(node)))
      .toEqual(lens.nodes.filter((node) => node.kind === 'Trigger'));
  });

  it('toggles the same facet the chrome buttons toggled, and says so', () => {
    const lean = entryFor('node/Question/Lean/');
    expect((lean as BoxEntry).facet).toBe(NodeFacet.STATUS);
    expect(lean.isOff(NOTHING_DIMMED)).toBe(false);
    const off = lean.toggle(NOTHING_DIMMED);
    expect(off).toEqual({ ...NOTHING_DIMMED, statuses: ['Lean'] });
    expect(lean.isOff(off)).toBe(true);
    expect(lean.toggle(off)).toEqual(NOTHING_DIMMED);
    const implies = entryFor('relation/Implies');
    expect(implies.toggle(NOTHING_DIMMED)).toEqual({ ...NOTHING_DIMMED, relations: ['Implies'] });
  });

  it('reads an architecture lens by classification, on the same rule', () => {
    const entries = legendEntriesOf(allocation);
    const classified = entries.filter(
      (entry) => entry instanceof BoxEntry && entry.facet === NodeFacet.CLASSIFICATION,
    ) as BoxEntry[];
    expect(classified.length).toBeGreaterThan(0);
    for (const entry of classified) {
      expect(allocation.nodes.filter((node) => entry.matchesNode(node)))
        .toEqual(allocation.nodes.filter((node) => node.classification === entry.value));
      // this app has no authored sentence for an architecture vocabulary
      expect(entry.says).toBe('');
    }
  });
});

describe('the scene counts each row over the picture it draws', () => {
  it('counts the matching boxes and arrows, and marks what is off', () => {
    const scene = buildScene(lens);
    expect(scene.legend.map((row) => row.entry.key))
      .toEqual(legendEntriesOf(lens).map((entry) => entry.key));
    for (const row of scene.legend) {
      const boxes = lens.nodes.filter((node) => row.entry.matchesNode(node)).length;
      const arrows = scene.edges.filter((edge) => row.entry.matchesEdge(edge)).length;
      expect(row.count, row.entry.key).toBe(boxes + arrows);
      expect(row.count, row.entry.key).toBeGreaterThan(0);
      expect(row.off).toBe(false);
    }
    const total = scene.legend
      .filter((row) => row.entry instanceof ArrowEntry)
      .reduce((sum, row) => sum + row.count, 0);
    expect(total).toBe(scene.edges.length);
  });

  it('says a row is off exactly when this window switched it off', () => {
    const off = buildScene(lens, {
      dimmed: { ...NOTHING_DIMMED, relations: ['GatedBy'], statuses: ['Open'] },
    });
    const isOff = (key: string) => off.legend.find((row) => row.entry.key === key)!.off;
    expect(isOff('relation/GatedBy')).toBe(true);
    expect(isOff('node/Question/Open/')).toBe(true);
    expect(isOff('relation/Requires')).toBe(false);
    expect(isOff('node/Question/Lean/')).toBe(false);
    // the count is what is DRAWN, so switching a class off does not change it
    expect(off.legend.map((row) => row.count))
      .toEqual(buildScene(lens).legend.map((row) => row.count));
  });
});

describe('the flash is a stamp with a clock', () => {
  it('bumps the count on every press, so a second press is a new flash', () => {
    expect(NOT_FLASHING).toEqual({ entry: '', seq: 0 });
    const first = flashOn(NOT_FLASHING, 'node/Question/Lean/');
    expect(first).toEqual({ entry: 'node/Question/Lean/', seq: 1 });
    const again = flashOn(first, 'node/Question/Lean/');
    expect(again.entry).toBe(first.entry);
    expect(again.seq).toBe(2);
    expect(isFlashing(first, 'node/Question/Lean/')).toBe(true);
    expect(isFlashing(first, 'relation/Requires')).toBe(false);
    expect(isFlashing(NOT_FLASHING, '')).toBe(false);
  });

  it('clears the mark and keeps the count, so the next flash is still new', () => {
    const lit = flashOn(NOT_FLASHING, 'relation/Requires');
    const out = cleared(lit);
    expect(out).toEqual({ entry: '', seq: 1 });
    expect(cleared(out)).toBe(out);
    expect(flashOn(out, 'relation/Requires').seq).toBe(2);
    expect(flashOn(lit, '')).toEqual(out);
  });

  it('is swept off the window after the interval, through the same handle', () => {
    const clock = fakeClock();
    const sweep = new FlashSweep(clock.schedule, FLASH_MS);
    const atom = flashAtom();
    atom.set(flashOn(atom.get(), 'relation/Implies'));
    sweep.arm(atom);
    expect(clock.due).toHaveLength(1);
    expect(clock.due[0].ms).toBe(FLASH_MS);
    expect(atom.get().entry).toBe('relation/Implies');
    clock.fire();
    expect(atom.get()).toEqual({ entry: '', seq: 1 });
  });

  it('restarts one window\'s interval rather than queueing a second', () => {
    const clock = fakeClock();
    const sweep = new FlashSweep(clock.schedule, FLASH_MS);
    const atom = flashAtom();
    atom.set(flashOn(atom.get(), 'relation/Implies'));
    sweep.arm(atom);
    atom.set(flashOn(atom.get(), 'relation/Implies'));
    sweep.arm(atom);
    expect(clock.due).toHaveLength(2);
    expect(clock.due[0].cancelled).toBe(true);
    expect(clock.due[1].cancelled).toBe(false);
    clock.fire();
    expect(atom.get()).toEqual({ entry: '', seq: 2 });
  });

  it('never sweeps one window\'s mark because another window flashed', () => {
    const clock = fakeClock();
    const sweep = new FlashSweep(clock.schedule, FLASH_MS);
    const left = flashAtom(flashOn(NOT_FLASHING, 'relation/Requires'));
    const right = flashAtom(flashOn(NOT_FLASHING, 'node/Trigger//'));
    sweep.arm(left);
    sweep.arm(right);
    expect(clock.due.filter((slot) => !slot.cancelled)).toHaveLength(2);
    clock.fire();
    expect(left.get().entry).toBe('');
    expect(right.get().entry).toBe('');
  });

  it('arms nothing at all for a window with no handle', () => {
    const clock = fakeClock();
    new FlashSweep(clock.schedule, FLASH_MS).arm(undefined);
    expect(clock.due).toHaveLength(0);
  });
});

describe('the flash marks the drawn shapes, and moves none of them', () => {
  it('marks every box of the pressed row and nothing else', () => {
    const flash = flashOn(NOT_FLASHING, 'node/Question/Lean/');
    const scene = buildScene(lens, { flash });
    const lean = lens.nodes.filter((node) => node.status === 'Lean').map((node) => node.id);
    expect(scene.nodes.filter((node) => node.flashing).map((node) => node.id)).toEqual(lean);
    expect(scene.edges.some((edge) => edge.flashing)).toBe(false);
    expect(scene.flash).toEqual(flash);
    // the same boxes, in the same places (MDV-4)
    expect(scene.nodes.map((node) => node.box)).toEqual(buildScene(lens).nodes.map((n) => n.box));
  });

  it('marks every arrow of a pressed relation row', () => {
    const scene = buildScene(lens, { flash: flashOn(NOT_FLASHING, 'relation/GatedBy') });
    const gated = scene.edges.filter((edge) => edge.relation === 'GatedBy');
    expect(gated.length).toBeGreaterThan(0);
    expect(scene.edges.filter((edge) => edge.flashing)).toEqual(gated);
    expect(scene.nodes.some((node) => node.flashing)).toBe(false);
  });

  it('marks nothing for a cleared stamp or an entry this lens has no row for', () => {
    expect(buildScene(lens).nodes.some((node) => node.flashing)).toBe(false);
    const stale = buildScene(lens, { flash: { entry: 'relation/Allocates', seq: 4 } });
    expect(stale.nodes.some((node) => node.flashing)).toBe(false);
    expect(stale.edges.some((edge) => edge.flashing)).toBe(false);
  });

  it('draws the mark as a class, and keys it on the flash so a repress replays', () => {
    const first = buildScene(lens, { flash: flashOn(NOT_FLASHING, 'node/Question/Lean/') });
    const markup = renderToStaticMarkup(
      <LensFigure scene={first} camera={CAMERA_UNFITTED} scope="test" />,
    );
    const lean = lens.nodes.filter((node) => node.status === 'Lean');
    expect(markup.match(/gyld-node-flash/g) ?? []).toHaveLength(lean.length);
    expect(markup).not.toContain('gyld-edge-flash');
    // the ids are the emitted ids: the flash is in the KEY, never in the id
    for (const node of lean) {
      expect(markup).toContain(`id="${node.id}"`);
      expect(markup).not.toContain(`id="${node.id}#`);
    }
  });
});
