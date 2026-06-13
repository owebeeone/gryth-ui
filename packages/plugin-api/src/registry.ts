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
  tabTaps?: (tabId: string) => Tap[];
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
