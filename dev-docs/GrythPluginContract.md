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
- `environ` — the user's appearance; persists and roams across sessions.
- `session` — one named mirrored desk, including tab destinations and semantic inputs.
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
    tabTaps?: (tabId: string) => Tap[];     // seeded into the tab context
    linkFields?: readonly TabLinkField[];  // bidirectional serializable inputs
    replay?: 'full' | 'inspect-only';      // G-4, see "General additions"
  }>;
  commands?: Record<CommandId, CommandDef>; // G-5, see "General additions"
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

**DECIDED — tab contexts are CHROME-HELD.** The desktop owns one context
per tab, STRONGLY, for the lifetime of the TAB RECORD: a reaper mirrors
the desktop document and retires contexts (unregistering their taps) when
the tab leaves it. Unmounts are presentation events (desktop switch,
minimize, overview) and do NOT destroy instance state. `tabTaps` is the
seeding slot: per-tab atoms (selections, form drafts) and stateful taps
(the workspace graph sim) register at tab creation — ownership reads
`state ← tap ← context ← desktop document`. The chrome mounts
`windowComponent` inside a nested provider on that context, so tools use
plain `useGrip` with no context plumbing of their own; this also removes
the unmount/remount context churn the keyed-id GC race rode on.

### Live tab-link fields (SS-06)

A tool MUST declare serializable destination atoms through `linkFields` when
those inputs belong to the mirrored desk. `tabLinkField` supplies a codec,
value grip and setter grip. `read(params)` MUST provide a default when an input
is removed; `write(value)` MUST return a JSON-safe patch. The desktop MUST merge that
patch with the existing params and preserve unrelated parameters. A codec
MUST reconstruct runtime value objects, such as legend modes, from JSON.

The desktop MUST reapply changed records into an existing tab context and
MUST mirror local atom changes back into that record. It MUST preserve camera,
draft and other instance atoms, suppress echoes and release listeners on tab
removal. `inherited: true` fields on wired sinks MUST resolve through the
source context; they MUST NOT be copied into the sink's params. `owns(params)`
MAY exclude an input supplied elsewhere by that tool. Unknown parameters MUST
survive updates. Source providers remain above the tab context.

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

## General additions (G-1 to G-7)

Seven small, general-purpose surfaces, added as one change set with their own
tests. Each is useful to any gryth client; none changes the behaviour of a
client that does not use it. The shell side lives in `@grythjs/desktop`; the
contract side in `@grythjs/plugin-api`.

**G-1 — Stable DOM anchors.** The shell marks its structure with data
attributes, so a capture, test, e2e driver or accessibility tool finds frames
without depending on CSS classes:

- the desktop root (`.desktop`): `data-gryth-desktop="<n>"`, the current
  virtual desktop's number;
- every window frame (`section.gwin`) AND its body (`.gwin-body`):
  `data-gryth-window="<windowId>"`, `data-gryth-tab="<tabId>"` and
  `data-gryth-tool="<toolId>"`, naming the frame's ACTIVE tab and its tool;
- a foundation frame (`section.gwin.foundation`): `data-gryth-window` only; it
  has no tab.

The attributes are the contract; the class names remain presentation.

**G-2 — `ToolBody`.** The chrome-free tool mount:

```tsx
import { ToolBody } from '@grythjs/desktop';
<ToolBody grok={grok} context={ctx} def={toolDef} tabId="t3" params={params} />
// or, with the view directly:  windowComponent={toolDef.windowComponent}
```

It renders `<GripProvider grok context><Facet tabId params/></GripProvider>`
and nothing else. `Window.tsx` mounts its own tabs through it. `ToolBody` takes
a READY context: it creates no tab context, seeds no `tabTaps` and registers
nothing. `tabContextFor` stays in the desktop (`Window.tsx` calls it); a
replay, preview, documentation page or test hands `ToolBody` its own context
in its own `Grok`, and no live tab entry is made for it.

**G-3 — `GRYTH_READ_ONLY`.** A boolean grip in plugin-api, default `false`:

```ts
import { GRYTH_READ_ONLY, GRYTH_READ_ONLY_TAP, grythReadOnlyTap } from '@grythjs/plugin-api';
grok.registerTap(grythReadOnlyTap(true));          // a host: the whole desk
replayRoot.getGripHomeContext().registerTap(grythReadOnlyTap()); // a replay root
```

With no producer, every client behaves as before. A host (a kiosk or
presentation mode, a tab that is not the writer) or a replay root registers
`grythReadOnlyTap(initial = true)` in the context its tools mount under; its
handle is advertised at `GRYTH_READ_ONLY_TAP`, so the mode can be flipped at
runtime. Controls read it with `useGrip(GRYTH_READ_ONLY) ?? false`.

What honours it today:

- `@grythjs/plugin-settings` — the Settings panel: every control (scale, font
  scale, theme cards, the wallpaper checkbox and URL field, Reset layout) is
  disabled;
- `@grythjs/desktop` window chrome — the frame's close and minimize buttons
  are disabled, the resize grip is not rendered, and a titlebar drag (move) or
  resize drag does not start. Raise/focus and the context menu are not edits
  and still work.

What does not: opening tools (launcher, intents), desktop switching, the
sidebar's add/remove desktop and lock controls, and any plugin's own controls
unless that plugin reads the grip. It is advice to controls, not an
enforcement boundary: a tool that writes through a grip it does not guard is
not stopped by it.

**G-4 — `ToolDef.replay`.**

