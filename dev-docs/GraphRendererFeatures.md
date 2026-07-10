# Graph renderer — feature analysis & coverage

Status: **analysis** — input to prioritization, not yet pruned.
Date: 2026-06-20
Scope: the workspace graph viewer (`packages/plugins/workspace`) and its
planned successor — a separate, more capable graph renderer that can be
substituted into `WorkspaceViewer`.
Purpose: catalogue the feature landscape, mark what the current renderer
covers, and record *who can deliver each feature* (force / dagre / ELK /
d3 / renderer-side / full library) with rough effort and value — so the
companion `GraphRendererRequirements.md` can prioritize from evidence.

This doc is descriptive. Priority decisions (critical / nice / excluded)
live in `GraphRendererRequirements.md`. Feature IDs (`L1`, `E7`, …) are
stable and referenced from there.

## How to read the tables

- **Today** — `✅` have · `◑` partial · `✗` none, in the current renderer
  (`graphEngine.ts` + `WorkspaceGraph.tsx`).
- **Provided by** — the cheapest credible source: `force` (existing sim),
  `dagre` (`@dagrejs/dagre`, MIT), `ELK` (`elkjs`, EPL-2.0), `d3`
  (`d3-hierarchy`/`d3-zoom`, ISC), `view` (renderer-side code we write),
  `lib` (a full framework, e.g. React Flow). Containment/grouping is called
  out where it matters.
- **Effort** — `S` < ~1d · `M` a few days · `L` a week+ / cross-cutting.
- **Value** — `H`/`M`/`L` for *this* app (a git dependency graph).

## Current-state coverage (what exists today)

The current renderer is a single hand-rolled force sim with rich HTML
cards. Confirmed against source:

| Area | Today | Notes |
|---|---|---|
| Force-directed layout | ✅ | springs + inverse-sq repulsion + gravity + AABB overlap separation + wall bounce; RAF settles at `activity < SETTLE` |
| Rich node cards | ✅ | SVG `foreignObject` HTML — name, branch, SHA, ahead/behind, dirty pill, status stripe, expandable changed-files w/ links |
| Directed edges | ◑ | straight `<line>`, boundary-clipped, per-edge arrow marker, "hot" recolor when an endpoint is expanded |
| Zoom / pan | ✗ | fixed `viewBox 1080×680` + `preserveAspectRatio` — scale-to-fit only |
| Layout choice | ✗ | force only, hard-wired in `step()` |
| Grouping / clusters | ✗ | none (see prototype evidence below) |
| Selection | ◑ | single `hover` / `pinned` / `dragId` only |
| Persistence | ✗ | `setInput` re-seeds positions on any input-key change |
| Export | ✗ | none |
| a11y | ✗ | SVG is opaque to assistive tech |

Known **defects** (not just gaps): parallel edges render exactly on top of
each other (only marker id differs); self-loops degenerate
(`boundaryIntersection` returns centre on coincident endpoints).

## Feature landscape & coverage

### A. Architecture / non-functional (bounds everything else)

| ID | Feature | Today | Provided by | Effort | Value | Notes |
|---|---|---|---|---|---|---|
| A1 | Layout/sim outside React (engine class) | ✅ | force | — | H | keep — already the pattern |
| A2 | Grip-fed pure view (no `useState`/effect for sim) | ✅ | view | — | H | keep — `GRAPH_NODES` snapshots |
| A3 | Swappable renderer seam (explicit interface) | ✗ | view | M | H | `WorkspaceViewer` depends on a `GraphRenderer` contract, not `WorkspaceGraph` |
| A4 | Generic graph model + domain payload | ✗ | view | M | H | decouple `GRAPH_NODES` repo fields from a generic node/edge model |
| A5 | Heavy layout in a web worker | ✗ | ELK | M | M | keep ELK's ~1.4 MB off main thread/bundle |
| A6 | Permissive-license posture | ◑ | — | — | H | dagre/d3/React Flow OK; ELK is EPL-2.0 (flag) |

