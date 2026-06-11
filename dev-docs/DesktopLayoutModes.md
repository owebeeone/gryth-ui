# Desktop layout modes — brainstorm

Status: **brainstorm** — for discussion, not yet pruned.

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
