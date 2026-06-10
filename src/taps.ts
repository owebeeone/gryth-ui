import { createAtomValueTap } from '@owebeeone/grip-react';
import { grok } from './runtime';
import { CURRENT_PAGE, CURRENT_PAGE_TAP, WORKSPACE_NAME } from './grips';

// Session-scope UI state: atom taps whose handles are themselves grips, so
// any authorized participant (UI, collaborator, agent) can set them.
export const CurrentPageTap = createAtomValueTap(CURRENT_PAGE, {
  initial: 'workspace',
  handleGrip: CURRENT_PAGE_TAP,
});

// Doc-scope mock provider. Stands in for the gryth service; when the real
// provider exists it binds the same grips (see grip-react-demo's
// withOneOf(WEATHER_PROVIDER_NAME, ...) bindings) and consumers don't change.
export const MockWorkspaceTap = createAtomValueTap(WORKSPACE_NAME, {
  initial: 'mock-workspace',
});

export function registerAllTaps() {
  grok.registerTap(CurrentPageTap);
  grok.registerTap(MockWorkspaceTap);
}
