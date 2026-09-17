import { describe, it, expect } from 'vitest';
import type { AtomTapHandle, Drip, Grip } from '@owebeeone/grip-react';
import { readDecideNow, readLens, type GyldDecideNow } from '../contract';
import { GYLD_DECIDE_NOW, GYLD_LENS, GYLD_TAB_HOVER_TAP, GYLD_TAB_MENU, GYLD_TAB_MENU_TAP } from '../grips';
import { GyldBrowser } from '../GyldBrowser';
import { buildScene } from '../lens/scene';
import { cardFor } from './card';
import { browserTabTaps } from './browserTabTaps';
import { nextUpOf } from './nextUp';
import {
  MENU_CLOSED, MenuAct, addsToSelection, closeMenu, isMenuOpen, menuEntries, openMenuOn,
  type GyldNodeMenu,
} from './menu';
import { opensMenu } from './menu';
import type { BrowserFocus } from './useBrowserFocus';
import type { GyldLensState, GyldValue } from '../store/state';
import { STATIC_SET, mountDesk } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';
import decisionsFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';
import decideNowFixture from '../../test/fixtures/bundle/streams/base/decide-now.json';

// Step 0.2 of GyldAskAgent.md: the gesture and the menu.
//
// The open / dismiss / replace rule is arithmetic over one atom and is
// asserted without a picture; what the menu OFFERS is a projection over the
// node card's own view, so it is asserted without a desk. The rendered menu is
// asserted through the browser window, which this package renders to static
// markup — no click is dispatched anywhere, so every press is stated by
// calling the act.

const lens = readLens(decisionsFixture);
const decideNow = readDecideNow(decideNowFixture);
const KEY_CUSTODY = 'glade_decisions:GladeDecisions.key_custody';
const VERSION_PIN = 'glade_decisions:GladeDecisions.version_pin';

const scene = buildScene(lens, { nextUp: nextUpOf(lens, decideNow) });
const nodeAt = (slot: string) => scene.nodes.find((node) => node.slot === slot)!;

/** A box this stream's decide-now list does NOT carry a row for: an
 *  alternative, which is drawn and is not a question. */
const unlisted = scene.nodes.find(
  (node) => node.slot !== '' && !decideNow.questions.some((row) => row.slot === node.slot),
)!;

/** A desk that can carry every act out. The hook resolves these from grips;
 *  the acts are asserted by calling them, so a test states them directly. */
function focusOn(overrides: Partial<BrowserFocus> = {}): BrowserFocus & { done: string[] } {
  const done: string[] = [];
  return {
    done,
    wiredTo: 'browser-1',
    ready: true,
    focus: (slot: string) => done.push(`focus:${slot}`),
    decideReady: true,
    decide: (slot: string) => done.push(`decide:${slot}`),
    detailReady: true,
    detail: (slot: string) => done.push(`detail:${slot}`),
    askReady: true,
    ask: (slot: string) => done.push(`ask:${slot}`),
    ...overrides,
  };
}

/** ONE bundle image for the file. Nothing below rewrites a byte of it, and
 *  re-serializing the fixture set per desk is most of what a mount costs. */
const image = new FakeBundle();
const desk = () => mountDesk(STATIC_SET, image);

const settled = async <T,>(read: () => T, done: (value: T) => boolean): Promise<T> => {
  await expect.poll(() => done(read())).toBe(true);
  return read();
};

const drawn = async (tab: { read: <T>(grip: Grip<T>) => Drip<T> }): Promise<void> => {
  await settled(
    () => tab.read(GYLD_LENS).get() as GyldLensState,
    (state) => state?.status === 'ok',
  );
  await settled(
    () => tab.read(GYLD_DECIDE_NOW).get() as GyldValue<GyldDecideNow> | undefined,
    (value) => value !== undefined && value.status !== 'unset' && value.status !== 'loading',
  );
};

// The box a gesture resolved, in the lens's own user units: the menu records
// the whole rectangle, because the placement rule puts the panel on whichever
// EDGE of it leaves the least of the menu off the stage (./placement.ts).
const BOX = {
  x: 120, y: 48, width: 96, height: 40,
};
const OTHER = {
  x: 300, y: 210, width: 120, height: 36,
};

