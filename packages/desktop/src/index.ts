// @grythjs/desktop — the window manager as a library. The app composes:
// registerDesktopTaps(grok) + render <Desktop/>. Implements the shell side
// of the plugin contract (dev-docs/GrythPluginContract.md).
import './desktop.css';

export { default as Desktop } from './Desktop';
export { registerDesktopTaps, type DeskTool, type DesktopSetup } from './taps.desktop';
export * from './grips.desktop';
export * from './themes';
export * from './ops';
export * from './ticker';
// The pane presets a target may hand to registerDesktopTaps.
export { HUB, GYLD } from './foundations';
export { DESKTOP_BUILTINS, resolveTool, toolRoles } from './facets';
// A browser's stored appearance, for a target that carries it into the user's
// zone once (Glial appearance plan, Step 2.4): where an entry's stored desk is,
// and the one reader of its appearance. The rest of the document stays private.
export { readLegacyAppearance, type DeskAppearance } from './layoutDocument';
export { layoutKey, readStoredLayout, type LayoutStore } from './layoutStorageTap';

export { startSessionLayout, sessionLayoutKey, type DeskZone, type SessionFields } from './sessionLayout';
export type { DeskPorts, LayoutPersistence } from './layoutStorageTap';
