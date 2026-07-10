# Showcase concept — skin over a shared spine

Status: **concept** — for discussion. Synthesized from a 7-metaphor
generate→score→curate exploration.
Date: 2026-06-21
Scope: a public, crawlable, A/B-able showcase for ~70 GitHub repos, built on
grip. The hero is the **navigation metaphor**, not the portfolio.

## Thesis

The unique navigation UX *is* the product — getting a visitor to the project
they want, fast, via a UX nobody's seen. So the metaphor is the deliverable,
not the data. And because you want **multiple landing states A/B-tested for
conversion**, the right architecture is: **build one shared spine, then A/B
interchangeable metaphor *skins* over it.** Every skin renames the same
context tuple (basin/pour, station/line, plant/season, center/pivot) but
serializes identically — so swapping the skin is cheap and the variants are
honestly comparable.

## The shared spine (build once)

Five layers; only the render skin and the layout strategy differ per variant.

1. **Context ⇄ URL ⇄ page triad** (the load-bearing invariant). One nav state
   == one grip `MatchingContext` == one URL == one SSG page. All human copy
   (search chips, captions, prose) is a *pure projection* of the context key,
   so it can't drift. Partly shipped already:
   `getOrCreateMatchingContext('tab:{id}')` in `packages/desktop/src/tabContexts.ts`
   makes a context the nav instance, and `ToolLink{toolId,params}` +
   `DESKTOP_TAB_LINKS`/`DESKTOP_RETARGET_TAB` in `packages/plugin-api/src/registry.ts`
   already serialize per-tab state to a portable bundle. **Net-new:** a
   canonical URL encoder/decoder (there is *zero* `pushState`/router usage in
   the repo today). One shared key schema all skins reuse:
   `{ focus: repoId, op: deps|rdeps|closure, scope/level, filter: facet chips,
   from: breadcrumb origin }`. **Canonical-URL discipline:** only discrete
   named features + a bounded facet set go in the key; camera/pan/zoom/
   animation-phase are presentation-local and never in the key (the
   key-vs-presentation boundary from `GrazelGraphProtocol.md`). Pan snaps to
   the nearest landmark.

2. **Emergent search = the rear-view mirror.** The query box is never a front
   door; it's the current context tuple rendered as removable chips + a
   ghosted "try other terms" suggesting sibling facets from the focus node's
   neighbors. Editing a chip mutates the context (and the camera); navigating
   rewrites the chips. Both directions hit the **same reducer**. Metaphor-
   agnostic; the cheapest universal "this is alive" wow — wire it once.

3. **SSG mirror (the crawl surface).** A build-time renderer walks every
   canonical context key and emits one flat text page per key: H1 (focus name
   + role), a one-line status/role sentence, the GitHub `<a href>` CTA, and
   the load-bearing part — real `<a>` link lists for every adjacency
   (depends-on / depended-on-by / siblings), each link a neighbor's canonical
   URL. **Invariant: navigable-edge-set === rendered-anchor-set**, so crawler
   and human walk the identical graph and the SPA hydrates over the same DOM.
   This *is* the a11y/keyboard fallback — wire it as the real path, not a
   toggle.

4. **Deterministic layout bake** (gates the spatial-memory skins). Blocker:
   `graphEngine.ts` seeds velocities with unseeded `Math.random()` and re-seeds
   on any input change (L9/L10 are ✗). Spatial memory needs a repo in the same
   place every visit, and the SSG text + hydrated SPA must agree. So bake
   positions **once at build time** from a manifest hash; the runtime loads
   baked coordinates instead of simulating live on first paint. Pair with the
   camera (N1/N2, both ✗) and the L8 layout-strategy seam so each skin plugs a
   different engine (force / dagre-layered / radial).

5. **A/B + measurement harness.** A landing variant is just a *default context
   + a render-skin id*, both in the URL — so A/B is a deterministic assignment
   over already-shareable state, no new state model. Instrument one shared
   conversion event (click-through to a target GitHub repo) + one engagement
   signal (≥1 nav hop / ≥20s dwell), emitted identically by every skin because
   they share the reducer. Same spine, same events, only the metaphor differs.

**Data prerequisite (all skins):** `RepoInfo` today carries only
path/head/ahead/behind/dirty, and the mock is ~11 repos across 3 workspaces —
"70 repos" is aspirational. The spine needs a **manifest enrichment pass**
adding role, description, language, last-commit recency, and stars (GitHub API
at build time) + a curated dependency-cluster/role taxonomy. Every skin's
triage signal (brightness/season/line/basin-size) reads from this one manifest.

## The A/B portfolio (three skins, chosen for appeal diversity)

| Skin | Pole / who it converts | One-line metaphor | Order |
|---|---|---|---|
| **The Concierge Desk** | wayfinding / goal-driven, possibly non-technical | A desk asks "where are you trying to get?"; every answer re-pivots a radial map so the destination snaps to center and the route lights up | **1st** — radial (L4/N3) is the cheapest unbuilt layout (S/M); lowest feasibility risk |
| **Stellarium** | wow / curious, aesthetics-driven | A living night sky: repos are stars (brightness = recent activity), clusters are constellations, you star-hop along dependency edges | **2nd** — reuses the existing force engine + status hues; fastest second variant |
| **Interchange (Metro)** | crawl/SEO / systems-thinker | A subway map: repos are stations, dependency chains are colored lines, workspaces are interchange zones; pick a destination and "ride" a route | **later** — octolinear (L5) is NP-hard + needs a curated line manifest; ship behind dagre-layered as fallback |

