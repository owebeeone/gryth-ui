# grazel — razel as a glade graph provider

Status: **proposal v3** — reframed onto glade. Supersedes the standalone-
protocol framing of v1/v2: grazel is **not** a bespoke transport/RPC. It is
razel's surface as a **glade provider**, expressed in glade's *exchange* and
*interest* semantics. glade does the locating, transfer, caching, resync, and
identity; this doc defines only what razel contributes.
Date: 2026-06-20
Scope: the data + operations razel exposes so the graph viewer can request a
workspace graph by key and apply the resulting document.
Reads against: `dev-docs/glade/GladeSurfacePrecis.md`,
`GladeExchangeSemantics.md`, `GladeRecordEnvelope.md`, and the StackMap layer
split. Companion to `GraphRendererRequirements.md` / `GraphRendererFeatures.md`.

## 1. Role & layering

```
graph viewer  ── glade consumer (declares interest by key, applies a projection)
    │  key (workspace + slice) → document (projection)
glade         ── substrate: locate · transfer · cache · resync · identity · scope
    │  exchange (bounded query)   +   interest (live source projection)
razel/grazel  ── glade provider: graph operations + the projection shape
```

The viewer never speaks to razel. It declares **interest** in a graph slice
(a key) and applies the maintained **projection** (a tap value); a different
slice is a different key → a different **exchange** razel serves. razel is a
provider that claims exchanges, executes, and publishes — and maintains the
live graph as an observed source.

## 2. What glade owns — NOT redefined here

Everything in v2 that was transport/streaming/identity machinery is glade's
and is deliberately removed from this doc:

| Concern | Owned by glade (reference) |
|---|---|
| locating the provider, work placement | provider placement / distributed control plane |
| efficient transfer, **local caching**, dedup | substrate + content addressing |
| record identity, verifiability, supersession | `GladeRecordEnvelope` (`record_id`, `payload_hash`, `causal_refs`, `content-head`/`content-chunk-ref`/`content-invalidation`) |
| ordering, generations, resync, disconnect | exchange planes: `generation`/`seq`, **observation plane** (publication ≠ observation) |
| ownership, claiming, retry, cancellation, diagnostics | `ClaimRecord`/`owner_term`, `ProviderProgress`, the **diagnostics plane** (`certainty: confirmed/suspected/unknown`) |
| scope, visibility, capability, lease | glade scope axis (sessions → scopes → apps) |

So the v2 hardening (epoch/seq/resync/idempotency/invocation scoping/cache
coherence) is satisfied by glade, not by grazel. **razel's action identity** =
a content digest, surfaced as a glade content reference — which closes the v2
keystone open question via glade's content addressing.

## 3. The graph projection (value-type)

razel's data contribution is the typed graph record. These are the **razel
profile**; razel declares the actual vocabulary via §7 capabilities (the
ladder shape is razel-design-dependent — see §9).

```
Node  { id; kind; level; label; parent_id; owner_id;
        dep_attrs?; status?; aggregate? }      // id = content/label digest (glade content-ref)
Edge  { id; source_id; target_id; kind;
        dep_kind?; optional?; weight?; aggregate?; reason?[] }  // reason lazy
Status{ incr;  // CLEAN | DIRTY | UNKNOWN     ← driven by razel's file monitor
        exec;  // QUEUED|RUNNING|DONE|FAILED|CACHED|SKIPPED|CANCELLED|BLOCKED|RETRYING
        phase; // for RUNNING: UPLOAD_INPUTS | EXECUTE | DOWNLOAD_OUTPUTS
        where; // LOCAL | REMOTE | LOCAL_CACHE | REMOTE_CACHE
        cause? }
Aggregate { member_level; member_count; member_digest; rollup }  // deterministic super-node id
StatusRollup { counts{exec→n}; total; progress; dominant }       // collapsed-view liveness
```

Kept from v2 because they are razel's data, not transport: split
incrementality-vs-execution status, the `RUNNING.phase` output-download
reality, `StatusRollup` for collapsed nodes, `dep_kind`/`optional` for cheap
edge styling (`E7`), deterministic aggregate ids for stable collapse/explode.
Identity, versioning, and delivery of these records are glade's.

> **The card payload is not razel's and not glade-graph data.** Git
> branch/SHA/ahead/behind/changed-files is a *separate* glade declaration a
> gryth-side provider joins by node id. `A4` (decouple the generic model from
> the repo shape) remains a prerequisite.

## 4. Exchange operations (the query vocabulary — bounded work)

Each is a glade `RequestIntent { operation, target_ref, input }`; razel claims
it and publishes a `Subgraph` as `PublicationRecord`s. razel owns **how much
to compute** (the budget); glade owns delivery.

| operation | input | publishes |
|---|---|---|
| `get_graph` | roots, `op` (deps/rdeps/closure), `depth`, `collapse_to`, `collapse_count`, `filter`, `graph` mode, `max_nodes/edges` | a budgeted `Subgraph` + `truncated` + `frontier[].omitted_count` |
| `expand_node` | node id, target level | children subgraph (ladder down) |
| `expand_edge` | edge id | constituent edges + `reason` provenance |
| `neighbors` | node id, direction, depth | focus bloom subgraph |
| `paths` | from, to, mode (all/some/shortest) | the why-path subgraph |
| `search` | text, kind filter | matching nodes |
| `metrics` | node ids, metric keys | per-node metric values (lens data) |
| `diff` | rev A, rev B, scope | added/removed/changed nodes & edges |

