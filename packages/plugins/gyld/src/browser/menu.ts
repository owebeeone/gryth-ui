import type { Box } from '../lens/geometry';
import type { NodeCardView } from './card';
import type { BrowserFocus } from './useBrowserFocus';

// The node menu: the acts on a box, reached by a right-click or a shift-click
// (GyldAskAgent.md section 2, owner ruling A1 of 2026-09-16).
//
// Everything here is PURE. The state is one per-tab atom, the open/dismiss/
// replace rule is arithmetic over it, and what the menu OFFERS is a projection
// over the node card's own view — which is itself a projection over emitted
// data. Nothing in this file decides a Gyld fact: the entries only open
// windows, and which of them is offered follows the stream's own decide-now
// list rather than a judgement about the box.
//
// The card is not replaced. The card stays for READING — the question's drawn
// text, its alternatives with the lean marked, the one emitted reason it is
// not answerable — and the menu is for ACTING, which is why a window
// suppresses its card while its menu is open rather than stacking the two.

/**
 * Which box this window's menu is open over, and the box it is anchored ON.
 *
 * The rectangle is the node's own emitted `box`, in the LENS's own user units,
 * so the view anchors the menu through the camera exactly as it anchors the
 * card: HTML over the picture, no geometry added and nothing repositioned
 * (MDV-4). It is the whole box and not one corner of it because the placement
 * rule puts the menu on whichever EDGE of it leaves the least of the menu off
 * the stage (./placement.ts), and a corner cannot say where the other edges
 * are.
 *
 * The slot is the QUALIFIED SLOT, because that is the identity that survives a
 * restream (R1) and the one the picture, the decide-now list and every act
 * share.
 */
export interface GyldNodeMenu {
  slot: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** No menu open. An empty slot is a RENDERED STATE, not a default: a window
 *  with this value draws no menu and draws its hover card instead. */
export const MENU_CLOSED: GyldNodeMenu = Object.freeze({
  slot: '', x: 0, y: 0, width: 0, height: 0,
});

export function isMenuOpen(menu: GyldNodeMenu | undefined): boolean {
  return menu !== undefined && menu.slot !== '';
}

/**
 * The whole open / dismiss / replace rule, as one function.
 *
 * One atom means one menu per window: opening over another box REPLACES the
 * held one rather than stacking a second, and a gesture that resolved no box
 * DISMISSES. Re-opening over the same box re-anchors it, which is what a
 * second right-click on a moved picture should do.
 */
export function openMenuOn(slot: string, box: Box): GyldNodeMenu {
  if (slot === '') {
    return MENU_CLOSED;
  }
  return {
    slot, x: box.x, y: box.y, width: box.width, height: box.height,
  };
}

/** The dismissal every path shares: a click on the picture, `Escape`, a pan
 *  start, and a pick made from the menu itself. */
export function closeMenu(): GyldNodeMenu {
  return MENU_CLOSED;
}

/** The modifier keys one gesture on the picture carried. Structural, so the
 *  two rules below are stated — and asserted — without a DOM event. */
export interface GestureKeys {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

/**
 * ONE COLLISION, NAMED (section 2).
 *
 * `LensView` read `event.shiftKey || event.metaKey` for the ADDITIVE selection
 * modifier. Owner ruling A1 gives shift-click to the menu, so the additive
 * modifier narrows to meta or ctrl. Both halves of that trade live here, side
 * by side, so neither can be changed without the other being read.
 */
export function opensMenu(keys: GestureKeys): boolean {
  return keys.shiftKey;
}

export function addsToSelection(keys: GestureKeys): boolean {
  return keys.metaKey || keys.ctrlKey;
}

/**
 * One act of the menu.
 *
 * An act is an OBJECT, not a label branched on at the press site (AGENTS.md,
 * "no magic strings when the concept has semantics"): each one owns its own
 * words, whether the stream's decide-now list has to carry a row for it to be
 * offered at all, whether the desk can carry it out right now, and what it
 * does. Adding a fifth is one more instance here and no change at the call
 * site.
 *
 * Three of the four are the node card's own acts reached a second way
 * (`useBrowserFocus`, `decideOn` and `detailOn`), which is the point: the
 * menu adds a gesture, not a second meaning.
 */
export class MenuAct {
  private constructor(
    /** The stable name, used as the React key and the `data-act` attribute. */
    readonly name: string,
    readonly label: string,
    /** Whether this act needs the stream to list a decide-now ROW for the box.
     *  An act that needs one is not OFFERED at all on a box with no row: a
     *  disabled Answer on something that is not a question this stream lists
     *  would read as "not answerable", which is a different Gyld fact. */
    readonly needsRow: boolean,
    private readonly readyWith: (browser: BrowserFocus, card: NodeCardView) => boolean,
    private readonly saysWith: (card: NodeCardView) => string,
    private readonly actWith: (browser: BrowserFocus, slot: string) => void,
  ) {}

