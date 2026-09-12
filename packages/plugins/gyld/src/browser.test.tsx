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
    expect(markup).toContain('emitted perspectives: branch, decisions, status, tiers');
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

  it('says the desk has no bundle root at all', async () => {
    const window = mount('no-root', 'base', 'decisions', EMPTY_ROOTS);
    await expect.poll(() => window.lens()?.status).toBe('absent');
    const markup = window.render();
    expect(markup).toContain('This desk has no bundle root');
    expect(markup).not.toContain('gyld-lens-svg');
  });
});
