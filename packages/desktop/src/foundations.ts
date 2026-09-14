import type { FoundationDef } from './grips.desktop';

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

// The Gyld desk: a browser-shaped reading layout for one decision graph.
// `explorer` is the selector column (the stream tree), `stage` is the
// document being read, `pulse` under it is the queue of what wants a
// decision now, and `inspector` on the right is what the stage's selection
// IS — the record, and the ruling being written about it.
//
// `designate` is deliberately EMPTY: every window here is placed by the role
// its own plugin declares (ToolDef.role → ops.dockingHome), so this preset
// names no tool of another package and a Gyld tool added later lands in the
// right area without editing the desktop.
export const GYLD: FoundationDef = {
  layout: {
    id: 'root', size: 100, direction: 'row',
    children: [
      { id: 'explorer', size: 20 },
      {
        id: 'main', size: 56, direction: 'column',
        children: [
          { id: 'stage', size: 70 },
          { id: 'pulse', size: 30 },
        ],
      },
      { id: 'inspector', size: 24 },
    ],
  },
  designate: {},
  fallback: 'stage',
};
