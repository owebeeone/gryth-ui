# Graph renderer — requirements & priorities

Status: **draft** — proposed prioritization, to be ratified.
Date: 2026-06-20
Scope: the successor graph renderer that substitutes into `WorkspaceViewer`,
replacing `WorkspaceGraph` + `graphEngine`.
Purpose: state the requirements and sort every candidate feature into
**critical / important / nice-to-have / excluded**, so we build the right
things in the right order. The feature catalogue, coverage, and evidence
behind these calls live in `GraphRendererFeatures.md`; this doc references
its feature IDs (`L2`, `E7`, …) rather than restating them.

Priorities here are **proposed** (my recommendation). Items whose bucket
depends on an unresolved fork are marked `→ Dn` and listed under
**Open decisions**.

## Priority definitions (MoSCoW)

- **Critical (Must)** — the renderer is not worth shipping without it, or
  everything else depends on it. If we cut it, we failed the brief.
- **Important (Should)** — high value, expected by users of a "graphviz-
  level" tool; ship soon after the criticals, not necessarily in v1.
- **Nice-to-have (Could)** — real value, but deferrable indefinitely
  without undermining the product.
- **Excluded (Won't)** — explicitly out of scope / "don't want near us":
  cost, complexity, or architectural risk outweighs value *for this app*.
  Excluded ≠ impossible; it's a deliberate no, revisited only on cause.

## Non-functional requirements (MUST — bound everything)

These are hard constraints on *how* the renderer is built, not features.
They are non-negotiable; a feature that violates one is wrong even if it
works.

- **NF1 — Layout/sim runs outside React** (`A1`). An imperative engine
  class owns positions; React never drives the sim loop.
- **NF2 — Pure, grip-fed view** (`A2`). The view reads node/edge snapshots
  from a grip and renders; no `useState`/`useEffect`/`useRef` for sim or
  app state (per `CodingRules.md`). Gestures call engine methods.
- **NF3 — Swappable behind an explicit seam** (`A3`, `A4`). `WorkspaceViewer`
  depends on a `GraphRenderer` contract + a generic graph model (node/edge
  with a domain `payload`), not on a concrete renderer. Old and new must be
  swappable behind one grip.
- **NF4 — Layout is a strategy, not hard-wired** (`L8`). Force is one
  implementation among dagre/ELK/etc., selected at runtime.
- **NF5 — Containment is layout-owned, never force-emergent** (`G1`). Group
  boundaries are derived deterministically from a settled layout (or from
  member bbox for render only) — never produced by competing forces.
- **NF6 — Rich custom node content is preserved** (the `foreignObject`
  card). Any vehicle that cannot render arbitrary HTML/React node bodies is
  disqualified.
- **NF7 — Heavy layout off the main thread** (`A5`). ELK (or any
  non-trivial engine) runs in a web worker; the view animates toward
  results.
- **NF8 — Permissive licensing** (`A6`). Default to MIT/ISC/Apache. EPL-2.0
  (ELK) is allowed only as an unmodified dependency and only after a legal
  glance (`→ D3`).
- **NF9 — Stable by default** (`L9`). A data refresh (git status changing)
  must not reshuffle the graph; unchanged nodes keep their positions.

## Anti-requirements (MUST-NOT — the "how not to")

Hard prohibitions, drawn from the prototype's failure modes
(`GraphRendererFeatures.md` §Prototype evidence). Reviewers should reject
any change that does these:

- **AN1** — No emergent containment: group boxes must not chase members via
  per-frame interpolation, and must not snap at settle.
- **AN2** — No collision resolved against a lagging/interpolated boundary.
- **AN3** — No stacked competing force systems that converge to a limit
  cycle instead of a fixed point.
- **AN4** — No moving a whole cluster by nudging every member each frame.
- **AN5** — No clipping edges to stale geometry.
- **AN6** — No rendering of empty containers.
- **AN7** — No physics inside React / no full-tree re-render per frame
  (violates NF1/NF2).
- **AN8** — No axis-aligned minimum-penetration "shove" as the separation
  primitive (snappy pops); prefer a solved constraint or smoother push.
- **AN9** — No hardcoded edge style; style is data (`E7`).
- **AN10** — No random re-seed / re-init on data change (violates NF9).

## Functional priorities (proposed)

### Critical (Must) — v1 is these

| ID | Feature | Why critical |
|---|---|---|
| N1 | Real zoom + pan | foundational; removes the fixed-viewBox ceiling under everything |
| N2 | Fit-to-view | unusable navigation without it once zoom exists |
| L8 | Pluggable layout-strategy interface | NF4; the refactor that makes "more layouts" possible |
| L2 | Hierarchical / layered (dagre), TB/LR | the defining feature for a dependency graph |
| L9 | Stable / incremental layout | NF9; a live status view that reshuffles is broken |
| L10 | Manual + persisted positions | drags must survive remount/refresh; needs model/persistence |
| E4 | Parallel/multi-edge separation | fixes a real overlap defect |
| E5 | Self-loops | fixes a real degenerate-edge defect |
| E7 | Edge style API (colour/pattern/width/arrow size+dir/curve) | NF/AN9; explicitly requested |
| E1 | Spline / curved edges | required for legible layered output |

### Important (Should) — fast-follow

| ID | Feature | Why |
|---|---|---|
| G1 | Groups / clusters with layout-owned containment | requested; the artifact-free version of the prototype |
| G3 | Polymorphic edge endpoints (node ↔ group) | strong prototype idea, cheap once G1 exists |
| E2 | Orthogonal routing w/ node avoidance (ELK) | "curve around boxes" done right (`→ D3` for ELK) |
| N3 | Centre / focus-on-node | jump from sidebar/search |
| N6 | Highlight-neighbours / dim-rest | high comprehension win on existing "hot" mechanism |
| N4 | Minimap | second SVG over `GRAPH_NODES`; cheap given N1 |
| X2 / X1 | PNG / SVG export | drop a dep snapshot into a PR — high practical value |
| X3 | JSON serialize (graph + positions) | underpins L10 |
| Y2 | Legend | the status colours are currently undocumented in-UI |
| L11 | Animated transitions between layouts | preserve mental map when switching |
| L3 / L4 | Tree / radial layouts | natural for near-tree dep graphs and overviews |
| U7 | Debug / vector overlay | prototype keeper; pays for itself while tuning layouts |
| E8 | State → style resolver | express "hot"/selected as style, not branch logic |

### Nice-to-have (Could) — deferrable

`L5` orthogonal layout · `L6` grid · `L7` constraint-based ·
`G2` collapse/expand groups · `G4` ports · `G5` nested drill-in ·
`E6` edge labels · `E10` weighted edges · `N5` search/filter ·
`N7` level-of-detail · `S2` multi-select · `S3` box-select ·
`S4` move-multiple · `X4` DOT import/export · `X5` copy-to-clipboard ·
`Y3` node shapes · `Y5` extra badges · `Y6` heatmap colouring ·
`U2` tooltips · `U3` context menus · `U8` calibration panel.

### Excluded (Won't — "don't want near us")

| ID | Feature | Why excluded |
|---|---|---|
| N8 | Canvas/WebGL render path + virtualization | costs the `foreignObject` cards (NF6) and a whole second render pipeline; only justified at thousands of nodes — `→ D2` |
| E3 | True spline obstacle-avoidance routing | libavoid-class effort; E2 (orthogonal) gives real avoidance at a fraction of the cost |
| E9 | Edge bundling | only legible at a scale we don't expect; high complexity |
| — | Adopt a non-HTML-node library (Cytoscape/Sigma/vis/reagraph) | violates NF6 — disqualified, not deferred |
| — | 3D graph rendering | no use case for a dependency graph |
| S5–S7 | Full graph editing (add/remove/rewire) + undo/redo | the graph is **derived from git state**, not authored; editing it by hand is a different product — `→ D4` |
| U4–U6 | Keyboard nav / ARIA / focus | *not* unwanted — deferred to Nice-to-have once the visual renderer is stable; listed here only to note it is consciously out of v1, not forgotten |

> Note on the last two rows: they are gated/deferred, not rejected on
> principle. Editing flips to in-scope if `D4` says so; a11y is a
> should-have we are sequencing after the core renderer, and must not be
> dropped permanently (NF-adjacent quality bar).

## Open decisions (gate some buckets)

These four forks change which bucket some features land in. Recommended
default in **bold**; unresolved until ratified.

- **D1 — Delivery vehicle.** Borrow layout engine + keep our renderer
  (**recommended**) · adopt React Flow as the view · full framework (G6).
  Affects: who builds N1/N2/N4/S2 (us vs library). Does not change the
  critical *set*, only the implementer.
- **D2 — Target graph size.** Dozens (**recommended assumption**) · low
  hundreds · hundreds-to-thousands. If thousands, `N8` moves from Excluded
  to Critical and NF6 is at risk.
- **D3 — ELK / EPL-2.0 tolerance.** Use ELK, flag for legal
  (**recommended**) · MIT-only (dagre + d3-hierarchy). If MIT-only: `E2`,
  `G4`, `L5`, and ELK-based `G1`/`L4` lose their cheapest provider and drop
  in priority or change vehicle.
- **D4 — Editing scope.** Read-only viewer (**recommended to start**) ·
  include editing. If editing: `S5`–`S7` and `S6`/`G2` move up out of
  Excluded/Nice, and undo/redo becomes Important.

## First-milestone definition of done (proposed)

A v1 that satisfies the **Critical** set and all **NF**/**AN** constraints:

1. `WorkspaceViewer` renders through the new `GraphRenderer` seam (NF3); the
   old renderer is swappable behind one grip.
2. Camera works: wheel-zoom, drag-pan, fit-to-view (N1/N2).
3. Layout is selectable (N4-strategy/L8); force and dagre-layered (L2)
   both available, switchable at runtime with stable positions (L9) and
   persisted drags (L10).
4. Edges carry a style object (E7), render as splines (E1), separate when
   parallel (E4), and handle self-loops (E5).
5. No MUST-NOT (AN1–AN10) present; reviewed against the anti-requirements.
6. Rich repo cards unchanged (NF6); `npm test`/`lint`/`build` green.

Grouping (G1/G3) and export (X1–X3) are the expected **v1.1** target.
