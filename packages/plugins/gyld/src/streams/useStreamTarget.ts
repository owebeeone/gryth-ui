import { useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import { DESKTOP_OPEN_TOOL, DESKTOP_RETARGET_TAB } from '@grythjs/plugin-api';
import {
  GYLD_DEST_PERSPECTIVE, GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP, GYLD_TAB_ID,
} from '../grips';
import { browserLink } from '../browser/links';

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
//    after a reload. The perspective the browser is on travels unchanged: a
//    stream that does not emit it says so, and this window will not pick a
//    different perspective on the reader's behalf.
//  - STANDALONE: there is no browser to move, so one opens on that stream with
//    NO perspective. An unset perspective is a rendered state and the picker
//    fills it in; guessing one here would be inventing a Gyld fact.

export interface StreamTarget {
  /** The tab id of the browser this window is wired to, or '' when it is not. */
  wiredTo: string;
  /** The stream that browser is on, so a row can say which one is shown. */
  showing: string;
  /** Whether a write can land at all, so a button can say it cannot. */
  ready: boolean;
  show(stream: string): void;
}

export function useStreamTarget(): StreamTarget {
  const wiredTo = useGrip(GYLD_TAB_ID) ?? '';
  const showing = useGrip(GYLD_DEST_STREAM) ?? '';
  const perspective = useGrip(GYLD_DEST_PERSPECTIVE) ?? '';
  const streamTap = useGrip(GYLD_DEST_STREAM_TAP) as AtomTapHandle<string> | undefined;
  const retarget = useGrip(DESKTOP_RETARGET_TAB);
  const openTool = useGrip(DESKTOP_OPEN_TOOL);
  const wired = wiredTo !== '';
  return {
    wiredTo,
    showing: wired ? showing : '',
    ready: wired ? streamTap !== undefined : openTool !== undefined,
    show(stream: string): void {
      if (wired) {
        streamTap?.set(stream);
        retarget?.(wiredTo, { stream, perspective, focus: '' });
        return;
      }
      openTool?.(browserLink({ stream, perspective: '', focus: '' }));
    },
  };
}
