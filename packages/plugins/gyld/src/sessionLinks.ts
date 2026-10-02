import type { AtomTapHandle, Grip } from '@owebeeone/grip-react';
import { tabLinkField, type TabLinkField } from '@grythjs/plugin-api';
import * as g from './grips';
import { seededConversation } from './ask/askTabTaps';

function text(grip: Grip<string>, handle: Grip<AtomTapHandle<string>>, param: string, inherited = false): TabLinkField {
  return tabLinkField(grip, handle, (p) => typeof p?.[param] === 'string' ? p[param] as string : '', (v) => ({ [param]: v }), { inherited });
}
const stream = text(g.GYLD_DEST_STREAM, g.GYLD_DEST_STREAM_TAP, 'stream', true);
const perspective = text(g.GYLD_DEST_PERSPECTIVE, g.GYLD_DEST_PERSPECTIVE_TAP, 'perspective', true);
const ref = tabLinkField(g.GYLD_DEST_REF, g.GYLD_DEST_REF_TAP,
  (p) => typeof p?.question === 'string' ? p.question : g.refFromParams(p),
  (v) => ({ ref: v, focus: v, question: v }), { inherited: true });
const legend = tabLinkField(g.GYLD_TAB_LEGEND, g.GYLD_TAB_LEGEND_TAP,
  g.legendFromParams, (v) => ({ legend: v.param }));
const preview = text(g.GYLD_DEST_PREVIEW, g.GYLD_DEST_PREVIEW_TAP, 'preview');
const left = text(g.GYLD_DEST_LEFT, g.GYLD_DEST_LEFT_TAP, 'left');
const right = text(g.GYLD_DEST_RIGHT, g.GYLD_DEST_RIGHT_TAP, 'right');
const run = text(g.GYLD_DEST_RUN, g.GYLD_DEST_RUN_TAP, 'run');
const proposal = text(g.GYLD_DEST_PROPOSAL, g.GYLD_DEST_PROPOSAL_TAP, 'proposal');
const conversation = tabLinkField(g.GYLD_TAB_ASK_CONVERSATION, g.GYLD_TAB_ASK_CONVERSATION_TAP,
  (p) => {
    const seed = seededConversation(p);
    return typeof p?.conversationSlot === 'string' ? { ...seed, slot: p.conversationSlot } : seed;
  }, (v) => ({ conversation: v.id, conversationSlot: v.slot }));

/** Exactly the session fields from GrythGripScopes. Wired destinations are
 *  resolved from their source rather than copied into the sink's record. */
export function gyldLinkFields(tool: string): readonly TabLinkField[] {
  switch (tool) {
    case 'gyld.browser': { return [stream, perspective, preview, ref, legend]; }
    case 'gyld.detail': { return [stream, ref]; }
    case 'gyld.decidenow': { return [stream]; }
    case 'gyld.decide': { return [stream, ref]; }
    case 'gyld.ask': { return [stream, ref, perspective, conversation]; }
    case 'gyld.compare': { return [run, proposal]; }
    case 'gyld.diff': { return [left, right, perspective]; }
    default: { return []; }
  }
}
