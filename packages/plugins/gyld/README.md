# @grythjs/plugin-gyld

Gyld windows for the gryth desktop. Gyld emits a decision graph as a bundle of
JSON files: a census of streams, a record and a projection per stream, a
decide-now list, a validation report, and one lens file per perspective with
the picture already laid out by Graphviz. This plugin reads that bundle and
renders it. It never derives a Gyld fact, never repairs a file and never
substitutes a value for a missing one, so a file that is not there shows as
absent and a file that does not read shows the contract violation that stopped
it.

## The windows

`gyld.browser` is the one that draws. It carries a stream switcher, a
perspective picker, a search box over emitted labels and qualified slots, one
dim toggle per value each drawn dimension carries, and the emitted picture
itself with pan, zoom, fit and selection. The picker reads the stream record's
own lens manifest: a perspective the host declined to emit is shown disabled
with the host's reason, and a member of a parameterised family is labelled with
the family and the parameter that picked it, so `neighbourhood-key_custody`
reads as the neighbourhood of question `...GladeDecisions.key_custody` while
the `neighbourhood` family itself is the disabled entry beside it. Under the picture it states what the
lens omitted and, in the provenance footer, which lineage, revision, snapshot
digest, relations and layout engine the file was built from. It writes four
links: a detail window wired to it, a decide-now window wired to it, a decide
window wired to it, and a neighbourhood window on the focused record. With no bundle root on the desk it
shows the set picker instead of a picture, because the plugin will not invent a
place to read Gyld output from.

Neighbourhood opens emitted geometry where there is any. The stream's own lens
manifest is what decides: an entry of the `neighbourhood` family whose
`parameter.question` is the focused record's qualified slot is the member Gyld
emitted for that question, and the new window opens on it, pinned. A question
the stream emitted no member for opens a BROWSER PREVIEW instead: the window
goes to the `decisions` lens those members are restricted out of and names the
question, and `GyldPreviewLayoutTap` lays the neighbourhood of it out here. The
picker then shows that entry as `neighbourhood of question <slot> preview
(browser layout, unpinned)`, the provenance footer reads `@viz-js/viz 3.30.0
graphviz 16.0.0 · PREVIEW, unpinned layout`, and the omission strip says the
picture omits the pinned layout. Choosing any other perspective drops the
preview, and choosing an emitted member replaces it with pinned geometry. A
stream that emitted no `decisions` lens either gets neither: the window opens on
the same perspective with the focus set and the emitted picture dims to it.

A preview is a LAYOUT of emitted records and never a fact. Every node, edge,
group, label, shape, fill, font size and justification in it is copied from the
emitted `decisions` lens of that stream; the legend, snapshot, relations and
omissions are that lens's own; the closure is the one the Gyld host walks
(`emit_decision_streams.neighbourhood_closure`: the question, what it requires,
what requires it, what its alternatives imply, and the gates those wait on),
read off the drawn edges rather than off a snapshot this package does not have.
The DOT it composes is `lens_geometry.plan_dot`, and for the one question the
committed bundle also emitted a member for it is byte identical to the file the
host wrote, which is what a test asserts. What the browser adds is positions,
and only positions.

`gyld.detail` shows one record: its kind, definition, description, record id,
the place it was declared, its declared and effective status, its tier, whether
it is answerable now, the lean recorded for it, any ruling, the relations the
record itself carries and its definition closure. Opened from a browser through
the Details button it is wired to that browser and follows its selection live,
with no parameter copied. Opened from the launcher with a stream and a record
in the link it stands alone on that record, with a `follow focus` switch that
puts it on the record last focused in any gyld window instead, on whichever
stream that was. Its Decide button opens the decide
window on this record, wired to the browser this window follows when it follows
one and standalone on `{ stream, question }` when it does not; a record the
stream lists no decide-now row for is not a question to answer, so the button
is refused with that as its reason.

`gyld.decidenow` lists the stream's emitted decide-now rows grouped by what the
host said about them: answerable now, blocked by an open prerequisite, gated,
induced, and already settled. Each row carries the declared and effective
status, the tier, the preference recorded for it, the slots that block or gate
it, and a Decide button that opens the decide window on that row the same way
the detail window's does. Like the detail window it is wired when opened from a
browser and standalone when opened with a stream of its own.

