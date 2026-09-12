# Gyld contract fixtures

The `bundle/` tree is REAL Gyld output, copied verbatim from
`gyld/artifacts/decision-streams-v2/` on 2026-09-13. It is not edited here: a
fixture that is hand adjusted stops being evidence of what Gyld emits. The
directory layout is the bundle layout of specification section 4.6, so the
store tests address files by the same relative paths the real stores use.

## `bundle/`: one directory, two lineages

Written by `gyld/scripts/emit_decision_streams.py` (documented in
`gyld/examples/README.md`, section "The base stream bundle").

| Path | Format |
|---|---|
| `streams.json` | `gyld.streams.v1`, two streams over two lineages |
| `streams/base/stream.json` | `gyld.stream.v1`, the decision graph, `kind` fork |
| `streams/base/decide-now.json` | `gyld.decide-now.v1`, 24 questions, no rulings |
| `streams/base/validation.json` | `gyld.validation.v1`, ok, empty findings |
| `streams/base/projection.json` | `gyld.projection.v1`, 75 occurrences, 36 assertions, 83 definitions |
| `streams/base/lenses/decisions.lens.json` | `gyld.lens.v1`, 29 nodes, 32 edges, 2 groups |
| `streams/base/lenses/tiers.lens.json` | `gyld.lens.v1`, 24 nodes, 20 edges, 6 groups |
| `streams/base/lenses/status.lens.json` | `gyld.lens.v1`, 29 nodes, 32 edges, 4 groups |
| `streams/base/lenses/branch.lens.json` | `gyld.lens.v1`, 10 nodes, 10 edges, no groups |
| `streams/architecture/stream.json` | `gyld.stream.v1`, the architecture graph, `kind` declaration, with a `lenses` manifest |
| `streams/architecture/validation.json` | `gyld.validation.v1`, ok |
| `streams/architecture/lenses/lifecycle.lens.json` | `gyld.lens.v1`, `stream` null, classifications set |
| `streams/architecture/lenses/allocation.lens.json` | `gyld.lens.v1`, groups of kind `declared` with an `occurrence` |

The two architecture lenses are here because they carry shapes the decision
lenses do not: a null `stream` (no stream overlays the architecture snapshot
today), a set `classification` with a null `status` on every node, edge labels
with label positions, and declared containment groups beside reading aids. The
occurrence a declared group names is the area record, which is NOT drawn as a
node of that lens, so nothing cross-checks it against the node set.

Not copied, because no reader in this package reads them and they are large:
`snapshot.json`, `inputs.json`, `annotations.json`, the architecture stream's
`projection.json` and its other seven lens files, and the `.dot`, `.svg` and
`.json0.json` files beside each lens. The architecture stream therefore reads
here as a bundle whose projection and decide-now list are absent, which is a
state the store must render and does.

## `provisional/`: still hand written, no emitted counterpart

Two formats of specification section 7 have no emitted file yet, so these stay
hand written from the specification and are marked as such:

| File | Format | Why it is still provisional |
|---|---|---|
| `diff.json` | `gyld.stream-diff.v1` | needs two streams of one lineage; the diff host is step 2.2 |
| `validation-invalid.json` | `gyld.validation.v1`, not ok | both captures validate, so no rejected bundle exists; the shape follows `emit_decision_streams.validation_document` with a `GyldError.to_dict()` finding, plus the `location` block section 7.5 defines and this host does not write |

Replace each of these with real output as soon as the emitting host lands.

## What the real files changed in the readers

Recorded here because the reader comments point back at this list.

- Lens `stream` is nullable: `base` for the decision lenses, null for the
  architecture lenses.
- Lens nodes carry `classification` and `group` (a cluster id or null), and both
  `status` and `classification` are always present with one of them null.
- Lens edges carry `ref_index` and a `style` object (`color`, and `style` or
  `penwidth` where the picture uses them).
- An edge's `owner` is not always a node of the lens: in the decisions and
  status lenses an Implies edge is drawn from the alternative's owning question
  while `owner` names the alternative, which those lenses fold into box text.
- Lens groups carry `kind` (`reading-aid` or `declared`) and `occurrence`.
- `validation.json` carries a `findings` list.
- `stream.json` and the records inside `streams.json` carry the emitted answers
  as well: `questions`, `roots`, `tiers`, and on the architecture stream a
  `lenses` manifest whose entries may be marked not emitted with a reason.
- `streams.json` carries `lineages` when the directory holds more than one.
- `kind` is an open string: the second stream is `declaration`, which is
  neither of the two kinds section 4.4 names.