```ts
replay?: 'full' | 'inspect-only';   // type ToolReplay
```

A tool's declaration of whether it can render from FROZEN grip data, outside
a live desk. `'full'`: it reads everything it shows through grips and has no
side effect at mount that bypasses them, so a snapshot, preview or
documentation renderer may mount it (through `ToolBody`). `'inspect-only'`:
it must not be mounted there; the renderer shows its captured values instead.
**Undeclared means inspect-only to any renderer that mounts tools outside a
live desk** (fail-closed), unless that renderer's host policy says otherwise.
The live desktop ignores the field.

**G-5 — Commands.** A plugin declares app-level commands beside its tools:

```ts
import type { CommandDef, CommandContext } from '@grythjs/plugin-api';
addEntry(MY_PLUGIN, {
  tools: { ... },
  commands: {
    'my.export': { label: 'Export', hotkey: 'Mod+Shift+E', run: (ctx: CommandContext) => { ... } },
  },
});
```

`CommandDef` is `{ label, hotkey?, run(ctx) }`. `ctx` is `{ grok, context }`:
the shell's runtime and the context the command was invoked from (the
desktop's own, for the sidebar and hotkeys), from which a command resolves
the intents it needs. `context` is a `GripContextLike`, so the consumer comes
from its consumer context:
`ctx.context.getGripConsumerContext().getOrCreateConsumer(DESKTOP_OPEN_TOOL).get()`.
`allCommands(registry)` flattens every entry's commands as `allTools` does
(later entry wins a collision).

The shell lists every command in the sidebar — below the launcher, and below
the application sidebar's content when a composition supplies one — as a
`nav.sidebar-commands` of buttons, and binds the hotkeys in its own keyboard
handler (`Desktop.tsx`'s `onKeyDown`: no effect, no window listener).

Hotkey specs are modifiers joined with `+` and one key: `Mod+Shift+Y`,
`Ctrl+K`, `F2`, `Alt+ArrowUp`. `Mod` is Cmd on macOS and Ctrl elsewhere
(either matches). Key names are DOM `KeyboardEvent.key` names; letters are
case-insensitive. A letter or digit also matches by `KeyboardEvent.code`
(`KeyY`, `Digit1`), so `Mod+Shift+1` fires although the event's `key` is `!`,
and `Alt+I` fires on macOS although `key` is a diacritic. Parsing and matching
are exported (`parseHotkey`, `hotkeyMatches`, `hotkeyCollides`, `hotkeyKey`).

Two shell behaviours a host should know: a hotkey does **not** fire while
focus is in an `<input>`, `<textarea>` or contenteditable element (the shell's
existing guard, so typing is never hijacked), and it fires only while focus is
inside the `.desktop` element, because the shell binds in `Desktop.tsx`'s own
`onKeyDown` rather than on `window`. A held chord fires its command **once**:
auto-repeats are swallowed, not run (`keydownCommand` in `@grythjs/desktop`).
Avoid chords the browser takes before the page sees them (`Ctrl+Shift+I/J/C`
are DevTools on Windows and Linux; `Ctrl+Shift+N/T/W` are window and tab
chords): `preventDefault` cannot suppress those.

**The host wins.** A command whose hotkey collides with a chord the host
binds — the shell's own (`SHELL_HOTKEYS`: Shift+Arrows and Escape) or any the
composition names in `registerDesktopTaps(grok, { reservedHotkeys: [...] })`
(published at `DESKTOP_RESERVED_HOTKEYS`) — is listed but not bound, and the
conflict is logged once (`console.warn`). `Mod+K` collides with both `Ctrl+K`
and `Cmd+K`. Two commands on one chord: the first declared is bound. The
binding is the pure `bindCommands(commands, reserved)` in `@grythjs/desktop`,
with `commandFor(bound, chord)` resolving a key event.

**G-6 — `tabContextsOn(desktop)`.** A read-only view of the chrome-held tab
contexts on one virtual desktop:

```ts
import { tabContextsOn, type TabContextInfo } from '@grythjs/desktop';
const tabs: TabContextInfo[] = tabContextsOn(3);
// [{ tabId, toolId, params, source, context }, ...]
```

Every tab of a frame on that desktop (a sticky frame counts on all desktops;
a docked frame is where its foundation is) that the desktop currently holds a
context for. A tab never yet rendered has no context and is not listed. The
map itself stays module-private: nothing here can add, replace or retire an
entry.

**G-7 — `Desktop.OpenOnDesktop`.** A shell intent beside `Desktop.OpenTool`:

```ts
import { DESKTOP_OPEN_ON_DESKTOP, type DesktopTarget } from '@grythjs/plugin-api';
const open = useGrip(DESKTOP_OPEN_ON_DESKTOP);
open({ toolId: 'viewer', params }, { name: 'session:42' });  // -> desktop number
```

`(link: ToolLink, target?: DesktopTarget) => number`, opening the link on
another desktop and switching there — "open this in its own workspace". With
no target, a NEW desktop is added and used. `target.desktop` names an existing
desktop by number (a positive integer the desk does not have yet is added).
`target.name` is a caller-chosen handle for a desktop this intent opened
earlier: the first call under a name adds a desktop and remembers it
(`DESKTOP_NAMES`, instance scope, not persisted), later calls land on the same
one, so several windows open onto one new workspace without the caller
tracking its number. `desktop` wins when both are given. The window is opened
through the same path `Desktop.OpenTool` takes (docked by role on a locked
desk) and revealed the same way. The return value is the desktop it landed on.

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
