import type { GyldOps, GyldOpsResponse } from '../ops/ops';
import { opsGate, type OpsGate } from '../ops/submit';
import type { GyldAskContext } from './envelope';

// When the Ask button may be pressed, and what it sends (step 1.5).
//
// Pure, so the whole rule is asserted without a window: this package renders
// to static markup and dispatches no click, so what a press does is asserted
// by calling the act.
//
// The gate is the SUBMIT gate every gyld window is behind (`ops/submit.ts`)
// plus the two things this verb cannot be sent without — a conversation to
// key the reply on, and a question to ask. Everything else is left to the
// supplier and comes back as data, including a refusal: a button that could be
// pressed and would fail honestly beats one disabled on a guess.

/** Why this window cannot ask yet, in its own words. */
export function explainGate(
  ops: GyldOps | undefined,
  status: string,
  conversation: string,
  question: string,
): OpsGate {
  const gate = opsGate(ops, status);
  if (!gate.ready) {
    return gate;
  }
  if (conversation === '') {
    return {
      ready: false,
      reason: 'this window has no conversation to ask in: open one from a box\'s '
        + 'menu with Ask about this',
    };
  }
  if (question.trim() === '') {
    return { ready: false, reason: 'type a question first' };
  }
  return gate;
}

/**
 * Send one turn: the envelope of section 3, with the question the reader
 * actually pressed with.
 *
 * A question that is only whitespace is not sent at all — the supplier refuses
 * an empty one as data, and asking it to is a round trip that tells the reader
 * nothing they could not be told here.
 */
export async function explainSubmit(
  ops: GyldOps | undefined,
  envelope: GyldAskContext,
  question: string,
): Promise<GyldOpsResponse | undefined> {
  if (ops === undefined || envelope.conversation === '' || question.trim() === '') {
    return undefined;
  }
  return ops.explain(envelope, question);
}
