# Gyld contract fixtures

The `bundle/` tree is REAL Gyld output, copied verbatim from
`gyld/artifacts/decision-streams-v3/` on 2026-09-13. It is not edited here: a
fixture that is hand adjusted stops being evidence of what Gyld emits. The
directory layout is the bundle layout of specification section 4.6, so the
store tests address files by the same relative paths the real stores use.

It replaced the `decision-streams-v2` copy that was here before. Between the
two runs the base stream's own files changed only in the build stamp, the
run's note and the two typography fields every lens node now carries
(`fontsize`, `justify`); what is new is the chain of streams over the base,
which is what the stream, decide and diff windows are built against.

## `bundle/`: one directory, two lineages and a chain of three streams

Written by `gyld/scripts/emit_decision_streams.py` with `--architecture
--stream stream-a --stream stream-b` (documented in `gyld/examples/README.md`,
sections "The base stream bundle" and "A chain in one bundle").

| Path | Format |
|---|---|
| `streams.json` | `gyld.streams.v1`, four streams over two lineages |
| `streams/base/stream.json` | `gyld.stream.v1`, the decision graph, `kind` fork, no parent |
| `streams/base/decide-now.json` | `gyld.decide-now.v1`, 24 questions, no rulings |
| `streams/base/validation.json` | `gyld.validation.v1`, ok, empty findings |
| `streams/base/projection.json` | `gyld.projection.v1`, 75 occurrences, 36 assertions, 83 definitions |
| `streams/base/lenses/decisions.lens.json` | `gyld.lens.v1`, 29 nodes, 32 edges, 2 groups |
| `streams/base/lenses/tiers.lens.json` | `gyld.lens.v1`, 24 nodes, 20 edges, 6 groups |
| `streams/base/lenses/status.lens.json` | `gyld.lens.v1`, 29 nodes, 32 edges, 4 groups |
| `streams/base/lenses/branch.lens.json` | `gyld.lens.v1`, 10 nodes, 10 edges, no groups |
| `streams/stream-a/stream.json` | `gyld.stream.v1`, `kind` link, parent `base`, chain `[base, stream-a]` |
| `streams/stream-a/decide-now.json` | `gyld.decide-now.v1`, 25 questions, 3 rulings |
| `streams/stream-a/validation.json` | `gyld.validation.v1`, ok, empty findings |
| `streams/stream-a/lenses/decisions.lens.json` | `gyld.lens.v1`, 30 nodes, 33 edges, 2 groups |
| `streams/stream-b/stream.json` | `gyld.stream.v1`, `kind` link, parent `stream-a`, chain of three |
| `streams/stream-b/decide-now.json` | `gyld.decide-now.v1`, 25 questions, 4 rulings, one of them retired |
| `streams/stream-b/validation.json` | `gyld.validation.v1`, ok, empty findings |
| `streams/stream-b/lenses/decisions.lens.json` | `gyld.lens.v1`, 30 nodes, 33 edges, 2 groups |
| `streams/architecture/stream.json` | `gyld.stream.v1`, the architecture graph, `kind` declaration, with a `lenses` manifest |
| `streams/architecture/validation.json` | `gyld.validation.v1`, ok |
| `streams/architecture/lenses/lifecycle.lens.json` | `gyld.lens.v1`, `stream` null, classifications set |
| `streams/architecture/lenses/allocation.lens.json` | `gyld.lens.v1`, groups of kind `declared` with an `occurrence` |

The two architecture lenses are here because they carry shapes the decision
lenses do not: a null `stream` (no stream overlays the architecture snapshot
today), a set `classification` with a null `status` on every node, edge labels
with label positions, declared containment groups beside reading aids, and the
other typography the host uses (12pt centred, against the decision lenses'
11pt left). The occurrence a declared group names is the area record, which is
NOT drawn as a node of that lens, so nothing cross-checks it against the node
set.

Stream A and stream B are here because they carry the shapes one stream cannot:
a `parent`, a `chain`, a `parent_snapshot` to compare against the parent's
current identity, an overlay module of their own, rulings, a retired ruling, a
record that marks a trigger as occurred, and a question a stream added
(`pin_audit`) with a qualified slot in the overlay's own module.

Not copied, because no reader in this package reads them and they are large:
`snapshot.json`, `inputs.json`, `annotations.json`, the projections of every
stream but `base`, and the `.dot`, `.svg` and `.json0.json` files beside each
lens. Only one perspective of stream A and stream B is copied (`decisions`),
which is the one the diff window draws side by side. Those two streams and the
architecture stream therefore read here as bundles whose projection is absent,
which is a state the store must render and does.

## `provisional/`: still hand written, no emitted counterpart

Two formats of specification section 7 have no emitted file yet, so these stay
hand written from the specification and are marked as such:

| File | Format | Why it is still provisional |
|---|---|---|
| `diff.json` | `gyld.stream-diff.v1` | the diff host is Gyld-side step 2.2; no `diffs/` directory is emitted yet |
| `validation-invalid.json` | `gyld.validation.v1`, not ok | every stream of the bundle validates, so no rejected bundle exists; the shape follows `emit_decision_streams.validation_document` with a `GyldError.to_dict()` finding, plus the `location` block section 7.5 defines and this host does not write |

Replace each of these with real output as soon as the emitting host lands.

## What the real files changed in the readers

Recorded here because the reader comments point back at this list.

- Lens `stream` is nullable: the stream's own id for the decision lenses, null
  for the architecture lenses.
- Lens nodes carry `classification` and `group` (a cluster id or null), and both
  `status` and `classification` are always present with one of them null.
- Lens nodes carry `fontsize` and `justify`, which is the typography the host
  drew with rather than one the view guesses.
- Lens edges carry `ref_index` and a `style` object (`color`, and `style` or
  `penwidth` where the picture uses them).
- An edge's `owner` is not always a node of the lens: in the decisions and
  status lenses an Implies edge is drawn from the alternative's owning question
  while `owner` names the alternative, which those lenses fold into box text.
- Lens groups carry `kind` (`reading-aid` or `declared`) and `occurrence`.
- A decided question keeps its whole `Offers` list in the box text with the
  selected line reading `- name (selected)` (owner ruling O2); the star keeps
  its older meaning, a recorded lean that selects nothing.
- `validation.json` carries a `findings` list.
- A `decide-now.json` ruling carries more than the four fields section 7.4
  sketches, and three of them are legitimately null: `decides`, `selects` and
  `reopens` are all null on the record that only marks a trigger as occurred.
  It also carries `label`, `stream`, `occurred`, `live`, `principal` and
  `stamp`. A ruling an ancestor made that a child reopened is emitted with
  `live: false` rather than dropped.
- `stream.json` and the records inside `streams.json` carry the emitted answers
  as well: `questions`, `roots`, `tiers`, and on the architecture stream a
  `lenses` manifest whose entries may be marked not emitted with a reason. A
  question's ruling is NOT in those entries: it travels in `decide-now.json`,
  where the contract already put `ruling` and `rulings`.
- `streams.json` carries `lineages` when the directory holds more than one.
- `kind` is an open string: the architecture stream is `declaration`, which is
  neither of the two kinds section 4.4 names.