Conversion hypotheses:
- **Concierge** beats both the blank box (cold-start paralysis) and the 70-tile
  grid (choice paralysis) by opening with use/build/contribute/browse triage;
  one unambiguous "Open repo →" CTA per center. Measure click-through +
  pivots-to-conversion. Ship with a terse "just show the map" escape for senior
  devs scanning for a name.
- **Stellarium** spends the first 3s of novelty-attention on the highest-value
  (recently-maintained) hubs, so the eye lands on what's worth clicking before
  any reading; star-hopping guides "I don't know the names" to a known hub's
  leaf. Measure dwell >20s + ≥1 hop, then click-through.
- **Metro** externalizes the one thing a portfolio visitor lacks — a model of
  *how* 70 repos relate — in a visual language everyone already reads; "ride
  the busiest line from the hub" answers "where do I start?" in a glance.
  Measure click-through + line-follow rate.

## Cross-cutting wow (graft into every winner)

- **Importance ≠ activity.** Encode importance (depended-on count) as **size**
  and activity (recency) as a **separate** channel (brightness/fill) — so a
  load-bearing-but-stable core library reads as a venerable big-calm landmark,
  not a dead one. Fixes the most common misread of any activity-colored map.
- **Edge-as-journey.** Make "what uses grip-core?" a literal animated traversal
  along the edge (rest dims, camera glides the route, destination card opens),
  not a filter toggle — the shared engagement hook that buys the seconds before
  the repo click. Wire once in the reducer (highlight-route + camera-ease); each
  skin styles it (lit track / flowing road / flood). Add a "jump instantly"
  affordance for repeat power-users.
- **Search-box-as-editable-camera.** Deleting a "clean" chip widens the view to
  include dirty repos; typing "react" flies the camera to the match and
  reframes. Editing the query *is* moving the camera — the cheapest "this is
  alive" wow. Every skin treats a chip edit as a context+camera mutation.
- **Semantic-zoom default-collapse.** Never show 70 specks on landing —
  default-collapse low-degree nodes into ~9 labelled workspace/cluster
  super-nodes so the first frame is 5–12 legible features regardless of total;
  scroll/pinch explodes one. Biggest legibility win for all spatial skins; build
  behind the L8 seam.
- **Status-as-motion + saturation, not hue alone.** Colorblind-safe a11y *and*
  makes motion encode real direction/status (the line between wow and noise).
  Legend carries names+patterns, not color. Wire as a shared status→style
  resolver (the E8 seam).
- **Facets→prose service (shared).** One generator: role + in/out-degree +
  status → "a foundational library nothing depends on but 12 things use." Reused
  for SSG H1-sentences, ambient captions, and Concierge narration — amortizes
  the hardest non-layout piece and *is* the SEO content engine.

## Bench & cut

- **Patchbay — cut.** A force-directed cable board is an exploration surface,
  not get-to-target-fast; it concedes a plain search box does the real
  wayfinding, inverting what a navigation metaphor is for. Its only strength
  (grip serialization) is already in the spine.
- **The Atlas — harvested, not shipped.** Conceptually airtight but stacks three
  unbuilt renderer capabilities (stable+persisted layout, semantic zoom, stable
  clustering). Its best moves (zoom altitude ladder, edge-as-journey,
  search-as-camera) are grafted above.
- **Watershed — benched.** Fresh and best-in-class grip-fit, but redundant in
  appeal with Stellarium (another organic canvas). Hold as a reserve: its
  dagre-**layered** downhill layout is a cheaper systems-thinker substitute if
  Metro's octolinear cost proves prohibitive.
- **Conservatory — benched behind Stellarium.** Same activity-triage thesis,
  lower uniqueness, "cute undercuts credibility" risk. Graft its
  importance-vs-activity separation into Stellarium.

## Open decisions

1. **Manifest reality** — "70 repos" needs an enrichment source (GitHub API at
   build) + a curated role/cluster taxonomy. Who owns curation; hand-maintained
   or derived? Gates every skin.
2. **Layout-engine borrow order** — dagre-layered (serves Metro + Watershed
   fallback) vs radial (serves Concierge, the 1st variant). Land which first?
   (ELK for true octolinear is EPL-2.0 — flag before committing Metro.)
3. **Deterministic-bake mechanism** — bake on manifest-hash change; do
   per-visitor drags (L10) persist or reset to baked?
4. **SSG URL bounding** — confirm continuous axes (pan-center, sliders) drop
   from the canonical crawl set and pan snaps to named features, else thin
   duplicate-content explosion.
5. **Mobile** — a pannable map and a star-field both degrade at 380px. Distinct
   "directory" fallback (the SSG text mirror gives it for free) or default
   mobile to the Concierge variant?
6. **Scope/mission** — `GrythDemoProposal.md` frames gryth as an internal
   two-desktop cooperation demo; this brief is a public conversion showcase.
   Is the showcase a distinct product (own repo/deploy) or a gryth facet?
   Justifies the A/B + SEO investment either way — confirm before building.

## Build order

Spine first (triad encoder + emergent-search reducer + SSG mirror + deterministic
bake + measurement harness), then variant 1 (Concierge / radial), then variant 2
(Stellarium / force), then Metro once the line manifest + a layout engine exist.
The variants are render skins + a default context each, plugged into the L8 seam.
