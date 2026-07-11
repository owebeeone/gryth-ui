// Pure, DOM-free bootstrap decision logic (GLP-0006 P1.S4) — split out of
// runtime.ts so it is unit-testable with plain fakes (runtime.ts touches
// sessionStorage / location / WebSocket at import and cannot load under a node
// test env).

export interface BootstrapJson {
  node_ws?: string;
  mode?: string;
  name?: string;
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

/** The acting principal from the URL, else the per-tab origin: `?principal=`
 *  (alias `?user=`) forces a stable identity across tabs; otherwise each tab is
 *  its own participant. The stage-1 stub the P0.S7 principal records replace. */
export function pickPrincipal(search: string, origin: string): string {
  const params = new URLSearchParams(search);
  return params.get('principal') ?? params.get('user') ?? origin;
}
