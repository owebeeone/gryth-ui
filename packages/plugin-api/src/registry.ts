import type { JSX } from 'react';
import { createAtomValueTap, type AtomTapHandle, type Grip, type Tap } from '@owebeeone/grip-react';
import { defineGrip } from './runtime';

// The plugin registry is GRIP-KEYED (see dev-docs/GrythPluginContract.md):
// each plugin's identity is its own typed grip, used as the KEY into one
// immutable registry map. The whole mechanism is an ordinary atom tap with
// a special setter — addEntry/removeEntry are COW mutations (copy the map,
// mutate the copy, set it), so subscribers only ever see immutable
// snapshots. Entries are runtime-only (component factories): rebuilt every
// client start, never persisted.

export type ToolId = string;

// Context-mounted components: they render from whatever grips their
// mounting context resolves. menuTitle/tabTitle mount in the DESKTOP/TAB
// chrome; windowComponent receives the tab's identity so it can create its
// OWN keyed matching child context (the CoinColumn pattern) for
// per-instance state — multiple windows of one tool stay independent.
export type GripComponentFactory = () => JSX.Element;
export interface ToolViewProps {
  tabId: string;
  // the LINK snapshot that opened this tab (serializable grip values)
  params?: Record<string, unknown>;
}
export type ToolView = (props: ToolViewProps) => JSX.Element;

// A LINK (the grip-lab lineage): the serializable bundle that locates a
// specific view — a tool id plus the grip values that recreate it when
// seeded into a fresh tab. Links travel anywhere data does: chat messages,
// activity feeds, agent plans.
export interface ToolLink {
  toolId: ToolId;
  params?: Record<string, unknown>;
}

// The desktop's open intent, published by the shell as a grip value:
// chrome, plugins, and agents all invoke the SAME surface. Window policy
// v1: invoking a link ALWAYS opens a new window (find-or-switch an
// existing view is a later optimization).
export type OpenTool = (link: ToolLink) => void;
export const DESKTOP_OPEN_TOOL = defineGrip<OpenTool>('Desktop.OpenTool');

// Attribution surface for human- and agent-created things (sessions,
// machines, runs): who acted, and on whose behalf.
export interface PrincipalRef {
  principal: string;
  onBehalfOf?: string;
}

// Shell-provided READ surface: every tab's link (toolId + params),
// published by the desktop as serializable data. This is how a plugin
// learns "which views are open" without touching the window manager —
// e.g. the session browser derives attached/orphaned sessions from it.
export interface TabLinkInfo {
  tabId: string;
  toolId: ToolId;
  params?: Record<string, unknown>;
}
export const DESKTOP_TAB_LINKS = defineGrip<TabLinkInfo[]>('Desktop.TabLinks', []);

// Shell-provided intent: replace an existing tab's link params (the
// "send to an EXISTING window" half of link invocation — the view
// re-resolves against the new params).
export type RetargetTab = (tabId: string, params: Record<string, unknown>) => void;
export const DESKTOP_RETARGET_TAB = defineGrip<RetargetTab>('Desktop.RetargetTab');

// Shell-provided intent: open (or focus) a SINK tab WIRED to a source tab.
// The shell makes the source's grip context a parent of the sink's, so the
// sink reads whatever the source publishes (e.g. the explorer's current
// WTA) live, through the context graph — no params copied. One sink per
// (source, toolId): a second call focuses the existing wire instead of
// spawning, which is the IDE "current editor" reuse falling out of the
// graph. This is the patchbay's connect primitive.
export type OpenWired = (sourceTabId: string, link: ToolLink) => void;
export const DESKTOP_OPEN_WIRED = defineGrip<OpenWired>('Desktop.OpenWired');

// Shell-provided intent: open a SOURCE seeded from `params` plus a SINK
// WIRED to it, in one shot — the patchbay's "drop a connected pair" (e.g. a
// workspace-graph file click opens an explorer AT the file and a viewer
// following it). The source's tab id is resolved internally so the sink can
// name it.
export type OpenWiredPair = (
  sourceToolId: ToolId,
  sinkToolId: ToolId,
  params?: Record<string, unknown>,
) => void;
export const DESKTOP_OPEN_WIRED_PAIR = defineGrip<OpenWiredPair>('Desktop.OpenWiredPair');

