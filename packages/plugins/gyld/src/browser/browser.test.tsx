import { describe, it, expect } from 'vitest';
import type { AtomTapHandle } from '@owebeeone/grip-react';
import { readLens, readStream } from '../contract';
import {
  GYLD_BUNDLE, GYLD_DEST_PERSPECTIVE, GYLD_DEST_REF, GYLD_DEST_REF_TAP, GYLD_DEST_STREAM,
  GYLD_FOCUS, GYLD_LENS, GYLD_RECORD, GYLD_STREAMS, GYLD_TAB_SEARCH, GYLD_TAB_SEARCH_TAP,
} from '../grips';
import { NO_FOCUS } from '../focus';
import { GYLD_BROWSER_TOOL } from '../tools';
import { GyldBrowser } from '../GyldBrowser';
import { buildScene } from '../lens/scene';
import { NODE_FACETS } from '../lens/facets';
import { NOTHING_DIMMED } from '../lens/camera';
import { browserTabTaps } from './browserTabTaps';
import { searchLens } from './search';
import { neighbourhoodLink, pickOutcome } from './links';
import { labelFor, perspectiveOptions } from './perspectives';
import type { GyldBundle, GyldLensState, GyldStreamsCensus } from '../store/state';
import type { GyldRecordView } from '../records/records';
import { EMPTY_ROOTS, mountDesk, optionsOf, wireSink } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';
import decisionsFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';
import architectureRecord from '../../test/fixtures/bundle/streams/architecture/stream.json';
import baseRecord from '../../test/fixtures/bundle/streams/base/stream.json';

// Step 1.4: the gyld.browser window. Every assertion below is against EMITTED
// data: the picker lists the stream's own lens manifest, search matches
// emitted labels and qualified slots, and a dim toggle changes flags on the
// emitted geometry and never the geometry itself (MDV-4).

const SCOPE_MODEL = 'glade_decisions:GladeDecisions.scope_model';
const lens = readLens(decisionsFixture);
const manifest = architectureRecord.lenses;

const settled = async <T,>(read: () => T, done: (value: T) => boolean): Promise<T> => {
  await expect.poll(() => done(read())).toBe(true);
  return read();
};

describe('the browser window seeds from its opening link', () => {
  it('seeds the stream, the perspective and the focus record', async () => {
    const desk = mountDesk();
    const tab = desk.tab('seeded', browserTabTaps('seeded', {
      stream: 'base', perspective: 'decisions', focus: SCOPE_MODEL,
    }));
    await expect.poll(() => tab.read(GYLD_DEST_STREAM).get()).toBe('base');
    expect(tab.read(GYLD_DEST_PERSPECTIVE).get()).toBe('decisions');
    expect(tab.read(GYLD_DEST_REF).get()).toBe(SCOPE_MODEL);
    expect(tab.read(GYLD_TAB_SEARCH).get()).toBe('');
  });

  it('leaves every seed empty when the link carries none', async () => {
    const desk = mountDesk();
    const tab = desk.tab('bare', browserTabTaps('bare'));
    await expect.poll(() => tab.read(GYLD_TAB_SEARCH_TAP).get()).toBeDefined();
    expect(tab.read(GYLD_DEST_STREAM).get()).toBe('');
    expect(tab.read(GYLD_DEST_REF).get()).toBe('');
  });
});

describe('the pickers list what the bundle emitted, and nothing else', () => {
  it('lists exactly the stream record manifest, not-emitted entries included', async () => {
    const desk = mountDesk();
    const tab = desk.tab('arch', browserTabTaps('arch', {
      stream: 'architecture', perspective: 'lifecycle',
    }));
    await settled(
      () => tab.read(GYLD_BUNDLE).get() as GyldBundle,
      (bundle) => bundle?.status === 'ok',
    );
    const markup = tab.render(<GyldBrowser tabId="arch" />);
    expect(optionsOf(markup, 'gyld-pick-perspective')).toEqual(
      manifest.map((entry) => (entry.emitted ? entry.perspective : `${entry.perspective} (disabled)`)),
    );
    // and the host's own reason travels with the entry it explains
    expect(markup).toContain('mints no record ids');
  });

  it('falls back to the store listing for a stream with no manifest', async () => {
    // Every record of the emitted run carries a manifest now, so the fallback
    // is exercised against a record with its `lenses` key taken off: a bundle
    // from a host that writes none, which is the case the fallback is for.
    const image = new FakeBundle();
    const record = JSON.parse(image.read('streams/base/stream.json')) as Record<string, unknown>;
    delete record.lenses;
    image.write('streams/base/stream.json', record);
    const index = JSON.parse(image.read('streams.json')) as {
      streams: Record<string, unknown>[];
    };
    for (const entry of index.streams) {
      if (entry.id === 'base') {
        delete entry.lenses;
      }
    }
    image.write('streams.json', index);
    const desk = mountDesk(undefined, image);
    const tab = desk.tab('base-pick', browserTabTaps('base-pick', {
      stream: 'base', perspective: 'decisions',
    }));
    await settled(
      () => tab.read(GYLD_LENS).get() as GyldLensState,
      (state) => state?.status === 'ok',
    );
    expect(optionsOf(tab.render(<GyldBrowser tabId="base-pick" />), 'gyld-pick-perspective'))
      .toEqual(['branch', 'decisions', 'neighbourhood-key_custody', 'status', 'tiers']);
  });

  it('lists exactly the streams the census found', async () => {
    const desk = mountDesk();
    const tab = desk.tab('census', browserTabTaps('census', {
      stream: 'base', perspective: 'decisions',
    }));
    const census = await settled(
      () => tab.read(GYLD_STREAMS).get() as GyldStreamsCensus,
      (value) => value?.status === 'ready',
    );
    const ids = census.status === 'ready' ? census.streams.map((entry) => entry.id) : [];
    expect(ids).toEqual(['base', 'stream-a', 'stream-b', 'fork-a', 'architecture']);
    expect(optionsOf(tab.render(<GyldBrowser tabId="census" />), 'gyld-pick-stream')).toEqual(ids);
  });
});

