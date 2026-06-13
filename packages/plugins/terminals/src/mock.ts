import { createAtomValueTap } from '@owebeeone/grip-react';
import { TERMINAL_SESSIONS, TERMINAL_SESSIONS_TAP, type SessionRecord } from './grips';

// Mock session provider — what the workspace's session service reports.
// Note the attribution: two of these were opened by agents ON BEHALF OF
// gianni ("what has my agent opened").

const SESSIONS: SessionRecord[] = [
  {
    id: 's-101', cwd: '~/limbo/gryth-dev/gryth-ui',
    owner: { principal: 'gianni' }, machine: 'glv-dev',
    startedAt: '2026-06-12T08:00:00Z',
  },
  {
    id: 's-102', cwd: '~/limbo/glial-dev',
    owner: { principal: 'claude', onBehalfOf: 'gianni' }, machine: 'glv-dev',
    startedAt: '2026-06-12T08:20:00Z',
  },
  {
    id: 's-103', cwd: '~/limbo/razel',
    owner: { principal: 'razel-agent', onBehalfOf: 'gianni' }, machine: 'pi-bench',
    startedAt: '2026-06-12T09:05:00Z',
  },
  {
    id: 's-104', cwd: '/tmp/scratch',
    owner: { principal: 'gianni' },
    startedAt: '2026-06-12T09:40:00Z',
  },
];

export const TerminalSessionsTap = createAtomValueTap(TERMINAL_SESSIONS, {
  initial: SESSIONS,
  handleGrip: TERMINAL_SESSIONS_TAP,
});
