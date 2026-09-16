import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Grip, Tap } from '@owebeeone/grip-react';
import {
  grok, PluginRegistryTap, PLUGIN_REGISTRY, allTools, pluginFrom,
} from '@grythjs/plugin-api';
import './index'; // importing the plugin IS registering it
import {
  GYLD_PLUGIN, GYLD_DEST_STREAM, GYLD_DEST_PERSPECTIVE,
  GYLD_DEST_STREAM_TAP, GYLD_DEST_PERSPECTIVE_TAP,
  GYLD_TAB_FOLLOW, GYLD_TAB_FOLLOW_TAP,
} from './grips';
import {
  GYLD_BROWSER_TOOL, GYLD_DECIDE_NOW_TOOL, GYLD_DETAIL_TOOL, GYLD_STREAMS_TOOL,
} from './tools';

grok.registerTap(PluginRegistryTap);

const consume = grok.mainPresentationContext;
function drip<T>(grip: Grip<T>) {
  const d = consume.getOrCreateConsumer(grip);
  d.subscribe(() => {});
  return d;
}

const tools = () => allTools(drip(PLUGIN_REGISTRY).get());

// Stand in for the desktop chrome: a keyed tab context whose HOME context
// carries the tool's tabTaps, exactly as tabContextFor does
// (packages/desktop/src/tabContexts.ts).
function seedTab(key: string, params?: Record<string, unknown>) {
  const taps: Tap[] = tools()['gyld.browser'].tabTaps!(key, params);
  const ctx = grok.mainPresentationContext.getOrCreateMatchingContext(`tab:${key}`);
  const home = ctx.getGripHomeContext();
  for (const tap of taps) {
    home.registerTap(tap);
  }
  const read = <T,>(grip: Grip<T>) => {
    const d = ctx.getGripConsumerContext().getOrCreateConsumer(grip);
    d.subscribe(() => {});
    return d;
  };
  return { read, release: () => taps.forEach((tap) => home.unregisterTap(tap)) };
}