// Shell-provided intent: PIN (freeze) a tab — snapshot `params` onto it and
// cut its wire, so it stops following its source and becomes a permanent
// view. The live "current editor" reused one sink; pinning sheds a frozen
// copy so the next selection opens a fresh live one (the IDE preview-vs-
// pinned split, which is snapshot-vs-live made a gesture).
export type PinTab = (tabId: string, params: Record<string, unknown>) => void;
export const DESKTOP_PIN_TAB = defineGrip<PinTab>('Desktop.PinTab');

export interface ToolDef {
  label: string;                     // canonical text: measurement, a11y, agents
  defaultSize: { w: number; h: number };
  role?: string;                     // foundations map roles → areas
  menuTitle?: GripComponentFactory;  // launcher entry; label renders when absent
  tabTitle?: GripComponentFactory;   // ticker segment; label renders when absent
  windowComponent: ToolView;         // prop-less components remain assignable
  // Per-instance taps SEEDED into the tab's chrome-held context when the
  // tab is created and unregistered when the tab record leaves the desktop
  // document. This is where per-tab state lives (selection atoms, form
  // drafts, stateful engines): it survives unmount/remount — a window's
  // context lifetime equals the TAB's lifetime, not the React mount's.
  // `params` is the tab's opening LINK, so a seed can rehydrate from it
  // (e.g. an explorer opened AT a file seeds its WTA from the link).
  tabTaps?: (tabId: string, params?: Record<string, unknown>) => Tap[];
}

// The plugin object a plugin publishes under its grip. Window-instantiable
// tools are advertised here; root taps are REGISTERED (the ordinary way,
// into the context graph), not advertised.
export interface GrythPlugin {
  tools?: Record<ToolId, ToolDef>;
}

export type PluginRegistry = ReadonlyMap<Grip<unknown>, unknown>;

export const PLUGIN_REGISTRY = defineGrip<PluginRegistry>('Plugins.Registry', new Map());
export const PLUGIN_REGISTRY_TAP = defineGrip<AtomTapHandle<PluginRegistry>>('Plugins.Registry.Tap');

// The registry tap — an atom tap like any other, registered into the
// context graph by the composition root. Its setter is advertised through
// the graph at PLUGIN_REGISTRY_TAP (the standard handleGrip pattern).
export const PluginRegistryTap = createAtomValueTap(PLUGIN_REGISTRY, {
  initial: new Map() as PluginRegistry,
  handleGrip: PLUGIN_REGISTRY_TAP,
});

// The special setters: copy, mutate, set. Re-adding on the same grip
// REPLACES the entry (HMR-safe); every add should pair with a remove on
// unload, or stale entries hold dead component refs.
export function addEntry<P>(grip: Grip<P>, plugin: P): void {
  PluginRegistryTap.update((prev) => {
    const next = new Map(prev);
    next.set(grip as Grip<unknown>, plugin);
    return next;
  });
}

export function removeEntry(grip: Grip<unknown>): void {
  PluginRegistryTap.update((prev) => {
    if (!prev.has(grip)) return prev;
    const next = new Map(prev);
    next.delete(grip);
    return next;
  });
}

// Typed read: the grip parameter carries the entry's type.
export function pluginFrom<P>(registry: PluginRegistry | undefined, grip: Grip<P>): P | undefined {
  return registry?.get(grip as Grip<unknown>) as P | undefined;
}

// Flatten every entry's tools into one ToolId → ToolDef lookup — the
// chrome's resolution surface (it enumerates registry DATA, never imports
// a plugin). Map insertion order is deterministic: on a tool-id collision
// the later-registered plugin wins.
export function allTools(registry: PluginRegistry | undefined): Record<ToolId, ToolDef> {
  const out: Record<ToolId, ToolDef> = {};
  if (!registry) return out;
  for (const entry of registry.values()) {
    const tools = (entry as GrythPlugin | undefined)?.tools;
    if (tools) Object.assign(out, tools);
  }
  return out;
}
