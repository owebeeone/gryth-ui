import { GlialBinder } from '@owebeeone/glial-runtime';
import { glialTap, type GlialTapController } from '@owebeeone/glial-runtime/grip';
import { defineManifest } from '@owebeeone/glial-runtime/manifest';
import { defineGrip, grok, PluginRegistryTap, WORKSPACE_NAME } from '@grythjs/plugin-api';
import { registerDesktopTaps } from '@grythjs/desktop';

// App-level taps: the composition root's own providers. Shell chrome taps live
// in @grythjs/desktop. The workspace-name surface is the first incremental
// Glial cutover: consumers still request WORKSPACE_NAME and know nothing about
// its persistence/delivery provider.

export const GrythSurfaces = defineManifest({
  workspaceName: {
    id: 'gryth.workspace.name',
    shape: 'value',
    share: 'gryth-local',
  },
});

/** Provider-side write capability; ordinary UI consumers keep using only
 * WORKSPACE_NAME. A real workspace service can hold this grip without changing
 * any existing component contract. */
export const WORKSPACE_NAME_CONTROL = defineGrip<GlialTapController<string>>(
  'Doc.WorkspaceName.GlialControl',
);

export const workspaceNameBinder = new GlialBinder(undefined, 'gryth-ui');

export const WorkspaceNameTap = glialTap({
  binder: workspaceNameBinder,
  decl: GrythSurfaces.workspaceName,
  grip: WORKSPACE_NAME,
  handleGrip: WORKSPACE_NAME_CONTROL,
  fill: { domain: 'gryth-local' },
});

let seededWorkspaceName = false;

export function registerAllTaps() {
  // the registry tap lives in the context graph like every other tap;
  // entries added before it attaches publish on attach
  grok.registerTap(PluginRegistryTap);
  registerDesktopTaps(grok);
  grok.registerTap(WorkspaceNameTap);
  // Preserve the existing demo value, but send it through the Glial instance
  // write/fold path. This seed is provider policy, not a WORKSPACE_NAME consumer
  // default, and runs at most once per application composition root.
  if (!seededWorkspaceName) {
    WorkspaceNameTap.set('mock-workspace');
    seededWorkspaceName = true;
  }
}
