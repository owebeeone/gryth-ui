import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { type AtomTapHandle, type Drip, type Grip } from '@owebeeone/grip-react';
import { readDecideNow, readLens, type GyldDecideNow } from '../contract';
import {
  GYLD_DECIDE_NOW, GYLD_LENS, GYLD_TAB_DIMMED, GYLD_TAB_DIMMED_TAP,
} from '../grips';
import { GyldBrowser } from '../GyldBrowser';
import {
  CAMERA_UNFITTED, NOTHING_DIMMED, toggleNextUpOnly, type GyldDimmed,
} from '../lens/camera';
import { StatusGlyph } from '../lens/glyphs';
import { buildScene } from '../lens/scene';
import { LensFigure } from '../lens/LensView';
import { browserTabTaps } from './browserTabTaps';
import { NO_NEXT_UP, nextUpOf } from './nextUp';
import type { GyldLensState, GyldValue } from '../store/state';
import { mountDesk } from '../../test/mount';
import decisionsFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';
import decideNowFixture from '../../test/fixtures/bundle/streams/base/decide-now.json';

// The next-up join (GyldUiSimplification.md section 3, owner rulings U1 and
// U2 of 2026-09-16). Every mark below is a READ of `decide-now.json`: the
// window joins the emitted rows to the drawn boxes by QUALIFIED SLOT and
// nothing else, so no count and no status here is computed from the graph
// (GyldGrythPlugins.md 3.5 and 6.7).

const lens = readLens(decisionsFixture);
const decideNow = readDecideNow(decideNowFixture);
const KEY_CUSTODY = 'glade_decisions:GladeDecisions.key_custody';
const SCOPE_MODEL = 'glade_decisions:GladeDecisions.scope_model';

/** The qualified slots a set of lens ids stands for, sorted. */
const slotsOf = (ids: ReadonlySet<string>) => [...ids]
  .map((id) => lens.nodes.find((node) => node.id === id)!.slot)
  .sort();

const settled = async <T,>(read: () => T, done: (value: T) => boolean): Promise<T> => {
  await expect.poll(() => done(read())).toBe(true);
  return read();
};

/** Both files the window joins: a render before the decide-now list lands
 *  would be asserting the "no list yet" state, which is a different state. */
const drawn = async (tab: { read: <T>(grip: Grip<T>) => Drip<T> }): Promise<void> => {
  await settled(
    () => tab.read(GYLD_LENS).get() as GyldLensState,
    (state) => state?.status === 'ok',
  );
  await settled(
    () => tab.read(GYLD_DECIDE_NOW).get() as GyldValue<GyldDecideNow> | undefined,
    (value) => value !== undefined && value.status !== 'unset' && value.status !== 'loading',
  );
};

describe('the join is by qualified slot, over emitted rows', () => {
  it('gives every drawn box the emitted status of its own row', () => {
    const joined = nextUpOf(lens, decideNow);
    expect(joined.listed).toBe(true);
    for (const row of decideNow.questions) {
      const node = lens.nodes.find((entry) => entry.slot === row.slot);
      if (node === undefined) {
        continue;
      }
      expect(joined.statuses.get(node.id), row.slot).toBe(row.effective_status);
      expect(joined.ids.has(node.id), row.slot).toBe(row.answerable_now);
    }
    // 24 of the 29 drawn boxes carry a row; the other five are drawn records
    // this stream's decide-now list does not list, and they join nothing.
    expect(joined.statuses.size).toBe(24);
    expect(joined.drawn).toBe(lens.nodes.length);
    const unjoined = lens.nodes.filter((node) => !joined.statuses.has(node.id));
    expect(unjoined).toHaveLength(5);
    for (const node of unjoined) {
      expect(decideNow.questions.some((row) => row.slot === node.slot)).toBe(false);
    }
  });

  it('counts the answerable rows as emitted, drawn and in the file', () => {
    const joined = nextUpOf(lens, decideNow);
    const answerable = decideNow.questions.filter((row) => row.answerable_now);
    expect(joined.rows).toBe(answerable.length);
    expect(joined.count).toBe(4);
    expect(slotsOf(joined.ids)).toEqual(answerable.map((row) => row.slot).sort());
  });

  it('marks nothing at all for a stream that emitted no list', () => {
    const none = nextUpOf(lens, undefined);
    expect(none).toEqual({ ...NO_NEXT_UP, drawn: lens.nodes.length });
    expect(none.listed).toBe(false);
    expect(none.ids.size).toBe(0);
    expect(none.statuses.size).toBe(0);
    expect(none.count).toBe(0);
  });

  it('counts the emitted rows even when this picture draws none of them', () => {
    // `rows` is the FILE's answer and `count` is this picture's, so a lens
    // that draws no answerable box still says how many the stream has.
    const narrow = nextUpOf({ ...lens, nodes: [] }, decideNow);
    expect(narrow.rows).toBe(4);
    expect(narrow.count).toBe(0);
    expect(narrow.drawn).toBe(0);
    expect(narrow.listed).toBe(true);
  });
});

