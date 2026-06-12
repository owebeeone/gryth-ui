# Gryth plugin contract

Status: **draft v2** — context-graph model. (v1 — a registry/RPC model with
`createInstance`/`contextFor`/`PluginContextSpec` — was rejected: it rebuilt
the grip context graph as *data about taps* one meta-level up, which is why
it needed minted per-instance grip ids and a stored `Tools.Contexts` map.
Instance-ness comes from contexts, not from registries.)

## Core position

All plugin communication is grips, resolved through the **context graph**.
There is no plugin method surface. The shell never imports a tool; a tool
never imports the shell — enforced by packaging: the contract lives in
`@grythjs/plugin-api` (a BIDIRECTIONAL package declaring what plugins provide
and what the shell provides), the window manager is the `@grythjs/desktop`
library implementing the shell side, and plugins depend on the API package
only (see `PluginMigration.md`, Phase −1).

- The shell owns windows, tabs, docking, focus, z-order, layout.
- A plugin owns its taps, sources, commands, and rendering.
- The desktop document is the ONLY persisted artifact. It stores
  serializable references — `toolId`, params, source refs, placement —
  never components, closures, or runtime handles.

## The context graph

1. The desktop creates a **child grip context per tab**. That context IS
   the instance: identity, lifetime, and scope come from the graph. There
   is no `InstanceId` registry.
2. The desktop **seeds** the context: it inserts atom taps for what the
   persisted tab record carries (`Tool.Id`, `Tool.Params`, `Tool.SourceRef`)
   and chrome facts a tool may want (`Tab.Focused`, `Tab.DockedArea`).
   Seeded atoms are **backed by the tab record** — writing one (via its
   published handle) round-trips into the desktop document. The document
   stays the single source of truth.
3. A plugin registers its taps ONCE, at its own context level. One tap
   serves every instance simultaneously via **destination parameter
   grips**: the terminal-output tap resolves per-destination against each
   window context's `Tool.SourceRef`. No per-instance setup call exists.
4. Grips flow both ways:
   - plugin → shell: `Tab.Title`, `Tool.Status`, and `Tool.View` — the
     rendered component itself as a **runtime-only grip value**. The shell
     renders whatever `Tool.View` resolves to and shows a MissingTool
     placeholder when it is unresolved. Mock/real/remote swap is provider
     resolution (the WeatherPanel story), invisible to chrome.
   - shell → plugin: the seeded atoms above.
5. Commands are **handle grips in the context** (the `handleGrip` pattern):
   UI buttons and delegated agents write the same grips. (Ordering caveat
   below.)
6. Teardown is structural: closing a tab drops its context — subscriptions
   unwind, instance-scope state evaporates. Doc-scope sources live ABOVE
   the window contexts and survive detached: closing a window MUST NOT
   close its source unless the source-close command is invoked.

## Persistence

```ts
interface TabRecord {
  id: string;
  toolId: string;
  params: Record<string, unknown>;   // includes source refs, all serializable
}
```

Scope rules for plugin atoms (declared per tap, drives persistence):

- `doc` — shared artifact state.
- `environ` — the user's durable desktop state; persists and roams.
- `instance` — local client state; never persisted or replicated.

## Registration and discovery

**The registry is an atom tap with a special setter, GRIP-KEYED.** Each
plugin's identity is its own typed grip, used as the KEY into one
immutable registry map published at `Plugins.Registry`. `addEntry` /
`removeEntry` are **COW mutations** — copy the map, mutate the copy, set
it — so subscribers only ever see immutable snapshots, and re-adding on a
grip REPLACES the entry (HMR-safe). The setter is advertised through the
graph at `Plugins.Registry.Tap`, the standard `handleGrip` pattern —
bootstrap code calls `addEntry` directly; runtime participants resolve the
handle and apply the same COW update. A consumer hard-codes the grip of
the plugin it needs and reads it as the typed key:
`pluginFrom(useGrip(PLUGIN_REGISTRY), TERMINALS_PLUGIN)` — the grip's type
parameter carries the entry's type, so nothing is stringly-typed. The
desktop holds no plugin directory — it is TOLD what to mount and knows
only how to instantiate a plugin's components in window chrome, inside a
per-instance keyed matching child context (the demo's CoinColumn pattern:
`useKeyedMatchingContext` with a matcher init).

