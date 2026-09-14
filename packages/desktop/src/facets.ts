import { createElement } from 'react';
import type { GrythPlugin, ToolDef, ToolId } from '@grythjs/plugin-api';
import { GridFacet, MissingToolFacet, WelcomeFacet } from './facetComponents';
import type { RoleMap } from './ops';

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

// Every tool's declared ROLE, as the RoleMap the docking-home rule takes.
// Registry DATA again: the chrome reads what plugins declare and imports
// none of them, so a preset places a tool it has never heard of.
export function toolRoles(defs: Record<ToolId, ToolDef>): RoleMap {
  const roles: RoleMap = {};
  for (const [id, def] of Object.entries(defs)) {
    if (def.role !== undefined) {
      roles[id] = def.role;
    }
  }
  return roles;
}

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
