import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createAtomValueTap, type AtomTapHandle } from '@owebeeone/grip-react';
import { DESKTOP_RETARGET_TAB } from '@grythjs/plugin-api';
import { readLens } from '../contract';
import {
  GYLD_LENS, GYLD_TAB_DIMMED_TAP, GYLD_TAB_FLASH_TAP, GYLD_TAB_LEGEND,
  GYLD_TAB_LEGEND_TAP, legendFromParams,
} from '../grips';
import { GyldBrowser } from '../GyldBrowser';
import { browserTabTaps } from '../browser/browserTabTaps';
import type { GyldLensState } from '../store/state';
import { mountDesk } from '../../test/mount';
import { NOTHING_DIMMED, type GyldDimmed } from './camera';
import { NOT_FLASHING, flashOn, type GyldFlash } from './flash';
import { legendEntriesOf } from './legend';
import { LegendPanel } from './legendPanel';
import { LegendOverlay } from './LegendOverlay';
import { buildScene } from './scene';
import decisionsFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';

// The legend as a PANEL over the picture (owner's asks 1-4):
//
//  1. a press on a row flashes what it stands for;
//  2. every row carries the emitted docstring and what it means for you;
//  3. it is over the picture with an expand/shrink toggle, so the bar above
//     the picture is one line and the stage keeps its height;
//  4. `hide instead of dim` sits with the eyes it governs, says what it does,
//     and is unusable while nothing is switched off.

const lens = readLens(decisionsFixture);
const entry = (key: string) => legendEntriesOf(lens).find((row) => row.key === key)!;

function panel(options: {
  state?: LegendPanel;
  dimmed?: GyldDimmed;
  flash?: GyldFlash;
} = {}): string {
  const dimmed = options.dimmed ?? NOTHING_DIMMED;
  return renderToStaticMarkup(
    <LegendOverlay
      scene={buildScene(lens, { dimmed, flash: options.flash })}
      panel={options.state ?? LegendPanel.OPEN}
      dimmed={dimmed}
      onPanel={() => {}}
      onFlash={() => {}}
      onEye={() => {}}
      onHide={() => {}}
    />,
  );
}

/** A browser window on the fixture bundle, with its lens drawn. */
async function browser(tabId: string, params: Record<string, unknown> = {}) {
  const desk = mountDesk();
  desk.ctx.getGripHomeContext().registerTap(
    createAtomValueTap(DESKTOP_RETARGET_TAB, { initial: () => {} }),
  );
  const tab = desk.tab(tabId, browserTabTaps(tabId, {
    stream: 'base', perspective: 'decisions', ...params,
  }));
  await expect.poll(() => (tab.read(GYLD_LENS).get() as GyldLensState)?.status).toBe('ok');
  return {
    desk,
    tab,
    markup: () => tab.render(<GyldBrowser tabId={tabId} />),
    dim: tab.read(GYLD_TAB_DIMMED_TAP).get() as AtomTapHandle<GyldDimmed>,
    flash: tab.read(GYLD_TAB_FLASH_TAP).get() as AtomTapHandle<GyldFlash>,
    legend: tab.read(GYLD_TAB_LEGEND_TAP).get() as AtomTapHandle<LegendPanel>,
  };
}

