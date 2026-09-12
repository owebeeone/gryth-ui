import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GripProvider, createAtomValueTap, type Grip } from '@owebeeone/grip-react';
import { grok } from '@grythjs/plugin-api';
import { GyldBrowser } from './GyldBrowser';
import {
  GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP, GYLD_DEST_REF, GYLD_DEST_REF_TAP,
  GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP, GYLD_LENS, GYLD_SET, GYLD_SET_TAP,
} from './grips';
import { lensTabTaps } from './lens/lensTabTaps';
import { GyldStoreTap } from './store/GyldStoreTap';
import type { GyldLensState, GyldSet } from './store/state';
import { FakeBundle, fakeFetch } from '../test/fakeBundle';

// gyld.browser keeps working: the window mounts the LENS VIEW once the store
// tap has resolved its destination, and shows the destination and the store
// status while it has not. Rendered with renderToStaticMarkup, so no DOM and
// no network are needed.

const BASE_URL = 'https://example.test/out';
const STATIC_SET: GyldSet = { roots: [{ kind: 'static', baseUrl: BASE_URL }] };
let count = 0;

function mount(stream: string, perspective: string, roots: GyldSet) {
  const bundle = new FakeBundle();
  const root = grok.mainPresentationContext.getOrCreateMatchingContext(`gyld-browser-${count++}`);
  const home = root.getGripHomeContext();
  home.registerTap(createAtomValueTap(GYLD_SET, { initial: roots, handleGrip: GYLD_SET_TAP }));
  home.registerTap(new GyldStoreTap({ watch: false, fetch: fakeFetch(bundle) }));
  const tab = root.getGripConsumerContext().getOrCreateMatchingContext('tab:one');
  const tabHome = tab.getGripHomeContext();
  tabHome.registerTap(createAtomValueTap(GYLD_DEST_STREAM, {
    initial: stream, handleGrip: GYLD_DEST_STREAM_TAP,
  }));
  tabHome.registerTap(createAtomValueTap(GYLD_DEST_PERSPECTIVE, {
    initial: perspective, handleGrip: GYLD_DEST_PERSPECTIVE_TAP,
  }));
  tabHome.registerTap(createAtomValueTap(GYLD_DEST_REF, { initial: '', handleGrip: GYLD_DEST_REF_TAP }));
  for (const tap of lensTabTaps()) {
    tabHome.registerTap(tap);
  }
  const read = <T,>(grip: Grip<T>) => {
    const drip = tab.getGripConsumerContext().getOrCreateConsumer(grip);
    drip.subscribe(() => {});
    return drip;
  };
  const render = () => renderToStaticMarkup(
    <GripProvider grok={grok} context={tab}>
      <GyldBrowser />
    </GripProvider>,
  );
  return { read, render };
}

describe('gyld.browser', () => {
  it('mounts the lens view once the store resolves the destination', async () => {
    const window = mount('base', 'decisions', STATIC_SET);
    await expect.poll(() => (window.read(GYLD_LENS).get() as GyldLensState)?.status).toBe('ok');
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
    const window = mount('base', '', STATIC_SET);
    await expect.poll(() => (window.read(GYLD_LENS).get() as GyldLensState)?.status).toBe('unset');
    const markup = window.render();
    expect(markup).toContain('Gyld browser');
    expect(markup).toContain('not set by the opening link');
    expect(markup).toContain(BASE_URL);
  });

  it('says a perspective is absent rather than drawing something else', async () => {
    const window = mount('base', 'neighbourhood', STATIC_SET);
    await expect.poll(() => (window.read(GYLD_LENS).get() as GyldLensState)?.status).toBe('absent');
    const markup = window.render();
    expect(markup).toContain('no lens file for that stream and perspective');
    expect(markup).toContain('streams/base/lenses/neighbourhood.lens.json');
    // and it says what the stream DID emit, rather than drawing something else
    expect(markup).toContain('emitted perspectives: branch, decisions, status, tiers');
    expect(markup).not.toContain('gyld-lens-svg');
  });

  it('says which perspectives the host declined to emit, and why', async () => {
    const window = mount('architecture', 'full', STATIC_SET);
    await expect.poll(() => (window.read(GYLD_LENS).get() as GyldLensState)?.status).toBe('absent');
    const markup = window.render();
    expect(markup).toContain('full: not emitted');
    expect(markup).toContain('mints no record ids');
    expect(markup).toContain('emitted perspectives: dependencies');
  });

  it('says the desk has no bundle root at all', async () => {
    const window = mount('base', 'decisions', { roots: [] });
    await expect.poll(() => (window.read(GYLD_LENS).get() as GyldLensState)?.status).toBe('absent');
    expect(window.render()).toContain('No bundle root on this desk yet');
  });
});
