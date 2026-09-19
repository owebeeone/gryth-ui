import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readLens } from '../contract';
import {
  CAMERA_UNFITTED, MAX_SCALE, MIN_SCALE, NOTHING_DIMMED, clampScale, fitCamera,
  isMeasurableViewport, isPanning, needsFit,
  panBy, panningAt, pressAt, toggleRelation, toggleSelected, wheelFactor, zoomAt,
} from './camera';
import { STAGE_CLASS, stageOf } from './stage';
import {
  LABEL_INSET, LINE_SPACING, POINTS_PER_INCH, cornerRadius, decodeSpline, edgeStyle,
  groupBox, lensExtent, nodeBox, toSvg,
} from './geometry';
import { buildScene, lensKeyOf, recordIdOf, slotOf } from './scene';
import { LensFigure, LensOmissions, LensProvenance } from './LensView';
import { LegendOverlay } from './LegendOverlay';
import { LegendPanel } from './legendPanel';
import decisionsFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';
import branchFixture from '../../test/fixtures/bundle/streams/base/lenses/branch.lens.json';
import allocationFixture from '../../test/fixtures/bundle/streams/architecture/lenses/allocation.lens.json';

const lens = readLens(decisionsFixture);
const branch = readLens(branchFixture);
const allocation = readLens(allocationFixture);

// The picture is the emitted picture. Every geometry assertion below is an
// arithmetic restatement of a number in the lens file, and the rendering tests
// count elements against the emitted node and edge lists.

describe('decoding the emitted geometry', () => {
  it('flips the Graphviz axis and keeps the emitted numbers', () => {
    expect(lens.bb).toEqual([0, 0, 2242.8, 633.32]);
    expect(lensExtent(lens)).toEqual({ x: 0, y: 0, width: 2242.8, height: 633.32 });
    expect(toSvg(lens, 265.23, 35.76)).toEqual({ x: 265.23, y: 633.32 - 35.76 });
  });

  it('turns a node pos and size into a box without adjusting either', () => {
    const node = lens.nodes[0];
    const box = nodeBox(lens, node);
    expect(box.width).toBe(node.size[0] * POINTS_PER_INCH);
    expect(box.height).toBe(node.size[1] * POINTS_PER_INCH);
    expect(box.x + box.width / 2).toBeCloseTo(node.pos[0], 6);
    expect(box.y + box.height / 2).toBeCloseTo(lens.bb[3] - node.pos[1], 6);
  });

  it('turns a cluster bounding box into a rectangle of the same size', () => {
    const group = (lens.groups ?? [])[0];
    const box = groupBox(lens, group);
    expect(box.width).toBe(group.bb[2] - group.bb[0]);
    expect(box.height).toBe(group.bb[3] - group.bb[1]);
  });

  it('decodes a spline into one cubic per emitted triple', () => {
    const spline = decodeSpline(lens, 'e,833.23,378.1 833.23,465.66 833.23,441.39 833.23,410.85 833.23,387.14');
    expect(spline).not.toBeNull();
    expect(spline?.head).toEqual({ x: 833.23, y: 633.32 - 378.1 });
    expect(spline?.path.match(/C /g)).toHaveLength(1);
    expect(spline?.path.startsWith('M 833.23 ')).toBe(true);
    expect(spline?.path.endsWith(`L 833.23 ${633.32 - 378.1}`)).toBe(true);
  });

  it('decodes every emitted spline of every emitted lens', () => {
    for (const source of [lens, branch, allocation]) {
      for (const edge of source.edges) {
        expect(decodeSpline(source, edge.spline), `${source.perspective} ${edge.id}`).not.toBeNull();
      }
    }
  });

  it('refuses a spline it cannot decode rather than approximating one', () => {
    expect(decodeSpline(lens, '1,2 3,4')).toBeNull();
    expect(decodeSpline(lens, '1,2 3,4 5,6 7,8 9,10')).toBeNull();
    expect(decodeSpline(lens, 'e,nope,2 1,2 3,4 5,6 7,8')).toBeNull();
  });

  it('takes edge styling from the edge, then from the legend, and never elsewhere', () => {
    const requires = lens.edges.find((e) => e.relation === 'Requires');
    expect(edgeStyle(lens, requires!).color).toBe(requires!.style?.color);
    const gated = lens.edges.find((e) => e.relation === 'GatedBy');
    expect(edgeStyle(lens, gated!).dash).toBe('2 3');
    const bare = { ...requires!, style: undefined };
    const legend = lens.legend.edges.find((e) => e.relation === 'Requires');
    expect(edgeStyle(lens, bare).color).toBe(legend?.color);
  });

  it('reads rounded corners off the emitted node style', () => {
    expect(cornerRadius(lens.nodes[0])).toBeGreaterThan(0);
    expect(cornerRadius({ ...lens.nodes[0], style: 'filled' })).toBe(0);
  });
});