describe('one atom, one menu: the open, dismiss and replace rule', () => {
  it('opens on a box at the anchor the gesture resolved', () => {
    const menu = openMenuOn(KEY_CUSTODY, BOX);
    expect(menu).toEqual({ slot: KEY_CUSTODY, ...BOX });
    expect(isMenuOpen(menu)).toBe(true);
  });

  it('REPLACES rather than stacking when another box is picked', () => {
    const first = openMenuOn(KEY_CUSTODY, BOX);
    const second = openMenuOn(VERSION_PIN, OTHER);
    expect(second.slot).toBe(VERSION_PIN);
    expect(second).not.toEqual(first);
  });

  it('re-anchors when the same box is picked again', () => {
    expect(openMenuOn(KEY_CUSTODY, OTHER)).toEqual({ slot: KEY_CUSTODY, ...OTHER });
  });

  it('DISMISSES when the gesture resolved no box', () => {
    expect(openMenuOn('', BOX)).toBe(MENU_CLOSED);
    expect(isMenuOpen(openMenuOn('', BOX))).toBe(false);
  });

  it('closes to the one closed value, which is a rendered state', () => {
    expect(closeMenu()).toBe(MENU_CLOSED);
    expect(MENU_CLOSED.slot).toBe('');
    expect(isMenuOpen(MENU_CLOSED)).toBe(false);
    expect(isMenuOpen(undefined)).toBe(false);
  });
});

describe('the one collision, named: shift opens the menu, meta selects', () => {
  const keys = (held: Partial<{ shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }>) => ({
    shiftKey: false, metaKey: false, ctrlKey: false, ...held,
  });

  it('gives shift-click to the menu', () => {
    expect(opensMenu(keys({ shiftKey: true }))).toBe(true);
    expect(opensMenu(keys({ metaKey: true }))).toBe(false);
    expect(opensMenu(keys({}))).toBe(false);
  });

  it('narrows the additive selection modifier to meta or ctrl', () => {
    // The change this feature makes to a documented gesture, stated once:
    // shift no longer adds to the selection.
    expect(addsToSelection(keys({ shiftKey: true }))).toBe(false);
    expect(addsToSelection(keys({ metaKey: true }))).toBe(true);
    expect(addsToSelection(keys({ ctrlKey: true }))).toBe(true);
    expect(addsToSelection(keys({}))).toBe(false);
  });
});

describe('what the menu offers over one box', () => {
  it('offers the four entries of section 2, in its order, on a listed box', () => {
    const card = cardFor(nodeAt(KEY_CUSTODY), decideNow, undefined);
    const entries = menuEntries(card, focusOn());
    expect(entries.map((entry) => entry.label)).toEqual([
      'Ask about this', 'Answer', 'Ask a follow-up', 'Details',
    ]);
    expect(entries.every((entry) => entry.enabled)).toBe(true);
  });

  it('offers no Answer on a box this stream lists no row for', () => {
    const card = cardFor(unlisted, decideNow, undefined);
    expect(card.listed).toBe(false);
    const entries = menuEntries(card, focusOn());
    expect(entries.map((entry) => entry.act)).not.toContain(MenuAct.ANSWER);
    // and the acts that need no row are still there, so nothing is hidden
    expect(entries.map((entry) => entry.label))
      .toEqual(['Ask about this', 'Ask a follow-up', 'Details']);
  });

  it('offers Answer disabled, with the EMITTED reason, on a blocked row', () => {
    const blocked = decideNow.questions.find((row) => !row.answerable_now)!;
    const card = cardFor(nodeAt(blocked.slot), decideNow, undefined);
    const answer = menuEntries(card, focusOn()).find((entry) => entry.act === MenuAct.ANSWER)!;
    expect(answer.enabled).toBe(false);
    // the title is the card's own single emitted reason, not a new sentence
    expect(answer.title).toBe(card.blocked);
    expect(answer.title).not.toBe('');
  });

  it('says a desk that cannot open a window cannot, rather than hiding it', () => {
    const card = cardFor(nodeAt(KEY_CUSTODY), decideNow, undefined);
    const entries = menuEntries(card, focusOn({ decideReady: false, detailReady: false }));
    expect(entries).toHaveLength(4);
    expect(entries.filter((entry) => entry.enabled).map((entry) => entry.label))
      .toEqual(['Ask about this']);
  });

  it('carries each act out through the browser the window resolved', () => {
    const card = cardFor(nodeAt(KEY_CUSTODY), decideNow, undefined);
    const browser = focusOn();
    for (const entry of menuEntries(card, browser)) {
      entry.act.perform(browser, card.slot);
    }
    expect(browser.done).toEqual([
      `ask:${KEY_CUSTODY}`,
      `decide:${KEY_CUSTODY}`,
      `decide:${KEY_CUSTODY}`,
      `detail:${KEY_CUSTODY}`,
    ]);
  });

  it('names every act, so a press site never spells one out', () => {
    expect(MenuAct.ALL.map((act) => act.name))
      .toEqual(['ask', 'answer', 'follow-up', 'details']);
    expect(MenuAct.byName('answer')).toBe(MenuAct.ANSWER);
    expect(MenuAct.byName('nothing')).toBeUndefined();
  });
});