`gyld.decide` answers a question or asks a new one. Opened from a browser
through the Decide button it is wired to that browser, so it answers on the
stream that browser is on and opens on the record it has focused; opened from
the launcher with a stream and a question in the link it stands alone. The answer form lists the
stream's emitted decide-now rows, draws the picked question's own offered
alternatives with the recorded lean marked, and takes a principal, a stamp,
sources and the ruling text. The ask form takes a class, a member, a docstring,
prerequisites picked from the emitted questions, gates picked from the triggers
the emitted rows name, and alternatives with at most one marked preferred,
which is what makes the question Lean rather than Open. Both forms check shape
only: something empty, or more than one alternative preferred. Both end in
Export, which writes the overlay module text in the shape section 4.2 writes
down, composed against the classes the projection declares. Under the header
the window prints the stream's `validation.json` by code, with the details Gyld
wrote. Nothing is submitted: the owner merges the text into the stream's
overlay module and rebuilds.

`gyld.diff` puts one perspective of two streams side by side. Each pane is a
lens view in its own child context, with its own camera, selection and dim set,
resolving its own stream; the perspective picker offers only what both streams
emitted, because a picture one side does not have is not two pictures to
compare. Picking or hovering a record in either pane puts its qualified slot in
the window's hand, and both panes light up the record with that slot: the slot
is the only thing that means the same record in two streams, because ids are
minted per stream, and a pane that does not draw it says so rather than
lighting up a neighbour. Under the pictures the window reads out the emitted
`diffs/<left>..<right>.json` whole: records, questions, effective statuses,
selections, rulings added, removed, retired and restored, triggers recorded as
occurred, assertions, what this perspective's picture gained and lost, and the
diff's own omissions. A pair the bundle has not compared reads as absent, with
the command that would write it, because this window never compares two
bundles itself. Each pane carries a Detail button that opens the record in hand
on that pane's own stream, so the same slot can be read as the left stream has
it beside the right. Those windows are standalone rather than wired: the
desktop holds one sink per source tab and tool, so a diff window cannot have
two detail windows following it live, and a window that stays on the record it
was opened on is what a side by side reading wants anyway.

`gyld.compare` reads one proposal of an emitted evaluator run. It takes the URL
a run directory is served from, reads that run's own `run.json`, and lists the
proposals it names. For the proposal picked it shows the frame both sides were
evaluated under with its context and its pinned obligations, every hard gate
with the baseline status beside the candidate status, every obligation with
whether it was retained and how it was satisfied on each side, the costs with
the state of each record and the conditional subtotals the evaluator was
willing to add up (an unknown cost is never in one, and a side with nothing
addable says so rather than showing a zero), the futures with their own gates,
their own subtotals and the relaxation note that says what each would give up,
the evidence with its applicability and the provenance recorded for it, the
structural impact of applying the proposal, the summary rows, and the
evaluator's `winner` and `architecture_superiority` as the literal `null` they
are with the reason it gave. The window never ranks proposals and never adds a
cost up. Above all that it draws the run's own baseline and candidate lens
files side by side, each in its own context with its own pan, zoom and dim set,
with what the run says each picture is and what both leave out. At the bottom
it frames the inspector report: this run emitted none, so the frame is the
report of the sibling run the index names in `reports.run`, with that name and
the host's note beside it and the URL it resolved printed out.

`gyld.streams` is the stream manager. It draws the set's streams as the tree
their `parent` fields make, each row with its kind, lineage, revision, snapshot
digest, the digest it was built against, its chain, its overlay module and what
its own `validation.json` says, read through a child context per row. A stream
whose pinned parent digest is not the digest its parent carries now is marked
`parent moved since build`, which is the one comparison the specification
defines across two records; a record a rebuild wrote answers that itself, in
`rebuilt_from`, and then the record's answer is what the row shows and says so.
The rebuild that would fix it is Gyld's, not this window's. Clicking a row shows that stream in the browser this window is wired
to, or opens one when it is standalone. Under the tree, a form composes a fork
or a link from a kind, a parent and a name, and the Export button writes the
exact command line that makes it. Nothing is submitted in this stage: the owner
runs the command into a new output directory and the watch loop picks the
bundle up.

