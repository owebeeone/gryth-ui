import type { AtomTapHandle } from '@owebeeone/grip-react';
import type { RetargetTab } from '@grythjs/plugin-api';
import { LegendPanel } from '../lens/legendPanel';
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
  /** How the picture's legend overlay is left. Not a destination, and folded
   *  in here all the same: it rides the same record, for the same reason —
   *  a reader who opened the legend should find it open after a reload. */
  legend?: AtomTapHandle<LegendPanel>;
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
    legend: (on.legend?.get() ?? LegendPanel.SHRUNK).param,
    focus: '',
  };
}

function record(on: DestinationHandles): void {
  on.retarget?.(on.tabId, destinationParams(on));
}

/**
 * Fold what the window is showing NOW back into its tab record, with nothing
 * changed by this call.
 *
 * The legend overlay is written by the picture's own panel, through the
 * picture's own handle, exactly as the camera and the dim set are. This is the
 * other half — the window remembering it — and it is a separate act rather
 * than a fourth `pick*` because nothing about the DESTINATION moved: the same
 * params are written back, with the legend's new state among them, read back
 * through the handle the panel just wrote (CodingRules.md).
 */
export function rememberDestination(on: DestinationHandles): void {
  record(on);
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
