// The Chat plugin's group CONFIG + typed surfaces (GLP-0006 P1.S4) — DOM-free
// (no @grythjs/glade import), so the wiring is unit-testable under a node env.
// The live glial mounts + post path live in live.ts (they need the runtime).

import type { Grip } from '@owebeeone/grip-react';
import type { GlialTapController } from '@owebeeone/glial-runtime/grip';
import type { Surface } from '@owebeeone/glial-runtime/manifest';
import { chatManifest, type ChatGroup, type ChatLine } from '@owebeeone/glade-chat';
import { defineGrip } from '@grythjs/plugin-api';

export type { ChatLine };

/** The pre-declared chat groups — stage-1 config, matching grazel-app.glade's
 *  pre-declared chat.msgs/chat.groups (general + dev). Dynamic creation is a
 *  create-a-share ceremony that rides F2 + P2. */
export const CHAT_GROUPS: ChatGroup[] = [
  { id: 'general', label: '#general' },
  { id: 'dev', label: '#dev' },
];

/** The typed chat surfaces (share "chat"; chat.msgs keyed per group). */
export const chatM = chatManifest(CHAT_GROUPS, { share: 'chat' });

/** The keyed commons log surface for a group (the mount's decl). */
export function groupSurface(id: string): Surface<'log'> {
  return chatM.msg(id);
}

/** The label for a group id (falls back to the id). */
export function groupLabel(id: string): string {
  return CHAT_GROUPS.find((g) => g.id === id)?.label ?? id;
}

export interface GroupGrips {
  readonly list: Grip<ChatLine[]>;
  readonly handle: Grip<GlialTapController<ChatLine[]>>;
}
const groupGrips = new Map<string, GroupGrips>(
  CHAT_GROUPS.map((g) => [
    g.id,
    {
      list: defineGrip<ChatLine[]>(`Chat.${g.id}.Lines`, []),
      handle: defineGrip<GlialTapController<ChatLine[]>>(`Chat.${g.id}.Lines.Tap`),
    },
  ]),
);

/** The per-group grips (list + write handle) for a group id. Throws on unknown. */
export function gripsFor(id: string): GroupGrips {
  const gg = groupGrips.get(id);
  if (!gg) throw new Error(`chat: unknown group '${id}'`);
  return gg;
}

/** The line-list grip for a group (the panel reads the selected group's). */
export function groupListGrip(id: string): Grip<ChatLine[]> {
  return gripsFor(id).list;
}