### B. Layout engines

| ID | Feature | Today | Provided by | Effort | Value | Notes |
|---|---|---|---|---|---|---|
| L1 | Force-directed | ✅ | force | — | M | good for "overview", wrong default for a dep graph |
| L2 | Hierarchical / layered (Sugiyama), TB/LR | ✗ | dagre / ELK | M | H | **the defining feature** — deps read as layers |
| L3 | Tree (rooted, tidy) | ✗ | d3 / ELK | S | M | many dep graphs are near-trees |
| L4 | Radial / circular | ✗ | d3 / ELK | M | M | good overview; radial centres a focus repo |
| L5 | Orthogonal layout | ✗ | ELK | M | L | compact grid-aligned; less critical |
| L6 | Grid | ✗ | view | S | L | cheap deterministic fallback |
| L7 | Constraint-based (fix rank, align) | ✗ | ELK / cola | L | L | power-user control |
| L8 | Pluggable layout-strategy interface | ✗ | view | M | H | `engine.setLayout(mode)`; force is one impl |
| L9 | Stable / incremental layout | ✗ | view+engine | M | H | stop re-seeding on git-status refresh |
| L10 | Manual + persisted positions | ✗ | view+model | M | H | drags survive remount/data change |
| L11 | Animated transitions between layouts | ✗ | view | M | M | interpolate, preserve mental map |

### C. Edge handling

| ID | Feature | Today | Provided by | Effort | Value | Notes |
|---|---|---|---|---|---|---|
| E1 | Spline / curved edges | ✗ | view | S | M | Bézier; needed for legible layered output |
| E2 | Orthogonal routing w/ node avoidance | ✗ | ELK | M | M | ELK returns bend points → polyline |
| E3 | Obstacle-avoiding curves | ✗ | view/ELK | L | L | true spline avoidance is hard — defer |
| E4 | Parallel / multi-edge separation | ✗ (bug) | view | S | M | fixes exact-overlap defect |
| E5 | Self-loops | ✗ (bug) | view | S | M | fixes degenerate-centre defect |
| E6 | Edge labels | ✗ | view / ELK | M | M | dep kind/version/ref |
| E7 | Edge style API (colour, pattern, width, arrow size+dir, curve) | ✗ | view | M | H | lift hardcoded style to per-edge props |
| E8 | State → style resolver (hot/selected) | ◑ | view | S | M | express "hot" as a style transform, not branch logic |
| E9 | Edge bundling | ✗ | view | L | L | only matters at scale |
| E10 | Weighted edges (thickness encodes weight) | ✗ | view | S | L | coupling strength; feeds weighted layout |

### D. Graph structure (grouping)

| ID | Feature | Today | Provided by | Effort | Value | Notes |
|---|---|---|---|---|---|---|
| G1 | Groups / clusters (model + **layout-owned** containment) | ✗ | ELK / dagre | L | H | containment is a layout constraint, **not** a force (see anti-patterns) |
| G2 | Collapse / expand groups (proxy node) | ✗ | view+model | M | M | distinct from node-card expand |
| G3 | Polymorphic edge endpoints (edge → node *or* group) | ✗ | view+model | S | M | strong idea from the prototype |
| G4 | Ports / anchored connection points | ✗ | ELK | M | L | stable semantic attach points |
| G5 | Nested graphs / drill-in | ✗ | ELK | L | L | open a cluster as its own graph |

### E. Navigation & scale

| ID | Feature | Today | Provided by | Effort | Value | Notes |
|---|---|---|---|---|---|---|
| N1 | Real zoom + pan (camera transform) | ✗ | view / d3-zoom | M | H | **foundational** — removes the fixed-viewBox ceiling |
| N2 | Fit-to-view / zoom-to-extent | ✗ | view | S | H | immediate companion to N1 |
| N3 | Centre / focus-on-node | ✗ | view | S | M | jump from search / sidebar |
| N4 | Minimap | ✗ | view | M | M | second SVG reading `GRAPH_NODES` |
| N5 | Search / filter nodes | ✗ | view | M | M | find by name/branch/status |
| N6 | Highlight-neighbours / dim-rest | ✗ | view | S | M | extend the "hot" mechanism to subtrees |
| N7 | Level-of-detail rendering | ✗ | view | M | M | collapse cards to dots when zoomed out |
| N8 | Canvas/WebGL render path + virtualization | ✗ | lib | L | L | only if graphs exceed low-hundreds (loses HTML cards) |

