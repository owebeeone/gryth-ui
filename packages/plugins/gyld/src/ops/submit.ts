import { addStaticRoot } from '../browser/setOps';
import type { GyldSet } from '../store/state';
import type { GyldOps } from './ops';

// When a window may submit, and where the build an answer named is read from
// (step 4.4). Pure, so every window asks the same question the same way and a
// test asks it without a window at all.

/** Whether a submit may be pressed, and the reason when it may not. */
export interface OpsGate {
  ready: boolean;
  /** Empty when ready; otherwise what the button's title says. */
  reason: string;
}

const READY: OpsGate = Object.freeze({ ready: true, reason: '' });

/**
 * The gate every Submit is behind.
 *
 * Two refusals and no more. `Gyld.Ops` UNRESOLVED means no glade node in this
 * composition at all, so there is nothing to send to; `offline` means the one
 * there is has lost its socket. Anything else sends, and whatever comes back
 * is data, including a refusal: a button that could be pressed and would fail
 * honestly is better than one disabled on a guess.
 */
export function opsGate(ops: GyldOps | undefined, status: string): OpsGate {
  if (ops === undefined) {
    return {
      ready: false,
      reason: 'no glade node in this desktop, so nothing can be submitted: '
        + 'export the text below and run it yourself',
    };
  }
  if (status === 'offline') {
    return {
      ready: false,
      reason: 'the glade node is offline, so nothing can be submitted: '
        + 'export the text below and run it yourself',
    };
  }
  return READY;
}

/** The URL path grazel serves the supplier's bundle root at, which is what a
 *  published lens pointer's `path` is relative to. */
export const GYLD_STATIC_BASE = '/gyld';

/**
 * The URL a build directory is served at, or undefined when the answer named
 * none this can resolve.
 *
 * The supplier answers with an ABSOLUTE filesystem path, and grazel serves the
 * bundle root at `--static-base`; the one part of that path this package knows
 * the shape of is the `builds/<stamp>` tail the supplier's README fixes. So
 * the tail is what is taken, and a directory with no `builds/` segment
 * resolves to nothing rather than to a URL composed out of a guess.
 */
export function buildUrl(outputDir: string | undefined): string | undefined {
  if (outputDir === undefined || outputDir === '') {
    return undefined;
  }
  const at = outputDir.lastIndexOf('/builds/');
  if (at < 0) {
    return undefined;
  }
  return `${GYLD_STATIC_BASE}${outputDir.slice(at)}`;
}

/**
 * Add the build an answer named to the set, as a static root.
 *
 * This is the OTHER half of "the graph rebuilds in place". A desk reading the
 * glade node converges on its own, because the supplier publishes each build's
 * documents onto the shares and the store reads them again. A desk reading
 * files has no such thing, and the two documents a share never carries
 * (`projection.json` and `validation.json`) are only ever on the static path,
 * so the honest move is to offer the build the answer named as a root and let
 * the reader take it.
 */
export function retargetToBuild(
  set: GyldSet,
  outputDir: string | undefined,
): { set: GyldSet; error?: string } {
  const url = buildUrl(outputDir);
  if (url === undefined) {
    return { set, error: 'the answer named no build directory this can resolve to a URL' };
  }
  return addStaticRoot(set, url);
}
