# Gyld contract fixtures

The `bundle/` tree is REAL Gyld output, copied verbatim from
`gyld/artifacts/decision-streams-v5/` on 2026-09-13. It is not edited here: a
fixture that is hand adjusted stops being evidence of what Gyld emits. The
directory layout is the bundle layout of specification section 4.6, so the
store tests address files by the same relative paths the real stores use. Where
a test needs a shape that run does not carry, it mutates a copy in the test
(`FakeBundle.write`) and says why, rather than editing a file here.

It replaced a `decision-streams-v3` copy, which replaced a `v2` one. What the
v5 run added is what the stream, decide and diff windows are built against:
`fork-a` beside the two links, a `lenses` manifest on every record, one member
of the parameterised `neighbourhood` family per stream, and the three emitted
diffs.

## `bundle/`: one directory, two lineages, four decision streams and three diffs

Written by `gyld/scripts/emit_decision_streams.py` and
`gyld/scripts/manage_decision_streams.py` (documented in
`gyld/examples/README.md`, sections "The base stream bundle", "A chain in one
bundle" and "Fork, link, rebuild and diff").

| Path | Format |
|---|---|
| `streams.json` | `gyld.streams.v1`, five streams over two lineages |
| `diffs/base..stream-a.json` | `gyld.stream-diff.v1`, a link over the base: seven occurrences added, two effective statuses changed |
| `diffs/stream-a..stream-b.json` | `gyld.stream-diff.v1`, a reopen: one ruling added, one retired, one selection changed |
| `diffs/stream-a..fork-a.json` | `gyld.stream-diff.v1`, a flattening fork of the same content |
| `streams/base/stream.json` | `gyld.stream.v1`, the decision graph, `kind` fork, no parent |
| `streams/base/decide-now.json` | `gyld.decide-now.v1`, 24 questions, no rulings |
| `streams/base/validation.json` | `gyld.validation.v1`, ok, empty findings |
| `streams/base/projection.json` | `gyld.projection.v1`, 75 occurrences, 36 assertions, 83 definitions |
| `streams/base/lenses/decisions.lens.json` | `gyld.lens.v1`, 29 nodes, 32 edges, 2 groups |
| `streams/base/lenses/tiers.lens.json` | `gyld.lens.v1`, grouped by tier |
| `streams/base/lenses/status.lens.json` | `gyld.lens.v1`, grouped by effective status |
| `streams/base/lenses/branch.lens.json` | `gyld.lens.v1`, Implies and Offers only |
| `streams/base/lenses/neighbourhood-key_custody.lens.json` | `gyld.lens.v1`, one member of a parameterised family: `family` and `parameter` are set |
| `streams/stream-a/stream.json` | `gyld.stream.v1`, `kind` link, parent `base`, chain `[base, stream-a]` |
| `streams/stream-a/decide-now.json` | `gyld.decide-now.v1`, 25 questions, 3 rulings |
| `streams/stream-a/projection.json` | `gyld.projection.v1`, the definitions the decide window reads declared classes from |
| `streams/stream-a/validation.json` | `gyld.validation.v1`, ok, empty findings |
| `streams/stream-a/lenses/decisions.lens.json` | `gyld.lens.v1`, 30 nodes, 33 edges |
| `streams/stream-b/stream.json` | `gyld.stream.v1`, `kind` link, parent `stream-a`, chain of three |
| `streams/stream-b/decide-now.json` | `gyld.decide-now.v1`, 25 questions, 4 rulings, one of them retired |
| `streams/stream-b/validation.json` | `gyld.validation.v1`, ok, empty findings |
| `streams/stream-b/lenses/decisions.lens.json` | `gyld.lens.v1`, 30 nodes, 33 edges |
| `streams/fork-a/stream.json` | `gyld.stream.v1`, `kind` fork, parent `stream-a`, chain `[base, fork-a]` |
| `streams/fork-a/decide-now.json` | `gyld.decide-now.v1`, stream A's content restated over the base |
| `streams/fork-a/validation.json` | `gyld.validation.v1`, ok, empty findings |
| `streams/fork-a/lenses/decisions.lens.json` | `gyld.lens.v1` |
| `streams/architecture/stream.json` | `gyld.stream.v1`, the architecture graph, `kind` declaration |
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

The three decision streams over the base are here because they carry shapes one
stream cannot: a `parent`, a `chain`, a `parent_snapshot` to compare against
the parent's current identity, an overlay module of their own, rulings, a
retired ruling, a record that marks a trigger as occurred, a question a stream
added (`pin_audit`), and the difference between a LINK, whose chain runs
through its parent, and a FORK, whose parent is provenance and whose chain runs
straight to the base.

Stream A's projection is here for one reason: a qualified slot names the member
(`...GladeDecisions.version_pin`) and an overlay is written against the class
(`Decides[VersionPin]`), and the class is only in the projection's definitions.
The decide window reads it there rather than spelling a class out of a slot.

Not copied, because no reader in this package reads them and they are large:
`snapshot.json`, `inputs.json`, `annotations.json`, the projections of every
stream but `base` and `stream-a`, and the `.dot`, `.svg` and `.json0.json`
files beside each lens. Only one perspective of stream A, stream B and fork-a
is copied (`decisions`), which is the one the diff window draws side by side.
Those streams and the architecture stream therefore read here as bundles whose
projection is absent, which is a state the store must render and does.

## `provisional/`: still hand written, no emitted counterpart

| File | Format | Why it is still provisional |
|---|---|---|
| `validation-invalid.json` | `gyld.validation.v1`, not ok | every stream of the bundle validates, so no rejected bundle exists; the shape follows `emit_decision_streams.validation_document` with a `GyldError.to_dict()` finding, plus the `location` block section 7.5 defines and this host does not write |

The hand-written `diff.json` that was here is gone: `diffs/` is real output now.

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
- A lens of a parameterised family carries `family` and `parameter`, and its
  `perspective` is the member's name (`neighbourhood-key_custody`).
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
- Every stream record carries a `lenses` manifest now, whose entries may be
  marked not emitted with a reason: the `neighbourhood` FAMILY is such an
  entry, because it is parameterised and a stream emits the members it was
  asked for. The store's directory-listing fallback is still there for a host
  that writes no manifest, and the browser test exercises it against a record
  with the key taken off.
- A stream record may carry `follows` beside `parent` (the stream whose module
  the overlay imports, which is not the same as the stream it came from) and,
  on a record a REBUILD wrote, `rebuilt_from` with the host's own
  `parent_moved` answer. This run carries neither: a fresh build does not.
- `streams.json` carries `lineages` when the directory holds more than one.
- `kind` is an open string: the architecture stream is `declaration`, which is
  neither of the two kinds section 4.4 names.
- A `gyld.stream-diff.v1` document carries five sections section 7.6 does not
  name: `selections`, `questions`, `rulings` (added, removed, retired and
  restored), `occurred`, and `lenses` keyed by perspective with the node slots
  and the edges each picture gained and lost. Each is read when present and
  left absent otherwise. An assertion's `relation` there is a qualified slot
  (`glade_decision_concepts:Requires`), not a bare label.