describe('search is a projection over the emitted records', () => {
  it('matches labels and qualified slots and nothing else', () => {
    const match = searchLens(lens, undefined, 'scope_model');
    expect(match.active).toBe(true);
    const matched = lens.nodes.filter((node) => match.ids.has(node.id));
    expect(matched.map((node) => node.slot)).toEqual([SCOPE_MODEL]);
    expect(searchLens(lens, undefined, 'GladeDecisions.scope_model').ids.has(matched[0].id)).toBe(true);
    expect(searchLens(lens, undefined, 'no such record').ids.size).toBe(0);
    expect(searchLens(lens, undefined, '   ').active).toBe(false);
  });

  it('never moves anything: the geometry is identical with and without it', () => {
    const plain = buildScene(lens);
    const searched = buildScene(lens, { search: searchLens(lens, undefined, 'scope_model') });
    expect(searched.nodes.length).toBe(plain.nodes.length);
    expect(searched.edges.length).toBe(plain.edges.length);
    expect(searched.extent).toEqual(plain.extent);
    expect(searched.nodes.map((node) => node.box)).toEqual(plain.nodes.map((node) => node.box));
    expect(searched.edges.map((edge) => edge.path)).toEqual(plain.edges.map((edge) => edge.path));
  });

  it('highlights the matches and dims the rest', () => {
    const scene = buildScene(lens, { search: searchLens(lens, undefined, 'scope_model') });
    const hit = scene.nodes.filter((node) => node.matched);
    expect(hit.map((node) => node.slot)).toEqual([SCOPE_MODEL]);
    expect(hit[0].dimmed).toBe(false);
    expect(scene.nodes.filter((node) => node.dimmed).length).toBe(scene.nodes.length - 1);
    expect(scene.omissions.some((entry) => entry.fromWindow && entry.text.includes('scope_model')))
      .toBe(true);
  });

  it('renders the search box and the match count in the window', async () => {
    const desk = mountDesk();
    const tab = desk.tab('search', browserTabTaps('search', {
      stream: 'base', perspective: 'decisions',
    }));
    await settled(
      () => tab.read(GYLD_LENS).get() as GyldLensState,
      (state) => state?.status === 'ok',
    );
    const searchTap = tab.read(GYLD_TAB_SEARCH_TAP).get() as AtomTapHandle<string>;
    searchTap.set('scope_model');
    await expect.poll(() => tab.read(GYLD_TAB_SEARCH).get()).toBe('scope_model');
    const markup = tab.render(<GyldBrowser tabId="search" />);
    expect(markup).toContain('gyld-node-match');
    expect(markup).toContain('1 of 29 drawn records match');
  });
});

