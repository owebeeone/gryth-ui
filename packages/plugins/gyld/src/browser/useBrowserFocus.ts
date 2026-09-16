import { useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import {
  DESKTOP_OPEN_TOOL, DESKTOP_OPEN_WIRED, DESKTOP_RETARGET_TAB,
  type OpenTool, type OpenWired, type RetargetTab,
} from '@grythjs/plugin-api';
import {
  GYLD_DEST_PERSPECTIVE, GYLD_DEST_REF_TAP, GYLD_DEST_STREAM, GYLD_TAB_ID,
} from '../grips';
import { GYLD_DECIDE_TOOL, GYLD_DETAIL_TOOL } from '../tools';
import { browserLink, questionParams, recordParams } from './links';

// "Show me that record in the browser", "answer that question", and "show me
// its record", for any window that can reach a browser — including the browser
// itself, which seeds its own tab id and so takes the wired path on its own
// boxes.
//
// Two cases, told apart by ONE fact that arrives through the graph: a browser
// publishes its own tab id, so a window wired to one resolves a non-empty
// Gyld.Tab.Id and a standalone window resolves the empty default.
//
//  - WIRED: the sink also resolves the SOURCE tab's Gyld.Dest.Ref handle,
//    because it seeds none of its own. Writing that handle moves the browser
//    itself, which is the contract's own answer to retargeting ("a write to
//    that window context's seeded handle"). `Desktop.RetargetTab` is called as
//    well so the TAB RECORD carries the new focus and the window rehydrates on
//    it after a reload. It is the grip write that moves the live window: the
//    desktop builds a tab's seeds once, from the params the tab was CREATED
//    with (packages/desktop/src/tabContexts.ts), and does not re-seed them
//    when a retarget changes the record.
//  - STANDALONE: there is no browser to move, so a new one is opened on the
//    same stream, the same perspective and this record (window policy v1: a
//    link always opens a new window).
//
// The three acts are PURE functions over the handles, and the hook is the
// thing that resolves the handles: this package renders to static markup and
// dispatches no click, so what a press does is asserted by calling the act
// (the shape `streams/useStreamTarget.ts` already uses).

/** Everything one of the acts below writes through, passed whole. */
export interface BrowserFocusHandles {
  /** The browser this window can move, or '' when there is none. */
  wiredTo: string;
  stream: string;
  perspective: string;
  /** That browser's own record handle, resolved through the wire. */
  ref?: AtomTapHandle<string>;
  retarget?: RetargetTab;
  openTool?: OpenTool;
  openWired?: OpenWired;
}

/** Move the wired browser onto one record: the live window through its own
 *  handle, and its tab record so a reload comes back on it. */
function move(on: BrowserFocusHandles, slot: string): void {
  on.ref?.set(slot);
  on.retarget?.(on.wiredTo, {
    stream: on.stream, perspective: on.perspective, focus: slot,
  });
}

export function focusOn(on: BrowserFocusHandles, slot: string): void {
  if (on.wiredTo !== '') {
    move(on, slot);
    return;
  }
  on.openTool?.(browserLink({ stream: on.stream, perspective: on.perspective, focus: slot }));
}

/**
 * Open `gyld.decide` on one question.
 *
 * WIRED: the browser is moved to the question first and the decide window is
 * opened wired to that same browser, so it answers on the stream the browser
 * is on and opens on the record it now has focused, with no param copied —
 * the answer form defaults its question to that `Gyld.Dest.Ref`. A decide
 * window already wired to that browser is left where it is and follows the
 * move, which is what `Desktop.OpenWired` does on a repeat.
 * STANDALONE: there is no browser to move, so the window is opened on the
 * link spec section 2 writes down, `{ stream, question }`.
 */
export function decideOn(on: BrowserFocusHandles, slot: string): void {
  if (on.wiredTo !== '') {
    move(on, slot);
    on.openWired?.(on.wiredTo, { toolId: GYLD_DECIDE_TOOL });
    return;
  }
  on.openTool?.({ toolId: GYLD_DECIDE_TOOL, params: questionParams(on.stream, slot) });
}

/** The same, for `gyld.detail`: the record window this browser already has,
 *  moved onto this record, or a new one when there is no browser to wire to. */
export function detailOn(on: BrowserFocusHandles, slot: string): void {
  if (on.wiredTo !== '') {
    move(on, slot);
    on.openWired?.(on.wiredTo, { toolId: GYLD_DETAIL_TOOL });
    return;
  }
  on.openTool?.({ toolId: GYLD_DETAIL_TOOL, params: recordParams(on.stream, slot) });
}

export interface BrowserFocus {
  /** The tab id of the browser this window is wired to, or '' when it is not. */
  wiredTo: string;
  /** Whether a focus write can land at all, so a button can say it cannot. */
  ready: boolean;
  focus(slot: string): void;
  /** Whether a decide window can be opened at all, same reason. */
  decideReady: boolean;
  decide(slot: string): void;
  /** Whether a record window can be opened or retargeted, same reason. */
  detailReady: boolean;
  detail(slot: string): void;
  /**
   * Whether the Ask window can be opened at all.
   *
   * `gyld.ask` is declared in step 0.3 of GyldAskAgent.md; until it exists
   * there is nothing to open, so the menu's `Ask about this` is OFFERED and
   * disabled with that as its reason rather than quietly hidden (MDV-7: an
   * omission is said, never swallowed).
   */
  askReady: boolean;
  ask(slot: string): void;
}

export function useBrowserFocus(): BrowserFocus {
  const stream = useGrip(GYLD_DEST_STREAM) ?? '';
  const perspective = useGrip(GYLD_DEST_PERSPECTIVE) ?? '';
  const wiredTo = useGrip(GYLD_TAB_ID) ?? '';
  const refTap = useGrip(GYLD_DEST_REF_TAP) as AtomTapHandle<string> | undefined;
  const retarget = useGrip(DESKTOP_RETARGET_TAB);
  const openTool = useGrip(DESKTOP_OPEN_TOOL);
  const openWired = useGrip(DESKTOP_OPEN_WIRED);
  const wired = wiredTo !== '';
  const handles: BrowserFocusHandles = {
    wiredTo, stream, perspective, ref: refTap, retarget, openTool, openWired,
  };
  const throughWire = wired ? openWired !== undefined : openTool !== undefined && stream !== '';
  return {
    wiredTo,
    ready: wired ? refTap !== undefined : openTool !== undefined,
    focus(slot: string): void {
      focusOn(handles, slot);
    },
    decideReady: throughWire,
    decide(slot: string): void {
      decideOn(handles, slot);
    },
    detailReady: throughWire,
    detail(slot: string): void {
      detailOn(handles, slot);
    },
    askReady: false,
    ask(slot: string): void {
      // Step 0.3 opens `gyld.ask` here, wired to this browser. Nothing yet:
      // `askReady` is false, so no entry can reach this.
      void slot;
    },
  };
}