## Dependencies

One runtime dependency, added for the browser-side preview above and for
nothing else.

| | |
|---|---|
| Package | `@viz-js/viz` |
| Version | `3.30.0`, pinned exactly (no range) |
| Published | 2026-09-01, per the npm registry; added 2026-09-13, twelve days later |
| Licence | MIT (the wrapper and the build scripts) |
| Embedded | Graphviz 16.0.0, **EPL-1.0**, compiled to WebAssembly by Emscripten and carried UNMODIFIED. Its provenance attestation (`lib/provenance.json`) names the `graphviz-16.0.0.tar.gz` release it was built from. This is the EPL exception the owner ruled on 2026-09-13, recorded here as the ruling asks |
| Transitive footprint | none. Zero dependencies and zero peer dependencies; 13 files, 4.98 MB unpacked, of which `dist/viz.js` is 1.18 MB with the wasm inlined |
| Where it lands | `dist/assets/previewWorker-*.js`, its own chunk of 1.35 MB, loaded only when a window actually asks for a preview. The application chunk grew 10.6 kB (3.4 kB gzipped) for the preview modules themselves |

Graphviz stays a separately installed program on the Gyld side, which is where
every emitted lens is laid out. Nothing here replaces it: this build exists so a
reader can see a neighbourhood without a Gyld round trip, and what it produces
is always marked unpinned.

The `json0` shape is the same across the two Graphviz versions. The document
keys, the object keys and the edge keys of `dot -Tjson0` from the installed
14.1.4 and from the embedded 16.0.0 match one for one for the fields this
package reads, which settles the skew
`MultiDimensionalGraphViewing.md` section 7 left open. The POSITIONS differ: the
same DOT lays out to a bounding box of `0,0,1720,291.04` under 14.1.4 and
`0,0,1731.8,313.24` under 16.0.0, which is why a preview is never pinned.

## Running it

From the repository root:

```sh
pnpm install
pnpm dev
```

Vite prints the address it is serving on, normally `http://localhost:5173/`.
Open that, then click `+ Gyld browser` in the launcher down the left side. The
window opens on the set picker.

The dev server also serves an emitted Gyld bundle at `/gyld-bundle/`, so paste

```
http://localhost:5173/gyld-bundle
```

into the picker and press `Add static root`. `127.0.0.1` in place of
`localhost` works too: the Vite dev server answers loopback origins with the
CORS headers a cross origin fetch needs. A bundle served from somewhere else,
by `python3 -m http.server` for instance, has to send those headers itself or
be on the same origin as the page, or the browser refuses the read and the root
shows as one that will not load.

`+ Gyld compare` opens the comparison window instead. It reads an evaluator
run rather than a bundle, so paste

```
http://localhost:5173/gyld-evaluator/iroh-integration-v2
```

into its run field and press `Read run`, then choose a proposal. `carrier` is
the one whose candidate is the base again; `docs` is the one that moves two
allocations and relaxes four gates.

The status line under the buttons then says `ready` and the stream switcher
fills in. Choose `base`, then `decisions`, and the graph draws. Clicking a box
focuses that record, clicking empty canvas clears it, dragging anywhere pans,
the wheel zooms, and `Fit` puts the whole picture back in view. `Details` and
`Decide now` open the other two windows already wired to this one.

Focus a question and press `Neighbourhood`. `key_custody` is the one the
committed bundle emitted a member for, so that one opens pinned Gyld geometry;
any other question opens the browser preview, and the footer says which you are
looking at.

The FIRST preview in a freshly started dev server reloads the page once. Vite
discovers `@viz-js/viz` when the worker first imports it, optimizes it, and
reloads; the desk is not persisted, so add the root again and repeat. It happens
once per dependency-optimizer cache, never in a build, and never again in that
dev server.

The desk is not persisted yet, so a page reload comes back with no windows and
no bundle root. Add the root again after a reload.

## The glade node as a root

