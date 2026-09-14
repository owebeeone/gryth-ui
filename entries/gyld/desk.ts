import { GYLD, type DesktopSetup } from '@grythjs/desktop';
import { GYLD_BROWSER_TOOL, GYLD_STREAMS_TOOL } from '@grythjs/plugin-gyld';

// The Gyld-only target's DESK, the second thing a target chooses after its
// plugin list: the pane preset every lock opens, and that the first desk is
// already locked when the page paints.
//
// It is locked because this target is one workspace for one job. The full
// desktop opens floating — its windows are unrelated to each other, so where
// they land is the reader's business — but every window here is a view of the
// SAME decision graph, and the pane layout is what says how they relate:
// pick a stream on the left, read it in the middle, decide on the right.
// A reader who wants floating windows still has the lock button.
//
// Which window lands where is NOT decided here. Each tool declares its own
// `role` and the preset carries areas of those names, so the tools below are
// named in no area at all: the stream tree's `explorer` role puts it on the
// left and the browser's `stage` role puts it in the middle (see
// packages/desktop/src/foundations.ts, GYLD).
//
// They are named because a reader who opens this target has already said what
// they came for. An empty desk with a Welcome window on it makes them open the
// two windows every session begins with; a desk that opens them does not.
//
// The BROWSER opens first and the tree is opened WIRED to it, which is the
// relation the pane layout already draws: the selector on the left drives the
// view in the middle. The wire is what makes a stream click RETARGET that
// browser — the tree resolves the browser's own destination handle through it
// (packages/plugins/gyld/src/streams/useStreamTarget.ts) — instead of opening
// a second browser on every pick. A reader who wants a second browser opens
// one from the launcher, which is how a second of any tool is opened.
//
// A separate module from `main.tsx` for the reason `plugins.ts` is one:
// `main.tsx` mounts React and lights the live write path on import, so the
// choice is stated where a test can read it back.
export const GYLD_DESK: DesktopSetup = {
  // and its own name, which is what the INTERIM stored desk is keyed by: this
  // target and the full desktop are two desks, not one seen twice
  // (packages/desktop/src/layoutStorageTap.ts).
  entry: 'gyld',
  foundation: GYLD,
  locked: true,
  tools: [
    { toolId: GYLD_BROWSER_TOOL },
    { toolId: GYLD_STREAMS_TOOL, wiredTo: GYLD_BROWSER_TOOL },
  ],
};