describe('the legend is a panel over the picture', () => {
  it('is a slim tab with the samples while it is shrunk', () => {
    const shrunk = panel({ state: LegendPanel.SHRUNK });
    expect(shrunk).toContain('gyld-legend-tab');
    expect(shrunk).toContain('Legend');
    // the samples are there; the rows, the descriptions and the footer are not
    expect(shrunk.match(/gyld-swatch/g) ?? []).toHaveLength(lens.legend.nodes.length);
    expect(shrunk.match(/gyld-legend-line/g) ?? []).toHaveLength(lens.legend.edges.length);
    expect(shrunk).not.toContain('gyld-legend-row');
    expect(shrunk).not.toContain('hide instead of dim');
    expect(shrunk).toContain('aria-expanded="false"');
  });

  it('lists every entry with its count, its eye and its description', () => {
    const open = panel();
    expect(open).toContain('gyld-legend-open');
    expect(open).toContain('aria-expanded="true"');
    const rows = buildScene(lens).legend;
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(open).toContain(`data-entry="${row.entry.key}"`);
      expect(open).toContain(`>${row.count}</span>`);
      expect(open).toContain(row.entry.label);
      if (row.entry.says !== '') {
        expect(open).toContain(row.entry.says.slice(0, 40));
      }
    }
    expect(open.match(/gyld-legend-eye/g) ?? []).toHaveLength(rows.length);
    expect(open.match(/gyld-legend-flash/g) ?? []).toHaveLength(rows.length);
    expect(open).toContain('How to read this graph');
  });

  it('shows the emitted docstring above the app sentence, and nothing when none', () => {
    expect(panel()).not.toContain('gyld-legend-doc');
    const documented = readLens({
      ...decisionsFixture,
      legend: {
        edges: decisionsFixture.legend.edges.map((row) => ({
          ...row, doc: `${row.relation}: as declared.`,
        })),
        nodes: decisionsFixture.legend.nodes,
      },
    });
    const markup = renderToStaticMarkup(
      <LegendOverlay
        scene={buildScene(documented)}
        panel={LegendPanel.OPEN}
        dimmed={NOTHING_DIMMED}
        onPanel={() => {}}
        onFlash={() => {}}
        onEye={() => {}}
        onHide={() => {}}
      />,
    );
    expect(markup).toContain('Requires: as declared.');
    // both: the host's word about the graph, then the app's word to the reader
    expect(markup).toContain('before the one at the head can be');
    expect(markup.indexOf('Requires: as declared.'))
      .toBeLessThan(markup.indexOf('before the one at the head can be'));
  });

  it('opens the help in the same panel, with a way back to the rows', () => {
    const help = panel({ state: LegendPanel.HELP });
    expect(help).toContain('gyld-legend-help');
    expect(help).toContain('What a box is');
    expect(help).toContain('What &quot;answerable now&quot; means');
    expect(help).toContain('How to answer one');
    expect(help).toContain('Back to the legend');
    // the rows give way to it rather than sitting under it
    expect(help).not.toContain('gyld-legend-row');
  });
});

describe('hide instead of dim says what it does, and waits until it can', () => {
  it('is disabled, with the reason, while nothing is switched off', () => {
    const open = panel();
    expect(open).toContain('gyld-hide-off');
    expect(open).toContain('disabled=""');
    expect(open).toContain('nothing is switched off yet');
  });

  it('is usable, and says what it applies to, once an eye is off', () => {
    const off = panel({ dimmed: entry('relation/Implies').toggle(NOTHING_DIMMED) });
    expect(off).not.toContain('disabled=""');
    expect(off).toContain('applies to the classes you switched off with the eye');
    expect(off).toContain('Next up only always dims');
  });
});

