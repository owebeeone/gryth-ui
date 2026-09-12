import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { instance } from '@viz-js/viz';
import { createAtomValueTap, type Grip } from '@owebeeone/grip-react';
import { grok } from '@grythjs/plugin-api';
import { readLens } from '../contract';
import { GYLD_DEST_PREVIEW, GYLD_DEST_STREAM, GYLD_LENS, GYLD_PREVIEW } from '../grips';
import { LENS_UNSET, type GyldLensState } from '../store/state';
import { PreviewPerspective } from './neighbourhood';
import { previewDot } from './dot';
import { previewDocument } from './document';
import { GyldPreviewLayoutTap } from './GyldPreviewLayoutTap';
import { VIZ_PACKAGE, type PreviewRenderResult, type PreviewRenderer } from './renderer';
import manifest from '../../package.json';
import decisionsFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';
import emittedFixture from '../../test/fixtures/bundle/streams/base/lenses/neighbourhood-key_custody.lens.json';

// Step 3.1: the browser-side neighbourhood preview.
//
// The fence of this file: a preview is a LAYOUT of emitted records. Every node,
// every edge and every group it draws is one the emitted `decisions` lens
// already carries, so the strongest test available is the emitted neighbourhood
// member itself. `neighbourhood-key_custody.lens.json` is what the Gyld host
// wrote for that question from the same decisions lens; the preview's closure
// must select exactly those records.
//
// `@viz-js/viz` itself DOES run here: it is a wasm module and node has
// WebAssembly, so the layout is checked against the real engine below. What
// does NOT exist in this environment is a WEB WORKER, so the tap is driven
// through an injected renderer and the worker path itself is verified in a
// browser. The document tests are fed a RECORDED json0 fixture so they do not
// depend on wasm timing, and one test asserts the engine still produces it.

const fixture = (path: string): string =>
  readFileSync(new URL(`../../test/fixtures/${path}`, import.meta.url), 'utf8');

const HOST_DOT = fixture('bundle/streams/base/lenses/neighbourhood-key_custody.dot');
const JSON0 = fixture('preview/neighbourhood-key_custody.json0.json');

const source = readLens(decisionsFixture);
const emitted = readLens(emittedFixture);

const KEY_CUSTODY = 'glade_decisions:GladeDecisions.key_custody';

/** The record ids one composed DOT carries, read back out of its `id`
 *  attributes. Every node, edge and cluster the host writes carries one
 *  (spec section 7.3), so this is what the DOT says it drew. */
function dotIds(dot: string): { nodes: string[]; edges: string[]; groups: string[] } {
  const found = Array.from(dot.matchAll(/\bid="((?:occ|asn|grp):[^"]+)"/g), (m) => m[1]);
  return {
    nodes: found.filter((id) => id.startsWith('occ:')),
    edges: found.filter((id) => id.startsWith('asn:')),
    groups: found.filter((id) => id.startsWith('grp:')),
  };
}

function planFor(question: string) {
  const preview = PreviewPerspective.of(question);
  expect(preview).toBeDefined();
  return preview!.restrict(source);
}

describe('the neighbourhood closure', () => {
  it('selects exactly the records the emitted member carries', () => {
    const plan = planFor(KEY_CUSTODY);
    expect(plan).toBeDefined();
    expect(plan!.nodes.map((node) => node.id).sort())
      .toEqual(emitted.nodes.map((node) => node.id).sort());
    expect(plan!.edges.map((edge) => edge.id).sort())
      .toEqual(emitted.edges.map((edge) => edge.id).sort());
    expect(plan!.groups.map((group) => group.id))
      .toEqual((emitted.groups ?? []).map((group) => group.id));
  });

  it('names the member and its parameter the way the host names them', () => {
    const plan = planFor(KEY_CUSTODY)!;
    expect(plan.perspective).toBe(emitted.perspective);
    expect(plan.family).toBe(emitted.family);
    expect(plan.parameter).toEqual(emitted.parameter);
    expect(plan.title).toBe(emitted.title);
  });

  it('restates the source lens omissions and adds the closure and the preview', () => {
    const plan = planFor(KEY_CUSTODY)!;
    expect(plan.omissions.slice(0, emitted.omissions.length)).toEqual(emitted.omissions);
    expect(plan.omissions[plan.omissions.length - 1]).toBe(PreviewPerspective.OMISSION);
  });

  it('composes no node, edge or group that is not in the emitted lens', () => {
    const nodes = new Set(source.nodes);
    const edges = new Set(source.edges);
    for (const node of source.nodes) {
      const plan = planFor(node.slot);
      if (plan === undefined) {
        continue;
      }
      expect(plan.nodes.every((drawn) => nodes.has(drawn))).toBe(true);
      expect(plan.edges.every((drawn) => edges.has(drawn))).toBe(true);
      for (const group of plan.groups) {
        const held = (source.groups ?? []).find((entry) => entry.id === group.id);
        expect(held).toBeDefined();
        expect(group.members.every((member) => held!.members.includes(member))).toBe(true);
      }
    }
  });

  it('has nothing to restrict for a slot the lens does not draw', () => {
    expect(PreviewPerspective.of('')).toBeUndefined();
    expect(planFor('glade_decisions:GladeDecisions.not_a_question')).toBeUndefined();
  });
});

