import type { AtomTapHandle } from '@owebeeone/grip-react';
import type { RetargetTab } from '@grythjs/plugin-api';
import { PreviewPerspective } from '../preview/neighbourhood';
import type { PerspectiveOption } from './perspectives';

// What one pick in the browser's OWN chrome changes, as pure acts over
// handles — the shape `../streams/useStreamTarget` already uses for the stream
// tree's pick, so both places that move a browser move it the same way and
// both are asserted without a click (this package dispatches no events).
//
// A window's live destination lives in its TAB CONTEXT (`browserTabTaps`),
// seeded from the tab record's params when the tab was created. So a pick made
// here leaves the RECORD on whatever the window was opened with, and a desk
// restored from that record reopens the window somewhere the reader has not
// been for an hour. Each act therefore folds the new destination back into the
// record through `Desktop.RetargetTab` — the same intent the stream tree calls
// for the same reason, and the reason no new desktop intent is added here:
// these four params ARE a browser link (`./links`, `browserLink`), so
// replacing them wholesale loses nothing.

export interface DestinationHandles {
  /** This window's own tab, so a pick can be folded back into its record. */
  tabId: string;
  stream?: AtomTapHandle<string>;
  perspective?: AtomTapHandle<string>;
  preview?: AtomTapHandle<string>;
  retarget?: RetargetTab;
}

/**
 * The destination params a browser window's tab record carries after a pick.
 *
 * Read back through the HANDLES rather than off a render closure: two picks
 * can land inside one notification cycle and the second would otherwise record
 * the destination the first one left (CodingRules.md).
 *
 * The focus record is NOT among them. It is camera-side state — what is
 * selected in the picture — and a restored window comes back on the
 * destination it was left on, not on the box that was clicked in it.
 */
export function destinationParams(on: DestinationHandles): Record<string, unknown> {
  return {
    stream: on.stream?.get() ?? '',
    perspective: on.perspective?.get() ?? '',
    preview: on.preview?.get() ?? '',
    focus: '',
  };
}

function record(on: DestinationHandles): void {
  on.retarget?.(on.tabId, destinationParams(on));
}

/** Show another stream in THIS window. */
export function pickStream(on: DestinationHandles, stream: string): void {
  on.stream?.set(stream);
  record(on);
}

/**
 * Show another perspective in THIS window.
 *
 * Two writes, one gesture: a preview puts the window on the emitted lens it
 * restricts AND names the question; anything else clears the preview, so no
 * layout is left running behind a picture nobody is looking at.
 */
export function pickPerspective(
  on: DestinationHandles,
  options: readonly PerspectiveOption[],
  value: string,
): void {
  const chosen = options.find((option) => option.value === value);
  on.preview?.set(chosen?.preview ?? '');
  on.perspective?.set(
    chosen === undefined
      ? value
      : (chosen.preview === undefined ? chosen.perspective : PreviewPerspective.SOURCE),
  );
  record(on);
}
