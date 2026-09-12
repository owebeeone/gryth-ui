import { instance } from '@viz-js/viz';

// The preview layout worker: Graphviz, compiled to WebAssembly, off the main
// thread (NF7). It is OWNED by GyldPreviewLayoutTap, which starts it on the
// first preview a window asks for and terminates it when no window is asking
// any more; nothing else in this package may hold one.
//
// It does ONE thing: DOT in, `dot -Tjson0` out, plus the Graphviz version the
// wasm build reports at runtime. It reads no file, holds no Gyld value and
// decides nothing about what is drawn: the DOT arrives already composed from
// emitted records, and the json0 goes back to be merged with them.

/** What the tap sends. `id` pairs a reply with its request, because a window
 *  may move to another question before the first layout comes back. */
export interface PreviewWorkerRequest {
  id: number;
  dot: string;
}

export type PreviewWorkerReply =
  | { id: number; ok: true; json0: string; version: string }
  | { id: number; ok: false; message: string };

/** The dedicated-worker globals this module uses, declared here because the
 *  application's TypeScript lib set is the DOM's and not the worker's. */
interface WorkerScope {
  addEventListener(type: 'message', handler: (event: { data: unknown }) => void): void;
  postMessage(message: PreviewWorkerReply): void;
}

const scope = self as unknown as WorkerScope;

/** One wasm instance per worker, built on the first request and kept: the
 *  build is the expensive part and a reader opening several previews should
 *  pay it once. */
let engine: Promise<Awaited<ReturnType<typeof instance>>> | undefined;

function requestOf(data: unknown): PreviewWorkerRequest | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  const raw = data as Record<string, unknown>;
  if (typeof raw.id !== 'number' || typeof raw.dot !== 'string') {
    return undefined;
  }
  return { id: raw.id, dot: raw.dot };
}

scope.addEventListener('message', (event) => {
  const request = requestOf(event.data);
  if (request === undefined) {
    return;
  }
  void (async () => {
    try {
      if (engine === undefined) {
        engine = instance();
      }
      const viz = await engine;
      const result = viz.render(request.dot, { format: 'json0', engine: 'dot' });
      if (result.status !== 'success') {
        scope.postMessage({
          id: request.id,
          ok: false,
          message: result.errors.map((error) => error.message).join('; ') || 'layout failed',
        });
        return;
      }
      scope.postMessage({
        id: request.id, ok: true, json0: result.output, version: viz.graphvizVersion,
      });
    } catch (error) {
      // A failed build or a runtime fault is data, not a thrown worker: the
      // window shows the reason instead of an empty picture.
      scope.postMessage({
        id: request.id,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});
