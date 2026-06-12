import { createAtomValueTap } from '@owebeeone/grip-react';
import { WORKSPACE_LIST, WORKSPACE_LIST_TAP, type WorkspaceRecord } from './grips';
import type { RepoInfo } from './types';

// Mock workspace provider — the provider bound today. The gryth service
// binds WORKSPACE_LIST later (matcher selection) and consumers don't change.

function repo(partial: Partial<RepoInfo> & { path: string; name: string }): RepoInfo {
  return {
    branch: 'main', head: 'a1b2c3d', ahead: 0, behind: 0, dirty: false,
    changedFiles: [], ...partial,
  };
}

const MOCK_WORKSPACES: WorkspaceRecord[] = [
  {
    id: 'gryth', name: 'gryth', icon: '🛰️',
    repos: [
      repo({ path: '', name: 'gryth-dev', head: '24bd2f5' }),
      repo({
        path: 'gryth-ui', name: 'gryth-ui', head: 'bc8ce87', dirty: true,
        changedFiles: [{ path: 'packages/plugin-api/src/registry.ts' }, { path: 'src/plugins/index.ts' }],
      }),
      repo({ path: 'grip-core', name: 'grip-core', head: '91f02ae' }),
      repo({ path: 'grip-react', name: 'grip-react', head: '77c41d0', ahead: 2 }),
    ],
    deps: [
      { source: 'gryth-ui', target: 'grip-react' },
      { source: 'grip-react', target: 'grip-core' },
      { source: '', target: 'gryth-ui' },
    ],
  },
  {
    id: 'glial', name: 'glial', icon: '🧪',
    repos: [
      repo({ path: '', name: 'glial-dev', head: 'f40a3da', dirty: true, changedFiles: [{ path: 'dev-docs/StackMap.md' }] }),
      repo({ path: 'grip-lab', name: 'grip-lab', head: '5d31e88', behind: 1 }),
      repo({ path: 'razel', name: 'razel', head: '52fac2a' }),
    ],
    deps: [
      { source: 'grip-lab', target: '' },
      { source: 'razel', target: '' },
    ],
  },
  {
    id: 'demo', name: 'demo', icon: '🔧',
    repos: [
      repo({ path: '', name: 'demo-root', head: '0000001' }),
      repo({ path: 'app', name: 'app', head: 'beefcaf', ahead: 1, dirty: true, changedFiles: [{ path: 'src/main.ts' }] }),
    ],
    deps: [{ source: 'app', target: '' }],
  },
];

export const WorkspaceListTap = createAtomValueTap(WORKSPACE_LIST, {
  initial: MOCK_WORKSPACES,
  handleGrip: WORKSPACE_LIST_TAP,
});