describe('the camera', () => {
  const extent = lensExtent(lens);

  it('fits the whole lens inside the viewport and centres it', () => {
    const camera = fitCamera(extent, { width: 900, height: 500 }, 'key');
    expect(camera.k).toBeLessThan(1);
    expect(extent.width * camera.k).toBeLessThanOrEqual(900);
    expect(extent.height * camera.k).toBeLessThanOrEqual(500);
    expect(camera.tx).toBeCloseTo((900 - extent.width * camera.k) / 2, 6);
    expect(camera.fittedTo).toBe('key');
  });

  it('zooms about the pointer, so what is under it stays under it', () => {
    const before = { k: 1, tx: 0, ty: 0, fittedTo: 'key' };
    const at = { x: 300, y: 200 };
    const after = zoomAt(before, at, 2);
    const world = (camera: typeof before, point: typeof at) => ({
      x: (point.x - camera.tx) / camera.k, y: (point.y - camera.ty) / camera.k,
    });
    expect(world(after, at).x).toBeCloseTo(world(before, at).x, 6);
    expect(world(after, at).y).toBeCloseTo(world(before, at).y, 6);
  });

  it('clamps the scale at both ends and stops rather than drifting', () => {
    expect(clampScale(1e9)).toBe(MAX_SCALE);
    expect(clampScale(0)).toBe(MIN_SCALE);
    expect(clampScale(Number.NaN)).toBe(1);
    const pinned = { k: MAX_SCALE, tx: 3, ty: 4, fittedTo: '' };
    expect(zoomAt(pinned, { x: 0, y: 0 }, 2)).toBe(pinned);
  });

  it('pans by the pointer delta and leaves the scale alone', () => {
    const camera = panBy({ k: 2, tx: 10, ty: 20, fittedTo: 'k' }, 5, -7);
    expect(camera).toEqual({ k: 2, tx: 15, ty: 13, fittedTo: 'k' });
  });

  it('turns a wheel delta into a factor either side of one', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(0)).toBe(1);
  });

  // The pan gesture and the pick share one press, and the order they resolve
  // in is not a matter of taste: the pan's capture overlay is a sibling of the
  // figure, so an overlay mounted by the PRESS takes the release, and a
  // browser that saw the press on a node and the release on the overlay
  // dispatches no click at all. The picture then cannot be picked with a real
  // mouse, which is exactly what it did (verified in Chromium against the
  // emitted base bundle before this was fixed). So the press only ARMS, and
  // the overlay is mounted by the first MOVE.
  it('arms a press without capturing, so the release still reaches the figure', () => {
    const armed = pressAt(120, 80);
    expect(armed).toEqual({ x: 120, y: 80, panning: false });
    expect(isPanning(armed)).toBe(false);
    expect(isPanning(undefined)).toBe(false);
  });

  it('starts capturing at the first move, and tracks the pointer from there', () => {
    const moved = panningAt(140, 95);
    expect(moved).toEqual({ x: 140, y: 95, panning: true });
    expect(isPanning(moved)).toBe(true);
    expect(isPanning(panningAt(141, 96))).toBe(true);
  });

  it('toggles a relation and a selection without touching anything else', () => {
    const one = toggleRelation(NOTHING_DIMMED, 'Requires');
    expect(one).toEqual({ ...NOTHING_DIMMED, relations: ['Requires'] });
    expect(toggleRelation(one, 'Requires').relations).toEqual([]);
    expect(toggleSelected({ ids: [] }, 'occ:a', false).ids).toEqual(['occ:a']);
    expect(toggleSelected({ ids: ['occ:a'] }, 'occ:a', false).ids).toEqual([]);
    expect(toggleSelected({ ids: ['occ:a'] }, 'occ:b', true).ids).toEqual(['occ:a', 'occ:b']);
    expect(toggleSelected({ ids: ['occ:a'] }, 'occ:b', false).ids).toEqual(['occ:b']);
  });
});

