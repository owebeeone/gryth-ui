import type { GyldRootStatus } from './state';

// A root that is THERE and has nothing in it yet.
//
// The supplier's bundle root is app-owned and starts empty: `glade-gyld`
// publishes onto the four gyld shares AFTER a build, so a composition that has
// never built anything answers every read with "nothing has landed". Read as a
// failure that is a lie — nothing failed, the node answered, the share is
// simply empty — and the desk said `glade node: error (nothing has landed on
// gyld.streams for streams.json)`, which tells a reader neither what happened
// nor what to do.
//
// So it is its own status, `waiting`, and these are the sentences the windows
// say about it. Pure: a test asks them without a store and without a window.

/** The status a root carries while its store answers "nothing published yet".
 *  Named once here, so the three windows and the store agree on the spelling. */
export const ROOT_WAITING = 'waiting';

/** The short reason on a one-line status. */
export const WAITING_REASON = 'the supplier has published no build yet';

/**
 * The prefix the supplier puts on the run id of its OWN first build.
 *
 * The supplier publishes the latest build at attach and, finding none, runs a
 * first build itself; that run is announced on the `gyld.output` log share
 * under a run id beginning with this. A desk that can see such a run names it
 * rather than telling the reader to press Rebuild over a build already going.
 */
export const BOOT_RUN = 'boot';

/** The run in view when it is the supplier's own first build, else empty. */
export function bootRunOf(runId: string): string {
  return runId.startsWith(BOOT_RUN) ? runId : '';
}

/** Whether one root is a root with nothing published on it yet. */
export function isWaiting(root: GyldRootStatus): boolean {
  return root.status === ROOT_WAITING;
}

/** Whether the desk is waiting on any root of its set. */
export function anyWaiting(roots: readonly GyldRootStatus[]): boolean {
  return roots.some(isWaiting);
}

/**
 * The one line a window prints per root of the set.
 *
 * A waiting root carries no error, because it has none: the reason is what
 * this line says instead, and the paragraph under an empty census says the
 * rest.
 */
export function rootLine(root: GyldRootStatus): string {
  const said = isWaiting(root) ? WAITING_REASON : root.error;
  const watching = root.watchLive ? ' · watching' : '';
  return `${root.describe}: ${root.status}${said === undefined ? '' : ` (${said})`}${watching}`;
}

/**
 * What a window says about a desk that is waiting for the first build.
 *
 * Two sentences: what is true, and what to do about it. Which second sentence
 * depends on whether a first build is visible — pressing Rebuild over a build
 * already running would start a second one, and every build is minutes of
 * Python.
 */
export function waitingSays(bootRun: string): string[] {
  const said = [
    `${WAITING_REASON}, so the gyld shares carry no census yet. This is a`
    + ' waiting state, not a failure: the node answered.',
  ];
  if (bootRun !== '') {
    said.push(
      `Its first build is running as ${bootRun}; the run's own lines are below.`,
    );
  } else {
    said.push(
      'Its first build may still be running. Otherwise press Rebuild, which'
      + ' captures every stream the Gyld checkout declares into the first build.',
    );
  }
  return said;
}