Disciplines that keep it sound:

- Grip-keyed entries are typed end to end — no stringly-typed ids at the
  contract surface; static typing flows from the grip's type parameter.
- Re-registration on the same grip REPLACES the entry (HMR-safe); every
  add pairs with a remove (registration yields its own disposal). Without
  it, unload/HMR leaves stale entries holding dead component refs.
- Entries are **instance-scope, runtime-only** (they carry component
  factories). Rebuilt on every client start; never persisted. Serialized
  references store the grip's KEY string and resolve through the
  GripRegistry.
- The registry solves advertisement and lifecycle, NOT module loading.
  Something must still execute the plugin module so it can insert itself:
  the composition root (`import.meta.glob('./plugins/*/index.ts')` locally;
  `import(url)` for remote plugins later). The window manager itself never
  imports a tool — the entry point is the one legitimate place. No
  ordering rule exists: entry taps register on first use.

A plugin object advertises the plugin's window-instantiable tools. Each
tool provides UI resources as **context-mounted components** — they render
from whatever grips their mounting context resolves:

```ts
// each plugin defines its own typed grip — the grip IS the identity
export const TERMINALS_PLUGIN = defineGrip<GrythPlugin>('Terminals.Plugin');

interface GrythPlugin {
  tools?: Record<ToolId, {
    label: string;                          // canonical text; serializable
    defaultSize: { w: number; h: number };
    role?: string;          // semantic role; foundations map roles → areas
    menuTitle?: GripComponentFactory;       // mounts in the DESKTOP context
    tabTitle?: GripComponentFactory;        // mounts in the TAB context
    windowComponent: GripComponentFactory;  // mounts in the TAB context
  }>;
}

// bootstrap (module init): the special setter — copy, mutate, set
addEntry(TERMINALS_PLUGIN, plugin);
// consumers: the grip is the typed key
const terminals = pluginFrom(useGrip(PLUGIN_REGISTRY), TERMINALS_PLUGIN);
```

`menuTitle` exists before any instance does (so it can show counts or
availability from desktop/doc grips); `tabTitle` and `windowComponent`
resolve against the tab's seeded context. Strings remain data: the
canonical title is the `Tab.Title` STRING grip (the ticker solver measures
it; sidebars, ghosts, tooltips, and headless agents read it); `tabTitle`
is presentation clipped to the solved width.

Manifests advertise a *role*, not an area name — foundations own their area
vocabulary (`designate`).

**There is no separate "root plugin" kind.** Every plugin has a root
registration step (its taps, registered once, plus its registry insert);
some additionally advertise window tools; some advertise none. Settings is
the first conversion precisely because it shows the split: the theme /
wallpaper / zoom / font-scale taps are root-level desktop state that exists
whether or not any window is open; the Settings *panel* is just a window
tool whose view edits those grips.

## Plugin kinds and invocation

Three kinds of plugin UI — a UX taxonomy over ONE mechanism:

- **Utility** — terminal, settings, code viewer/editor. Activated by an
  event (usually a user gesture); the DESKTOP is the invoker.
- **Primary UI** — needed to start anything: workspace selector/browser/
  creator, user management. Exists ABOVE `Workspace.Id` (it is what gets
  to set it); the APP ROOT is the invoker. May render full-bleed (the
  "no workspace open" state) or in chrome slots.
- **Contextual UI** — invoked in the context of another UI: sessions for a
  workspace, a file viewer from the explorer, a command executor, VM
  manager actions. ANOTHER COMPONENT is the invoker and supplies the
  context.

The mechanism is single: invocation is a LINK (the grip-lab lineage — the
serializable bundle that locates a specific view) written to the intent:

```ts
interface ToolLink { toolId: ToolId; params?: Record<string, unknown> }
Desktop.OpenTool: (link: ToolLink) => void
// published by the shell as a grip VALUE; the launcher, plugins, and
// agents all open views through this one surface. params land on the tab
// record (serializable — they ride merge/detach and rehydrate the view)
// and reach the tool as ToolViewProps.params.
```

