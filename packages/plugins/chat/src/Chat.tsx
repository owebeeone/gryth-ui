import { useGrip } from '@owebeeone/grip-react';
import { GLADE_STATUS, principal } from '@grythjs/glade';
import { CHAT_GROUP, CHAT_GROUP_TAP } from './grips';
import { CHAT_GROUPS, groupLabel, groupListGrip } from './groups';
import { postToGroup } from './live';

// Chat panel (GLP-0006 P1.S4) — a thin projection over grips, no React state
// hook. The selected group is a PER-TAB grip atom (seeded via tabTaps); the
// message list is the selected group's GLOBAL glial log mount (live.ts); the
// compose box is uncontrolled (posting is a client append — postToGroup stamps
// the ChatLine attributed to the acting principal). Two participants (two
// browser contexts / `?principal=`) converge on the same keyed commons log.

export function Chat() {
  const group = useGrip(CHAT_GROUP) ?? CHAT_GROUPS[0]!.id;
  const groupTap = useGrip(CHAT_GROUP_TAP);
  const lines = useGrip(groupListGrip(group)) ?? [];
  const status = useGrip(GLADE_STATUS);

  return (
    <div className="chat-view">
      <div className="chat-groups">
        {CHAT_GROUPS.map((g) => (
          <button
            key={g.id}
            className={g.id === group ? 'chat-group active' : 'chat-group'}
            onClick={() => groupTap?.set(g.id)}
            disabled={g.id === group}
          >
            {g.label}
          </button>
        ))}
        <span className="chat-who" title={`connection: ${status ?? 'connecting'}`}>
          {principal} · {status ?? 'connecting'}
        </span>
      </div>
      <div className="chat-log">
        {lines.length === 0 && (
          <div className="chat-empty">No messages in {groupLabel(group)} yet.</div>
        )}
        {lines.map((l, i) => (
          <div key={i} className={`chat-msg ${(l.principal ?? l.user) === principal ? 'user' : ''}`}>
            <span className="chat-who">
              {l.principal ?? l.user} · {new Date(l.ts).toLocaleTimeString()}
            </span>
            <span className="chat-text">{l.text}</span>
          </div>
        ))}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem('msg') as HTMLInputElement;
          const text = input.value.trim();
          if (text) {
            postToGroup(group, text);
            input.value = '';
          }
        }}
      >
        <input name="msg" type="text" placeholder={`Message ${groupLabel(group)}…`} autoComplete="off" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
