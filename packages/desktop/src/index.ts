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