  /** Whether the desk can carry this act out at all, so the entry can say it
   *  cannot rather than doing nothing when pressed. */
  ready(browser: BrowserFocus, card: NodeCardView): boolean {
    return this.readyWith(browser, card);
  }

  /** The entry's own title: what pressing it will do, or the emitted reason it
   *  cannot be pressed. */
  says(card: NodeCardView): string {
    return this.saysWith(card);
  }

  perform(browser: BrowserFocus, slot: string): void {
    this.actWith(browser, slot);
  }

  /**
   * Open `gyld.ask` on this record and this stream, with the envelope composed
   * and the question box focused (section 2).
   *
   * The window itself lands in step 0.3, so `BrowserFocus.ask` is optional
   * until then and the entry is offered and disabled with that as its reason.
   * A menu that hid the entry would be a window hiding an omission (MDV-7).
   */
  static readonly ASK = new MenuAct(
    'ask',
    'Ask about this',
    false,
    (browser) => browser.askReady,
    (card) => `ask the agent about ${card.label}, with this record's context`,
    (browser, slot) => browser.ask(slot),
  );

  /** `useBrowserFocus().decide(slot)`, the card's own `Answer`. */
  static readonly ANSWER = new MenuAct(
    'answer',
    'Answer',
    true,
    (browser, card) => browser.decideReady && card.answerable,
    (card) => (card.answerable ? 'answer this question in the decide window' : card.blocked),
    (browser, slot) => browser.decide(slot),
  );

  /** The same act, landing on the ask form: the card's own `Ask a follow-up`. */
  static readonly FOLLOW_UP = new MenuAct(
    'follow-up',
    'Ask a follow-up',
    false,
    (browser) => browser.decideReady,
    () => 'ask a new question in the decide window, which lists this one to tick as a prerequisite',
    (browser, slot) => browser.decide(slot),
  );

  /** `useBrowserFocus().detail(slot)`, the card's own `Details`. */
  static readonly DETAILS = new MenuAct(
    'details',
    'Details',
    false,
    (browser) => browser.detailReady,
    () => 'this record in the detail window',
    (browser, slot) => browser.detail(slot),
  );

  /** The four entries of section 2's table, in its order. */
  static readonly ALL: readonly MenuAct[] = Object.freeze([
    MenuAct.ASK, MenuAct.ANSWER, MenuAct.FOLLOW_UP, MenuAct.DETAILS,
  ]);

  static byName(name: string): MenuAct | undefined {
    return MenuAct.ALL.find((act) => act.name === name);
  }
}

/** One offered entry, ready to draw: the act, the words it says and whether
 *  this desk can carry it out. */
export interface MenuEntry {
  act: MenuAct;
  label: string;
  title: string;
  enabled: boolean;
}

/**
 * What the menu offers over one box.
 *
 * The only thing withheld is an act that needs a decide-now ROW on a box this
 * stream's list does not carry. Everything else is offered and, where the desk
 * cannot carry it out, disabled with the reason said — the same rule the card
 * follows, so the two surfaces never disagree about one box.
 */
export function menuEntries(card: NodeCardView, browser: BrowserFocus): MenuEntry[] {
  return MenuAct.ALL
    .filter((act) => card.listed || !act.needsRow)
    .map((act) => ({
      act,
      label: act.label,
      title: act.says(card),
      enabled: act.ready(browser, card),
    }));
}
