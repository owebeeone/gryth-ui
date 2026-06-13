import type { TabLinkInfo } from '@grythjs/plugin-api';
import type { SessionRecord } from './grips';

// Pure session/view derivations — the contract's worked example: attached
// vs ORPHANED is derived by scanning the desktop's tab links for terminal
// tabs referencing the session. Orphaned = a live PTY with no view; the
// browser makes those visible so nothing leaks invisibly.

export interface SessionAttachment {
  session: SessionRecord;
  tabIds: string[];
  orphaned: boolean;
}

export function deriveAttachments(
  sessions: SessionRecord[],
  links: TabLinkInfo[],
): SessionAttachment[] {
  return sessions.map((session) => {
    const tabIds = links
      .filter((l) => l.toolId === 'terminal' && l.params?.session === session.id)
      .map((l) => l.tabId);
    return { session, tabIds, orphaned: tabIds.length === 0 };
  });
}

// Returns the SAME list when the id is unknown (no notify churn).
export function killSession(sessions: SessionRecord[], id: string): SessionRecord[] {
  if (!sessions.some((s) => s.id === id)) return sessions;
  return sessions.filter((s) => s.id !== id);
}
