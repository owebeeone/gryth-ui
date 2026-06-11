# Desktop layout modes — brainstorm

Status: **brainstorm** — for discussion, not yet pruned.
**v2 note:** the per-desktop `mode` in the schema sketch below is SUPERSEDED
by the foundation-window model (see "v2 — Foundation windows" at the end);
the zone/arrangement/agent-vocabulary analysis stands.

## Problem

Free-floating windows + edge snap (left/full/right) is all the structure we
have. Many users want rigid, predictable layouts. The IDE crowd (VS Code,
Cursor, Antigravity, Windsurf) converged on rail / sidebar / central editor /
bottom panel — but gryth's centre of gravity is the *collaboration*, not a
code buffer. Copying the IDE shape would put the wrong thing in the middle.

## Design forces

1. **The desktop is a document** (environ scope, roams). A layout mode must
   be data in the desktop document, never component state.
2. **Agents drive the UI.** Rigid layouts give agents — and chat links, and
   follow-mode — a *vocabulary of places*: "open the diff in the stage" beats
   pixel coordinates. Predictability is a delegation feature, not just
   tidiness. This is the argument that layout modes are protocol vocabulary,
   not UX polish.
3. **Reuse the machinery we have**: frames+tabs (`mergeWindows`), the snap
   dock + grow preview, drag gestures, per-desktop mode, pure rect math
   (`overviewLayout` / `snapRect` precedents).
4. **Mode is per desktop**, not global — zen workspaces: desktop 1 floats,
   desktop 2 is the rigid collab hub. Today's float desktop is just
   `mode: 'float'`.
5. **Float stays a first-class escape hatch.**

## Idea catalogue (loosest → most rigid)

### A. Magnetic float
Snap-to-grid + magnetic window edges (PowerToys-ish). Low effort, keeps
freedom — but gives agents no vocabulary. Polish, not structure. Maybe later,
orthogonal to everything below.

### B. Zone layouts — recommended core
A desktop can run a **zone layout**: named regions with fractional sizes and
splitters. Windows are *assigned to zones*; their geometry is computed.
Key consequences:

- Multiple windows dropped in one zone = the existing **tab merge** — VS
  Code's editor-group behaviour falls out of the frame/tab model for free.
- Dragging a header over a zoned desktop highlights zones (today's snap dock
  IS a 3-zone layout — left/full/right; this generalizes it).
- Tab drag-out moves a tab to another zone, or out to float.
- Zones are **role-named, not content-named**: `stage`, `crew`, `pulse`,
  `rail` — no facet is privileged by the geometry.

### C. Full tiling (i3 / PaperWM)
Recursive split tree or scrolling columns; drag = reorder. Most rigid;
keyboard-friendly; biggest lift. Zones cover ~80% of the demand; tiling can
arrive later as another `mode` value without schema upheaval. Defer.

### D. Arrangements (presets) — the collab-shaped answer to "VS Code layout"
An **arrangement** = zone geometry + facet→zone assignment rules, declared as
data (config-as-data, swappable). Candidates:

- **Hub** (default): `stage` (large, centre-left — whatever you're doing
  now) + `crew` (right column — chat & presence, always visible) + `pulse`
  (bottom strip — activity, commits, notifications). *The social column is
  the constant; the stage rotates.* This inverts the IDE assumption: chat is
  not "main", but it is never buried.
- **Review**: diff in the stage, crew right, activity pulse.
- **Ops**: VM manager stage, terminal grid, pulse.
- **Focus**: single stage, crew collapsed to a rail.
- **IDE classic**: rail/side/main/panel for the muscle-memory crowd.

Switching arrangements re-assigns open windows by facet rules; unmatched
windows float above or dock to a declared default zone.

### E. Stage deck (Stage Manager-ish)
One primary window + a side deck of true-scaled minis (the overview
machinery, persistent). Good small-screen mode. Cheap later; not the core.

### F. Follow / projected layouts — the gryth differentiator
Because arrangements are data: share one in chat (the stateUrl
generalization), **follow my layout** in a pairing session, and agents
applying them — "set up review for PR-123" = apply `Review`, open the diff
into `stage`, the PR chat into `crew`. Zone names become part of the
delegable surface (GrythVision C3 meets C2).

## Schema sketch

This feature finally forces the per-desktop record (desktops stop being bare
ids 1–4):

```ts
DesktopRecord {
  id: number;
  mode: 'float' | 'zones';        // 'tiling' | 'deck' reserved
  arrangement?: ArrangementId;     // when mode === 'zones'
  zoneSizes?: Record<ZoneId, number>; // per-desktop splitter overrides
}

WindowRecord += {
  zone?: ZoneId;       // assignment when on a zoned desktop
  prefloat?: Rect;     // return-to-float memory (the presnap pattern)
}

Arrangement (data, not code) {
  id; label;
  zones: [{ id: ZoneId; role: string; frac: number; axis: 'row'|'col'; … }];
  assign: Partial<Record<FacetKind, ZoneId>>; // defaults per facet
  fallback: ZoneId | 'float';
}
```

