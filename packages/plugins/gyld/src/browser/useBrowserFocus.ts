import { useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import {
  DESKTOP_OPEN_TOOL, DESKTOP_OPEN_WIRED, DESKTOP_RETARGET_TAB,
} from '@grythjs/plugin-api';
import {
  GYLD_DEST_PERSPECTIVE, GYLD_DEST_REF_TAP, GYLD_DEST_STREAM, GYLD_TAB_ID,
} from '../grips';
import { GYLD_DECIDE_TOOL } from '../tools';
import { browserLink, questionParams } from './links';

// "Show me that record in the browser", and "answer that question", for a
// window that is not the browser.
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

export interface BrowserFocus {
  /** The tab id of the browser this window is wired to, or '' when it is not. */
  wiredTo: string;
  /** Whether a focus write can land at all, so a button can say it cannot. */
  ready: boolean;
  focus(slot: string): void;
  /** Whether a decide window can be opened at all, same reason. */
  decideReady: boolean;
  /**
   * Open `gyld.decide` on one question.
   *
   * WIRED: the browser is moved to the question first and the decide window is
   * opened wired to that same browser, so it answers on the stream the browser
   * is on and opens on the record it now has focused, with no param copied. A
   * decide window already wired to that browser is left where it is and
   * follows the move, which is what `Desktop.OpenWired` does on a repeat.
   * STANDALONE: there is no browser to move, so the window is opened on the
   * link spec section 2 writes down, `{ stream, question }`.
   */
  decide(slot: string): void;
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
  const move = (slot: string): void => {
    refTap?.set(slot);
    retarget?.(wiredTo, { stream, perspective, focus: slot });
  };
  return {
    wiredTo,
    ready: wired ? refTap !== undefined : openTool !== undefined,
    focus(slot: string): void {
      if (wired) {
        move(slot);
        return;
      }
      openTool?.(browserLink({ stream, perspective, focus: slot }));
    },
    decideReady: wired ? openWired !== undefined : openTool !== undefined && stream !== '',
    decide(slot: string): void {
      if (wired) {
        move(slot);
        openWired?.(wiredTo, { toolId: GYLD_DECIDE_TOOL });
        return;
      }
      openTool?.({ toolId: GYLD_DECIDE_TOOL, params: questionParams(stream, slot) });
    },
  };
}
