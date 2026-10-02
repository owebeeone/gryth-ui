import type { AtomTapHandle, Drip, Grok, MatchingContext, Tap } from '@owebeeone/grip-react';
import type { TabLinkField, ToolDef } from '@grythjs/plugin-api';
import { DESKTOP_WINDOWS, DESKTOP_WINDOWS_TAP, type TabRecord, type WindowRecord } from './grips.desktop';

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
  fields: readonly TabLinkField[];
  values: Map<TabLinkField, string | undefined>;
  releases: Array<() => void>;
  params?: string;
  // the source tab this sink is currently wired to (a parent edge on its
  // home context), so re-wiring is idempotent and rewires cleanly
  wiredTo?: string;
  // and the CONTEXT that edge points at, kept because the source tab may be
  // reaped before the sink is rewired — its entry is gone by then, and the
  // parent edge is only removable with the context object itself
  wiredCtx?: MatchingContext;
}

const entries = new Map<string, TabEntry>();
let windowsDrip: Drip<WindowRecord[]> | null = null;
let windowHandle: Drip<AtomTapHandle<WindowRecord[]>> | null = null;

function sweep(windows: WindowRecord[] | undefined) {
  const live = new Set<string>();
  for (const w of windows ?? []) {
    for (const t of w.tabs) {
      live.add(t.id);
      const entry = entries.get(t.id);
      if (entry !== undefined) { applyRecord(entry, t); }
    }
  }
  for (const [tabId, entry] of entries) {
    if (live.has(tabId)) { continue; }
    const home = entry.ctx.getGripHomeContext();
    for (const tap of entry.taps) { home.unregisterTap(tap); }
    for (const release of entry.releases) { release(); }
    entries.delete(tabId);
  }
}

function startReaper(grok: Grok) {
  if (!windowsDrip) {
    windowHandle = grok.mainPresentationContext.getOrCreateConsumer(DESKTOP_WINDOWS_TAP);
    windowHandle.subscribe(() => {});
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

export function tabContextFor(
  grok: Grok,
  tabId: string,
  def: ToolDef,
  params?: Record<string, unknown>,
): MatchingContext {
  startReaper(grok);
  let entry = entries.get(tabId);
  if (!entry) {
    const ctx = grok.mainPresentationContext.getOrCreateMatchingContext(`tab:${tabId}`);
    // params is the opening link — seeds may rehydrate from it (created once)
    const taps = def.tabTaps?.(tabId, params) ?? [];
    const home = ctx.getGripHomeContext();
    for (const tap of taps) { home.registerTap(tap); }
    entry = { ctx, taps, fields: def.linkFields ?? [], values: new Map(), releases: [] };
    entries.set(tabId, entry);
    const record = windowsDrip?.get()?.flatMap((w) => w.tabs).find((t) => t.id === tabId);
    applyRecord(entry, record ?? { id: tabId, facet: '', params });
  }
  return entry.ctx;
}

// Reapply only declared link atoms. No tab context or instance tap is replaced.
function applyRecord(entry: TabEntry, record: TabRecord): void {
  const signature = JSON.stringify([record.params, record.source]);
  if (entry.params === signature) { return; }
  entry.params = signature;
  const home = entry.ctx.getGripHomeContext();
  for (const field of entry.fields) {
    const existing = entry.taps.find((tap) => tap.provides.includes(field.grip));
    const owns = !(record.source !== undefined && field.inherited) && field.owns(record.params);
    const next = field.read(record.params);
    entry.values.set(field, JSON.stringify(next));
    if (!owns) {
      if (existing !== undefined) {
        home.unregisterTap(existing);
        entry.taps.splice(entry.taps.indexOf(existing), 1);
      }
      continue;
    }
    if (existing !== undefined) {
      if (JSON.stringify(field.get(existing)) !== JSON.stringify(next)) { field.set(existing, next); }
    } else {
      const atom = field.create(next);
      entry.taps.push(atom);
      home.registerTap(atom);
    }
    if (!watched(entry, field)) {
      const drip = entry.ctx.getGripConsumerContext().getOrCreateConsumer(field.grip);
      entry.releases.push(drip.subscribe(() => {
        const tap = entry.taps.find((t) => t.provides.includes(field.grip));
        if (tap === undefined) { return; }
        const value = field.get(tap);
        const stamp = JSON.stringify(value);
        if (entry.values.get(field) === stamp) { return; }
        entry.values.set(field, stamp);
        windowHandle?.get()?.update((windows) => windows.map((w) => ({
          ...w, tabs: w.tabs.map((t) => t.id === record.id
            ? { ...t, params: { ...t.params, ...field.write(value) } } : t),
        })));
      }));
      watches(entry).add(field);
    }
  }
}

const fieldWatches = new WeakMap<TabEntry, Set<TabLinkField>>();
function watches(entry: TabEntry): Set<TabLinkField> {
  let set = fieldWatches.get(entry);
  if (set === undefined) { set = new Set(); fieldWatches.set(entry, set); }
  return set;
}
function watched(entry: TabEntry, field: TabLinkField): boolean { return watches(entry).has(field); }

// WIRE a sink tab to its source: add the source's home as a (nearest,
// priority -1) parent of the sink's home, so the sink resolves whatever the
// source publishes (the live multi-parent path). Idempotent; rewires
// cleanly if the source changes. Both contexts must already exist
// (tabContextFor called for each).
export function wireTabSource(tabId: string, sourceTabId: string, sourceCtx: MatchingContext): void {
  const entry = entries.get(tabId);
  if (!entry || entry.wiredTo === sourceTabId) {
    return;
  }
  const home = entry.ctx.getGripHomeContext();
  if (entry.wiredCtx) {
    home.unlinkParent(entry.wiredCtx.getGripHomeContext());
  }
  const source = sourceCtx.getGripHomeContext();
  home.addParent(source, -1);
  // A sink wired AFTER its consumers have already resolved (the stream tree
  // adopting a browser, once the one it was opened against is closed) must be
  // re-resolved: grip tells its resolver about an unlinked parent and not
  // about an added one, so without this the sink keeps the resolution it had
  // before the edge existed — for the tree, the empty tab id that says
  // "no browser", for ever.
  home.getGrok().resolver.addParent(home, source);
  entry.wiredTo = sourceTabId;
  entry.wiredCtx = sourceCtx;
}

// UNWIRE a sink (e.g. when it is pinned/frozen): drop the source parent edge
// so it stops resolving the source's grips. Idempotent — a no-op if unwired.
export function unwireTab(tabId: string): void {
  const entry = entries.get(tabId);
  if (!entry?.wiredCtx) {
    return;
  }
  entry.ctx.getGripHomeContext().unlinkParent(entry.wiredCtx.getGripHomeContext());
  entry.wiredTo = undefined;
  entry.wiredCtx = undefined;
}