describe('the DOT the preview composes', () => {
  const dot = previewDot(planFor(KEY_CUSTODY)!);

  it('carries exactly the record ids of the emitted member', () => {
    const ids = dotIds(dot);
    expect(ids.nodes.sort()).toEqual(emitted.nodes.map((node) => node.id).sort());
    expect(ids.edges.sort()).toEqual(emitted.edges.map((edge) => edge.id).sort());
    expect(ids.groups).toEqual((emitted.groups ?? []).map((group) => group.id));
  });

  // The strongest statement available about "the same conventions": the Gyld
  // host's own `neighbourhood-key_custody.dot` for this member, copied into the
  // bundle fixtures, byte for byte. If this holds, every convention holds at
  // once: the preamble, the typography, the shapes, the fills, the label
  // breaking, the attribute order and the id on every record.
  it('is byte identical to the DOT the Gyld host wrote for this member', () => {
    expect(dot).toBe(HOST_DOT);
  });

  it('keeps the emitted shape, style and fill of every node', () => {
    for (const node of emitted.nodes) {
      expect(dot).toContain(`shape=${JSON.stringify(node.shape)}`);
      expect(dot).toContain(`fillcolor=${JSON.stringify(node.fill)}`);
    }
  });

  it('breaks a multi-line label the way the host does, and quotes a single line', () => {
    const question = emitted.nodes.find((node) => node.label === 'key_custody')!;
    expect(question.text.length).toBeGreaterThan(1);
    expect(dot).toContain(`label="${question.text.map((line) => `${line}\\l`).join('')}"`);
  });
});

describe('the recorded json0 fixture', () => {
  it('is what the pinned engine lays this DOT out as today', async () => {
    const viz = await instance();
    const result = viz.render(previewDot(planFor(KEY_CUSTODY)!), {
      format: 'json0', engine: 'dot',
    });
    expect(result.status).toBe('success');
    expect(JSON.parse(result.output!)).toEqual(JSON.parse(JSON0));
    expect(VIZ_PACKAGE.endsWith(manifest.dependencies['@viz-js/viz'])).toBe(true);
    expect(VIZ_PACKAGE).toBe(`@viz-js/viz ${manifest.dependencies['@viz-js/viz']}`);
  });

  it('has the key-for-key shape the emitted lenses were merged from', () => {
    const document = JSON.parse(JSON0) as Record<string, unknown>;
    expect(Object.keys(document)).toContain('bb');
    const objects = document.objects as Record<string, unknown>[];
    expect(objects.every((item) => typeof item.id === 'string')).toBe(true);
    expect(objects.every((item) => 'pos' in item && 'width' in item && 'height' in item))
      .toBe(true);
    const edges = document.edges as Record<string, unknown>[];
    expect(edges.every((item) => typeof item.pos === 'string')).toBe(true);
    expect(edges.every((item) => typeof item.tail === 'number' && typeof item.head === 'number'))
      .toBe(true);
  });
});

describe('the preview document', () => {
  const engine = { name: VIZ_PACKAGE, version: 'graphviz 16.0.0' };
  const document = previewDocument(planFor(KEY_CUSTODY)!, JSON0, engine);
  const lens = readLens(document);

  it('passes this package\'s own lens reader', () => {
    expect(lens.format).toBe('gyld.lens.v1');
    expect(lens.perspective).toBe(emitted.perspective);
    expect(lens.family).toBe('neighbourhood');
    expect(lens.parameter).toEqual({ question: KEY_CUSTODY });
  });

  it('is UNPINNED and names the engine that laid it out', () => {
    expect(lens.engine.pinned).toBe(false);
    expect(lens.engine.name).toBe(VIZ_PACKAGE);
    expect(lens.engine.version).toBe('graphviz 16.0.0');
  });

  it('carries the emitted snapshot, stream, relations and legend unchanged', () => {
    expect(lens.snapshot).toEqual(source.snapshot);
    expect(lens.stream).toBe(source.stream);
    expect(lens.relations).toEqual(source.relations);
    expect(lens.text_relations).toEqual(source.text_relations);
    expect(lens.legend).toEqual(source.legend);
  });

  it('counts what it drew and what it left out, as the emitted member does', () => {
    expect(lens.counts.nodes).toBe(emitted.counts.nodes);
    expect(lens.counts.edges).toBe(emitted.counts.edges);
    expect(lens.counts.groups).toBe(emitted.counts.groups);
    expect(lens.counts.omitted_occurrences).toBe(emitted.counts.omitted_occurrences);
    expect(lens.counts.omitted_assertions).toBe(emitted.counts.omitted_assertions);
  });

  it('draws the same records as the emitted member, at its own positions', () => {
    expect(lens.nodes.map((node) => node.id).sort())
      .toEqual(emitted.nodes.map((node) => node.id).sort());
    expect(lens.edges.map((edge) => edge.id).sort())
      .toEqual(emitted.edges.map((edge) => edge.id).sort());
    for (const node of lens.nodes) {
      const held = emitted.nodes.find((entry) => entry.id === node.id)!;
      expect(node.text).toEqual(held.text);
      expect(node.fontsize).toBe(held.fontsize);
      expect(node.justify).toBe(held.justify);
      expect(Number.isFinite(node.pos[0]) && Number.isFinite(node.pos[1])).toBe(true);
    }
  });
});

