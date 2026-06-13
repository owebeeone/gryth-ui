import { useGrip } from '@owebeeone/grip-react';
import {
  DESKTOP_OPEN_TOOL, DESKTOP_RETARGET_TAB, DESKTOP_TAB_LINKS,
} from '@grythjs/plugin-api';
import { TERMINAL_SESSIONS, TERMINAL_SESSIONS_TAP } from './grips';
import { deriveAttachments, killSession } from './ops';

// Live launcher entry: sessions total, with the orphan count when nonzero.
export function SessionsMenuTitle() {
  const sessions = useGrip(TERMINAL_SESSIONS) ?? [];
  const links = useGrip(DESKTOP_TAB_LINKS) ?? [];
  const orphans = deriveAttachments(sessions, links).filter((r) => r.orphaned).length;
  return <>Sessions ({sessions.length}{orphans > 0 ? ` · ${orphans} orphaned` : ''})</>;
}

// The session browser — the contract's worked example. Sessions carry
// ATTRIBUTION (who started them, on whose behalf); attached/orphaned is
// derived from the desktop's tab links; "open" fires a link through the
// open intent, "send to an existing terminal" retargets that tab's link.
export function SessionBrowser() {
  const sessions = useGrip(TERMINAL_SESSIONS) ?? [];
  const sessionsTap = useGrip(TERMINAL_SESSIONS_TAP);
  const links = useGrip(DESKTOP_TAB_LINKS) ?? [];
  const openTool = useGrip(DESKTOP_OPEN_TOOL);
  const retarget = useGrip(DESKTOP_RETARGET_TAB);

  const rows = deriveAttachments(sessions, links);
  const terminalTabs = links.filter((l) => l.toolId === 'terminal');

  return (
    <div className="sess-browser">
      {rows.length === 0 && <div className="sess-empty">No sessions in this workspace.</div>}
      {rows.map(({ session: s, tabIds, orphaned }) => (
        <div key={s.id} className="sess-row">
          <span className={`sess-dot${orphaned ? ' orphan' : ''}`} title={orphaned ? 'orphaned — no view' : `shown in ${tabIds.join(', ')}`} />
          <code className="sess-cwd">{s.cwd}</code>
          {s.machine && <span className="sess-chip">{s.machine}</span>}
          <span className={`sess-chip owner${s.owner.onBehalfOf ? ' agent' : ''}`}>
            {s.owner.onBehalfOf ? `${s.owner.principal} ⇒ ${s.owner.onBehalfOf}` : s.owner.principal}
          </span>
          <span className="sess-attach">
            {orphaned ? <em>orphaned</em> : `in ${tabIds.join(', ')}`}
          </span>
          <span className="sess-actions">
            <button
              title="Open in a new terminal"
              onClick={() => openTool?.({ toolId: 'terminal', params: { session: s.id } })}
            >⧉ open</button>
            {terminalTabs.filter((t) => !tabIds.includes(t.tabId)).map((t) => (
              <button
                key={t.tabId}
                title={`Show in existing terminal ${t.tabId}`}
                onClick={() => retarget?.(t.tabId, { session: s.id })}
              >→ {t.tabId}</button>
            ))}
            <button
              title="Kill session"
              onClick={() => sessionsTap?.update((list) => killSession(list, s.id))}
            >✕</button>
          </span>
        </div>
      ))}
    </div>
  );
}