/** The three elements a Fit press walks between, with no DOM at all: the
 *  button, the lens root it is inside, and what each selector finds under that
 *  root. The legend's 26x10 line sample comes FIRST in the real document,
 *  which is what made `querySelector('svg')` the wrong question to ask. */
function fakeLensRoot() {
  const stage = { tag: 'div' } as unknown as Element;
  const swatch = { tag: 'svg' } as unknown as Element;
  const root = {
    querySelector(selector: string) {
      if (selector === 'svg') {
        return swatch;
      }
      if (selector === `.${STAGE_CLASS}`) {
        return stage;
      }
      return null;
    },
  } as unknown as Element;
  const button = {
    closest(selector: string) {
      if (selector === '.gyld-lens') {
        return root;
      }
      return null;
    },
  } as unknown as Element;
  return { button, stage, swatch };
}

// Fitting the picture: WHICH box is measured, and what happens when that box
// cannot be measured. Both were wrong, and both wrote the same camera — the
// whole graph at MIN_SCALE in the top-left corner, which is what the reader
// saw every time the Fit button was pressed.
describe('fitting to the box that shows the picture', () => {
  const extent = lensExtent(lens);

  it('refuses a viewport nothing can be seen in', () => {
    expect(isMeasurableViewport({ width: 452, height: 277 })).toBe(true);
    expect(isMeasurableViewport({ width: 452, height: 0 })).toBe(false);
    expect(isMeasurableViewport({ width: 0, height: 0 })).toBe(false);
    expect(isMeasurableViewport({ width: -1, height: 10 })).toBe(false);
    expect(isMeasurableViewport({ width: Number.NaN, height: 10 })).toBe(false);
  });

  // Why the guard is not a nicety. `fitCamera` is unchanged and correct; these
  // are the two boxes it was being handed.
  it('states what fitting to one of those would have written', () => {
    const collapsed = fitCamera(extent, { width: 452, height: 0 }, 'key');
    expect(collapsed.k).toBe(MIN_SCALE);
    const swatch = fitCamera(extent, { width: 26, height: 10 }, 'key');
    expect(swatch.k).toBe(MIN_SCALE);
    expect(swatch.tx).toBeLessThan(0);
    expect(swatch.ty).toBeLessThan(0);
  });

  it('leaves a lens unfitted when there was nothing to fit it to', () => {
    // An unmeasurable viewport writes NO camera, so `fittedTo` still names
    // nothing and the next measurable measurement fits for real.
    expect(needsFit(CAMERA_UNFITTED, 'key')).toBe(true);
    const fitted = fitCamera(extent, { width: 900, height: 500 }, 'key');
    expect(needsFit(fitted, 'key')).toBe(false);
    expect(needsFit(fitCamera(extent, { width: 900, height: 500 }, 'other'), 'key')).toBe(true);
  });

  it('asks the lens for its stage by name, not for the first svg under it', () => {
    const { button, stage, swatch } = fakeLensRoot();
    expect(stageOf(button)).toBe(stage);
    expect(stageOf(button)).not.toBe(swatch);
    expect(stageOf(null)).toBeNull();
    expect(stageOf(undefined)).toBeNull();
  });

  it('draws the legend with svg line samples, which is what `svg` found', () => {
    // The legend still draws `<svg>` line samples — it is over the picture
    // now rather than above it, and `stageOf` still asks for the stage BY
    // NAME so the samples cannot be measured as the picture again.
    const markup = renderToStaticMarkup(
      <LegendOverlay
        scene={buildScene(lens)}
        panel={LegendPanel.OPEN}
        dimmed={NOTHING_DIMMED}
        onPanel={() => {}}
        onFlash={() => {}}
        onEye={() => {}}
        onHide={() => {}}
      />,
    );
    expect(markup).toContain('<svg');
  });
});