There is a third kind of root beside a served URL and a picked directory: the
glade node itself. `Add glade node` in the set picker adds it, and the bundle
then arrives on the value shares the `glade-gyld` supplier publishes onto after
each build (`glade-wz/glade-gyld/README.md`, "Results"):

| surface | key | what the root reads from it |
|---|---|---|
| `gyld.streams` | none | `streams.json`, the census |
| `gyld.stream` | stream id | that stream's `stream.json` |
| `gyld.decisions` | stream id | that stream's `decide-now.json` |
| `gyld.lens` | `<stream>/<perspective>` | a `{path, digest, bytes}` pointer |

A lens file is the large one, so it travels as a pointer and the file itself is
fetched over HTTP from grazel's static path, which is what the pointer's `path`
names. The pointer is never trusted: the bytes are counted and digested, and a
file whose sha256 is not the one the pointer promised is refused, so the window
shows a lens that did not read rather than a picture nobody vouched for. The
digest is taken with the platform's own `crypto.subtle`, which a page served
over plain http from something other than localhost does not have; that case is
a refusal too, with the reason.

Nothing is subscribed speculatively. The stream listing is the authority for
which streams exist, so it is also the authority for which keyed surfaces to
ask the node for; and each stream record's own `lenses` manifest names the
perspectives whose pointers are followed. A stream whose record carries NO
manifest therefore lists no perspectives on this root: over a static host the
store falls back to a directory autoindex, and a share has no directory to
list.

Two files of a bundle are **not** on any share, because the supplier does not
publish them: `projection.json` and `validation.json`, and neither is an
emitted `diffs/<left>..<right>.json`. On a glade root they read as absent,
which is true, and the windows show absence. They are real files of the build
the last answer named, on the static path, so the way to see them is to point a
static root at that build: grazel serves the bundle root at `/gyld/`, so a
build directory `builds/build-1789247615547` is at
`http://localhost:PORT/gyld/builds/build-1789247615547`. The decide window's
Submit does this for you (below).

The root reads as a loud error when there is no glade in the composition at
all, rather than as a bundle with nothing in it. `@grythjs/glade` is reached
from exactly one file of this package, `src/live.ts`, because that module
computes the per-tab principal from `location.search` and a `sessionStorage`
origin at import and owns the one session; every window, the store, the
contract readers and the whole test suite run with no DOM and no socket. For
the same reason `registerGyldLive()` is called by the APPLICATION
(`gryth-ui/src/plugins/index.ts`) rather than by this package's `index.ts`,
which is what the package's own registration test imports.

## The bundle the dev server serves

`/gyld-bundle/` is mounted over a directory of real Gyld output. Nothing is
copied into this repository: the files are about five megabytes and they belong
to the Gyld workspace. By default the mount points at
`../../gyld-wz/gyld/artifacts/decision-streams-v6` relative to this repository,
which is where the sibling gwz member emits them. Point it somewhere else with
an environment variable:

```sh
GYLD_BUNDLE_DIR=/path/to/some/other/bundle pnpm dev
```

The path may be absolute or relative to this repository. The mount serves files
and directory listings both, which matters: a stream whose record carries no
`lenses` manifest has no list of perspectives to read, so the store falls back
to parsing a plain directory autoindex, exactly as it would against
`python3 -m http.server` over the same directory. A request for a file that is
not there answers 404 rather than falling through to the application, so an
absent bundle file reads as absent instead of arriving as `index.html`.

## The evaluator runs the dev server serves

`/gyld-evaluator/` is a SECOND mount, over the directory that HOLDS the emitted
evaluator runs rather than over one run. By default it points at
`../../gyld-wz/gyld/artifacts`, and the same environment override applies:

```sh
GYLD_EVALUATOR_DIR=/path/to/some/other/artifacts pnpm dev
```

So `http://localhost:5173/gyld-evaluator/iroh-integration-v2/run.json` is the
index of the run, and each proposal is a directory beside it. The mount is over
the holding directory and not over the run because a run that skipped the
inspector report names the SIBLING run that holds it, in `reports.run`: the
`iroh-integration-v2` run's `reports.emitted` is false and its `reports.run` is
`artifacts/iroh-integration-v1`, whose `report.html` is byte identical for the
same evaluation inputs. A reader that could only reach one run directory could
not follow that.