describe('the status glyph marks Open and Lean, and nothing else', () => {
  it('names a glyph for the two statuses that ask something of the reader', () => {
    expect(StatusGlyph.of('Open')).toBe(StatusGlyph.OPEN);
    expect(StatusGlyph.of('Lean')).toBe(StatusGlyph.LEAN);
    expect(StatusGlyph.of('Decided')).toBeUndefined();
    expect(StatusGlyph.of('Directed')).toBeUndefined();
    expect(StatusGlyph.of(undefined)).toBeUndefined();
    expect(StatusGlyph.ALL.map((glyph) => glyph.status)).toEqual(['Open', 'Lean']);
  });

  it('draws one glyph inside the emitted box of each Open and Lean row', () => {
    const scene = buildScene(lens, { nextUp: nextUpOf(lens, decideNow) });
    const markup = renderToStaticMarkup(
      <LensFigure scene={scene} camera={CAMERA_UNFITTED} scope="test" />,
    );
    const open = decideNow.questions.filter(
      (row) => row.effective_status === 'Open' && lens.nodes.some((n) => n.slot === row.slot),
    );
    const lean = decideNow.questions.filter(
      (row) => row.effective_status === 'Lean' && lens.nodes.some((n) => n.slot === row.slot),
    );
    expect(open.length).toBe(5);
    expect(lean.length).toBe(12);
    expect(markup.match(/data-status="Open"/g) ?? []).toHaveLength(open.length);
    expect(markup.match(/data-status="Lean"/g) ?? []).toHaveLength(lean.length);
    expect(markup).not.toContain('data-status="Decided"');
    expect(markup).not.toContain('data-status="Directed"');
    // inside the box, so nothing moved (MDV-4)
    const custody = scene.nodes.find((node) => node.slot === KEY_CUSTODY)!;
    const plain = buildScene(lens).nodes.find((node) => node.slot === KEY_CUSTODY)!;
    expect(custody.box).toEqual(plain.box);
    expect(markup).toContain(
      `translate(${custody.box.x + custody.box.width - 8} ${custody.box.y + 8})`,
    );
  });

  it('draws no glyph at all when the stream emitted no decide-now list', () => {
    const markup = renderToStaticMarkup(
      <LensFigure scene={buildScene(lens)} camera={CAMERA_UNFITTED} scope="test" />,
    );
    expect(markup).not.toContain('gyld-node-glyph');
  });
});

