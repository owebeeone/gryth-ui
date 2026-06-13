import { useGrip } from '@owebeeone/grip-react';
import type { ToolViewProps } from '@grythjs/plugin-api';
import { TERMINAL_SESSIONS } from './grips';

// Mock terminal view. A link binds it to a SESSION (the session browser,
// rehydration) or a MACHINE (the VM manager's shell action). Sessions
// outlive views — closing this window never closes the session.

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function mockScrollback(cwd: string, machine: string): string[] {
  return [
    machine ? `[${machine}] connected (mock PTY)` : 'connected (mock PTY)',
    `$ cd ${cwd || '~'}`,
    '$ git status --short',
    ' M src/…  (mock output — the PTY provider binds behind this grip later)',
    '$ ▌',
  ];
}

export function TerminalView({ params }: ToolViewProps) {
  const sessions = useGrip(TERMINAL_SESSIONS) ?? [];
  const sessionId = str(params?.session);
  const machineParam = str(params?.machine);
  const session = sessions.find((s) => s.id === sessionId);

  if (sessionId && !session) {
    return (
      <div className="facet-pad">
        <h2>Terminal</h2>
        <p>Session <code>{sessionId}</code> no longer exists.</p>
      </div>
    );
  }
  const cwd = session?.cwd ?? '';
  const machine = session?.machine ?? machineParam;
  const owner = session?.owner;

  return (
    <div className="term-view">
      <header className="term-head">
        <code className="term-cwd">{cwd || (machine ? `machine: ${machine}` : 'no session linked')}</code>
        {machine && cwd && <span className="term-chip">{machine}</span>}
        {owner && (
          <span className={`term-chip owner${owner.onBehalfOf ? ' agent' : ''}`}>
            {owner.onBehalfOf ? `${owner.principal} ⇒ ${owner.onBehalfOf}` : owner.principal}
          </span>
        )}
        {session && <span className="term-chip sid">{session.id}</span>}
      </header>
      <pre className="term-body">
        {(session || machine) ? mockScrollback(cwd, machine).join('\n') : 'Open a session from the Sessions browser, or a shell from the VM manager.'}
      </pre>
    </div>
  );
}