// --- the tap ---------------------------------------------------------------

class FakeRenderer implements PreviewRenderer {
  static started = 0;
  static stopped = 0;
  static dots: string[] = [];

  static reset(): void {
    FakeRenderer.started = 0;
    FakeRenderer.stopped = 0;
    FakeRenderer.dots = [];
  }

  static factory(): PreviewRenderer {
    FakeRenderer.started += 1;
    return new FakeRenderer();
  }

  async render(dot: string): Promise<PreviewRenderResult> {
    FakeRenderer.dots.push(dot);
    return { json0: JSON0, engine: { name: VIZ_PACKAGE, version: 'graphviz 16.0.0' } };
  }

  stop(): void {
    FakeRenderer.stopped += 1;
  }
}

let harnessCount = 0;

function harness(lensState: GyldLensState, question: string) {
  const tap = new GyldPreviewLayoutTap({ renderer: FakeRenderer.factory });
  const id = `gyld-preview-${harnessCount++}`;
  const root = grok.mainPresentationContext.getOrCreateMatchingContext(id);
  root.getGripHomeContext().registerTap(tap);
  const tab = root.getGripConsumerContext().getOrCreateMatchingContext(`${id}:tab`);
  const tabHome = tab.getGripHomeContext();
  const seeds = [
    createAtomValueTap(GYLD_DEST_STREAM, { initial: 'base' }),
    createAtomValueTap(GYLD_DEST_PREVIEW, { initial: question }),
    createAtomValueTap(GYLD_LENS, { initial: lensState }),
  ];
  for (const seed of seeds) {
    tabHome.registerTap(seed);
  }
  const read = <T,>(grip: Grip<T>) => {
    const drip = tab.getGripConsumerContext().getOrCreateConsumer(grip);
    drip.subscribe(() => {});
    return drip;
  };
  return {
    tap,
    read,
    release: () => {
      for (const seed of seeds) {
        tabHome.unregisterTap(seed);
      }
      root.getGripHomeContext().unregisterTap(tap);
    },
  };
}

const READY: GyldLensState = {
  status: 'ok', stream: 'base', perspective: 'decisions', value: source,
};

describe('GyldPreviewLayoutTap', () => {
  it('starts no renderer for a window that has asked for no preview', async () => {
    FakeRenderer.reset();
    const desk = harness(READY, '');
    desk.read(GYLD_PREVIEW);
    await Promise.resolve();
    expect(FakeRenderer.started).toBe(0);
    desk.release();
  });

  it('starts one renderer when a preview is requested and publishes an unpinned lens',
    async () => {
      FakeRenderer.reset();
      const desk = harness(READY, KEY_CUSTODY);
      const drip = desk.read(GYLD_PREVIEW);
      await expect.poll(() => drip.get()?.status).toBe('ok');
      expect(FakeRenderer.started).toBe(1);
      expect(drip.get()?.value?.engine.pinned).toBe(false);
      expect(drip.get()?.value?.nodes.map((node) => node.id).sort())
        .toEqual(emitted.nodes.map((node) => node.id).sort());
      desk.release();
    });

  it('stops the renderer when the tap has no destinations left', async () => {
    FakeRenderer.reset();
    const desk = harness(READY, KEY_CUSTODY);
    const drip = desk.read(GYLD_PREVIEW);
    await expect.poll(() => drip.get()?.status).toBe('ok');
    expect(FakeRenderer.stopped).toBe(0);
    desk.release();
    await expect.poll(() => FakeRenderer.stopped).toBe(1);
  });

  it('has no preview while the source lens has not landed', async () => {
    FakeRenderer.reset();
    const desk = harness(LENS_UNSET, KEY_CUSTODY);
    const drip = desk.read(GYLD_PREVIEW);
    await Promise.resolve();
    expect(drip.get()?.status).toBe('unset');
    expect(FakeRenderer.started).toBe(0);
    desk.release();
  });
});
