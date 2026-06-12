# Plugin migration: Settings first, mocks as plugins, matcher flips

Status: **plan**. Companion to `GrythPluginContract.md` (context-graph
model, registry tap). This doc is the precise flip sequence for the
EXISTING code.

## Where we are

- `src/taps.ts` — `registerAllTaps()` hard-registers ~20 atom taps in one
  list: shell chrome state (windows, drag, menus, canvas, ticker, sidebar)
  mixed with appearance state (theme, wallpaper, zoom, font scale) and the
  doc-scope mock (`MockWorkspaceTap` → `Doc.WorkspaceName`).
- `src/desktop/facets.ts` — `FACETS: Record<FacetKind, FacetDef>`: a
  hard-linked registry of `{ title, defaultSize, Component }`, imported by
  `Window.tsx`, `TickerStrip.tsx`, `Desktop.tsx`, `foundations.ts`.
- `src/desktop/facetComponents.tsx` — every facet body is inline mock JSX
  (Explorer's file tree, Terminal's text, Chat's placeholder).
- `grips.desktop.ts` — `FacetKind` is a closed string union.

Two structural smells this migration removes: the shell hard-links every
tool, and mock data lives in components instead of behind provider taps —
so nothing can be flipped to real without rewriting consumers.

## Where we land

- `Tools.Registry` atom tap (instance scope, runtime-only); plugins insert
  themselves on init (commutative merge by plugin id, paired removal).
- `src/plugins/<name>/index.ts` per plugin; the composition root loads
  them with `import.meta.glob` — adding a plugin is adding a directory.
- The shell resolves titles/sizes/views through a registry-backed lookup;
  unknown tool ids render a MissingTool placeholder.
- Every mock is a provider TAP bound through the **matcher**:
  `grok.addBinding({ query: withOneOf(PROVIDER_GRIP, 'mock', 10).build(),
  tap, baseScore })` — flipping mock↔real is writing a provider grip, and
  consumers never change (the WeatherPanel story, verbatim).

Shell chrome taps (windows, drag, menus, canvas, ticker, sidebar) are NOT
plugins — they are the desktop itself and stay in `taps.ts`.

One typing decision up front: `FacetKind` stays the closed union through
this migration (`type ToolId = FacetKind` alias). Generalizing to open
string ids ripples through `WindowRecord`, `designate`, and the tests, and
earns nothing until a non-builtin plugin exists. Flagged for Phase 4.

---

## Phase −1 — the package split (mechanical, before anything converts)

The desktop UI is a PACKAGE, not the grip application. The split happens
first because it is pure code movement (zero behavior change, tests move
with their code) and because converting plugins inside one app and
re-splitting later moves everything twice. npm workspaces inside this
repo:

```
packages/plugin-api/        @grythjs/plugin-api
packages/desktop/           @grythjs/desktop
packages/plugins/<group>/   @grythjs/plugin-<group> — one package per
                            PROVIDER SEAM (see Package map below)
src/ (app)                  composition root: runtime instance, plugin
                            glob, index.html, wallpapers/brand
```

Workspace packages in THIS repo — not separate git repos. The package
boundary is what enforces the contract; repo extraction is ceremony that
only pays when something ships independently, and it stays cheap because
the boundaries already exist. `plugin-api` and `desktop` are created in
this phase; each plugin-group package is created when its first tool
converts (empty packages are noise).

Dependency direction is the contract's enforcement mechanism:

- **`@grythjs/plugin-api`** — the BIDIRECTIONAL contract. Declares what
  plugins provide (registry grip, `PluginEntry`/`ToolDef`,
  `registerPlugin`) AND what the shell provides (seeded context atoms,
  intent handles such as `Desktop.OpenTool`, scope vocabulary). The
  desktop and the plugins are peer implementors of opposite sides; both
  depend only on this package. Any grip a plugin may legitimately touch
  is API surface and lives here.
- **`@grythjs/desktop`** — the window manager as a library: ops, solvers,
  chrome components, shell grips/taps; exports `<Desktop/>` and
  `registerShellTaps(grok)`. Implements the shell side of the API. The
  ops/ticker/seam tests move with it.
- **Plugin-group packages** — one per provider seam, several tools each
  (see Package map). Enforced by the workspace dependency graph: a plugin
  package depends ONLY on `@grythjs/plugin-api` (and React/grip-react),
  never on `@grythjs/desktop` or a sibling plugin. Cross-plugin interaction
  is grips or nothing.
- **The app** composes: creates the runtime, registers shell taps, globs
  plugins, renders `<Desktop/>` (and the pre-desktop workspace-browser
  state — see the contract's boot-flow decision).

The plugin API surface (what an entry provides via the registry tap):

```ts
interface PluginEntry {
  id: PluginId;
  tools?: Record<ToolId, ToolDef>;   // window-instantiable surfaces
}

// A context-mounted component: it renders from whatever grips its
// mounting context resolves. Runtime-only, never persisted.
type GripComponentFactory = () => JSX.Element;

interface ToolDef {
  label: string;                     // static fallback; agent/serializable
  defaultSize: { w: number; h: number };
  role?: string;                     // foundations map roles → areas
  // UI resources — each mounts in a SPECIFIC context (contractual):
  menuTitle: GripComponentFactory;       // launcher/menu — DESKTOP context
  tabTitle?: GripComponentFactory;       // ticker segment — TAB context
  windowComponent: GripComponentFactory; // window body  — TAB context
}
registerPlugin(grok, entry, taps?): () => void
// merge-insert keyed by id + tap registration + paired removal — ONE
// generated act, so declare-without-register is impossible. Root taps are
// registered, not advertised: they are not part of the entry.
```

**Strings are data; components are presentation.** Every presentational
factory pairs with a context-resolved STRING grip — canonically
`Tab.Title` — because chrome needs text, not JSX, for: the ticker width
solver (it MEASURES titles), sidebar window lists, drag-ghost labels,
tooltips, accessibility, and headless agents listing windows. `tabTitle`
renders clipped to the solved width; icons contribute a declared fixed
width to the measurement. A tool with no `tabTitle` gets the default
segment rendering of `Tab.Title`.

**Grip identity constraint (recorded as a decision):** `defineGrip` mints
grips against one `GripRegistry`; every package must define grips via the
SHARED registry instance. The module-singleton runtime (today's
`runtime.ts`) moves down into `@grythjs/plugin-api` (or a tiny runtime
package beneath it). If two desktops in one page is ever needed this
becomes a factory; not paying for that now.

Gate: build, lint, and all tests green with code only MOVED.

### Package map

**Grouping principle: one package per provider seam.** Tools that flip
mock→real against the same backing service ship together — the flip is
per provider, so they convert, test, and version as a unit. Tools backed
by different services land in different packages even when they feel
related.

| Package                  | Tools (kind)                                              | Provider seam (mock → real)            |
| ------------------------ | --------------------------------------------------------- | --------------------------------------- |
| `@grythjs/plugin-api`      | — (the contract)                                          | —                                        |
| `@grythjs/desktop`         | grid/foundations (chrome, not a plugin)                   | —                                        |
| `@grythjs/plugin-workspace`| workspace browser/selector/creator (primary); activity / "what has my agent done" view (later) | workspace registry + activity feed (glial) |
| `@grythjs/plugin-terminals`| terminal (utility); session browser (contextual)          | PTY/session service                      |
| `@grythjs/plugin-code`     | explorer (utility); file viewer/editor (contextual); diff | file tree/content + VCS                  |
| `@grythjs/plugin-settings` | settings panel (utility) + appearance root taps; user management parked here for the mock | local/environ only                       |
| `@grythjs/plugin-chat`     | chat (utility)                                            | chat/rooms service (later)               |
| `@grythjs/plugin-vm`       | vm manager + actions: change base, expand, add project (contextual) | vm_manager service                       |
| app `src/plugins/welcome`| welcome (static; doubles as the example-plugin template)  | none                                     |

Notable calls: terminal + session browser share the session service —
one package (they flip together). The workspace browser is alone because
its backing service (workspace registry) is nobody else's. Explorer,
viewer/editor, and diff share the file/VCS seam. `welcome` stays
app-local as the minimal worked example a plugin author copies.

### Repos and publishing

ONE repo (this one) for all packages. `plugin-api` is hot — every
contract change ripples into the desktop and every plugin; a monorepo
makes that one atomic commit, one PR, one CI run. Repo-per-package pays
the multi-repo coordination tax exactly while the API churns most. A
package moves to its own repo only when ownership (external contributors
without shell commit rights) or a frozen-API release cadence demands it —
grip-core/grip-react already model that case.

On GitHub this repo publishes as **`grythjs`** (existing history and tags
pushed as-is — nothing "migrates"; Phase −1 moves code within the repo).
`gryth-dev` remains the private umbrella (submodules, plan-docs) and is
never published. Provenance effectively wants the repo public — note that
flipping public publishes `dev-docs/` too (deliberate, not accidental).

Publishing to npmjs from the monorepo:

- **changesets** + its GitHub Action: independent semver per package,
  generated changelogs, publishes only what changed on merge.
- npm **trusted publishing** (OIDC from the workflow, no stored token) +
  `--provenance`; `repository.directory` set per package.
- Packages publish under the **`@grythjs`** org (claimed; the bare
  `gryth` scope is held by a dormant npm username — orgs and usernames
  share a namespace and npm releases neither). Ship everything `0.x`
  until the contract stops moving.

## Phase 0 — the registry seam (no behavior change)

1. Grips (in `grips.desktop.ts` or a new `grips.tools.ts`):

```ts
export interface ToolDef {
  label: string;
  defaultSize: { w: number; h: number };
  role?: string;                       // foundations map roles → areas
  View: () => JSX.Element;             // runtime-only
}
export interface PluginEntry { tools: Record<ToolId, ToolDef> }
export const TOOLS_REGISTRY = defineGrip<Record<string, PluginEntry>>('Tools.Registry', {});
export const TOOLS_REGISTRY_TAP = defineGrip<AtomTapHandle<…>>('Tools.Registry.Tap');
```

2. Plugin module shape + composition root:

```ts
// src/plugins/<name>/index.ts — executing the module IS registering
export function register(): () => void { /* insert + tap registration */ }

// src/plugins/index.ts (composition root)
const modules = import.meta.glob('./*/index.ts', { eager: true });
// bootstrap order: RegistryTap registers in registerAllTaps() BEFORE this runs
```

   Inserts go through the handle as merges keyed by plugin id
   (`update(reg => ({ ...reg, [id]: entry }))`); `register()` returns the
   paired removal (HMR/unload discipline per the contract).

3. Shell switch: `facets.ts` stops being the source of truth — `FACETS`
   becomes a derived lookup over `TOOLS_REGISTRY` (same shape, so
   `Window.tsx` / `TickerStrip.tsx` / `Desktop.tsx` signatures are
   untouched). The launcher derives its buttons from the registry, so it
   updates reactively when plugins come and go. Unresolved tool id →
   MissingTool placeholder facet.

   Interim: until all facets convert, `facets.ts` seeds the registry with
   the remaining builtins — the lookup is registry-only from day one.

Tests (red first): registry insert / remove / replace-on-reinsert;
launcher reflects a registry insert; unknown id renders MissingTool;
existing 42 stay green.

## Phase 1 — Settings becomes the first plugin

Settings proves the split from the contract: root taps + a window tool.

Move to `src/plugins/settings/`:

- **Root taps** (from `taps.ts`): `DesktopThemeTap`, `DesktopWallpaperTap`,
  `DesktopWallpaperThemedTap`, `DesktopZoomTap`, `DesktopFontScaleTap`.
  The GRIP DECLARATIONS stay in `grips.desktop.ts` — grips are the
  contract surface the shell consumes (`Desktop.tsx` reads theme/zoom for
  the root style) without importing the plugin. Taps move; grips don't.
- **Window tool**: `SettingsFacet` → `plugins/settings/SettingsPanel.tsx`;
  registry entry `{ settings: { label: 'Settings', defaultSize: { w: 460,
  h: 440 }, View: SettingsPanel } }`.
- `SIDEBAR_OPEN/WIDTH` stay shell-owned (desktop geometry); the panel
  edits them through their handles like any authorized participant.

Tests: theme/wallpaper/zoom/font-scale flips still work (existing
behavior, now plugin-provided); `registerAllTaps()` no longer mentions
appearance taps.

## Phase 2 — every mock provider becomes a plugin

Each tool converts inline mock JSX into a **mock provider tap + thin
view**, landing in its group package per the Package map (terminal joins
`plugin-terminals`, explorer/diff join `plugin-code`, …):

| Plugin      | New grips (consumed by the view)        | Mock tap (class-2 source)    |
| ----------- | ---------------------------------------- | ---------------------------- |
| `workspace` | `Doc.WorkspaceName` (exists)              | `MockWorkspaceTap` (moves)   |
| `explorer`  | `Explorer.Tree`                           | inline tree → tap data       |
| `terminal`  | `Terminal.Output`, `Tab.Title` (later)    | mock scrollback              |
| `chat`      | `Chat.Messages`                           | placeholder thread           |
| `diff`      | `Diff.Content`                            | mock diff                    |
| `welcome`   | — (static copy is genuinely static)       | none                         |

- `workspace` is the **root-only plugin** (no window tools) — proves that
  case.
- `grid` stays shell-owned: the foundation body is chrome scaffolding,
  not a tool.
- `Session.CurrentPage` (`CurrentPageTap`) predates the desktop; retire it
  or park it shell-side — decide when `workspace` converts.
- `facetComponents.tsx` and the `facets.ts` seed shrink to nothing and are
  deleted at the end of this phase.

Tests per plugin: the view renders FROM THE GRIP (set the grip in a test
context → view content changes), not from inline constants.

## Phase 3 — matcher flips

The payoff. Provider choice becomes data, per surface:

```ts
export const WORKSPACE_PROVIDER = defineGrip<'mock' | 'gryth'>('Workspace.Provider', 'mock');
export const TERMINAL_PROVIDER  = defineGrip<'mock' | 'pty'>('Terminal.Provider', 'mock');
// + handles, atom taps (environ scope — a dev/runtime preference)
```

Plugin registration switches from bare `grok.registerTap(MockTap)` to
matcher bindings (the grip-react-demo weather pattern, verbatim):

```ts
grok.addBinding({
  id: 'mock-terminal-binding',
  query: withOneOf(TERMINAL_PROVIDER, 'mock', 10).build(),
  tap: MockTerminalTap,
  baseScore: 5,
});
// the real provider later adds its own binding for 'pty' — same grips,
// zero consumer changes
```

- Flipping globally: write the provider grip at main (Settings grows a
  **Providers** section — toggles that write these handles; an agent
  flips the same grips through the same handles. Dogfood.)
- Flipping per window: when the contract's per-window child contexts
  land, a window context sets its own provider value and the matcher
  resolves per destination (the demo's `useKeyedMatchingContext` /
  per-column `COIN_SOURCE` pattern). Out of scope here; the bindings laid
  down in this phase already support it.

Tests: set `TERMINAL_PROVIDER` 'mock' → output is the mock scrollback;
register a second fake binding for 'pty', flip the grip → consumer value
changes, consumer code untouched. That test IS the contract's promise.

## Phase 4 — outlook (not this migration)

- Open `ToolId` (break the `FacetKind` union) when the first external
  plugin exists.
- Per-window child contexts: seeded param atoms, `Tool.View` resolved as
  a grip per context (replaces the registry component lookup), lazy
  renderer loading (`import.meta.glob` non-eager + async view states).
- Real providers: gryth service binds the same grips behind the matcher.

## Order and verification

Each phase lands green (`npm test`, lint, build) before the next starts;
every new behavior gets a red-first test. Phases 1 and 2 are
window-by-window mechanical moves — small commits, one plugin each.
