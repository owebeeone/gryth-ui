// Pure, DOM-free bootstrap decision logic (GLP-0006 P1.S4): what grazel's
// `/bootstrap.json` placement says, read with plain fakes in the tests. Who the
// page is, resolved from it before the page composes, is `identity.ts`'s.

export interface BootstrapJson {
  node_ws?: string;
  mode?: string;
  name?: string;
  /** The user this desk is for, when grazel was given `--principal` (gyld-ui
   *  always gives one). An older grazel, or one given none, serves no field. */
  principal?: string;
}

/** The dev fallback node — used when grazel is not serving `/bootstrap.json`
 *  (e.g. `pnpm dev` with no grazel in front). Matches the demo + grazel's
 *  default `--node-port 9099`. */
export const DEV_FALLBACK_NODE_WS = 'ws://127.0.0.1:9099';

/** Pick the node WS URL from grazel's bootstrap payload, falling back to the
 *  dev node. A missing/blank `node_ws` (or absent payload) → the fallback. */
export function pickNodeWs(boot: BootstrapJson | undefined, fallback = DEV_FALLBACK_NODE_WS): string {
  const url = boot?.node_ws?.trim();
  return url ? url : fallback;
}

/** The principal something NAMES for this page: `?principal=` (alias
 *  `?user=`), else the one grazel serves. None when neither names one, and
 *  the tab is then its own participant (`identity.ts`). A blank name, or one
 *  that is not a string, names nobody. */
export function pickPrincipal(search: string, boot: BootstrapJson | undefined): string | undefined {
  const params = new URLSearchParams(search);
  return named(params.get('principal')) ?? named(params.get('user')) ?? named(boot?.principal);
}

function named(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  return value;
}
