import { describe, expect, it } from 'vitest';
import type { AtomTapHandle } from '@owebeeone/grip-react';
import { openWindow, setTabParams, type WindowRecord } from '@grythjs/desktop';
import {
  legendFromParams, perspectiveFromParams, previewFromParams, streamFromParams,
} from '../grips';
import { LegendPanel } from '../lens/legendPanel';
import { PreviewPerspective } from '../preview/neighbourhood';
import {
  pickPerspective, pickStream, rememberDestination, type DestinationHandles,
} from './destination';
import type { PerspectiveOption } from './perspectives';

// A pick in the browser's own chrome moves the window's TAB-CONTEXT atoms, and
// the INTERIM desk persistence restores a window from its tab RECORD. So the
// claim under test is that the two do not drift: what a pick shows is what a
// restored desk reopens on.

function atom<T>(initial: T): AtomTapHandle<T> {
  let held = initial;
  return {
    get: () => held,
    set: (value) => { held = value; },
    update: (updater) => { held = updater(held); },
  };
}

const OPTIONS: readonly PerspectiveOption[] = [
  { perspective: 'decisions', value: 'decisions', emitted: true },
  { perspective: 'ownership', value: 'ownership', emitted: true },
  {
    perspective: PreviewPerspective.FAMILY,
    value: 'preview:q7',
    emitted: false,
    preview: 'q7',
  },
];

/** One browser window on the desk, and the handles its chrome writes through
 *  — the same object `BrowserChrome` builds from its own resolved grips. */
function onDesk(params: Record<string, unknown>) {
  const opened = openWindow([], 'gyld.browser', { w: 600, h: 400 }, 1, params);
  let list: WindowRecord[] = opened.list;
  const tabId = list[0].tabs[0].id;
  const handles: DestinationHandles = {
    tabId,
    stream: atom(streamFromParams(params)),
    perspective: atom(perspectiveFromParams(params)),
    preview: atom(previewFromParams(params)),
    legend: atom(legendFromParams(params)),
    retarget: (id, next) => { list = setTabParams(list, id, next); },
  };
  return {
    handles,
    /** What the tab record now carries — what a reload would seed from. */
    record: () => list[0].tabs[0].params ?? {},
  };
}

const SEEDED = { stream: 'alpha', perspective: 'decisions', preview: '', focus: '' };

describe('a pick in the browser chrome', () => {
  it('shows the stream AND folds it into the tab record', () => {
    const win = onDesk(SEEDED);
    pickStream(win.handles, 'beta');
    expect(win.handles.stream?.get()).toBe('beta');
    // the record went with it: without this the window reopens on `alpha`
    expect(streamFromParams(win.record())).toBe('beta');
    expect(perspectiveFromParams(win.record())).toBe('decisions');
  });

  it('shows the perspective AND folds it into the tab record', () => {
    const win = onDesk(SEEDED);
    pickPerspective(win.handles, OPTIONS, 'ownership');
    expect(win.handles.perspective?.get()).toBe('ownership');
    expect(perspectiveFromParams(win.record())).toBe('ownership');
    expect(previewFromParams(win.record())).toBe('');
  });

  it('records a preview as the lens it restricts plus the question', () => {
    const win = onDesk(SEEDED);
    pickPerspective(win.handles, OPTIONS, 'preview:q7');
    expect(win.handles.perspective?.get()).toBe(PreviewPerspective.SOURCE);
    expect(win.handles.preview?.get()).toBe('q7');
    expect(perspectiveFromParams(win.record())).toBe(PreviewPerspective.SOURCE);
    expect(previewFromParams(win.record())).toBe('q7');
  });

  it('reopens the window on the last pick, not on the link it was opened with', () => {
    const win = onDesk(SEEDED);
    pickStream(win.handles, 'beta');
    pickPerspective(win.handles, OPTIONS, 'ownership');
    // the restore: a new tab context seeded from the record the desk stored
    const restored = onDesk(win.record());
    expect(restored.handles.stream?.get()).toBe('beta');
    expect(restored.handles.perspective?.get()).toBe('ownership');
  });

  it('folds the legend overlay into the record, and seeds it back', () => {
    const win = onDesk(SEEDED);
    // shrunk until the reader opens it: the panel takes no room by default
    expect(win.handles.legend?.get()).toBe(LegendPanel.SHRUNK);
    expect(legendFromParams(win.record())).toBe(LegendPanel.SHRUNK);
    // the panel writes its own atom, then the window remembers it
    win.handles.legend?.set(LegendPanel.OPEN);
    rememberDestination(win.handles);
    expect(win.record().legend).toBe('open');
    // and a desk restored from that record comes back with it open
    expect(legendFromParams(win.record())).toBe(LegendPanel.OPEN);
    expect(onDesk(win.record()).handles.legend?.get()).toBe(LegendPanel.OPEN);
    // the help is remembered as its own state, and shrinking is too
    win.handles.legend?.set(LegendPanel.OPEN.withHelp());
    rememberDestination(win.handles);
    expect(onDesk(win.record()).handles.legend?.get()).toBe(LegendPanel.HELP);
    win.handles.legend?.set(LegendPanel.HELP.toggled());
    rememberDestination(win.handles);
    expect(onDesk(win.record()).handles.legend?.get()).toBe(LegendPanel.SHRUNK);
  });

  it('keeps the legend across a pick, and opens shrunk for an unknown word', () => {
    const win = onDesk({ ...SEEDED, legend: 'open' });
    expect(win.handles.legend?.get()).toBe(LegendPanel.OPEN);
    pickStream(win.handles, 'beta');
    expect(win.record().legend).toBe('open');
    // a desk written before the panel existed, and a link with nonsense in it
    expect(legendFromParams({})).toBe(LegendPanel.SHRUNK);
    expect(legendFromParams({ legend: 'wide' })).toBe(LegendPanel.SHRUNK);
    expect(legendFromParams({ legend: 7 })).toBe(LegendPanel.SHRUNK);
  });

  it('does not carry the selected record across a reload', () => {
    // camera-side state: a restored window comes back on the destination, not
    // on the box that happened to be clicked in it
    const win = onDesk({ ...SEEDED, focus: 'alpha/q3' });
    pickStream(win.handles, 'beta');
    expect(win.record().focus).toBe('');
  });
});
