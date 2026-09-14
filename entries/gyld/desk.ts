import { GYLD, type DesktopSetup } from '@grythjs/desktop';

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
// `role` and the preset carries areas of those names, so this file names no
// tool at all (see packages/desktop/src/foundations.ts, GYLD).
//
// A separate module from `main.tsx` for the reason `plugins.ts` is one:
// `main.tsx` mounts React and lights the live write path on import, so the
// choice is stated where a test can read it back.
export const GYLD_DESK: DesktopSetup = { foundation: GYLD, locked: true };
