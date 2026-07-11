import type { AtomTapHandle } from '@owebeeone/grip-react';
import { defineGrip, type GrythPlugin } from '@grythjs/plugin-api';

// The plugin's identity grip (the registry key).
export const CHAT_PLUGIN = defineGrip<GrythPlugin>('Chat.Plugin');

// The selected group for THIS chat window — a per-tab grip atom (seeded via
// tabTaps), so two chat windows can watch different groups. The group message
// LOGS themselves are shared/global glial mounts (live.ts), not per-tab: a
// #general subscriber sees the same lines everywhere. Switching the picker sets
// this handle; the panel then reads that group's shared line-list grip.
export const CHAT_GROUP = defineGrip<string>('Chat.Group', 'general');
export const CHAT_GROUP_TAP = defineGrip<AtomTapHandle<string>>('Chat.Group.Tap');
