import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GripProvider, type GripContextLike } from '@owebeeone/grip-react';
import { grok, grythReadOnlyTap } from '@grythjs/plugin-api';
import { registerDesktopTaps } from './taps.desktop';
import { openWindow, openFoundation } from './ops';
import { HUB } from './foundations';
import Window from './Window';
import FoundationWindow from './FoundationWindow';

// Stable DOM anchors (G-1) on the frame and the body, and the chrome's
// read-only stance (G-3): with GRYTH_READ_ONLY set in the mounting context the
// close and minimize controls are disabled and the resize grip is gone.

registerDesktopTaps(grok);
const RECT = { x: 0, y: 0, w: 300, h: 200 };

function frame(ctx: GripContextLike = grok.mainPresentationContext) {
  const opened = openWindow([], 'welcome', { w: 300, h: 200 }, 1, { p: 1 });
  const win = opened.list[0];
  return renderToStaticMarkup(
    <GripProvider grok={grok} context={ctx}>
      <Window win={win} rect={RECT} z={1} focused dropTarget={false} overview={null} deskAnim={null} />
    </GripProvider>,
  );
}

describe('DOM anchors', () => {
  it('the frame and its body name the window, tab and tool', () => {
    const html = frame();
    const anchors = 'data-gryth-window="w1" data-gryth-tab="t1" data-gryth-tool="welcome"';
    expect(html).toContain(`<section ${anchors}`);
    expect(html).toContain(`<div class="gwin-body" ${anchors}>`);
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('class="gwin-resize"');
  });

  it('a foundation frame names its window', () => {
    const out = openFoundation([], 1, HUB, {}, {});
    const f = out.list.find((w) => w.foundation)!;
    const html = renderToStaticMarkup(
      <GripProvider grok={grok}><FoundationWindow win={f} rect={RECT} /></GripProvider>,
    );
    expect(html).toContain(`<section class="gwin foundation" data-gryth-window="${f.id}"`);
  });
});

describe('GRYTH_READ_ONLY in the window chrome', () => {
  it('disables close and minimize and drops the resize grip', async () => {
    const ctx = grok.mainPresentationContext.getOrCreateMatchingContext('readonly-desk');
    ctx.getGripHomeContext().registerTap(grythReadOnlyTap(true));
    const warm = ctx.getGripConsumerContext().getOrCreateConsumer(grythReadOnlyTap().provides[0]);
    warm.subscribe(() => {});
    await expect.poll(() => warm.get()).toBe(true);
    const html = frame(ctx);
    expect(html).toContain('title="Minimize" disabled=""');
    expect(html).toContain('title="Close tab" disabled=""');
    expect(html).not.toContain('gwin-resize');
  });
});
