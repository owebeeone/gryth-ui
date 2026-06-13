import type { Drip, Grok, MatchingContext, Tap } from '@owebeeone/grip-react';
import type { ToolDef } from '@grythjs/plugin-api';
import { DESKTOP_WINDOWS, type WindowRecord } from './grips.desktop';

// Chrome-held per-tab grip contexts — the contract's "the desktop creates a
// child context per tab; that context IS the instance". The desktop holds
// each context STRONGLY for the lifetime of the TAB RECORD: unmounts are
// presentation events (desktop switch, minimize, overview) and must not
// destroy instance state. ToolDef.tabTaps register at creation; the reaper
// below mirrors the desktop document and retires contexts whose tab left
// it. This also removes the re-create churn the keyed-id GC race rode on.

interface TabEntry {
  ctx: MatchingContext;
  taps: Tap[];
}

const entries = new Map<string, TabEntry>();
let windowsDrip: Drip<WindowRecord[]> | null = null;

function sweep(windows: WindowRecord[] | undefined) {
  const live = new Set<string>();
  for (const w of windows ?? []) {
    for (const t of w.tabs) live.add(t.id);
  }
  for (const [tabId, entry] of entries) {
    if (live.has(tabId)) continue;
    const home = entry.ctx.getGripHomeContext();
    for (const tap of entry.taps) home.unregisterTap(tap);
    entries.delete(tabId);
  }
}

function startReaper(grok: Grok) {
  if (!windowsDrip) {
    windowsDrip = grok.mainPresentationContext.getOrCreateConsumer(DESKTOP_WINDOWS);
    windowsDrip.subscribe((windows) => sweep(windows));
  }
  // also sweep inline: notification delivery is queued, but the drip's
  // VALUE is current — render-time calls piggyback the sweep
  sweep(windowsDrip.get());
}

// Whether the desktop currently holds a context for this tab (tests, devtools).
export function hasTabContext(tabId: string): boolean {
  return entries.has(tabId);
}

export function tabContextFor(grok: Grok, tabId: string, def: ToolDef): MatchingContext {
  startReaper(grok);
  let entry = entries.get(tabId);
  if (!entry) {
    const ctx = grok.mainPresentationContext.getOrCreateMatchingContext(`tab:${tabId}`);
    const taps = def.tabTaps?.(tabId) ?? [];
    const home = ctx.getGripHomeContext();
    for (const tap of taps) home.registerTap(tap);
    entry = { ctx, taps };
    entries.set(tabId, entry);
  }
  return entry.ctx;
}