describe('the browser window seeds the menu and draws it', () => {
  it('seeds Gyld.Tab.Menu closed, with a handle to write it', async () => {
    const tab = desk().tab('menu-seed', browserTabTaps('menu-seed', {
      stream: 'base', perspective: 'decisions',
    }));
    await expect.poll(() => tab.read(GYLD_TAB_MENU).get()).toBe(MENU_CLOSED);
    const handle = tab.read(GYLD_TAB_MENU_TAP).get() as AtomTapHandle<GyldNodeMenu>;
    expect(handle).toBeDefined();
    handle.set(openMenuOn(KEY_CUSTODY, BOX));
    expect(tab.read(GYLD_TAB_MENU).get()?.slot).toBe(KEY_CUSTODY);
  });

  it('draws the four entries over the box the menu is open on', async () => {
    const tab = desk().tab('menu-draw', browserTabTaps('menu-draw', {
      stream: 'base', perspective: 'decisions',
    }));
    await drawn(tab);
    (tab.read(GYLD_TAB_MENU_TAP).get() as AtomTapHandle<GyldNodeMenu>)
      .set(openMenuOn(KEY_CUSTODY, BOX));
    const markup = tab.render(<GyldBrowser tabId="menu-draw" />);
    expect(markup).toContain(`<ul class="gyld-node-menu" data-slot="${KEY_CUSTODY}"`);
    for (const act of ['ask', 'answer', 'follow-up', 'details']) {
      expect(markup).toContain(`data-act="${act}"`);
    }
    expect(markup).toContain('Ask about this');
    expect(markup).toContain('Ask a follow-up');
  });

  it('draws no Answer over a box this stream lists no row for', async () => {
    const tab = desk().tab('menu-unlisted', browserTabTaps('menu-unlisted', {
      stream: 'base', perspective: 'decisions',
    }));
    await drawn(tab);
    (tab.read(GYLD_TAB_MENU_TAP).get() as AtomTapHandle<GyldNodeMenu>)
      .set(openMenuOn(unlisted.slot, BOX));
    const markup = tab.render(<GyldBrowser tabId="menu-unlisted" />);
    expect(markup).toContain('<ul class="gyld-node-menu"');
    expect(markup).not.toContain('data-act="answer"');
    expect(markup).toContain('data-act="ask"');
    expect(markup).toContain('not a question this stream lists');
  });

  it('suppresses the hover card while the menu is open, so neither stacks', async () => {
    const tab = desk().tab('menu-hover', browserTabTaps('menu-hover', {
      stream: 'base', perspective: 'decisions',
    }));
    await drawn(tab);
    const hoverTap = tab.read(GYLD_TAB_HOVER_TAP).get() as AtomTapHandle<string>;
    hoverTap.set(nodeAt(KEY_CUSTODY).id);
    // the card is what a hover draws, while nothing else is open
    expect(tab.render(<GyldBrowser tabId="menu-hover" />)).toContain('gyld-node-card');

    (tab.read(GYLD_TAB_MENU_TAP).get() as AtomTapHandle<GyldNodeMenu>)
      .set(openMenuOn(KEY_CUSTODY, BOX));
    const withMenu = tab.render(<GyldBrowser tabId="menu-hover" />);
    expect(withMenu).toContain('gyld-node-menu');
    expect(withMenu).not.toContain('gyld-node-card');
  });

  it('draws nothing for a slot this picture does not draw', async () => {
    const tab = desk().tab('menu-gone', browserTabTaps('menu-gone', {
      stream: 'base', perspective: 'decisions',
    }));
    await drawn(tab);
    (tab.read(GYLD_TAB_MENU_TAP).get() as AtomTapHandle<GyldNodeMenu>)
      .set(openMenuOn('glade_decisions:GladeDecisions.nothing_here', BOX));
    expect(tab.render(<GyldBrowser tabId="menu-gone" />)).not.toContain('gyld-node-menu');
  });
});