Nothing is copied into this repository here either. The runs are about ten
megabytes each, mostly `report.html` and `workspace.sqlite`, and they belong to
the Gyld workspace.

The default names `decision-streams-v6` and not an earlier run for two
reasons. From the v5 run every lens node carries the point size and the
justification the host drew it with, and this package reads both rather than
guessing a font; an older bundle has no `fontsize` on its nodes, so its lens
files report the missing field instead of drawing. From the v6 run every
overlay module carries the `gyld-stream-record:` block Gyld discovers streams
by, which is the block the decide window's exported and submitted text has to
keep.

The committed bundle holds five streams over two lineages:

- `base`, lineage `glade-decision-graph` revision v1. Twenty four questions,
  four roots, six tiers, a projection, a decide-now list and a validation
  report that passes with no findings. Its record carries no `lenses` manifest,
  so its four perspectives (`branch`, `decisions`, `status` and `tiers`) come
  from the directory listing. The `decisions` lens draws twenty nine nodes,
  thirty two edges and two groups.
- `stream-a`, a link over `base`: it rules two of the base's questions, records
  one trigger as occurred and adds a question of its own. Its record carries a
  `parent`, the chain `base, stream-a` and the parent snapshot it was built
  against.
- `stream-b`, a link over `stream-a` that reopens one of A's answers and takes
  the other alternative. Its decide-now list carries four rulings, one of them
  marked not live.
- `fork-a`, a flattening fork of `stream-a`: its parent is stream A and its
  chain runs straight to the base, because a fork restates what still stands
  and follows the parent no further.
- `architecture`, lineage `glade-architecture-candidate-1` revision v3. Its
  record does carry a `lenses` manifest, listing nine emitted perspectives and
  one, `full`, that the host declined to emit with its reason. The picker shows
  that entry disabled with the reason attached rather than hiding it. This
  stream emits no decide-now list, which the windows render as absent.

Every record of the run carries a `lenses` manifest, and the decision streams
carry one member of the parameterised `neighbourhood` family beside the family
entry itself. The `family` and `parameter` fields are read from both the
manifest entry and the lens file; a parameter value that is not text is
refused, because there is no label in a value the picker would have to
stringify.

A smaller copy of the same output lives in `test/fixtures/bundle/` and is what
the tests read. See the README beside it for what was copied and what was not.

Every window watches: the store re-reads the census and every file it has
cached about every four seconds, with cache busting, and publishes only where
the bytes changed. Re-emitting the bundle therefore updates an open window
without a reload. `Reload` in the browser chrome drops the whole cache and
reads it all again.

## Known limits

Each tool declares a `role` in `tools.ts`, and the desktop ignores it. Window
placement comes from the desktop's own map from tool id to foundation, so every
gyld window lands on the `stage` fallback. The role is declared because the
contract asks for it and it is what a placement entry would say.

`gyld.detail` cannot be pinned to a record. A pinned detail window that stops
following its browser is in the specification and is not implemented, so a
wired detail window always follows.

`Gyld.Focus` is followed by one window: a standalone `gyld.detail` whose reader
turned its `follow focus` switch on shows the record last focused in any gyld
window, across streams, because the focus is a stream and a qualified slot. It
does that by rendering inside a child context whose destination is the focus,
so turning the switch off puts the window straight back on its own record. A
window wired to a browser ignores the switch and offers none: it already
follows that browser's selection. No other window follows the focus yet; the
browser chrome still only prints it.

`gyld.compare` addresses a run by URL, so a run in a picked directory is not
readable there: a directory handle has no URL, and the window resolves the run
and the sibling that holds the report by URL arithmetic. The dev server serves
the runs, and a static host does as well.

The one name `gyld.compare` composes rather than reads is `report.html` inside
the sibling run: the run that holds the reports predates `run.json` and so
names no file for it, and the layout specification section 7.8 writes down is
`<run>/<proposal>/report.html`. The window prints the URL it resolved beside
the frame. When that older run gains an index of its own, the file it names
there should be read instead.

A pick in a compare picture publishes a `Gyld.Focus` whose stream is empty,
because an evaluator lens is of a SNAPSHOT and carries no stream. A detail
window following the focus then has no bundle to read that record from and says
so. Nothing is invented: the empty stream is the truth about that picture.

