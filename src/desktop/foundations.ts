import type { FoundationDef } from '../grips.desktop';

// Foundation type presets (pure data). One per desktop for now; created via
// the launcher's "+ Grid". The Hub: the social column (crew) is the
// constant, the stage rotates, pulse is a dockable home for activity —
// shipped empty to demonstrate dockable holes.

export const HUB: FoundationDef = {
  layout: {
    id: 'root', size: 100, direction: 'row',
    children: [
      { id: 'explorer', size: 16 },
      {
        id: 'main', size: 62, direction: 'column',
        children: [
          { id: 'stage', size: 72 },
          { id: 'pulse', size: 28 },
        ],
      },
      { id: 'crew', size: 22 },
    ],
  },
  designate: {
    explorer: 'explorer',
    chat: 'crew',
    settings: 'crew',
    terminal: 'pulse',
    diff: 'stage',
    welcome: 'stage',
  },
  fallback: 'stage',
};
