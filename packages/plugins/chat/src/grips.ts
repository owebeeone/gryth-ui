import type { AtomTapHandle } from '@owebeeone/grip-react';
import { defineGrip, type GrythPlugin } from '@grythjs/plugin-api';

export const CHAT_PLUGIN = defineGrip<GrythPlugin>('Chat.Plugin');

// One chat turn. role is the speaker; a message may later carry LINKS (the
// grip-lab lineage) so a transcript can hold openable views.
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

// Per-tab transcript + draft. These resolve against the TAB's chrome-held
// context (seeded by tabTaps), so every chat window is an independent
// conversation that survives unmount/remount — the same grips, a different
// atom per tab.
export const CHAT_TRANSCRIPT = defineGrip<ChatMessage[]>('Chat.Transcript', []);
export const CHAT_TRANSCRIPT_TAP = defineGrip<AtomTapHandle<ChatMessage[]>>('Chat.Transcript.Tap');
export const CHAT_DRAFT = defineGrip<string>('Chat.Draft', '');
export const CHAT_DRAFT_TAP = defineGrip<AtomTapHandle<string>>('Chat.Draft.Tap');