**DECIDED — window policy v1: a link ALWAYS opens a new window** (docking
home on a gridded desktop). Find-an-existing-view-and-switch is a later
optimization; the link shape doesn't change when it lands. Links compose:
one gesture may fire several — the worked example below opens the explorer
revealed at a file AND the viewer on that file (anchored to its
branch/HEAD ref) from a single click in the workspace graph.

— and "activated by an event" just means SOMEONE wrote it: a user gesture,
a menu entry, an agent, or another plugin are all the same writer. A
tool's kind is not fixed: the workspace browser is primary as the
full-bleed bootstrap state and utility as a window opened from inside a
workspace.

**Invocation lifetime rules** (the contextual-UI trap — the invoker's
context can die before the invokee):

- **Snapshot (default):** the invoker's relevant params (workspace id,
  path, session id, vm id) are COPIED into the new tab's seeded atoms at
  invocation. Independent lifetime; and because the seed is serializable,
  the tab record is rehydratable after reload.
- **Live link:** only to contexts guaranteed to outlive the invokee —
  workspace, doc, environ ("sessions for THIS workspace"). Peer-to-peer
  coupling (viewer follows explorer selection) is NEVER context
  parentage — it is a shared grip (`Explorer.Selection`) the invokee opts
  into reading. Master/detail via data, not lifetime coupling.

The desktop document handle (`Desktop.Windows.Tap`) remains the raw seam —
it is how agents already open and arrange windows (proved by the seam
tests). Retargeting an existing window needs no intent: it is a write to
that window context's seeded `Tool.SourceRef` handle, which round-trips
into the tab record.

## Worked example: terminal + terminal-sessions app

The orphaned-source inventory is itself a plugin — the contract eats its
own dogfood.

- A doc-scope source tap (provider-backed; mock first) publishes
  `Workspace.TerminalSessions`: `{ id, cwd, owner: PrincipalRef }[]` —
  every PTY the workspace knows, with human/agent attribution.
- A conversion derives `attachedTo` per session by scanning the desktop
  document for tabs whose params reference it. **Orphaned = no referencing
  tab** — detached sessions are always visible here, never leaked.
- Send-to-terminal:
  - existing terminal → write that window context's `Tool.SourceRef`
    handle (a document edit; the terminal tap re-resolves its output).
  - new terminal → write `Desktop.OpenTool` with
    `{ toolId: 'terminal', params: { session: id } }`.
- The terminal tool itself: `Terminal.Output` (source tap keyed by
  `Tool.SourceRef`), `Terminal.Command.Write/Resize/CloseSource` (handles),
  `Tab.Title` fed from the session's cwd, `Tool.Status` for liveness.

## Open questions

1. **Command ordering.** A `write` command as an atom write is last-write-
   wins: concurrent writers (two agents, agent + user) can lose input. The
   context graph gives commands an address, not a queue. Command streams
   need an exchange primitive with ordering/acks — likely a glade
   requirement, not a shell one. Until it exists, `write`-class commands
   are single-writer by convention.
2. **Cross-context addressing.** The sessions app references *another*
   window's context (to write its `Tool.SourceRef`). Today: a derived
   inventory grip carrying runtime handles (runtime-only, like renderers).
   Confirm this against grip-core's context-addressing facilities.
3. ~~Manifest registration~~ **RESOLVED by the registry tap**: a plugin's
   initialization inserts its entry; the declaration and the registration
   are the same act, so the "grip declared, tap never registered" failure
   is impossible by construction. The plugin scaffold should make the
   insert + paired removal the generated boilerplate.
4. ~~The workspace selector~~ **DECIDED — the boot flow.** The app boots
   into a PRE-DESKTOP state: no workspace, no desktop document, the
   workspace browser (primary UI) full-bleed. Selecting a workspace mounts
   THAT workspace's desktop — desktop documents are per-workspace
   environs, and `Workspace.Id` sits above the environ scope in the
   context graph. Doc-scope providers key on `Workspace.Id` (destination
   params), so switching workspaces re-resolves the whole desktop. The
   shell owns the slot and the rebind mechanics; the browser UI is
   plugin-provided like everything else.
