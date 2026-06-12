import { createAtomValueTap } from '@owebeeone/grip-react';
import { grok, PluginRegistryTap, WORKSPACE_NAME } from '@grythjs/plugin-api';
import { registerDesktopTaps } from '@grythjs/desktop';

// App-level taps: the composition root's own providers. Shell chrome taps
// live in @grythjs/desktop; the workspace provider becomes plugin-provided
// in migration Phase 2.

// Doc-scope workspace provider — not inherently a mock: this is simply the
// provider bound today. Matcher bindings (withOneOf on a provider grip)
// later choose between this and the gryth service behind the SAME grip;
// consumers never change.
export const WorkspaceNameTap = createAtomValueTap(WORKSPACE_NAME, {
  initial: 'mock-workspace',
});

export function registerAllTaps() {
  // the registry tap lives in the context graph like every other tap;
  // entries added before it attaches publish on attach
  grok.registerTap(PluginRegistryTap);
  registerDesktopTaps(grok);
  grok.registerTap(WorkspaceNameTap);
}