describe('gyld plugin registration', () => {
  it('inserts its entry under GYLD_PLUGIN when the module is imported', async () => {
    await expect.poll(() => pluginFrom(drip(PLUGIN_REGISTRY).get(), GYLD_PLUGIN)).toBeDefined();
  });

  it('the chrome finds gyld.browser via allTools', async () => {
    await expect.poll(() => tools()['gyld.browser']).toBeDefined();
    const tool = tools()['gyld.browser'];
    expect(tool.label).toBe('Graph');
    expect(tool.defaultSize).toEqual({ w: 900, h: 620 });
    expect(tool.role).toBe('stage');
    expect(typeof tool.windowComponent).toBe('function');
  });

  it('seeds the destination atoms per tab from the opening link params', async () => {
    const tab = seedTab('gyld-seeded', { stream: 'base', perspective: 'decisions' });
    await expect.poll(() => tab.read(GYLD_DEST_STREAM).get()).toBe('base');
    expect(tab.read(GYLD_DEST_PERSPECTIVE).get()).toBe('decisions');
    // the seeds publish their write handles, so a gesture reads and writes
    // through handle.get()/set, never through a render closure
    await expect.poll(() => tab.read(GYLD_DEST_STREAM_TAP).get()).toBeDefined();
    expect(tab.read(GYLD_DEST_PERSPECTIVE_TAP).get()).toBeDefined();
    tab.release();
  });

  it('advertises the record detail and the decide-now list too', async () => {
    await expect.poll(() => tools()['gyld.detail']).toBeDefined();
    expect(tools()['gyld.detail'].label).toBe('Details');
    expect(tools()['gyld.detail'].role).toBe('inspector');
    expect(tools()['gyld.decidenow'].label).toBe('Next up');
    expect(tools()['gyld.decidenow'].role).toBe('pulse');
  });

  it('names its windows plainly and keeps every tool id (owner ruling U5)', async () => {
    await expect.poll(() => Object.keys(tools()).length).toBeGreaterThanOrEqual(7);
    // The labels a launcher shows, everywhere and not only in the Gyld-only
    // target. Decide, compare and diff keep theirs: the report names no plain
    // word for them.
    expect(Object.fromEntries(
      Object.entries(tools())
        .filter(([id]) => id.startsWith('gyld.'))
        .map(([id, tool]) => [id, tool.label]),
    )).toEqual({
      'gyld.browser': 'Graph',
      'gyld.streams': 'Streams',
      'gyld.detail': 'Details',
      'gyld.decidenow': 'Next up',
      'gyld.decide': 'Gyld decide',
      'gyld.compare': 'Gyld compare',
      'gyld.diff': 'Gyld diff',
    });
    // and the IDS are untouched, because a stored layout, a wire and every
    // link written inside this plugin resolve by them
    expect(GYLD_BROWSER_TOOL).toBe('gyld.browser');
    expect(GYLD_DECIDE_NOW_TOOL).toBe('gyld.decidenow');
    expect(GYLD_DETAIL_TOOL).toBe('gyld.detail');
    expect(GYLD_STREAMS_TOOL).toBe('gyld.streams');
  });

  it('seeds a sink NOTHING, so a wired window resolves its source', async () => {
    await expect.poll(() => tools()['gyld.detail']).toBeDefined();
    // opened wired (Desktop.OpenWired passes no params): a DESTINATION seed
    // here would sit below the source's parent edge and shadow it for ever.
    // The one tap a wired detail window does seed provides `Gyld.Tab.Follow`
    // and nothing else, which no browser publishes, so it shadows nothing.
    expect(tools()['gyld.detail'].tabTaps!('sink').flatMap((tap) => [...tap.provides]))
      .toEqual([GYLD_TAB_FOLLOW, GYLD_TAB_FOLLOW_TAP]);
    expect(tools()['gyld.decidenow'].tabTaps!('sink')).toEqual([]);
    // opened standalone: its own destination, seeded from its own link
    expect(tools()['gyld.detail'].tabTaps!('own', {
      stream: 'base', ref: 'glade_decisions:GladeDecisions.scope_model',
    })).toHaveLength(3);
    expect(tools()['gyld.decidenow'].tabTaps!('own', { stream: 'base' })).toHaveLength(1);
  });

  it('two tabs are independent destinations', async () => {
    const a = seedTab('gyld-a', { stream: 'base', perspective: 'decisions' });
    const b = seedTab('gyld-b', { stream: 'keys-2026-09-13', perspective: 'architecture' });
    await expect.poll(() => a.read(GYLD_DEST_STREAM).get()).toBe('base');
    await expect.poll(() => b.read(GYLD_DEST_STREAM).get()).toBe('keys-2026-09-13');
    expect(a.read(GYLD_DEST_PERSPECTIVE).get()).toBe('decisions');
    expect(b.read(GYLD_DEST_PERSPECTIVE).get()).toBe('architecture');
    a.release();
    b.release();
  });

  it('leaves the destination EMPTY when the link carries none (no invented default)', async () => {
    const tab = seedTab('gyld-empty');
    await expect.poll(() => tab.read(GYLD_DEST_STREAM_TAP).get()).toBeDefined();
    expect(tab.read(GYLD_DEST_STREAM).get()).toBe('');
    expect(tab.read(GYLD_DEST_PERSPECTIVE).get()).toBe('');
    tab.release();
  });

  it('ignores non-string link params rather than coercing them', async () => {
    const tab = seedTab('gyld-junk', { stream: 42, perspective: null });
    await expect.poll(() => tab.read(GYLD_DEST_STREAM_TAP).get()).toBeDefined();
    expect(tab.read(GYLD_DEST_STREAM).get()).toBe('');
    expect(tab.read(GYLD_DEST_PERSPECTIVE).get()).toBe('');
    tab.release();
  });
});

// The desktop scales every window's text by setting a px font-size on
// `.desktop` from `Desktop.FontScale` (packages/desktop/src/Desktop.tsx), so
// only em-sized text follows the user's scale. This is the same file-read the
// preview suite does for its fixtures.
describe('gyld.css follows the desktop font scale', () => {
  it('sizes no text in px, because a px font-size ignores Desktop.FontScale', () => {
    const css = readFileSync(new URL('./gyld.css', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ''); // prose may say "12px" about the past
    // `font-size:` and the `font:` shorthand both carry a size; neither may be px.
    const sized = css.match(/\bfont(?:-size)?\s*:[^;}]*/g) ?? [];
    expect(sized.filter((declaration) => /\dpx/.test(declaration))).toEqual([]);
  });
});
