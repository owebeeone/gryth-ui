import { createAtomValueTap } from '@owebeeone/grip-react';
import { addEntry, tabLinkField } from '@grythjs/plugin-api';
import { CHAT_PLUGIN, CHAT_GROUP, CHAT_GROUP_TAP } from './grips';
import { CHAT_GROUPS } from './groups';
import { registerChatLive } from './live';
import { Chat } from './Chat';
import './chat.css';

// @grythjs/plugin-chat — LIVE group chat over glade (GLP-0006 P1.S4). The
// message logs are GLOBAL glial mounts (registerChatLive, one keyed commons log
// per group); each chat WINDOW holds only its selected-group grip (per-tab, via
// tabTaps), so two windows can watch different groups over the same shared
// surfaces. Importing this module IS registering.

// Global: the group-keyed commons log mounts + their boot subscriptions.
registerChatLive();

addEntry(CHAT_PLUGIN, {
  tools: {
    chat: {
      label: 'Chat',
      defaultSize: { w: 380, h: 460 },
      role: 'crew',
      windowComponent: Chat,
      linkFields: [tabLinkField(CHAT_GROUP, CHAT_GROUP_TAP, (p) => typeof p?.group === 'string' ? p.group : CHAT_GROUPS[0]!.id, (v) => ({ group: v }))],
      // per-tab: which group THIS window is viewing.
      tabTaps: () => [
        createAtomValueTap(CHAT_GROUP, { initial: CHAT_GROUPS[0]!.id, handleGrip: CHAT_GROUP_TAP }),
      ],
    },
  },
});
