import { describe, it, expect } from 'vitest';
import type { TabLinkInfo } from '@grythjs/plugin-api';
import { deriveAttachments, killSession } from './ops';
import type { SessionRecord } from './grips';

const session = (id: string, over: Partial<SessionRecord> = {}): SessionRecord => ({
  id, cwd: `~/work/${id}`, owner: { principal: 'gianni' }, startedAt: 't0', ...over,
});

describe('session attachment derivation (the orphan inventory)', () => {
  it('marks sessions with no terminal tab as ORPHANED; others list their tabs', () => {
    const sessions = [session('s1'), session('s2'), session('s3')];
    const links: TabLinkInfo[] = [
      { tabId: 't1', toolId: 'terminal', params: { session: 's1' } },
      { tabId: 't2', toolId: 'terminal', params: { session: 's1' } },
      { tabId: 't3', toolId: 'viewer', params: { session: 's2' } }, // not a terminal
      { tabId: 't4', toolId: 'terminal', params: { machine: 'glv-dev' } }, // no session
    ];
    const rows = deriveAttachments(sessions, links);
    expect(rows.find((r) => r.session.id === 's1')).toMatchObject({ tabIds: ['t1', 't2'], orphaned: false });
    expect(rows.find((r) => r.session.id === 's2')).toMatchObject({ tabIds: [], orphaned: true });
    expect(rows.find((r) => r.session.id === 's3')!.orphaned).toBe(true);
  });

  it('kills a session by id; unknown ids return the same list', () => {
    const sessions = [session('s1'), session('s2')];
    expect(killSession(sessions, 's1').map((s) => s.id)).toEqual(['s2']);
    expect(killSession(sessions, 'nope')).toBe(sessions);
  });
});
