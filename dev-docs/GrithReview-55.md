# GrithReview-55

Date: 2026-06-11
Scope: `gryth-ui`
Purpose: code review and improvement suggestions for the mock implementation
that will become the revamped grip-lab UI shell and then split tools into
independent projects.

Verification baseline:

- `npm test` passes: 3 test files, 42 tests.
- `npm run lint` passes.
- `npm run build` passes.

## Review Summary

The mock is directionally strong. It already treats the desktop as grip-held
data, keeps facets mostly unaware of window chrome, and puts the important
window/foundation transforms in pure, tested functions. That is the right
shape for a window-per-tool model where users can open multiple terminals,
explorers, workspace views, diffs, and future tool instances.

The main gaps are not small style issues. The next step is to harden the
contracts that independent tool projects will depend on: a versioned desktop
document schema, per-tool instance bindings, a real tool manifest boundary,
and testable command/interaction policy outside the large React component.

## Findings

### P1: Tool instances are not yet modeled

`TabRecord` contains only `id` and `facet`, and `WindowRecord` only stores a
tab list plus frame geometry (`src/grips.desktop.ts:36-63`). This proves
multi-window and multi-tab chrome, but it does not yet distinguish two
terminal sessions, two file explorers rooted at different paths, or two
workspace views over different repos. The placeholder facets also confirm
that source binding is deferred (`src/desktop/facetComponents.tsx:31-60`).

Suggestion: introduce a per-tab or per-window `instance` binding before real
tools land. It SHOULD include at least:

- stable instance id
- tool/facet kind
- source handle or query params
- dynamic title source
- owner/attribution metadata
- lifecycle policy: view close versus source close

This is the key contract for "multiple tools, multiple sessions" and should
be regression-tested with two terminals and two explorers that render
different instance data.

### P1: The desktop document is still an implicit TypeScript shape

The desktop document is effectively `WindowRecord[]` plus many side atoms
(`src/grips.desktop.ts:66-109`). Comments correctly call out environ versus
instance state, but the scope, persistence policy, version, migration story,
and authority are not machine-readable. `Desktop.Windows` is also one
aggregate atom where z-order, geometry, tabs, foundation layout, and docking
all mutate together.

Suggestion: define `DesktopDocumentV1` as a deliberate schema before adding
real providers. The schema SHOULD include a version field, desktops,
windows/frames, tabs, tool instance bindings, foundation definitions, and
current/presentation state split by scope. Keep the aggregate atom while the
mock is small if that remains simplest, but make the contract explicit enough
that a provider can validate and migrate it.

### P1: The tool boundary is coupled to local React imports

The facet registry maps `FacetKind` directly to React components and default
sizes (`src/desktop/facets.ts:1-25`). That is fine for the mock, but it is too
tight for independent tool projects. A real terminal, explorer, workspace
view, and diff tool need to advertise surface contracts and mount UI through
a stable shell boundary.

Suggestion: evolve `FACETS` into a tool manifest model. A manifest SHOULD
declare:

- tool id and display title resolver
- default window size and docking preference
- grip declarations and provider bindings
- instance parameter schema
- commands/exchanges the shell or agent can invoke
- React mount component as an implementation detail

The shell should know how to host a tool instance, not import every tool's
implementation directly.

### P2: Interaction policy is concentrated in `Desktop.tsx`

`Desktop.tsx` is doing rendering, grip reads, drag state transitions, DOM hit
testing, foundation adoption, menu commands, overview shortcuts, desktop
switching, and grid memory (`src/desktop/Desktop.tsx:94-876`). The pure
model operations in `ops.ts` are good, but many important policies remain
inside the component: open-on-foundation (`src/desktop/Desktop.tsx:178-195`),
drag/drop intent resolution (`src/desktop/Desktop.tsx:257-493`), grid toggle
memory (`src/desktop/Desktop.tsx:514-530`), and menu actions
(`src/desktop/Desktop.tsx:806-861`).

Suggestion: extract a `desktop/commands.ts` or `desktop/controller.ts` layer
that accepts current state plus an event-like command and returns state
patches. Keep DOM measurement and `elementsFromPoint` as adapters, but make
drop resolution, open behavior, dock/merge/split choices, and menu commands
unit-testable.

### P2: Environment versus instance scope needs decisions before roaming

The code already marks several grips as instance-scope, while comments note
that focused window and current desktop may need to change once one environ
has multiple live clients (`src/grips.desktop.ts:69-78`,
`src/grips.desktop.ts:111-240`). This uncertainty is acceptable in a mock,
but it will become a real conflict when desktop state roams.

Suggestion: make a scope table for every class-1 desktop grip. At minimum:

- `Desktop.Windows`, layout, theme, sidebar width: environ.
- drag, hover, menu, canvas size, slide animation: instance.
- focused window and current desktop: decide instance, environ, or
  promotable environ. My recommendation is instance by default, promotable
  later for follow/presenter mode.

Tests should prove that instance-only state is not persisted in the mock
desktop document.

### P2: Component-level behavior is under-tested

