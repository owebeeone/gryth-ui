import { useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import {
  DESKTOP_OPEN_TOOL, DESKTOP_RETARGET_TAB, type OpenTool, type RetargetTab,
} from '@grythjs/plugin-api';
import {
  GYLD_DEST_PERSPECTIVE_TAP, GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP,
  GYLD_STREAMS, GYLD_TAB_ID,
} from '../grips';
import { browserLink } from '../browser/links';
import { keptPerspective } from '../browser/firstPick';
import type { GyldStreamsCensus } from '../store/state';

// "Show me that STREAM in the browser", for the stream manager.
//
// The same two cases `useBrowserFocus` tells apart, told apart by the same one
// fact arriving through the graph: a browser publishes its own tab id, so a
// window wired to one resolves a non-empty `Gyld.Tab.Id` and a standalone
// window resolves the empty default. What differs is what moves: the record
// there, the whole destination here.
//
//  - WIRED: write the SOURCE tab's `Gyld.Dest.Stream` handle, which the sink
//    resolves because it seeds none of its own, and call `Desktop.RetargetTab`
//    so the tab RECORD carries the new stream and the window rehydrates on it
//    after a reload. NOTHING is opened: a pick moves the browser that is
//    already on stage, which is the window policy the owner settled for this
//    tree. A reader who wants a SECOND browser opens one from the launcher,
//    the way a second of any tool is opened; this window offers no affordance
//    of its own for it and never opens one behind a pick.
//  - STANDALONE: there is no browser to move, so one opens. That is the only
//    path here that opens a window at all, and it is exactly the case where
//    the desk has no browser to show the stream in.
//
// The Gyld target's desk opens its tree WIRED to its browser (entries/gyld/
// desk.ts), so the first case is the ordinary one and the second is what a
// desk whose browser has been closed falls back to.

export interface StreamTarget {
  /** The tab id of the browser this window is wired to, or '' when it is not. */
  wiredTo: string;
  /** The stream that browser is on, so a row can say which one is shown. */
  showing: string;
  /** Whether a write can land at all, so a button can say it cannot. */
  ready: boolean;
  show(stream: string): void;
}

/**
 * Everything one pick in the tree writes through, resolved from the graph by
 * the hook below and passed whole so the ACT can be asserted without a click:
 * this package renders to static markup and dispatches no events.
 */
export interface StreamTargetHandles {
  /** The browser this window is wired to, or '' when it is not. */
  wiredTo: string;
  census?: GyldStreamsCensus;
  /** The WIRED browser's own destination handles, resolved through the wire. */
  stream?: AtomTapHandle<string>;
  perspective?: AtomTapHandle<string>;
  retarget?: RetargetTab;
  openTool?: OpenTool;
}

/**
 * Show one stream: retarget the wired browser, or open one when there is none.
 *
 * The perspective the browser is on TRAVELS where the stream being moved to
 * emitted it, and gives way to the first-pick rule where it did not
 * (`browser/firstPick.ts`, `keptPerspective`). Both answers come off that
 * stream's own manifest, so neither is a Gyld fact this window invented.
 */
export function showStream(on: StreamTargetHandles, stream: string): void {
  if (on.wiredTo === '') {
    // No browser to move: one opens, on that stream and NO perspective. An
    // unset perspective is a rendered state that the new window's own first
    // pick fills from the stream's manifest.
    on.openTool?.(browserLink({ stream, perspective: '', focus: '' }));
    return;
  }
  // Read the perspective back through the HANDLE, never a render closure: two
  // picks can land inside one notification cycle, and the second would
  // otherwise be composed against the destination the first one left
  // (CodingRules.md).
  const held = on.perspective?.get() ?? '';
  const next = keptPerspective(on.census, stream, held);
  on.stream?.set(stream);
  on.perspective?.set(next);
  on.retarget?.(on.wiredTo, { stream, perspective: next, focus: '' });
}

export function useStreamTarget(): StreamTarget {
  const wiredTo = useGrip(GYLD_TAB_ID) ?? '';
  const showing = useGrip(GYLD_DEST_STREAM) ?? '';
  const census = useGrip(GYLD_STREAMS);
  const stream = useGrip(GYLD_DEST_STREAM_TAP) as AtomTapHandle<string> | undefined;
  const perspective = useGrip(GYLD_DEST_PERSPECTIVE_TAP) as AtomTapHandle<string> | undefined;
  const retarget = useGrip(DESKTOP_RETARGET_TAB);
  const openTool = useGrip(DESKTOP_OPEN_TOOL);
  const wired = wiredTo !== '';
  const handles: StreamTargetHandles = {
    wiredTo, census, stream, perspective, retarget, openTool,
  };
  return {
    wiredTo,
    showing: wired ? showing : '',
    ready: wired ? stream !== undefined : openTool !== undefined,
    show(pick: string): void {
      showStream(handles, pick);
    },
  };
}
