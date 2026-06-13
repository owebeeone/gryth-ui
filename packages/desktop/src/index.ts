// @grythjs/desktop — the window manager as a library. The app composes:
// registerDesktopTaps(grok) + render <Desktop/>. Implements the shell side
// of the plugin contract (dev-docs/GrythPluginContract.md).
import './desktop.css';

export { default as Desktop } from './Desktop';
export { registerDesktopTaps } from './taps.desktop';
export * from './grips.desktop';
export * from './themes';
export * from './ops';
export * from './ticker';
export { DESKTOP_BUILTINS, resolveTool } from './facets';
