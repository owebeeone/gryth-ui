import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GripProvider, type Grip } from '@owebeeone/grip-react';
import { grok } from '@grythjs/plugin-api';
import Desktop from './Desktop';
import { registerDesktopTaps } from './taps.desktop';
import { DESKTOP_DEBUG_SIDEBAR_TAP, DESKTOP_WINDOWS_TAP, SIDEBAR_OPEN_TAP } from './grips.desktop';

const content = () => <nav>Host tools</nav>;
const navigation = () => <nav>Application navigation</nav>;
function read<T>(grip: Grip<T>) {
  const consumer = grok.mainPresentationContext.getOrCreateConsumer(grip);
  consumer.subscribe(() => {}); grok.flush(); return consumer.get();
}
function render() {
  read(DESKTOP_WINDOWS_TAP)?.set([]); grok.flush();
  return renderToStaticMarkup(<GripProvider grok={grok}><Desktop /></GripProvider>);
}
describe('application navigation contract', () => {
  it('keeps the stock sidebar by default', () => {
    registerDesktopTaps(grok);
    expect(render()).toContain('class="sidebar"');
  });
  it('disallowed debug state cannot replace application navigation', () => {
    registerDesktopTaps(grok, { sidebar: { brand: 'Host', Content: content, Navigation: navigation, allowDebugSidebar: false } });
    read(DESKTOP_DEBUG_SIDEBAR_TAP)?.set(true);
    const html = render();
    expect(html).toContain('Application navigation');
    expect(html).not.toContain('Gryth debug sidebar');
    expect(html).not.toContain('sidebar-desktops');
  });
  it('suppresses the debug switch in both forms of the legacy application sidebar', () => {
    registerDesktopTaps(grok, { sidebar: { brand: 'Host', Content: content, allowDebugSidebar: false } });
    for (const open of [true, false]) {
      read(SIDEBAR_OPEN_TAP)?.set(open);
      expect(render()).not.toContain('Gryth debug sidebar');
    }
  });
  it('existing application hosts retain their optional debug sidebar', () => {
    registerDesktopTaps(grok, { sidebar: { brand: 'Host', Content: content, Navigation: navigation } });
    read(SIDEBAR_OPEN_TAP)?.set(true); read(DESKTOP_DEBUG_SIDEBAR_TAP)?.set(true);
    expect(render()).toContain('Gryth debug sidebar');
    read(DESKTOP_DEBUG_SIDEBAR_TAP)?.set(false);
    expect(render()).toContain('Application navigation');
  });
});