ops (pure, tested like `overviewLayout`/`snapRect`):
`zoneRects(arrangement, sizes, area)`, `assignToZone(list, id, zone)`,
`applyArrangement(list, desktop, arrangement)`.

## Interaction reuse

| Gesture today | On a zoned desktop |
| --- | --- |
| header drag | zone highlight + drop assigns (snap preview generalizes) |
| header drop on header | tab merge within the zone (unchanged) |
| tab drag-out | into another zone, or out to float |
| edge-snap dock | becomes the zone dock (float's left/full/right = a built-in arrangement) |
| splitter drag | resize zone fractions (drag-overlay pattern) |
| Shift+Up / Shift+Down | unchanged (transform-only overview) |
| desktop thumbnails | render zone outlines + occupants |

## Open questions

- Mode per desktop confirmed? (proposed: yes)
- May floating windows hover above a zoned desktop (palettes)? (proposed:
  yes — a per-window float-above flag)
- Zone sizes: per-arrangement defaults with per-desktop overrides? (proposed:
  yes)
- Where do arrangements live: code-as-data now → environ (user-defined)
  later → doc-scope/shareable eventually
- Keyboard: move-window-to-zone chords? arrangement switcher?
- UI home for the picker: Settings section, desktop-thumbnail right-click, or
  both?

## Suggested slice order

1. `zoneRects` + `applyArrangement` ops (pure, red-first).
2. Per-desktop `mode` + the **Hub** arrangement; zone drop-highlighting by
   generalizing the snap machinery.
3. Splitters (drag-overlay pattern).
4. Arrangement picker (Settings + thumbnail context menu).
5. Review / Ops / IDE presets; agent-facing zone names documented as surface
   vocabulary.

---

## v2 — Foundation windows (supersedes per-desktop mode)

Insight (Gianni): the grid is not a desktop mode — it is **another window**
whose only job is to provide the snap areas and splitters. "Switch grid/free"
= create/close a foundation window. Rigidity becomes object lifecycle, not a
mode flag; the system shape lives in data.

What falls out for free, because foundations are windows:
- persisted/roamed in the environ document, per-desktop, sticky-able
- creatable/closable by an agent (apply-arrangement = open a window)
- partial-canvas foundations: a terminal-wall on the right half while the
  rest of the desktop floats — semi-rigid desktops without extra design
- multiple foundations per desktop possible (decide whether to allow)

### Record shape

```jsonc
// the foundation's layout tree (Gianni's sketch; this is also
// react-resizable-panels' API shape — leaf nodes are AREAS)
{
  "id": "root", "direction": "row",
  "children": [
    { "id": "sidebar", "defaultSize": 20 },
    { "id": "main-area", "direction": "column", "defaultSize": 80,
      "children": [
        { "id": "editor-zone", "defaultSize": 70 },
        { "id": "terminal-zone", "defaultSize": 30 } ] }
  ]
}
```

Proposed decisions (discussion pins):

1. **Tree lives in the foundation's window record** (environ data). Window
   records grow a discriminant: a frame has `tabs`; a foundation has
   `layout` (tree) + `sizes` (splitter overrides) + `designate`
   (facet → areaId defaults used at adoption time).
2. **Docked windows reference the dock**: `dock?: { foundation, area }` on
   the window record. The single-writer rule holds — a window owns its own
   placement; the foundation never lists occupants.
3. **Stored x/y/w/h stay the FLOAT memory while docked.** Docked geometry is
   computed: `areaRects(layout, sizes, foundationRect)` — a pure op tested
   like `overviewLayout`/`snapRect`. Undock = drop the `dock` ref; the
   window lands exactly where it floated before (the presnap pattern,
   generalized; no `prefloat` field needed).
4. **Adoption**: creating a foundation assigns existing floaters on that
   desktop per `designate`; unmatched facets go to the declared fallback
   area or stay floating (decide default). Closing the foundation clears all
   `dock` refs → everything falls back to float memory.
   **`designate` is a soft default only** — areas are untyped homes; any
   window may be moved into any area afterwards (the explorer into the
   terminals' box is legal by construction). The foundation needs no
   knowledge of facet kinds at runtime.
5. **Occupancy and splitting**: drop in an area's CENTER = the existing
   header-drop **tab merge** (editor-group behaviour, already built); drop
   near an OCCUPIED area's EDGE = **split the box** on that edge. An EMPTY
   box cannot be split — a hole accepts drops whole, edges included.
   Splitting is a first-class op:
   `splitArea(tree, areaId, axis, ratio)` replaces the leaf with an interior
   node (old area + new empty area). Companion `closeArea` collapses the
   parent when one child remains. Both pure tree ops, tested.
6. **Chrome**: the foundation renders beneath its docked windows and owns
   the splitters (one more drag kind in the overlay pattern); area drop
   highlighting generalizes the snap dock/preview; docked frames hide their
   resize handle, header-drag undocks or re-areas.
7. **Foundation types** = the arrangements from v1 (Hub / Review / Ops /
   IDE-classic / terminal-wall) expressed as layout-tree + designate
   presets. Pure data; the launcher or thumbnail menu offers them.

### The universal instance contract (terminals are just the vivid example)

NOTHING is singleton: every facet is multi-instance and every window is
tabbable. The per-instance contract is therefore foundational, designed once
at the chrome↔facet boundary:
- **dynamic titles** from instance state (terminal: cwd; diff: PR; chat:
  room) — not the registry constant
- **owner/attribution** per window or tab (me / AI / collaborator) — C3
  surfacing in chrome
- terminals exercise this hardest (flocks, constant switching — tab stacks,
  a terminal-wall foundation type, quick-switcher chord later), but the
  contract is facet-agnostic.

### Libraries (react-resizable-panels / react-mosaic / Golden Layout)

Verdict: **adopt the API shape, not the dependency** — same state-ownership
argument that ruled out dockview for the WM. All three own their layout
state internally; syncing it bidirectionally with the grip-held tree is the
two-sources-of-truth bug factory. The only part worth buying is splitter
mechanics, and the drag-overlay pattern + pure rect ops already cover that
(~100 lines, testable). Real cost: their keyboard/touch a11y on handles is
genuinely good — revisit react-resizable-panels (already used in
grip-react-demo) if splitters get hairy; react-mosaic's controlled-tree mode
is the least-bad buy if we ever want drag-splitting fast; Golden Layout is
out.

### Open (for discussion)

- **DECIDED**: one foundation per desktop first (multiple later if earned);
  foundation is maximized to the canvas by default (windowed later);
  adoption sweeps ALL floaters — designated facets to their home, the rest
  to the declared `fallback` area. Sticky floaters are skipped (dock wins
  over sticky; sticky stays a floater concept).
- **DECIDED**: new windows opened while a foundation is active dock straight
  into their designated home (fallback otherwise).
- **DECIDED**: the foundation has NO chrome — pure scaffolding (areas span
  the whole canvas), absent from the sidebar window list; an **unlock chip**
  on the canvas drops the grid. **Alt-drag = float intent** (all dock
  targets suppressed); right-click Undock remains.
- **DECIDED**: occupants of an ephemeral split-half **migrate home** when
  the original (non-ephemeral) sibling empties — the remaining frame expands
  back to the full area instead of stranding at half size.
- can a docked window be sticky (visible across desktops while docked)?
  proposed: dock wins; sticky applies only to floaters
- splitter limits (min fractions), and whether `sizes` roam or stay
  per-instance
- ~~empty areas~~ **DECIDED (refined)**: preset and menu-created areas are
  deliberate furniture — when emptied, a **dockable hole** remains (subtle
  empty home; highlights with the animated destination preview during a
  drag); `closeArea` is the explicit way to remove one. Areas created by an
  **edge-drop split are `ephemeral: true`** and merge back into their
  sibling the moment their last docked reference leaves (minimized
  occupants still count as references). Dock refs pointing at vanished
  areas are cleared by the same normalize sweep.

### Tab strip (DECIDED — shaped ticker)

- **DECIDED**: the multi-tab strip is a **shaped ticker** at every width —
  slanted interlocking segments that always fill the strip exactly. Widths
  come from one pure solver (`ticker.ts`): each tab wants its natural label
  width; when squeezed, the active tab (and the hovered one) keep a readable
  floor and the rest absorb it. Labels glyph-squeeze (`scaleX`, floor 0.55)
  before clipping. Hover, click, and wheel-cycle are uniform; segments are
  the tab-drag handles (click = select, movement = tear-off) — no chips/pager
  mode switch.
- **DECIDED**: squeezed strips get a **bleed picker** — after a **500 ms
  dwell**, an identical bar inflates IN PLACE out of the header (centred on
  it, clamped to the canvas, slightly taller, every label natural) and
  shrinks back into the header's exact shape on leave (240 ms grace). The
  picker is the same TickerStrip component, so selection, wheel, and
  tear-off behave identically on it; a tear-off shrinks it the moment the
  press becomes a drag. Morph rides keyframes fed by custom properties
  (anchor rect + anchor-solved segment positions — the `.snap-preview`
  pattern); dwell/grace timers live in a module controller
  (`tickerBleed.ts`, the canvasGuard pattern).