describe('the eyes replace the relation buttons and the chrome facets', () => {
  it('dims a relation and adds the omission line the buttons added', async () => {
    const win = await browser('eye-edge', { legend: 'open' });
    expect(win.markup()).not.toContain('gyld-facet');
    win.dim.set(entry('relation/Implies').toggle(win.dim.get() ?? NOTHING_DIMMED));
    await expect.poll(() => win.markup().includes('Implies dimmed in this window')).toBe(true);
    const markup = win.markup();
    const implied = lens.edges.filter((edge) => edge.relation === 'Implies');
    expect(implied.length).toBeGreaterThan(0);
    expect(markup.match(/gyld-edge gyld-edge-dim/g) ?? []).toHaveLength(implied.length);
    for (const edge of implied) {
      expect(markup).toContain(`id="${edge.id}"`);
    }
    expect(markup).toContain('data-off="yes"');
  });

  it('hides the same relation, and says hidden, once hide is ticked', async () => {
    const win = await browser('eye-hide');
    const off = entry('relation/Implies').toggle(win.dim.get() ?? NOTHING_DIMMED);
    win.dim.set({ ...off, hide: true });
    await expect.poll(() => win.markup().includes('Implies hidden in this window')).toBe(true);
    const markup = win.markup();
    for (const edge of lens.edges.filter((item) => item.relation === 'Implies')) {
      expect(markup).not.toContain(`id="${edge.id}"`);
    }
  });

  it('dims a status the way the chrome facet button did, by the same facet', async () => {
    const win = await browser('eye-status');
    win.dim.set(entry('node/Question/Open/').toggle(win.dim.get() ?? NOTHING_DIMMED));
    await expect.poll(() => win.markup().includes('status Open dimmed in this window')).toBe(true);
    const open = lens.nodes.filter((node) => node.status === 'Open');
    expect(open.length).toBeGreaterThan(0);
    expect(win.markup().match(/gyld-node gyld-node-dim/g) ?? []).toHaveLength(open.length);
  });
});

describe('a press on a row flashes what it stands for', () => {
  it('marks exactly the matching boxes while the stamp is set', async () => {
    const win = await browser('flash-row');
    expect(win.markup()).not.toContain('gyld-node-flash');
    win.flash.set(flashOn(win.flash.get() ?? NOT_FLASHING, 'node/Question/Lean/'));
    await expect.poll(() => win.markup().includes('gyld-node-flash')).toBe(true);
    const lean = lens.nodes.filter((node) => node.status === 'Lean');
    expect(win.markup().match(/gyld-node-flash/g) ?? []).toHaveLength(lean.length);
    expect(win.markup()).not.toContain('gyld-edge-flash');
  });

  it('lets go of them again when the sweep clears the stamp', async () => {
    const win = await browser('flash-clear');
    win.flash.set(flashOn(win.flash.get() ?? NOT_FLASHING, 'relation/Requires'));
    await expect.poll(() => win.markup().includes('gyld-edge-flash')).toBe(true);
    // what the sweep does, on its own clock (see legend.test.tsx)
    win.flash.set(NOT_FLASHING);
    await expect.poll(() => win.markup().includes('gyld-edge-flash')).toBe(false);
  });
});

describe('the window around the picture', () => {
  it('keeps the bar to the title and Fit, with the legend over the picture', async () => {
    const win = await browser('bar');
    const markup = win.markup();
    const bar = markup.slice(markup.indexOf('gyld-lens-bar'), markup.indexOf('gyld-lens-stage'));
    expect(bar).toContain('Fit');
    expect(bar).toContain(lens.title);
    expect(bar).not.toContain('hide instead of dim');
    expect(bar).not.toContain('gyld-legend');
    // the panel is INSIDE the stage, so it takes no room from the picture
    const stage = markup.slice(markup.indexOf('gyld-lens-stage'));
    expect(stage).toContain('gyld-legend-panel');
    // and the picture is still drawn under it
    expect(stage.indexOf('gyld-lens-svg')).toBeLessThan(stage.indexOf('gyld-legend-panel'));
  });

  it('opens the legend the way the reader left it, across a reload', async () => {
    const fresh = await browser('legend-fresh');
    expect(fresh.legend.get()).toBe(LegendPanel.SHRUNK);
    expect(fresh.markup()).toContain('gyld-legend-tab');
    // the same window, restored from a record whose legend was left open
    const restored = await browser('legend-open', { legend: 'open' });
    expect(restored.tab.read(GYLD_TAB_LEGEND).get()).toBe(LegendPanel.OPEN);
    expect(restored.markup()).toContain('gyld-legend-open');
    expect(restored.markup()).toContain('How to read this graph');
    expect(legendFromParams({ legend: 'help' })).toBe(LegendPanel.HELP);
  });
});