describe('Next up only dims the rest, and says so', () => {
  it('is one more field on the dim set, and toggles on its own', () => {
    expect(NOTHING_DIMMED.nextUpOnly).toBe(false);
    const on = toggleNextUpOnly(NOTHING_DIMMED);
    expect(on).toEqual({ ...NOTHING_DIMMED, nextUpOnly: true });
    expect(toggleNextUpOnly(on)).toEqual(NOTHING_DIMMED);
  });

  it('dims exactly the boxes no answerable row joined, over the same geometry', () => {
    const nextUp = nextUpOf(lens, decideNow);
    const plain = buildScene(lens, { nextUp });
    const only = buildScene(lens, { nextUp, dimmed: toggleNextUpOnly(NOTHING_DIMMED) });
    expect(only.nodes.map((node) => node.box)).toEqual(plain.nodes.map((node) => node.box));
    expect(only.edges.map((edge) => edge.path)).toEqual(plain.edges.map((edge) => edge.path));
    expect(only.nodes.filter((node) => node.dimmed).length).toBe(lens.nodes.length - 4);
    expect(only.nodes.filter((node) => node.answerable).every((node) => !node.dimmed)).toBe(true);
    expect(plain.nodes.some((node) => node.dimmed)).toBe(false);
  });

  it('never hides, whatever the hide switch says (owner ruling U1)', () => {
    const nextUp = nextUpOf(lens, decideNow);
    const only = buildScene(lens, {
      nextUp,
      dimmed: { ...toggleNextUpOnly(NOTHING_DIMMED), hide: true },
    });
    expect(only.nodes.some((node) => node.hidden)).toBe(false);
    expect(only.nodes.filter((node) => node.dimmed).length).toBe(lens.nodes.length - 4);
  });

  it('adds its own omission line while it is on, and none while it is off (MDV-7)', () => {
    const nextUp = nextUpOf(lens, decideNow);
    const line = `${lens.nodes.length - 4} of ${lens.nodes.length} boxes dimmed by Next up only`;
    const only = buildScene(lens, { nextUp, dimmed: toggleNextUpOnly(NOTHING_DIMMED) });
    expect(only.omissions).toContainEqual({ text: line, fromWindow: true });
    const off = buildScene(lens, { nextUp });
    expect(off.omissions.some((omission) => omission.text.includes('Next up only'))).toBe(false);
  });

  it('dims nothing when the stream emitted no list to dim by', () => {
    const only = buildScene(lens, { dimmed: toggleNextUpOnly(NOTHING_DIMMED) });
    expect(only.nodes.some((node) => node.dimmed)).toBe(false);
    expect(only.omissions.some((omission) => omission.text.includes('Next up only'))).toBe(false);
  });
});

describe('the browser window shows the count and the toggle', () => {
  it('counts the answerable boxes and highlights them the way a search match is', async () => {
    const desk = mountDesk();
    const tab = desk.tab('nextup', browserTabTaps('nextup', {
      stream: 'base', perspective: 'decisions',
    }));
    await drawn(tab);
    const markup = tab.render(<GyldBrowser tabId="nextup" />);
    expect(markup).toContain('4 answerable now');
    expect(markup).toContain('gyld-nextup-only');
    expect(markup).toContain('Next up only');
    expect(markup).toContain('gyld-node-answerable');
    expect(markup.match(/gyld-node-answerable/g) ?? []).toHaveLength(4);
    expect(markup).toContain('data-status="Open"');
  });

  it('dims the rest and grows the omission strip when the toggle goes on', async () => {
    const desk = mountDesk();
    const tab = desk.tab('only', browserTabTaps('only', {
      stream: 'base', perspective: 'decisions',
    }));
    await drawn(tab);
    const dimmedTap = tab.read(GYLD_TAB_DIMMED_TAP).get() as AtomTapHandle<GyldDimmed>;
    dimmedTap.set(toggleNextUpOnly(dimmedTap.get() ?? NOTHING_DIMMED));
    await expect.poll(() => (tab.read(GYLD_TAB_DIMMED).get() as GyldDimmed).nextUpOnly).toBe(true);
    const markup = tab.render(<GyldBrowser tabId="only" />);
    expect(markup.match(/gyld-node gyld-node-dim/g) ?? []).toHaveLength(25);
    expect(markup).toContain('25 of 29 boxes dimmed by Next up only');
  });

  it('says so, and offers no filter, for a stream that emitted no list', async () => {
    const desk = mountDesk();
    // `architecture` carries a lens manifest and no decide-now file at all.
    const tab = desk.tab('nolist', browserTabTaps('nolist', {
      stream: 'architecture', perspective: 'allocation',
    }));
    await drawn(tab);
    const markup = tab.render(<GyldBrowser tabId="nolist" />);
    expect(markup).toContain('no decide-now list');
    expect(markup).not.toContain('gyld-nextup-only');
    expect(markup).not.toContain('answerable now');
    expect(markup).not.toContain('gyld-node-glyph');
  });

  it('ignores the `Next up only` seed a scene has no join for', () => {
    expect(buildScene(lens, {
      nextUp: NO_NEXT_UP, dimmed: toggleNextUpOnly(NOTHING_DIMMED),
    }).nodes.some((node) => node.dimmed)).toBe(false);
  });

  it('keeps the search count and the next-up count apart', () => {
    const nextUp = nextUpOf(lens, decideNow);
    const scene = buildScene(lens, { nextUp });
    const matched = scene.nodes.filter((node) => node.matched);
    expect(matched).toHaveLength(0);
    expect(scene.nodes.filter((node) => node.answerable)).toHaveLength(4);
    expect(scene.nodes.find((node) => node.slot === SCOPE_MODEL)?.answerable).toBe(true);
  });
});
