import { describe, it, expect } from 'vitest';
import { readLens, readStreamDiff } from '../contract';
import { GYLD_DIFF, GYLD_LENS, GYLD_STREAMS } from '../grips';
import type { GyldLensState, GyldStreamsCensus, GyldValue } from '../store/state';
import { diffPath } from '../store/layout';
import { diffCommand } from '../streams/operations';
import { DiffWindow } from './DiffWindow';
import { diffTabTaps } from './diffTabTaps';
import { DIFF_PANES, DiffPane, correspondenceHighlight, drawsSlot } from './panes';
import { mountDesk } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';
import diffFixture from '../../test/fixtures/bundle/diffs/base..stream-a.json';
import leftLensFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';
import rightLensFixture from '../../test/fixtures/bundle/streams/stream-a/lenses/decisions.lens.json';

// Step 2.5: gyld.diff. Two pictures of one perspective, the emitted comparison
// under them, and one rule relating them: the qualified slot. Nothing here is
// computed from the two bundles (spec section 6.7); the lists are the file.

const diff = readStreamDiff(diffFixture);
const leftLens = readLens(leftLensFixture);
const rightLens = readLens(rightLensFixture);

const VERSION_PIN = 'glade_decisions:GladeDecisions.version_pin';
const PIN_AUDIT = 'glade_decisions_stream_a:GladeDecisionsStreamA.pin_audit';

const settled = async <T,>(read: () => T, done: (value: T) => boolean): Promise<T> => {
  await expect.poll(() => done(read())).toBe(true);
  return read();
};

function mount(tabId: string, params: Record<string, unknown>, bundle = new FakeBundle()) {
  const desk = mountDesk(undefined, bundle);
  const tab = desk.tab(tabId, diffTabTaps(tabId, params));
  return {
    tab,
    census: () => tab.read(GYLD_STREAMS).get() as GyldStreamsCensus,
    diff: () => tab.read(GYLD_DIFF).get() as GyldValue<typeof diff>,
    render: () => tab.render(<DiffWindow tabId={tabId} params={params} />),
    /** One pane's lens, read in that pane's own child context. Only after a
     *  render: the window is what creates and seeds those contexts. */
    lens: (pane: DiffPane) => {
      const context = tab.ctx.getGripConsumerContext()
        .getOrCreateMatchingContext(pane.contextKey(tabId));
      const drip = context.getGripConsumerContext().getOrCreateConsumer(GYLD_LENS);
      drip.subscribe(() => {});
      return drip;
    },
  };
}

describe('two panes, two streams, one perspective', () => {
  it('resolves a lens per pane, each on its own stream', async () => {
    const window = mount('df-two', {
      left: 'base', right: 'stream-a', perspective: 'decisions',
    });
    await settled(window.census, (value) => value?.status === 'ready');
    window.render();
    const left = await settled(
      () => window.lens(DiffPane.LEFT).get() as GyldLensState,
      (state) => state?.status === 'ok',
    );
    const right = await settled(
      () => window.lens(DiffPane.RIGHT).get() as GyldLensState,
      (state) => state?.status === 'ok',
    );
    expect(left.stream).toBe('base');
    expect(right.stream).toBe('stream-a');
    expect(left.perspective).toBe('decisions');
    expect(right.perspective).toBe('decisions');
    // two different pictures, each the one its own stream emitted
    expect(left.value?.nodes).toHaveLength(leftLens.nodes.length);
    expect(right.value?.nodes).toHaveLength(rightLens.nodes.length);
    expect(left.value?.snapshot.revision).toBe('v1');
    expect(right.value?.snapshot.revision).toBe('stream-a@1');
    const markup = window.render();
    expect(markup).toContain('data-pane="left"');
    expect(markup).toContain('data-pane="right"');
  });

  it('offers only the perspectives BOTH streams emitted', async () => {
    const window = mount('df-picker', { left: 'base', right: 'architecture' });
    await settled(window.census, (value) => value?.status === 'ready');
    const markup = window.render();
    const select = /<select[^>]*class="gyld-pick-perspective"[\s\S]*?<\/select>/.exec(markup)![0];
    // the two lineages share no perspective at all, so none is offered and
    // none is invented
    expect(select).toContain('choose a perspective');
    expect(select).not.toContain('value="decisions"');
    expect(select).not.toContain('value="dependencies"');
  });

  it('names both panes and the pair it is on', async () => {
    const window = mount('df-head', {
      left: 'base', right: 'stream-a', perspective: 'decisions',
    });
    await settled(window.census, (value) => value?.status === 'ready');
    const markup = window.render();
    expect(markup).toContain('Left: base');
    expect(markup).toContain('Right: stream-a');
    expect(markup).toContain('no record in hand');
    expect(DIFF_PANES.map((pane) => pane.name)).toEqual(['left', 'right']);
    expect(DiffPane.LEFT.contextKey('t')).toBe('gyld-diff:t:left');
  });
});