describe('dim toggles change flags, never the emitted set', () => {
  it('keeps every emitted node and edge in the scene when a kind is dimmed', () => {
    const kinds = NODE_FACETS[0];
    expect(kinds.values(lens)).toEqual(['Question', 'Trigger']);
    const dimmed = kinds.toggle(NOTHING_DIMMED, 'Trigger');
    const scene = buildScene(lens, { dimmed });
    expect(scene.nodes.length).toBe(lens.nodes.length);
    expect(scene.nodes.filter((node) => node.dimmed).length).toBe(5);
    expect(scene.nodes.some((node) => node.hidden)).toBe(false);
    expect(scene.omissions.some((entry) => entry.fromWindow && entry.text.includes('Trigger')))
      .toBe(true);
  });

  it('keeps them in the scene even when the window hides instead of dimming', () => {
    const statuses = NODE_FACETS[1];
    expect(statuses.values(lens)).toEqual(['Decided', 'Directed', 'Lean', 'Open']);
    const dimmed = { ...statuses.toggle(NOTHING_DIMMED, 'Decided'), hide: true };
    const scene = buildScene(lens, { dimmed });
    expect(scene.nodes.length).toBe(lens.nodes.length);
    expect(scene.nodes.filter((node) => node.hidden).length).toBe(6);
  });

  it('offers a toggle per emitted facet value and says which are off', async () => {
    const desk = mountDesk();
    const tab = desk.tab('facets', browserTabTaps('facets', {
      stream: 'base', perspective: 'decisions',
    }));
    await settled(
      () => tab.read(GYLD_LENS).get() as GyldLensState,
      (state) => state?.status === 'ok',
    );
    const markup = tab.render(<GyldBrowser tabId="facets" />);
    expect(markup).toContain('data-facet="kind" data-value="Question"');
    expect(markup).toContain('data-facet="status" data-value="Decided"');
    // the decision lenses carry no classification at all, so nothing is offered
    expect(markup).not.toContain('data-facet="classification"');
  });
});

describe('what a pick writes, and where a link goes', () => {
  it('carries the picked record into the tab ref and the shared focus', () => {
    const node = lens.nodes.find((entry) => entry.slot === SCOPE_MODEL)!;
    const picked = pickOutcome(lens, { ids: [] }, 'base', node.id, false);
    expect(picked.selection.ids).toEqual([node.id]);
    expect(picked.ref).toBe(SCOPE_MODEL);
    expect(picked.focus).toEqual({ stream: 'base', ref: SCOPE_MODEL });
    const cleared = pickOutcome(lens, picked.selection, 'base', node.id, false);
    expect(cleared.selection.ids).toEqual([]);
    expect(cleared.ref).toBe('');
    expect(cleared.focus).toEqual(NO_FOCUS);
  });

  it('opens a neighbourhood lens when the stream emitted one', () => {
    const link = neighbourhoodLink({
      stream: 'base', perspective: 'decisions', focus: SCOPE_MODEL,
      perspectives: ['decisions', 'neighbourhood'],
    });
    expect(link).toEqual({
      toolId: GYLD_BROWSER_TOOL,
      params: { stream: 'base', perspective: 'neighbourhood', focus: SCOPE_MODEL },
    });
  });

  it('otherwise keeps the perspective and carries the focus, so the window dims to it', () => {
    const link = neighbourhoodLink({
      stream: 'base', perspective: 'decisions', focus: SCOPE_MODEL,
      perspectives: ['branch', 'decisions', 'neighbourhood-key_custody', 'status', 'tiers'],
    });
    expect(link.params).toEqual({
      stream: 'base', perspective: 'decisions', focus: SCOPE_MODEL,
    });
  });

  it('dims everything but the focus record and its emitted neighbours', async () => {
    const desk = mountDesk();
    const tab = desk.tab('hood', browserTabTaps('hood', {
      stream: 'base', perspective: 'decisions', focus: SCOPE_MODEL,
    }));
    await settled(
      () => tab.read(GYLD_LENS).get() as GyldLensState,
      (state) => state?.status === 'ok',
    );
    const node = lens.nodes.find((entry) => entry.slot === SCOPE_MODEL)!;
    const neighbours = new Set<string>([node.id]);
    for (const edge of lens.edges) {
      if (edge.tail === node.id || edge.head === node.id) {
        neighbours.add(edge.tail);
        neighbours.add(edge.head);
      }
    }
    const scene = buildScene(lens, { selection: { ids: [node.id] } });
    expect(scene.nodes.filter((entry) => !entry.dimmed).map((entry) => entry.id).sort())
      .toEqual([...neighbours].sort());
    expect(tab.render(<GyldBrowser tabId="hood" />)).toContain('gyld-node-selected');
  });
});

