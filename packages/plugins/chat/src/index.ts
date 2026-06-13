import { createAtomValueTap } from '@owebeeone/grip-react';
import { addEntry } from '@grythjs/plugin-api';
import {
  CHAT_PLUGIN,
  CHAT_TRANSCRIPT, CHAT_TRANSCRIPT_TAP,
  CHAT_DRAFT, CHAT_DRAFT_TAP,
} from './grips';
import { Chat } from './Chat';
import './chat.css';

// @grythjs/plugin-chat — a playground facet. Each window gets its own
// transcript + draft, seeded into the tab's chrome-held context, so the
// conversations are independent and survive remount. No root tap: this
// tool's state is entirely per-tab. Importing this module IS registering.

addEntry(CHAT_PLUGIN, {
  tools: {
    chat: {
      label: 'Chat',
      defaultSize: { w: 380, h: 460 },
      role: 'crew',
      windowComponent: Chat,
      tabTaps: () => [
        createAtomValueTap(CHAT_TRANSCRIPT, { initial: [], handleGrip: CHAT_TRANSCRIPT_TAP }),
        createAtomValueTap(CHAT_DRAFT, { initial: '', handleGrip: CHAT_DRAFT_TAP }),
      ],
    },
  },
});