describe('the correspondence is the qualified slot, and nothing else', () => {
  it('lights up the record with the SAME slot in the other picture', () => {
    const onLeft = correspondenceHighlight(leftLens, VERSION_PIN);
    const onRight = correspondenceHighlight(rightLens, VERSION_PIN);
    expect(onLeft?.active).toBe(true);
    expect(onRight?.active).toBe(true);
    const leftNode = leftLens.nodes.find((node) => node.slot === VERSION_PIN)!;
    const rightNode = rightLens.nodes.find((node) => node.slot === VERSION_PIN)!;
    expect([...onLeft!.ids]).toEqual([leftNode.id]);
    expect([...onRight!.ids]).toEqual([rightNode.id]);
    // and the two ids are NOT the same: ids are minted per stream (R1), which
    // is exactly why the slot is the only thing that can correspond
    expect(leftNode.id).not.toBe(rightNode.id);
    expect(leftNode.slot).toBe(rightNode.slot);
  });

  it('lights up nothing on a side that does not draw the record', () => {
    // `pin_audit` is the question stream A adds: the right picture draws it and
    // the left has no such record. The left lights up nothing rather than a
    // neighbour, and the window says the picture does not draw it.
    expect(drawsSlot(rightLens, PIN_AUDIT)).toBe(true);
    expect(drawsSlot(leftLens, PIN_AUDIT)).toBe(false);
    expect(correspondenceHighlight(rightLens, PIN_AUDIT)?.ids.size).toBe(1);
    expect(correspondenceHighlight(leftLens, PIN_AUDIT)?.ids.size).toBe(0);
    // nothing in hand highlights nothing at all, rather than everything
    expect(correspondenceHighlight(leftLens, '')).toBeUndefined();
    expect(correspondenceHighlight(undefined, VERSION_PIN)).toBeUndefined();
    expect(drawsSlot(undefined, VERSION_PIN)).toBe(false);
  });

  it('matches an edge by its slot too, and never by an id or a label', () => {
    const edge = leftLens.edges.find((entry) => entry.slot !== undefined)!;
    const highlight = correspondenceHighlight(leftLens, edge.slot!)!;
    expect(highlight.ids.has(edge.id)).toBe(true);
    // a label that names a drawn box is not a correspondence
    const labelled = leftLens.nodes[0].label;
    expect(correspondenceHighlight(leftLens, labelled)?.ids.size).toBe(0);
    // nor is an id
    expect(correspondenceHighlight(leftLens, leftLens.nodes[0].id)?.ids.size).toBe(0);
  });
});

describe('the lists are the emitted diff, read out', () => {
  it('reads the pair\'s own file and nothing else', async () => {
    const window = mount('df-lists', {
      left: 'base', right: 'stream-a', perspective: 'decisions',
    });
    const value = await settled(window.diff, (held) => held?.status === 'ok');
    expect(value.value?.left.stream).toBe('base');
    expect(value.value?.right.stream).toBe('stream-a');
    const markup = window.render();
    for (const slot of diff.occurrences.added) {
      expect(markup).toContain(`data-slot="${slot}"`);
    }
    for (const slot of diff.occurrences.removed) {
      expect(markup).toContain(`data-slot="${slot}"`);
    }
    expect(markup).toContain(`added (${diff.occurrences.added.length})`);
    expect(markup).toContain(`removed (${diff.occurrences.removed.length})`);
    expect(markup).toContain(`Records (${diff.occurrences.unchanged} unchanged)`);
    expect(markup).toContain(`Assertions (${diff.assertions.unchanged} unchanged)`);
    expect(markup).toContain(`assertions added (${diff.assertions.added.length})`);
    for (const change of diff.effective_status) {
      expect(markup).toContain(`${change.slot}: ${change.left} → ${change.right}`);
    }
    // the sections beside the three section 7.6 names are read out too
    expect(markup).toContain(`questions added (${diff.questions!.added.length})`);
    expect(markup).toContain(`rulings added (${diff.rulings!.added.length})`);
    expect(markup).toContain(`occurred added (${diff.occurred!.added.length})`);
    // and the emitted omissions, which every window states
    for (const omission of diff.omissions) {
      expect(markup).toContain(omission.replace(/'/g, '&#x27;'));
    }
    expect(diff.omissions).toContain('record ids are per stream, so nothing is matched by id');
  });

  it('shows the lens section for the perspective the window is on', async () => {
    const window = mount('df-lens', {
      left: 'base', right: 'stream-a', perspective: 'decisions',
    });
    await settled(window.diff, (held) => held?.status === 'ok');
    const markup = window.render();
    const lens = diff.lenses!.decisions;
    expect(markup).toContain(`nodes added (${lens.nodes.added.length})`);
    expect(markup).toContain(`edges added (${lens.edges.added.length})`);
    expect(markup).toContain('This picture (decisions)');
    for (const edge of lens.edges.added) {
      expect(markup).toContain(`${edge.relation} · ${edge.tail} → ${edge.head}`);
    }
  });

  it('reads the pair in the ORDER it was given, never the reverse', async () => {
    expect(diffPath('base', 'stream-a')).toBe('diffs/base..stream-a.json');
    // the bundle carries base..stream-a and not stream-a..base; the reversed
    // pair is absent, and the window offers the command that would write it
    const window = mount('df-order', { left: 'stream-a', right: 'base' });
    const value = await settled(window.diff, (held) => held?.status === 'absent');
    expect(value.status).toBe('absent');
    const markup = window.render();
    expect(markup).toContain('this bundle carries no diff for that pair');
    expect(markup).toContain(diffCommand('stream-a', 'base'));
  });

  it('says the diff file did not read rather than showing an empty comparison', async () => {
    const image = new FakeBundle();
    image.writeText('diffs/base..stream-a.json', '{ not json');
    const window = mount('df-invalid', { left: 'base', right: 'stream-a' }, image);
    await settled(window.diff, (held) => held?.status === 'invalid');
    const markup = window.render();
    expect(markup).toContain('the diff file did not read');
    expect(markup).toContain('not valid JSON');
    expect(markup).not.toContain('data-section="occurrences"');
  });

  it('has no pair at all until the link gives one', async () => {
    const window = mount('df-none', {});
    await settled(window.census, (value) => value?.status === 'ready');
    const value = window.diff();
    expect(value?.status).toBe('unset');
    expect(window.render()).toContain('this window has no pair of streams yet');
  });
});
