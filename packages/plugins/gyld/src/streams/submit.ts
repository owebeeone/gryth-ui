import type { GyldOps, GyldOpsResponse } from '../ops/ops';
import { StreamOperation, draftShapeFaults, type StreamDraft } from './operations';

// Submitting a fork or a link (step 4.4).
//
// The operands are the ones the exported command names, in the same order and
// with the same trimming, so the submit and the export are two spellings of
// one request rather than two requests that happen to look alike. A draft that
// does not pass its shape check is not sent: nothing half-composed ever leaves
// this window, which is the rule the export path has always followed.

export async function streamSubmit(
  ops: GyldOps,
  draft: StreamDraft,
): Promise<GyldOpsResponse | undefined> {
  if (draftShapeFaults(draft).length > 0) {
    return undefined;
  }
  const args = { parent: draft.parent, stream: draft.name.trim() };
  return draft.operation === StreamOperation.LINK ? ops.link(args) : ops.fork(args);
}
