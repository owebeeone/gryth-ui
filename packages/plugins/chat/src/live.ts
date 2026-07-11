// The Chat plugin's LIVE glial wiring (GLP-0006 P1.S4) — the demo's chat.ts
// ported into the plugin. Each pre-declared group (groups.ts) is a keyed COMMONS
// log (chat.msgs, group id = key) mounted as a glial tap producing ChatLine[].
// The mounts are GLOBAL (registered once on grok, like plugin-terminals' session
// tap), not per-tab: #general is one shared surface for everyone. Stage-1 chat
// is CLIENT appends + node fold/replicate (the supplier is not in the message
// path); postToGroup stamps a ChatLine attributed to the acting principal.

import { glialTap, type GlialTapController } from '@owebeeone/glial-runtime/grip';
import { groupKey, postChat, type ChatLine } from '@owebeeone/glade-chat';
import { grok } from '@grythjs/plugin-api';
import { addGladeSubscription, gladeDest, glial, principal, resolveController } from '@grythjs/glade';
import { CHAT_GROUPS, gripsFor, groupSurface } from './groups';

/** Register the group-keyed commons log mounts (one per group) on grok, and the
 *  boot subscriptions the node replays on connect. Called once from index.ts.
 *  Codec = glial's JSON default: ChatLine is plain JSON and the node folds
 *  chat.msgs payloads opaquely (stage-1, supplier not in the path), so no taut
 *  ChatLine schema is needed on the client. */
export function registerChatLive(): void {
  for (const g of CHAT_GROUPS) {
    const surface = groupSurface(g.id);
    const gg = gripsFor(g.id);
    grok.registerTap(
      glialTap<ChatLine[]>({
        binder: glial,
        decl: surface,
        grip: gg.list,
        // distinct fill per group → distinct instance (same glade id, group key).
        fill: { domain: g.id, zone: 'commons' },
        handleGrip: gg.handle,
        gladeFor: gladeDest({
          share: surface.share,
          gladeId: surface.glade_id.id,
          shape: surface.shape,
          key: surface.key ?? new Uint8Array(),
        }),
      }),
    );
    addGladeSubscription({ share: surface.share, gladeId: surface.glade_id.id, key: groupKey(g.id) });
  }
}

const ctlCache = new Map<string, GlialTapController<ChatLine[]>>();

/** Post a line to a group, attributed to the acting principal. Stage-1 CLIENT
 *  append through the group's glial log controller — stamps
 *  ChatLine{user, principal, ts, text} and appends it (its own op). */
export function postToGroup(groupId: string, text: string): void {
  let ctl = ctlCache.get(groupId);
  if (!ctl) {
    ctl = resolveController(gripsFor(groupId).handle);
    ctlCache.set(groupId, ctl);
  }
  postChat(ctl, text, principal);
}
