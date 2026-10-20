import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createAtomValueTap, useGrip, Grok } from '@owebeeone/grip-react';
import { defineGrip, registry, type ToolDef } from '@grythjs/plugin-api';
import { ToolBody } from './ToolBody';
import { hasTabContext } from './tabContexts';

// ToolBody (G-2): a tool mounts on the context it is handed, in whatever grok
// that context belongs to, and nothing of the desk is created for it.

const SHOWN = defineGrip<string>('ToolBody.Shown', 'default');
const View = ({ tabId, params }: { tabId: string; params?: Record<string, unknown> }) => {
  const shown = useGrip(SHOWN);
  return <p>{tabId}:{String(params?.k)}:{shown}</p>;
};
const DEF: ToolDef = { label: 'V', defaultSize: { w: 1, h: 1 }, windowComponent: View };

describe('ToolBody', () => {
  it('renders the tool on a ready context of a separate grok, creating no tab context', async () => {
    const replay = new Grok(registry);
    const ctx = replay.mainPresentationContext.getOrCreateMatchingContext('replay:t9');
    ctx.getGripHomeContext().registerTap(createAtomValueTap(SHOWN, { initial: 'frozen' }));
    const warm = ctx.getGripConsumerContext().getOrCreateConsumer(SHOWN);
    warm.subscribe(() => {});
    await expect.poll(() => warm.get()).toBe('frozen');
    const html = renderToStaticMarkup(
      <ToolBody grok={replay} context={ctx} def={DEF} tabId="t9" params={{ k: 'v' }} />,
    );
    expect(html).toBe('<p>t9:v:frozen</p>');
    expect(hasTabContext('t9')).toBe(false);
  });

  it('takes a view directly in place of a def', () => {
    const replay = new Grok(registry);
    const html = renderToStaticMarkup(
      <ToolBody grok={replay} context={replay.mainPresentationContext} windowComponent={View} tabId="t1" />,
    );
    expect(html).toBe('<p>t1:undefined:default</p>');
  });
});
