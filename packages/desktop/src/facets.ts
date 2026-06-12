import { createElement } from 'react';
import type { GrythPlugin, ToolDef, ToolId } from '@grythjs/plugin-api';
import {
  ChatFacet, DiffFacet, ExplorerFacet, GridFacet, MissingToolFacet,
  SettingsFacet, TerminalFacet, WelcomeFacet,
} from './facetComponents';

// The desktop's builtin tools — published at DESKTOP_BUILTINS_PLUGIN by
// registerDesktopTaps like any other plugin. These are the
// not-yet-converted facets riding as one plugin object; each leaves for
// its group package in migration Phase 1/2 (see PluginMigration.md).

export const DESKTOP_BUILTINS: GrythPlugin = {
  tools: {
    welcome: { label: 'Welcome', defaultSize: { w: 520, h: 280 }, windowComponent: WelcomeFacet },
    chat: { label: 'Chat', defaultSize: { w: 380, h: 460 }, windowComponent: ChatFacet },
    terminal: { label: 'Terminal', defaultSize: { w: 640, h: 400 }, windowComponent: TerminalFacet },
    diff: { label: 'Diff', defaultSize: { w: 720, h: 480 }, windowComponent: DiffFacet },
    settings: { label: 'Settings', defaultSize: { w: 460, h: 440 }, windowComponent: SettingsFacet },
    explorer: { label: 'Explorer', defaultSize: { w: 280, h: 480 }, windowComponent: ExplorerFacet },
    grid: { label: 'Grid', defaultSize: { w: 640, h: 480 }, windowComponent: GridFacet },
  },
};

// Registry lookup with the MissingTool placeholder for unknown ids. The
// placeholder defs are cached so the component identity stays stable across
// renders (a fresh arrow every render would remount the window body).
const missingCache = new Map<string, ToolDef>();

export function resolveTool(defs: Record<ToolId, ToolDef>, id: string): ToolDef {
  const def = defs[id];
  if (def) return def;
  let m = missingCache.get(id);
  if (!m) {
    m = {
      label: id,
      defaultSize: { w: 420, h: 260 },
      windowComponent: () => createElement(MissingToolFacet, { toolId: id }),
    };
    missingCache.set(id, m);
  }
  return m;
}