razel still owns **result budgeting** (`max_nodes`/`truncated`/`frontier`,
plus `collapse_count` for the "thousands of siblings under one parent" case) —
that's "how much to compute," a provider decision, distinct from glade's "how
to deliver." `filter` = bazel-style `kind()/filter()/attr()`; path queries
live only in `paths`.

## 5. Interest / source projections (ongoing observation)

razel maintains the live graph as a **mutable source** — kept live by its
**file monitor** (→ `Status.incr` dirty) and its **executor** (→ `Status.exec`
lifecycle). Per glade flow types:

- **derived structure** → an **atom** projection: the current slice snapshot.
- **live status** → a **stream** projection: the build/dirty wavefront
  (optionally also a **log** for replayable build history — the live/replay
  split over one source).

The exchange→interest bridge (per `GladeExchangeSemantics` §8): a `get_graph`
exchange **produces a source binding** the viewer then observes for status. So
fetch is bounded (exchange), liveness is continuous (interest), and the fetched
slice is exactly what gets watched. The live blast-radius view is
`get_graph(op=rdeps)` whose result is observed as a status stream — the
wavefront animates as you edit (file monitor) and as it builds (executor).

## 6. The slice key & the key/presentation boundary

The viewer's "key" is a glade interest/exchange declaration:

- **In the key (data slice):** workspace id + `roots` + `op` + `depth` +
  `collapse_to` + `filter` + active lens (metric keys). Changing any of these
  re-resolves to a different razel exchange.
- **NOT in the key (presentation):** layout algorithm, camera/zoom, edge
  style, theme, selection. These are viewer-local — glade "does not own UI
  runtime internals" (StackMap), so the boundary is enforced by the layering.

**Authored layer is a sibling glade declaration, not razel's.** The workspace
definition, saved lenses, manual node positions (`L10`), and showcase
annotations are user-authored, so they live in a glade **editable-blob** (CRDT,
multi-writer, p2p-convergent) owned gryth-side and synced by glade — out of
grazel scope. razel supplies only derived structure + live status.

## 7. Capabilities (razel's self-description)

razel declares its profile so the viewer renders generically and degrades
gracefully (rides glade's declaration model, not a bespoke call):

- ordered **level ladder** `[{id, display_name, order}]`
- **node_kinds**, **edge_kinds** vocabularies
- supported **operations** (§4)
- **metric_keys** `{key, type, unit, suggested_domain}` (lens scales)
- **label dialect** (opaque ids; pattern-match capability)
- **stable_levels** (which rungs guarantee cross-revision stable ids → where
  the viewer may persist layout; others re-layout within `owner_id`)
- **graph modes** razel exposes (loading / configured / action — only those
  razel actually models; see §9)

## 8. Phasing

- **v1 (static explore):** `get_graph` (deps/rdeps, depth, collapse, budget),
  `expand_node`, capabilities. Focus+context + the ladder.
- **v1.1 (reasoning):** `paths`, `search`, `expand_edge` + provenance,
  `filter`, `metrics`.
- **v2 (live):** status as an interest **stream** projection (file-monitor +
  executor). Cheap now — glade owns delivery/resync; razel just emits
  `ProviderProgress`/status.

## 9. Open questions (razel-specific now)

The bazel-fidelity questions are gone — razel is whatever we design. What
remains is razel's own shape:

1. **Ladder shape** — is razel's native graph action/command-centric (rungs ≈
   `command` + `file`, grouping directory-derived) or does it carry
   `target`/`package` layers? Sets how deep the declared ladder is.
2. **Configurations** — does razel build one input multiple ways? If not, drop
   the `configured` graph mode entirely (it was a bazel-ism).
3. **Action identity digest** — the exact content/owner-derived key razel
   uses, surfaced as the glade content reference.
4. **Flow-type composition** — derived structure as an **atom** snapshot per
   slice vs. an **editable-blob** the viewer patches; and whether build history
   warrants a parallel **log**.
5. **Exchange vs standing interest per gesture** — is "move focus to a node" a
   fresh `get_graph` exchange each time, or a parameterized standing interest
   glade keeps warm? Affects how chatty re-focus is.

## 10. Changes from v2

- Reframed from a standalone gRPC-over-iroh protocol to **razel as a glade
  provider** (exchange + interest). Transport, resync, identity, caching,
  ordering, diagnostics, and scope are **deferred to glade** (§2), removing the
  bulk of v2.
- Query RPCs → glade **exchange operations** (§4); the live stream → a glade
  **interest** projection (§5); the exchange→interest source-binding bridge
  made explicit.
- v2 keystone (stable ACTION identity) **closed** via glade content addressing.
- Value-type schemas (Node/Edge/Status/Aggregate) retained as razel's data
  contribution, trimmed of delivery mechanics.
- Authored layer relocated to a sibling glade **editable-blob**, out of scope.
- Open questions reduced to razel's own design (ladder/config/identity/flow-
  composition), the bazel-fidelity set retired.
