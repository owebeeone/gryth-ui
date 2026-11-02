import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GripProvider } from '@owebeeone/grip-react';
import { addEntry, defineGrip, grok, PluginRegistryTap } from '@grythjs/plugin-api';
import { registerDesktopTaps } from './taps.desktop';
import Window from './Window';
import type { WindowRecord } from './grips.desktop';

vi.mock('./TickerStrip', () => ({ default: () => <nav>Tab navigation</nav> }));
registerDesktopTaps(grok);
grok.registerTap(PluginRegistryTap);
addEntry(defineGrip('CompactChromeTest'), { tools: {
  compact: { label: 'Inspector', compactChrome: true, defaultSize: { w: 400, h: 600 }, windowComponent: () => <p>Inspector fields</p> },
  standard: { label: 'Other application', defaultSize: { w: 400, h: 600 }, windowComponent: () => null },
} });
const record: WindowRecord = { id: 'compact-frame', tabs: [{ id: 'compact-tab', facet: 'compact' }], activeTab: 'compact-tab',
  desktop: 1, x: 0, y: 0, w: 400, h: 600, minimized: false, sticky: false, dock: { foundation: 'f', area: 'setup' } };
function render(win: WindowRecord) {
  return renderToStaticMarkup(<GripProvider grok={grok}><Window win={win} rect={{ x: 0, y: 0, w: 400, h: 600 }}
    z={1} focused={false} dropTarget={false} overview={null} deskAnim={null} /></GripProvider>);
}
it('offers an accessible handle and close action without a duplicate docked title', () => {
  const html = render(record);
  expect(html).toContain('compact-chrome'); expect(html).toContain('Close Inspector');
  expect(html).toContain('Inspector panel actions'); expect(html).not.toContain('gwin-title"');
});
it('retains normal chrome for floating and tabbed frames and hosts that did not opt in', () => {
  expect(render({ ...record, dock: undefined })).not.toContain('compact-chrome');
  const tabbed = render({ ...record, tabs: [...record.tabs, { id: 'second', facet: 'standard' }] });
  expect(tabbed).not.toContain('compact-chrome'); expect(tabbed).toContain('Tab navigation');
  expect(render({ ...record, tabs: [{ id: 'standard-tab', facet: 'standard' }] })).not.toContain('compact-chrome');
});
