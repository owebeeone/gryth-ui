import { describe, expect, it } from 'vitest';
import { grok } from '@grythjs/plugin-api';
import {
  DesktopFocusedTap, DesktopWindowsTap, OpenToolTap, OpenWiredTap, RetargetTabTap,
  registerDesktopTaps,
} from './taps.desktop';
import { frameStack, mergeWindows, openWindow, raiseWindow } from './ops';

// The DEFECT, at the surface the reader meets it: on a locked desk the sinks
// a Gyld browser drives (Ask, Details, decide) are TABS of one docked
// inspector frame, so "Ask about this" on an already-open Ask window used to
// retarget a tab nobody could see and the act looked like it had failed.
//
// These go through the shell INTENTS rather than the ops, because that is
// where the acts arrive: the Gyld menu calls `Desktop.OpenWired` and knows
// nothing about frames, tabs or focus.

registerDesktopTaps(grok);

const SIZE = { w: 400, h: 300 };

/** A browser plus an inspector holding Ask and decide wired to it, with the
 *  DECIDE tab showing — the Ask window is open and out of sight. */
function seed() {
  const browser = openWindow([], 'gyld.browser', SIZE);
  const browserTab = browser.list[0].tabs[0].id;
  const ask = openWindow(browser.list, 'gyld.ask', SIZE, 1, undefined, browserTab);
  const decide = openWindow(ask.list, 'gyld.decide', SIZE, 1, undefined, browserTab);
  const list = mergeWindows(decide.list, decide.id, ask.id);
  DesktopWindowsTap.set(list);
  DesktopFocusedTap.set(browser.id);
  const frame = list.find((w) => w.id === ask.id)!;
  return {
    frames: list.length,
    browser: browser.id,
    browserTab,
    inspector: frame.id,
    askTab: frame.tabs[0].id,
    decideTab: frame.tabs[1].id,
  };
}

function frames() {
  return DesktopWindowsTap.get();
}

describe('an act delivered to a window that is already open', () => {
  it('Ask about this focuses the Ask window, shows its tab and stamps it', () => {
    const desk = seed();
    expect(frames().find((w) => w.id === desk.inspector)!.activeTab).toBe(desk.decideTab);

    OpenWiredTap.get()!(desk.browserTab, { toolId: 'gyld.ask' });

    const list = frames();
    const inspector = list.find((w) => w.id === desk.inspector)!;
    expect(list).toHaveLength(desk.frames);          // the wire is reused, not respawned
    expect(inspector.activeTab).toBe(desk.askTab);   // ...and now on screen
    expect(inspector.attention).toBe(1);             // wearing the cue
    expect(DesktopFocusedTap.get()).toBe(desk.inspector);
    expect(list[list.length - 1].id).toBe(desk.inspector); // topmost
  });

  it('Ask a follow-up does the same for the decide window, on a new stamp', () => {
    const desk = seed();
    OpenWiredTap.get()!(desk.browserTab, { toolId: 'gyld.ask' });
    OpenWiredTap.get()!(desk.browserTab, { toolId: 'gyld.decide' });

    const list = frames();
    const inspector = list.find((w) => w.id === desk.inspector)!;
    expect(list).toHaveLength(desk.frames);
    expect(inspector.activeTab).toBe(desk.decideTab);
    // a NEW number, which is what replays the animation on a repeat act
    expect(inspector.attention).toBe(2);
    expect(DesktopFocusedTap.get()).toBe(desk.inspector);
  });

  it('a repeat of the same act stamps again rather than sitting still', () => {
    const desk = seed();
    OpenWiredTap.get()!(desk.browserTab, { toolId: 'gyld.ask' });
    OpenWiredTap.get()!(desk.browserTab, { toolId: 'gyld.ask' });
    expect(frames().find((w) => w.id === desk.inspector)!.attention).toBe(2);
  });

  it('a retarget reveals the window it was sent to', () => {
    const desk = seed();
    RetargetTabTap.get()!(desk.askTab, { stream: 'base', focus: 'key_custody' });

    const list = frames();
    const inspector = list.find((w) => w.id === desk.inspector)!;
    expect(inspector.activeTab).toBe(desk.askTab);
    expect(inspector.tabs[0].params).toEqual({ stream: 'base', focus: 'key_custody' });
    expect(inspector.attention).toBe(1);
    expect(DesktopFocusedTap.get()).toBe(desk.inspector);
  });

  it('marks only the window that answered, not every window an act touched', () => {
    const desk = seed();
    // the Gyld node menu's own order: move the browser, then open the sink
    RetargetTabTap.get()!(desk.browserTab, { stream: 'base', focus: 'key_custody' });
    OpenWiredTap.get()!(desk.browserTab, { toolId: 'gyld.ask' });

    const list = frames();
    expect(list.find((w) => w.id === desk.browser)!.attention).toBeUndefined();
    expect(list.filter((w) => w.attention !== undefined).map((w) => w.id))
      .toEqual([desk.inspector]);
  });

  it('opens and reveals when there is no window to reuse', () => {
    const desk = seed();
    OpenToolTap.get()!({ toolId: 'gyld.detail', params: { stream: 'base' } });

    const list = frames();
    expect(list).toHaveLength(desk.frames + 1);
    const opened = list[list.length - 1];
    expect(opened.tabs[0].facet).toBe('gyld.detail');
    expect(opened.activeTab).toBe(opened.tabs[0].id);
    expect(opened.attention).toBe(1);
    expect(DesktopFocusedTap.get()).toBe(opened.id);
  });
});

// The frame an act does NOT land on must come out of it untouched — the same
// element, scrolled where the reader left it. React moves a keyed child whose
// relative order changed, and a node that leaves the document loses the scroll
// position of everything inside it, so the guarantee is structural: the
// document order the desktop renders (ops.frameStack) does not depend on the
// z-order at all. Found on the Gyld stream tree, where a raise — the mousedown
// of the very pick being made — scrolled the tree back to the top under the
// reader's cursor.
describe('the frames keep their place in the document', () => {
  it('renders in an order the z-order cannot move', () => {
    const desk = seed();
    const before = frameStack(frames()).order.map((w) => w.id);

    DesktopWindowsTap.set(raiseWindow(frames(), desk.inspector));

    const after = frameStack(frames());
    expect(after.order.map((w) => w.id)).toEqual(before);
    // raised all the same: the z is where the order used to be
    expect(after.z.get(desk.inspector)).toBe(frames().length);
    expect(after.z.get(desk.browser)).toBeLessThan(frames().length);
  });

  it('keeps that order across a retarget that reveals another frame', () => {
    const desk = seed();
    DesktopWindowsTap.set(raiseWindow(frames(), desk.inspector));
    const before = frameStack(frames()).order.map((w) => w.id);

    RetargetTabTap.get()!(desk.browserTab, { stream: 'architecture', focus: '' });

    const after = frameStack(frames());
    expect(after.order.map((w) => w.id)).toEqual(before);
    // the reveal still happened: the browser is on top and wears the mark
    expect(after.z.get(desk.browser)).toBe(frames().length);
    expect(frames().find((w) => w.id === desk.browser)!.attention).toBe(1);
  });
});
