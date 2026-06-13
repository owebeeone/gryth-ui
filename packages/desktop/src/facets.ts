import { createElement } from 'react';
import type { GrythPlugin, ToolDef, ToolId } from '@grythjs/plugin-api';
import { GridFacet, MissingToolFacet, WelcomeFacet } from './facetComponents';

// The desktop's own builtin tools — published at DESKTOP_BUILTINS_PLUGIN by
// registerDesktopTaps like any other plugin. These are SHELL tools, not
// plugins: `welcome` is the first-run window the shell opens by id, and
// `grid` is the foundation placeholder (foundations are core window
// management). The migratable facets now live in their group packages —
// settings → plugin-settings, explorer/diff → plugin-code, chat →
// plugin-chat (see PluginMigration.md).

export const DESKTOP_BUILTINS: GrythPlugin = {
  tools: {
    welcome: { label: 'Welcome', defaultSize: { w: 520, h: 280 }, windowComponent: WelcomeFacet },
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
