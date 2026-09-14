import { describe, it, expect } from 'vitest';
import { GYLD_LENS } from './grips';
import { GyldBrowser } from './GyldBrowser';
import { browserTabTaps } from './browser/browserTabTaps';
import type { GyldLensState, GyldSet } from './store/state';
import { BASE_URL, EMPTY_ROOTS, mountDesk } from '../test/mount';

// gyld.browser keeps working: the window mounts the LENS VIEW once the store
// tap has resolved its destination, and says which absence it is in while it
// has not. Rendered with renderToStaticMarkup, so no DOM and no network.

function mount(tabId: string, stream: string, perspective: string, roots?: GyldSet) {
  const desk = roots === undefined ? mountDesk() : mountDesk(roots);
  const tab = desk.tab(tabId, browserTabTaps(tabId, { stream, perspective }));
  return {
    lens: () => tab.read(GYLD_LENS).get() as GyldLensState,
    render: () => tab.render(<GyldBrowser tabId={tabId} />),
  };
}

describe('gyld.browser', () => {
  it('mounts the lens view once the store resolves the destination', async () => {
    const window = mount('lens-ok', 'base', 'decisions');
    await expect.poll(() => window.lens()?.status).toBe('ok');
    const markup = window.render();
    expect(markup).toContain('gyld-lens-svg');
    expect(markup).toContain('Buy/build decision graph');
    // the provenance footer and the omission strip ride with it (MDV-7)
    expect(markup).toContain('glade-decision-graph');
    expect(markup).toContain('pinned layout');
    expect(markup).toContain('matrix rows');
    // and the join to the records is in the markup
    expect(markup).toContain('data-slot="glade_decisions:GladeDecisions.scope_model"');
  });

  it('offers the four windows a browser opens, each wired or linked', async () => {
    const window = mount('lens-links', 'base', 'decisions');
    await expect.poll(() => window.lens()?.status).toBe('ok');
    const markup = window.render();
    // the three WIRED sinks follow this browser's own destination, and the
    // drill-in opens a new window on the focused record instead
    for (const held of [
      'gyld-open-detail', 'gyld-open-decidenow', 'gyld-open-decide', 'gyld-open-hood',
    ]) {
      expect(markup).toContain(`class="${held}"`);
    }
    // and each is refused while no desktop can open a window, rather than
    // doing nothing when pressed
    expect(markup.match(/<button[^>]*class="gyld-open-[a-z]+"[^>]*disabled/g))
      .toHaveLength(4);
  });

  it('shows the destination and the store status when there is no lens', async () => {
    const window = mount('lens-unset', 'base', '');
    await expect.poll(() => window.lens()?.status).toBe('unset');
    const markup = window.render();
    expect(markup).toContain('not set by the opening link');
    expect(markup).toContain('no stream and perspective on this window yet');
    expect(markup).toContain(BASE_URL);
  });

  it('says a perspective is absent rather than drawing something else', async () => {
    const window = mount('lens-absent', 'base', 'neighbourhood');
    await expect.poll(() => window.lens()?.status).toBe('absent');
    const markup = window.render();
    expect(markup).toContain('no lens file for that stream and perspective');
    expect(markup).toContain('streams/base/lenses/neighbourhood.lens.json');
    // and it says what the stream DID emit, rather than drawing something else
    expect(markup).toContain(
      'emitted perspectives: decisions, tiers, status, branch, neighbourhood-key_custody',
    );
    expect(markup).not.toContain('gyld-lens-svg');
  });

  it('says which perspectives the host declined to emit, and why', async () => {
    const window = mount('lens-withheld', 'architecture', 'full');
    await expect.poll(() => window.lens()?.status).toBe('absent');
    const markup = window.render();
    expect(markup).toContain('full: not emitted');
    expect(markup).toContain('mints no record ids');
    expect(markup).toContain('emitted perspectives: dependencies');
  });

  it('says why there is no root at all, rather than drawing a picture', async () => {
    const window = mount('no-root', 'base', 'decisions', EMPTY_ROOTS);
    await expect.poll(() => window.lens()?.status).toBe('absent');
    const markup = window.render();
    // no landing is published on this desk, so the picker reads the default:
    // no glade in the composition, which is the state it leads with
    expect(markup).toContain('No glade node answered');
    expect(markup).not.toContain('gyld-lens-svg');
  });
});