The pure op coverage is solid: window open/close, z-order, tab detach/merge,
snap, foundations, grid memory, area probing, and overview are covered in
`src/desktop/ops.test.ts:24-572`. The seam test proves a headless participant
can mutate `Desktop.Windows` through the tap handle
(`src/seam.test.ts:35-46`). Ticker width math is also covered
(`src/desktop/ticker.test.ts:6-82`).

The missing layer is assembled shell behavior. There are no browser/component
tests for clicking launcher buttons, toggling grid, dragging into a dock
area, tab tear-off, context menus, keyboard overview, sidebar restore, or
settings controls.

Suggestion: add a small Playwright or React Testing Library suite before
the mock grows further. Start with smoke tests that open two terminals, lock
the desktop grid, verify they tab or dock as expected, switch desktops, and
reload a persisted mock desktop.

### P2: Test output is noisy

`npm test` passes, but `src/seam.test.ts` emits many grip graph debug lines
while resolving atom taps. That makes failures harder to scan and will get
worse as more tool seams are added.

Suggestion: add a test-mode log level or suppress grip debug output in the
test environment. Keep one focused debug test if the graph logging itself is
important.

### P2: Accessibility and keyboard reachability are still mock-level

The shell has basic buttons and a few keyboard shortcuts
(`src/desktop/Desktop.tsx:538-575`), but most core actions are pointer-only:
window drag, resize, tab drag, splitter drag, area context menu, and dock
drop. Ticker tabs are buttons (`src/desktop/TickerStrip.tsx:100-120`), but
the windows and custom menus do not yet expose a complete accessible desktop
model.

Suggestion: add keyboard commands for window focus, move, resize, tab
selection, desktop switching, dock/undock, and grid area movement. Add ARIA
roles/labels for menus, windows/dialog-like frames, tab strips, and splitters.
This is easier before tool projects depend on the chrome.

### P3: Atom declarations and tap registration are already repetitive

`taps.ts` hand-registers each atom and handle (`src/taps.ts:45-145`). The
current count is manageable, but it will grow quickly once each tool has
instance state, commands, source handles, and settings.

Suggestion: declare atoms in data and generate or loop registration. The
declaration SHOULD carry grip id, type, initial value, scope, persistence
policy, and whether a tap handle is published. This also removes duplicated
defaults such as the first-run window size (`src/taps.ts:27-29` versus
`src/desktop/facets.ts:15-23`).

### P3: Imperative module state is acceptable, but should be named in the model

`canvasGuard` uses a module-level observer and timer/polling fallback
(`src/desktop/canvasGuard.ts:17-59`). `tickerBleed` uses module-level timers
for dwell/grace behavior (`src/desktop/tickerBleed.ts:16-64`). This follows
the local no-React-state rule and is reasonable for instance-only effects.

Suggestion: keep this pattern, but document these as instance services and
test their cleanup or state transitions where practical. The important rule
is that authoritative desktop state must remain in grips, while module state
is limited to local effects, timers, caches, and observers.

## What Is Working Well

- The grip-only rule is enforced by both lint and a script scan
  (`scripts/no-react-state.test.mjs:21-113`), and the package scripts run
  that check as part of `npm test` (`package.json:6-11`).
- The window record correctly separates float memory from effective geometry
  for snap and docked windows (`src/grips.desktop.ts:43-63`,
  `src/desktop/ops.ts:433-460`).
- Foundations are modeled as windows that provide layout areas, not as a
  global desktop mode (`src/grips.desktop.ts:15-34`,
  `src/desktop/ops.ts:490-535`). That matches the design direction in
  `DesktopLayoutModes.md`.
- Most high-risk window mutations are pure and well covered: tab merge,
  detach, foundation adoption, split collapse, grid memory, snap, and
  overview (`src/desktop/ops.test.ts:95-572`).
- Facets are currently thin projections and mostly isolated from chrome
  behavior (`src/desktop/facetComponents.tsx:12-15`).
- The seam test demonstrates the core agent-facing idea: a headless
  participant can mutate the same desktop grip that the UI uses
  (`src/seam.test.ts:35-46`).

## Suggested Next Slices

1. Desktop schema slice: write tests for serializing, validating, and
   migrating a `DesktopDocumentV1`; then introduce the schema without
   changing visible behavior.
2. Instance binding slice: write a regression test for two terminal windows
   with different source handles; then extend `TabRecord` or `WindowRecord`
   to carry an instance binding.
3. Tool manifest slice: replace direct `FACETS` coupling with a manifest
   adapter while keeping the current mock components.
4. Command extraction slice: test and extract open, dock, split, grid toggle,
   menu, and drag-drop release policy out of `Desktop.tsx`.
5. Persistence slice: add a mock environ provider backed by local storage or
   a serialized fixture; prove reload preserves windows, grids, tabs, and
   tool instance bindings but not instance-only drag/menu/hover state.
6. UI verification slice: add browser-level smoke tests for the launcher,
   multiple windows, grid lock/unlock, tab tear-off, context menus, overview,
   and settings.

## Residual Risk

No immediate correctness bug blocked the mock during this review. The main
risk is architectural drift: if real tools are added before the desktop
schema and instance binding are nailed down, terminal/explorer/workspace
behavior will hard-code around missing contracts and be harder to split into
independent projects later.
