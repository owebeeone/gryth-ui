import type { PreviewEngine } from './document';
import type { PreviewWorkerReply, PreviewWorkerRequest } from './previewWorker';

// What lays a preview out, as an interface the tap owns rather than a worker
// the tap knows about. The browser's implementation is one web worker; a test
// hands in its own, because Graphviz does not run under vitest (no worker and
// no DOM) and a test that needed one would be testing the browser instead of
// this package.

export interface PreviewRenderResult {
  json0: string;
  engine: PreviewEngine;
}

export interface PreviewRenderer {
  render(dot: string): Promise<PreviewRenderResult>;
  /** Release whatever this holds. Called when the tap has no destinations. */
  stop(): void;
}

/**
 * The npm package the wasm Graphviz comes from, and the exact version pinned
 * in this package's manifest.
 *
 * Spelled here because `@viz-js/viz` exports no manifest to import, and
 * asserted against the manifest by this package's own tests, so the two cannot
 * drift. The Graphviz version is NOT spelled here: the wasm build reports its
 * own at runtime and that is what a preview's provenance carries.
 */
export const VIZ_PACKAGE = '@viz-js/viz 3.30.0';

/** The renderer the browser uses: one dedicated worker running the wasm build
 *  of Graphviz. Created only when a preview is actually asked for. */
export function workerRenderer(): PreviewRenderer {
  const worker = new Worker(new URL('./previewWorker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, {
    resolve: (result: PreviewRenderResult) => void;
    reject: (error: Error) => void;
  }>();
  let next = 0;
  worker.addEventListener('message', (event: MessageEvent<PreviewWorkerReply>) => {
    const reply = event.data;
    const held = pending.get(reply.id);
    if (held === undefined) {
      return;
    }
    pending.delete(reply.id);
    if (reply.ok) {
      held.resolve({
        json0: reply.json0,
        engine: { name: VIZ_PACKAGE, version: `graphviz ${reply.version}` },
      });
    } else {
      held.reject(new Error(reply.message));
    }
  });
  worker.addEventListener('error', (event: ErrorEvent) => {
    // The worker itself failed to load or run. Every waiting layout fails with
    // that reason rather than hanging on a picture that will never arrive.
    const error = new Error(event.message === '' ? 'the preview worker failed' : event.message);
    for (const held of pending.values()) {
      held.reject(error);
    }
    pending.clear();
  });
  return {
    render(dot: string): Promise<PreviewRenderResult> {
      next += 1;
      const id = next;
      const request: PreviewWorkerRequest = { id, dot };
      return new Promise<PreviewRenderResult>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage(request);
      });
    },
    stop(): void {
      worker.terminate();
      for (const held of pending.values()) {
        held.reject(new Error('the preview worker was stopped'));
      }
      pending.clear();
    },
  };
}