The comparison record's `operation_history` is not read. It is the saved
operation list the applier replayed, it is most of the bytes of every
comparison that has one, and no part of the window shows it; the run's own lens
omissions name it too.

The diff window highlights a corresponding record with the same mechanism the
search box uses, which dims the rest of both pictures while a record is in
hand. That is a strong highlight for a hover, and `Clear` puts it back. A
quieter highlight would be a second mode in the scene builder, and it is not
one this step needed.

The decide window's principal is a per-tab field, not the glade principal stub.
`@grythjs/glade` computes that stub from `location.search` at import and owns
the glade runtime with it, so importing it here would put a DOM read and a
session client into a package that needs neither and would break a test suite
that runs without a DOM. Owner ruling O6 says a ruling carries the stage-one
principal as data until real principals land; a field the owner fills in is
that, and the exported text shows exactly what will be stamped.

The decide window composes an overlay module holding the ONE record the draft
adds. A stream's overlay normally holds several, so merging the text into the
stream's own module is the owner's, which the window says beside the box. The
two names the window spells itself are the ruling's class and its root member,
both composed from the question's own emitted class and member; every other
name in the text is emitted, and the vocabulary imports are the ones
specification section 4.2 writes down.

The stream manager's new-stream form takes a kind, a parent and a name. Section
6.3 also names a note; the exported command carries none, because the host's
`--note` is a flag on the run rather than an operand of the subcommand, and the
window will not guess how the two are spelled together.

The exported commands are `scripts/manage_decision_streams.py`'s four verbs as
that host documents them: `fork PARENT NEW`, `link PARENT NEW`, `rebuild
--bundle DIR --output NEW` and `diff LEFT RIGHT --bundle DIR`. The bundle and
output directories are placeholders, because they are the owner's to choose and
Gyld never overwrites one. Each string is asserted by a test, so a change to
one is a deliberate edit.

A browser preview is of the `decisions` lens and of nothing else. That is what
the Gyld host restricts every emitted member out of, so a preview of any other
picture would not be the same lens; a stream that emitted no `decisions` lens
therefore gets no preview, and the Neighbourhood button falls back to dimming.
The architecture lineage is in that position today.

A window shows at most one preview, the one it was asked for. The picker offers
that one rather than an entry per question, because a preview costs a layout on
the reader's machine and a list of twenty four of them would suggest otherwise.
Another question is another Neighbourhood press.

A preview's positions are not the emitted member's. Graphviz 14.1.4 on the Gyld
side and 16.0.0 in the browser lay the same DOT out slightly differently, so a
reader comparing a preview with an emitted member of the same question will see
the same records in slightly different places. The provenance footer names both
engines and marks the preview unpinned, which is the honest answer rather than a
layout constraint.

The preview worker is not started until a preview is asked for, and is
terminated when the layout tap has no destinations left. It is not restarted per
window: one worker serves the desk, and the wasm build inside it is paid for
once.

`pnpm build` prints a chunk size advisory: the single application chunk is over
Vite's 500 kB default warning threshold. It is an advisory about code splitting
for the whole application, not a fault in this package, and the build succeeds.
The preview worker is a SEPARATE chunk and is not part of that number.

`@viz-js/viz` does run under vitest, because node has WebAssembly, and one test
asserts that the recorded `json0` fixture is still what the pinned engine lays
the composed DOT out as. A WEB WORKER does not exist in that environment, so the
layout tap is driven through an injected renderer in the tests and the worker
path itself is verified in a browser.

A bundle path that returns 404 stays in the watch set and is re-requested on
every tick. Selecting a perspective a stream does not have, then moving on,
leaves one such request repeating every four seconds until the window closes.
It is wasted traffic against a local file server and nothing more.

## Working on it

Read `AGENTS.md` and `dev-docs/CodingRules.md` at the repository root first.
State lives in grips and taps; React local state is banned and the ban is
enforced by both the linter and a scan in `pnpm test`. The verification
commands are `pnpm test`, `pnpm lint` and `pnpm build`, and all three are
expected to pass before anything is committed.