describe('the scene', () => {
  it('carries one drawable item per emitted node and edge', () => {
    const scene = buildScene(lens);
    expect(scene.nodes).toHaveLength(lens.nodes.length);
    expect(scene.edges).toHaveLength(lens.edges.length);
    expect(scene.nodes.map((n) => n.id)).toEqual(lens.nodes.map((n) => n.id));
    expect(scene.edges.map((e) => e.id)).toEqual(lens.edges.map((e) => e.id));
    expect(scene.groups).toHaveLength((lens.groups ?? []).length);
  });

  it('states the emitted omissions and the counts, and marks its own', () => {
    const scene = buildScene(lens);
    for (const omission of lens.omissions) {
      expect(scene.omissions.map((o) => o.text)).toContain(omission);
    }
    expect(scene.omissions.some((o) => o.text.includes('46 occurrences'))).toBe(true);
    expect(scene.omissions.some((o) => o.text.includes('15 assertions'))).toBe(true);
    expect(scene.omissions.every((o) => !o.fromWindow)).toBe(true);
    const dimmedScene = buildScene(lens, { dimmed: { ...NOTHING_DIMMED, relations: ['Requires'], hide: false } });
    const own = dimmedScene.omissions.filter((o) => o.fromWindow);
    expect(own.map((o) => o.text)).toEqual(['Requires dimmed in this window']);
  });

  it('carries the provenance every window must show (MDV-7)', () => {
    const scene = buildScene(lens);
    expect(scene.provenance).toEqual({
      lineage: lens.snapshot.lineage,
      revision: lens.snapshot.revision,
      digest: lens.snapshot.digest,
      stream: 'base',
      perspective: 'decisions',
      relations: lens.relations,
      textRelations: ['Offers'],
      engine: 'dot 14.1.4',
      pinned: true,
      title: lens.title,
    });
    expect(buildScene(allocation).provenance.stream).toBe('');
  });

  it('dims or hides a relation over the SAME geometry, never a new layout', () => {
    const plain = buildScene(lens);
    const dim = buildScene(lens, { dimmed: { ...NOTHING_DIMMED, relations: ['Implies'], hide: false } });
    const hide = buildScene(lens, { dimmed: { ...NOTHING_DIMMED, relations: ['Implies'], hide: true } });
    for (const [index, edge] of plain.edges.entries()) {
      expect(dim.edges[index].path).toBe(edge.path);
      expect(hide.edges[index].path).toBe(edge.path);
    }
    for (const [index, node] of plain.nodes.entries()) {
      expect(dim.nodes[index].box).toEqual(node.box);
      expect(hide.nodes[index].box).toEqual(node.box);
    }
    const implies = plain.edges.filter((e) => e.relation === 'Implies');
    expect(implies.length).toBeGreaterThan(0);
    expect(dim.edges.filter((e) => e.dimmed).map((e) => e.id))
      .toEqual(implies.map((e) => e.id));
    expect(hide.edges.filter((e) => e.hidden).map((e) => e.id))
      .toEqual(implies.map((e) => e.id));
    expect(dim.edges.some((e) => e.hidden)).toBe(false);
  });

  it('highlights the selection and its emitted neighbours, and dims the rest', () => {
    const picked = lens.edges[0].tail;
    const scene = buildScene(lens, { selection: { ids: [picked] } });
    const near = new Set<string>([picked]);
    for (const edge of lens.edges) {
      if (edge.tail === picked || edge.head === picked) {
        near.add(edge.tail);
        near.add(edge.head);
      }
    }
    for (const node of scene.nodes) {
      expect(node.dimmed, node.id).toBe(!near.has(node.id));
    }
    expect(scene.nodes.find((n) => n.id === picked)?.selected).toBe(true);
  });

  it('marks a hovered id and nothing else', () => {
    const scene = buildScene(lens, { hover: lens.nodes[3].id });
    expect(scene.nodes.filter((n) => n.hovered).map((n) => n.id)).toEqual([lens.nodes[3].id]);
    expect(scene.edges.some((e) => e.hovered)).toBe(false);
  });

  it('tells a declared group apart from a reading aid', () => {
    const aid = buildScene(lens).groups;
    expect(aid.every((g) => !g.declared)).toBe(true);
    const declared = buildScene(allocation).groups.filter((g) => g.declared);
    expect(declared.length).toBeGreaterThan(0);
  });

  it('resolves a lens id back to the record it stands for', () => {
    const node = lens.nodes[0];
    expect(recordIdOf(node.id)).toBe(node.id.slice(4));
    const multi = lens.edges.find((e) => e.id.includes('#'));
    expect(multi).toBeDefined();
    expect(recordIdOf(multi!.id)).toBe(multi!.id.slice(4).split('#')[0]);
    expect(recordIdOf('grp:anchors')).toBeNull();
    expect(slotOf(lens, node.id)).toBe(node.slot);
    expect(slotOf(lens, multi!.id)).toBe(multi!.slot);
    expect(slotOf(lens, 'occ:nothing')).toBeNull();
  });
});