### F. Selection & editing

| ID | Feature | Today | Provided by | Effort | Value | Notes |
|---|---|---|---|---|---|---|
| S1 | Single selection | ◑ | view | — | M | pin exists |
| S2 | Multi-select (shift/ctrl) | ✗ | view | M | M | basis for group ops |
| S3 | Box / marquee select | ✗ | view | M | L | select a region |
| S4 | Move multiple together | ✗ | view | M | L | reposition a cluster |
| S5 | Add / remove / rewire nodes & edges | ✗ | view+model | L | ? | **scope-dependent** — view is read-mostly today |
| S6 | Create/delete groups, reassign membership | ✗ | view+model | M | ? | scope-dependent (editing) |
| S7 | Undo / redo | ✗ | view | L | ? | required if S5/S6 land |

### G. Export & interop

| ID | Feature | Today | Provided by | Effort | Value | Notes |
|---|---|---|---|---|---|---|
| X1 | SVG export | ✗ | view | M | M | `foreignObject` HTML needs inlined styles |
| X2 | PNG export | ✗ | view | M | M | paste a dep snapshot into a PR — high practical value |
| X3 | JSON serialize/deserialize (graph + positions) | ✗ | view+model | S | M | underpins L10 |
| X4 | DOT / Graphviz import & export | ✗ | view | M | L | ecosystem interop |
| X5 | Copy-to-clipboard (image / DOT) | ✗ | view | S | L | convenience over X1/X2/X4 |

### H. Styling & semantics

| ID | Feature | Today | Provided by | Effort | Value | Notes |
|---|---|---|---|---|---|---|
| Y1 | Status-derived node colours | ✅ | view | — | M | dirty/behind/ahead/clean |
| Y2 | Legend (colour key) | ✗ | view | S | M | colours are undocumented in-UI |
| Y3 | Node shapes (encode type) | ✗ | view | S | L | root vs submodule vs external |
| Y4 | Theme integration (dark/light, colourblind-safe) | ◑ | view | S | M | already uses `var(--win)`/`currentColor` |
| Y5 | Badges / metric overlays | ◑ | view | S | M | ahead/behind exist; add CI/PR/age |
| Y6 | Heatmap / metric colouring (toggle scales) | ✗ | view | M | L | colour by churn/age/build |

### I. UX & accessibility

| ID | Feature | Today | Provided by | Effort | Value | Notes |
|---|---|---|---|---|---|---|
| U1 | Hover-expand cards | ✅ | view | — | M | keep |
| U2 | Tooltips | ✗ | view | S | M | full path/SHA without expanding |
| U3 | Context menus (right-click) | ✗ | view | M | M | open/focus/collapse/pin/copy-SHA |
| U4 | Keyboard navigation | ✗ | view | M | M | arrow between nodes, enter to open |
| U5 | ARIA / screen-reader + text fallback | ✗ | view | M | M | SVG opaque to AT today |
| U6 | Focus management | ✗ | view | S | M | roving tabindex |
| U7 | Debug / vector overlay | ✗ | view | S | M | prototype keeper — force vectors, bboxes |
| U8 | Force-calibration params panel | ✗ | view | S | L | prototype keeper — per-layout tuning |

## Delivery vehicles (build-vs-borrow)

Two credible shapes; they are not mutually exclusive — option 1 is the
first step toward option 2.

