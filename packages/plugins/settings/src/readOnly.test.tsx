import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GripProvider } from '@owebeeone/grip-react';
import { GRYTH_READ_ONLY, grok, grythReadOnlyTap } from '@grythjs/plugin-api';
import { Settings } from './Settings';

// The Settings panel honours GRYTH_READ_ONLY (G-3): every control that edits
// the desk is disabled when the mode is set in its mounting context, and none
// is otherwise.

const CONTROLS = /<(button|input)\b/g;

describe('Settings under GRYTH_READ_ONLY', () => {
  it('enables every control by default', () => {
    const html = renderToStaticMarkup(<GripProvider grok={grok}><Settings /></GripProvider>);
    expect(html.match(CONTROLS)!.length).toBeGreaterThan(5);
    expect(html).not.toContain('disabled=""');
  });

  it('disables every control when the mode is set', async () => {
    const ctx = grok.mainPresentationContext.getOrCreateMatchingContext('settings-readonly');
    ctx.getGripHomeContext().registerTap(grythReadOnlyTap(true));
    const warm = ctx.getGripConsumerContext().getOrCreateConsumer(GRYTH_READ_ONLY);
    warm.subscribe(() => {});
    await expect.poll(() => warm.get()).toBe(true);
    const html = renderToStaticMarkup(<GripProvider grok={grok} context={ctx}><Settings /></GripProvider>);
    const controls = html.match(CONTROLS)!.length;
    expect(html.match(/disabled=""/g)!.length).toBe(controls);
  });
});
