import { createAtomValueTap, type Tap } from '@owebeeone/grip-react';
import {
  GYLD_DEST_REF, GYLD_DEST_REF_TAP, GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP,
  refFromParams, streamFromParams,
} from '../grips';

// The gyld.detail seeds, and the one rule that makes a tool work both as a
// WIRED SINK and as a standalone window.
//
// A sink is opened by `Desktop.OpenWired` with no params, and the desktop
// makes the source browser's context a parent of its own. A seed registered
// here would sit BELOW that parent edge and shadow the source's value, so the
// sink would read its own empty ref for ever. It therefore seeds NOTHING when
// the opening link carries no destination: what it resolves is then whatever
// the browser it is wired to publishes, live, with no param copied.
//
// A window opened with `{ stream, ref }` is standalone: it seeds its own
// destination and keeps it, whatever any other window is doing.
//
// The perspective is never seeded here. A detail window has no picture of its
// own: wired, it inherits the browser's perspective and names it as the lens
// it came from; standalone, it says there is no lens on this window.

export function detailTabTaps(_tabId: string, params?: Record<string, unknown>): Tap[] {
  const stream = streamFromParams(params);
  const ref = refFromParams(params);
  if (stream === '' && ref === '') {
    return [];
  }
  return [
    createAtomValueTap(GYLD_DEST_STREAM, {
      initial: stream, handleGrip: GYLD_DEST_STREAM_TAP,
    }),
    createAtomValueTap(GYLD_DEST_REF, {
      initial: ref, handleGrip: GYLD_DEST_REF_TAP,
    }),
  ];
}