**1. Borrow the layout engine, keep our renderer (recommended lean).**
Add `@dagrejs/dagre` (MIT, synchronous, ~90 KB) for L2, graduate to
`elkjs` (EPL-2.0, in a worker) for L2-with-ports, L4, L5, E2, G1, G4.
Keep the SVG/`foreignObject` cards and the grip/engine pattern verbatim.
Covers every layout/structure gap as a pure position-in/out function; all
renderer-side features (N*, E7, S*, X*, U*) are ours to build regardless.

- Pros: preserves the rich cards (no library renders them natively except
  React Flow / G6); zero disruption to `GRAPH_NODES`; incremental.
- Cons: we own camera/minimap/selection/export code; ELK is EPL-2.0.

**2. Adopt a full framework (React Flow `@xyflow/react`, MIT).**
Port the card to a React Flow node; get N1/N2/N4/S2 + selection for free;
still pair dagre/ELK for layout (React Flow ships none). Controlled mode
keeps the engine + grips feeding `nodes`.

- Pros: stop maintaining viewport/minimap/selection; large ecosystem.
- Cons: medium migration; the view lives inside React state (less "pure");
  re-customizing the card as a node component.

**Coverage note:** of the must-haves, only the *layout math* (L2/L4/L5,
E2, G1) is genuinely worth borrowing. Camera, selection, highlight,
export, persistence, a11y, debug overlay (N*, S*, X*, U*, E7) are
renderer-side either way — a full library would force us to re-customize
them. That asymmetry is why the lean is "borrow layout, keep renderer."

Rejected for this app (cannot render rich HTML/`foreignObject` cards —
disqualifying): Cytoscape.js, Sigma.js, vis-network, reagraph,
react-force-graph. Substrates that don't reduce the work vs. today:
`@visx/network`, raw d3. Stale: reaflow (~1 yr).

## Prototype evidence (`~/Downloads/dynamic_interactive_svg_graph (2).tsx`)

A standalone React prototype that extends the current card+force model
with groups, polymorphic edges, and editing. Useful as a behavioral spec
and as a cautionary example.

### Keepers (lift into the new design)

- **G3 polymorphic edge endpoints** — `findEntity` resolves a node or a
  group; `getBoundaryIntersection` clips to whichever boundary.
- **U7 debug/vector overlay** — force vectors, intersection points, node
  bounding boxes (`showMathOverlay`).
- **U8 force-calibration sliders** — spring length, collision padding, etc.
- **S6 editing UX** — add/delete node, create/delete group, connect-on-
  create, "delete group restores members to independent."
- Richer card fields (category / metric / desc) over the same
  `foreignObject` pattern.

### Anti-patterns (the "how not to" — see Requirements MUST-NOTs)

1. Container boundary as a lagging interpolation of member bbox (eases at
   `0.25`/frame, snaps at settle) — rubber-bands and pops.
2. Collision resolved against that lagging box — feedback oscillation.
3. Stacked competing force systems (cohesion vs node-node vs node-group) —
   reaches a limit cycle, never settles.
4. Moving a whole cluster by nudging every member each frame — lurches.
5. Edges clipped to stale group geometry — arrows point where the box was.
6. Rendering empty groups — ghost box at centre.
7. Physics inside React with a 60fps full-tree re-render (`setTick`).
8. Axis-aligned minimum-penetration shoves — snappy lateral pops.
9. Hardcoded edge style (colour=source, width 1.2/2.5, arrow 9×5.5).
10. Random re-seed / re-init on every data change.

Root cause of 1–6: **containment was made emergent from physics.** A
container is a constraint owned by the layout engine, never a force.

## Recommended lean (non-binding — decided in Requirements)

First slice = the two cross-cutting refactors plus one borrowed layout:
**N1+N2** (camera), **L8** (layout-strategy interface), **L2 via dagre**
(layered). These unblock most of the rest (L9, L10, G1, E2 all sit on
them). Defer N8/E3/E9/L7 and treat S5–S7 (editing) as gated on a scope
decision. Full priority buckets and open decisions: see
`GraphRendererRequirements.md`.