describe('rendering the lens', () => {
  const scene = buildScene(lens);
  const markup = renderToStaticMarkup(
    <LensFigure scene={scene} camera={CAMERA_UNFITTED} scope="test" />,
  );

  it('draws one group with the record id per emitted node and edge', () => {
    for (const node of lens.nodes) {
      expect(markup).toContain(`id="${node.id}"`);
      expect(markup).toContain(`data-record="${node.id.slice(4)}"`);
      expect(markup).toContain(`data-slot="${node.slot}"`);
    }
    for (const edge of lens.edges) {
      expect(markup).toContain(`id="${edge.id}"`);
    }
    const ids = markup.match(/ id="occ:[0-9a-f]{64}"/g) ?? [];
    expect(ids).toHaveLength(lens.nodes.length);
  });

  it('draws each node at the font size and justification the host emitted', () => {
    // The two lineages are drawn differently: the decision lenses are 11pt and
    // left aligned, the architecture lenses 12pt and centred, and a node with
    // one line is centred whatever its lens does. None of that is the view's
    // choice any more; all three numbers come out of the lens file.
    const sizes = new Set(lens.nodes.map((node) => node.fontsize));
    expect(sizes).toEqual(new Set([11]));
    expect(new Set(allocation.nodes.map((node) => node.fontsize))).toEqual(new Set([12]));
    // every drawn label line of this lens is at the emitted 11, and there are
    // exactly as many of them as the file has lines
    const lines = markup.match(/<text[^>]*font-size="11"[^>]*class="gyld-node-line"/g) ?? [];
    expect(lines).toHaveLength(lens.nodes.flatMap((node) => node.text).length);
    expect(markup).not.toMatch(/<text[^>]*font-size="12"[^>]*class="gyld-node-line"/);

    const left = lens.nodes.find((node) => node.justify === 'left');
    const centred = lens.nodes.find((node) => node.justify === 'center');
    expect(left).toBeDefined();
    expect(centred).toBeDefined();
    // a left justified block starts at the inset; a centred one is anchored
    // at the middle of the emitted box, so the box's own width places it
    const leftScene = scene.nodes.find((node) => node.id === left!.id)!;
    const centredScene = scene.nodes.find((node) => node.id === centred!.id)!;
    expect(leftScene.anchor).toBe('start');
    expect(leftScene.labelAt.x).toBeCloseTo(leftScene.box.x + LABEL_INSET, 6);
    expect(centredScene.anchor).toBe('middle');
    expect(centredScene.labelAt.x).toBeCloseTo(
      centredScene.box.x + centredScene.box.width / 2, 6,
    );
    expect(markup).toContain('text-anchor="middle"');
  });

  it('spaces the label lines by the emitted font size', () => {
    const node = lens.nodes.find((entry) => entry.text.length > 2)!;
    const drawn = scene.nodes.find((entry) => entry.id === node.id)!;
    expect(drawn.fontSize).toBe(node.fontsize);
    expect(drawn.lineHeight).toBeCloseTo(node.fontsize * LINE_SPACING, 6);
    const twelve = buildScene(allocation).nodes[0];
    expect(twelve.lineHeight).toBeCloseTo(12 * LINE_SPACING, 6);
  });

  it('draws every emitted label line of every node, verbatim', () => {
    const lines = lens.nodes.flatMap((node) => node.text);
    expect(lines.length).toBeGreaterThan(lens.nodes.length);
    for (const line of lines) {
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      expect(markup).toContain(`>${escaped}<`);
    }
  });

  it('draws the emitted cluster boxes and says which are reading aids', () => {
    for (const group of lens.groups ?? []) {
      expect(markup).toContain(`id="${group.id}"`);
      expect(markup).toContain(group.label);
    }
    expect(markup).toContain('gyld-group-aid');
    expect(markup).not.toContain('gyld-group-declared');
    expect(renderToStaticMarkup(
      <LensFigure scene={buildScene(allocation)} camera={CAMERA_UNFITTED} scope="t" />,
    )).toContain('gyld-group-declared');
  });

  it('never re-computes geometry: the same scene renders the same markup', () => {
    const again = renderToStaticMarkup(
      <LensFigure scene={buildScene(lens)} camera={CAMERA_UNFITTED} scope="test" />,
    );
    expect(again).toBe(markup);
    // and a camera change moves ONLY the transform
    const moved = renderToStaticMarkup(
      <LensFigure scene={scene} camera={{ k: 3, tx: 11, ty: 12, fittedTo: 'x' }} scope="test" />,
    );
    expect(moved.replace('translate(11 12) scale(3)', 'translate(0 0) scale(1)')).toBe(markup);
  });

  it('hides a relation by leaving it out and dims it by class alone', () => {
    const hidden = buildScene(lens, { dimmed: { ...NOTHING_DIMMED, relations: ['GatedBy'], hide: true } });
    const gated = lens.edges.filter((e) => e.relation === 'GatedBy');
    const hiddenMarkup = renderToStaticMarkup(
      <LensFigure scene={hidden} camera={CAMERA_UNFITTED} scope="test" />,
    );
    for (const edge of gated) {
      expect(hiddenMarkup).not.toContain(`id="${edge.id}"`);
    }
    const dimmed = renderToStaticMarkup(
      <LensFigure
        scene={buildScene(lens, { dimmed: { ...NOTHING_DIMMED, relations: ['GatedBy'], hide: false } })}
        camera={CAMERA_UNFITTED}
        scope="test"
      />,
    );
    for (const edge of gated) {
      expect(dimmed).toContain(`id="${edge.id}"`);
    }
    expect(dimmed).toContain('gyld-edge gyld-edge-dim');
  });

  it('renders the emitted legend, the omission strip and the provenance footer', () => {
    const off = { ...NOTHING_DIMMED, relations: ['Implies'], hide: false };
    const legend = renderToStaticMarkup(
      <LegendOverlay
        scene={buildScene(lens, { dimmed: off })}
        panel={LegendPanel.OPEN}
        dimmed={off}
        onPanel={() => {}}
        onFlash={() => {}}
        onEye={() => {}}
        onHide={() => {}}
      />,
    );
    for (const entry of lens.legend.edges) {
      expect(legend).toContain(entry.relation);
      expect(legend).toContain(entry.color);
    }
    expect(legend).toContain('gyld-legend-off');
    const omissions = renderToStaticMarkup(<LensOmissions scene={scene} />);
    for (const omission of lens.omissions) {
      expect(omissions).toContain(omission);
    }
    const footer = renderToStaticMarkup(<LensProvenance scene={scene} />);
    expect(footer).toContain(lens.snapshot.lineage);
    expect(footer).toContain(lens.snapshot.digest.slice(0, 12));
    expect(footer).toContain('pinned layout');
    expect(footer).toContain('29 nodes');
  });

  it('says PREVIEW when the lens was not laid out by a pinned engine', () => {
    const preview = buildScene({ ...lens, engine: { ...lens.engine, pinned: false } });
    expect(renderToStaticMarkup(<LensProvenance scene={preview} />)).toContain('PREVIEW');
  });

  it('keys a camera on the lens identity so a new perspective fits once', () => {
    expect(lensKeyOf(lens)).toBe(`${lens.snapshot.digest}/base/decisions`);
    expect(lensKeyOf(branch)).not.toBe(lensKeyOf(lens));
    expect(lensKeyOf(allocation).endsWith('//allocation')).toBe(true);
  });
});
