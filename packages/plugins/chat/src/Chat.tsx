import { useGrip } from '@owebeeone/grip-react';
import {
  CHAT_TRANSCRIPT, CHAT_TRANSCRIPT_TAP,
  CHAT_DRAFT, CHAT_DRAFT_TAP,
  type ChatMessage,
} from './grips';

// Chat playground — the first real facet seam, deliberately thin. Transcript
// and draft are per-tab grips (seeded via tabTaps), so this is just a
// projection: read the grips, write through their handles. The "assistant"
// is a mock echo until a model provider binds behind a grip.

function reply(text: string): string {
  return `You said “${text}”. (mock reply — a model binds behind this grip later.)`;
}

export function Chat() {
  const messages = useGrip(CHAT_TRANSCRIPT) ?? [];
  const transcriptTap = useGrip(CHAT_TRANSCRIPT_TAP);
  const draft = useGrip(CHAT_DRAFT) ?? '';
  const draftTap = useGrip(CHAT_DRAFT_TAP);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    transcriptTap?.update((prev) => {
      const n = prev.length;
      const user: ChatMessage = { id: `u${n}`, role: 'user', text };
      const bot: ChatMessage = { id: `a${n + 1}`, role: 'assistant', text: reply(text) };
      return [...prev, user, bot];
    });
    draftTap?.set('');
  };

  return (
    <div className="chat-view">
      <div className="chat-log">
        {messages.length === 0 && (
          <div className="chat-empty">A scratch conversation. Nothing is sent anywhere.</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.role}`}>
            <span className="chat-who">{m.role === 'user' ? 'you' : 'gryth'}</span>
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input
          type="text"
          placeholder="Message…"
          value={draft}
          onChange={(e) => draftTap?.set(e.target.value)}
        />
        <button type="submit" disabled={!draft.trim()}>Send</button>
      </form>
    </div>
  );
}
