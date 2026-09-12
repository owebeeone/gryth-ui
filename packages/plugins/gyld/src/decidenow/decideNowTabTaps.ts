import { createAtomValueTap, type Tap } from '@owebeeone/grip-react';
import { GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP, streamFromParams } from '../grips';

// The gyld.decidenow seeds. Same rule as gyld.detail: a window opened WIRED to
// a browser seeds nothing, so it resolves that browser's stream live; a window
// opened with `{ stream }` seeds its own and keeps it.
//
// The decide-now list never seeds a ref. It does not look at one record: it
// lists the stream's emitted decide-now rows, and clicking a row moves the
// browser rather than this window.

export function decideNowTabTaps(_tabId: string, params?: Record<string, unknown>): Tap[] {
  const stream = streamFromParams(params);
  if (stream === '') {
    return [];
  }
  return [
    createAtomValueTap(GYLD_DEST_STREAM, {
      initial: stream, handleGrip: GYLD_DEST_STREAM_TAP,
    }),
  ];
}