describe('the wire', () => {
  it('lets a detail sink resolve the browser tab selection through the graph', async () => {
    const desk = mountDesk();
    const tab = desk.tab('source', browserTabTaps('source', {
      stream: 'base', perspective: 'decisions',
    }));
    // a wired sink seeds nothing: it reads the source tab's own destination
    const sink = wireSink(tab, 'sink:detail');
    await settled(
      () => sink.read(GYLD_RECORD).get() as GyldRecordView,
      (view) => view?.status === 'unset' || view?.status === 'ok',
    );
    const refTap = tab.read(GYLD_DEST_REF_TAP).get() as AtomTapHandle<string>;
    refTap.set(SCOPE_MODEL);
    const view = await settled(
      () => sink.read(GYLD_RECORD).get() as GyldRecordView,
      (value) => value?.ref === SCOPE_MODEL && value.status === 'ok',
    );
    expect(view.sort).toBe('occurrence');
    expect(view.occurrence?.label).toBe('scope_model');
    expect(view.question?.tier).toBe('roots');
    // and the sink sees the source's stream without a param being copied
    expect(sink.read(GYLD_DEST_STREAM).get()).toBe('base');
  });

  it('writes the shared focus so every gyld window can follow it', async () => {
    const desk = mountDesk();
    const tab = desk.tab('focus', browserTabTaps('focus', {
      stream: 'base', perspective: 'decisions',
    }));
    await settled(
      () => tab.read(GYLD_LENS).get() as GyldLensState,
      (state) => state?.status === 'ok',
    );
    expect(tab.read(GYLD_FOCUS).get()).toEqual(NO_FOCUS);
    const markup = tab.render(<GyldBrowser tabId="focus" />);
    expect(markup).toContain('no record focused');
  });
});

describe('the empty desk', () => {
  it('shows the set picker rather than a picture', async () => {
    const desk = mountDesk(EMPTY_ROOTS);
    const tab = desk.tab('empty', browserTabTaps('empty'));
    await settled(
      () => tab.read(GYLD_BUNDLE).get() as GyldBundle,
      (bundle) => bundle !== undefined,
    );
    const markup = tab.render(<GyldBrowser tabId="empty" />);
    expect(markup).toContain('gyld-picker');
    expect(markup).toContain('has no bundle root');
    expect(markup).toContain('File System Access');
    expect(markup).not.toContain('gyld-lens-svg');
  });
});

describe('a parameterised family in the perspective picker', () => {
  it('labels the emitted member with its parameter, family disabled beside it', async () => {
    const desk = mountDesk();
    const tab = desk.tab('family', browserTabTaps('family', {
      stream: 'base', perspective: 'decisions',
    }));
    await settled(
      () => tab.read(GYLD_BUNDLE).get() as GyldBundle,
      (bundle) => bundle?.status === 'ok',
    );
    const markup = tab.render(<GyldBrowser tabId="family" />);
    const emitted = baseRecord.lenses.filter((entry) => entry.emitted);
    const withheld = baseRecord.lenses.filter((entry) => !entry.emitted);
    // every emitted perspective is choosable, the member included
    expect(optionsOf(markup, 'gyld-pick-perspective')).toEqual([
      ...emitted.map((entry) => entry.perspective),
      ...withheld.map((entry) => `${entry.perspective} (disabled)`),
    ]);
    // and the member is labelled by what picked it out of its family
    expect(markup).toContain(
      'neighbourhood-key_custody (neighbourhood of question '
      + 'glade_decisions:GladeDecisions.key_custody)',
    );
    // the family itself is the disabled entry, carrying the host's own reason
    const family = withheld.find((entry) => entry.perspective === 'neighbourhood')!;
    expect(markup).toContain(`neighbourhood (not emitted: ${family.reason}`);
  });

  it('builds the label from the manifest alone, and none where there is none', () => {
    // the options are the emitted list and the withheld list, each entry
    // carrying whatever the manifest said about it and nothing more
    const options = perspectiveOptions({
      status: 'ok',
      stream: 'base',
      perspectives: ['decisions', 'neighbourhood-key_custody'],
      notEmitted: [{ perspective: 'neighbourhood', reason: 'parameterised' }],
      lenses: readStream(baseRecord).lenses,
    }, 'decisions');
    expect(options.map((option) => option.perspective))
      .toEqual(['decisions', 'neighbourhood-key_custody', 'neighbourhood']);
    expect(options[0].family).toBeUndefined();
    expect(options[1].family).toBe('neighbourhood');
    expect(options[1].parameter)
      .toEqual({ question: 'glade_decisions:GladeDecisions.key_custody' });
    const member = options[1];
    expect(labelFor(member)).toBe(
      'neighbourhood-key_custody (neighbourhood of question '
      + 'glade_decisions:GladeDecisions.key_custody)',
    );
    expect(labelFor({ perspective: 'decisions', emitted: true })).toBe('decisions');
    expect(labelFor({ perspective: 'full', emitted: false, reason: 'core change' }))
      .toBe('full (not emitted: core change)');
    expect(labelFor({ perspective: 'full', emitted: false })).toBe('full (not emitted)');
    // a family with no parameter names the family and stops there
    expect(labelFor({ perspective: 'neighbourhood-x', emitted: true, family: 'neighbourhood' }))
      .toBe('neighbourhood-x (neighbourhood)');
  });
});
