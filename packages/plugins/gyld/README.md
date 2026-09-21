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

The launcher names them plainly: `gyld.browser` is **Graph**, `gyld.streams`
is **Streams**, `gyld.detail` is **Details** and `gyld.decidenow` is
**Next up** (GyldUiSimplification.md 2.3, owner ruling U5 of 2026-09-16 — the
plugin's own labels, not a Gyld-only-target override). The decide, compare and
diff windows keep the names they had. The tool IDS are unchanged and are what
a stored layout, a wire and every link written inside this plugin resolve by,
so this README goes on calling each window by its id.

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
window wired to it, and a neighbourhood window on the focused record.

It also says WHERE TO LOOK, and lets a reader act there. The stream's emitted
`decide-now.json` is joined to the drawn boxes by qualified slot, so each box
learns its own row: an answerable one is drawn with the bright rect a search
match gets, an `Open` or `Lean` one carries a glyph inside the box the host
emitted (a filled dot and a half dot, so the status is a shape as well as a
hue), and the chrome carries `N answerable now` beside a `Next up only` switch
that DIMS the rest — never hides it, whatever `hide instead of dim` holds — and
adds its own line to the omission strip while it is on. Hovering a box shows a
card over it with that question's own text as the host drew it, its
alternatives with the recorded lean marked, the one emitted reason it cannot be
answered or the one emitted reason it can be, and `Answer`, `Ask a follow-up`
and `Details`, each of which moves
this window onto the question and opens the wired window on it — and, when
that window is already open, brings it forward: the shell focuses it, shows
its tab when it shares a docked area with others, and flashes it briefly so
the reader can see which window answered. `Answer` is
the only one withheld on a box this stream's decide-now list carries no row
for — a follow-up is a NEW question with this one ticked as a prerequisite,
which any drawn question can take — and that is exactly the rule the menu
below follows, so the two surfaces never disagree about one box. On a stream
whose overlay module already declares records the card reads
`Answer (needs its own stream)`, names the refusal, and offers a `Link` already
filled in (see "Submitting to the supplier"). A RIGHT-CLICK or a SHIFT-CLICK on
a box opens a small menu at it with the same acts plus `Ask about this`, which
opens the `Ask` window on that record (`gyld-wz/dev-docs/ui/GyldAskAgent.md`
sections 2, 3 and 6). One menu per
window: opening one over another box replaces it, a click, `Escape` or a pan
dismisses it, and the hover card is suppressed while it is up so two panels
never stack over one box. Giving shift-click to the menu narrows the ADDITIVE
selection modifier to meta or ctrl. None of it is computed: a stream
that emitted no decide-now list gets no glyph, no count and no filter, and is
told so. Beside
`Reload`, which re-reads what is there, it carries `Rebuild`, which asks the
supplier for a new build of it. With no bundle root on the desk it
shows the set picker instead of a picture, because the plugin will not invent a
place to read Gyld output from — but a desk in a composition WITH a glade node
lands on that node by itself and never sees the picker (below, "What an empty
desk lands on"). A window that has a root and has chosen no stream or
perspective opens on what the census puts first, so it draws rather than
waiting for two picks.

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
it is answerable now and the emitted reason for that either way round, the lean
recorded for it, any ruling, the relations the
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
it, the emitted reason an answerable row is answerable, and a Decide button
that opens the decide window on that row the same way
the detail window's does. Like the detail window it is wired when opened from a
browser and standalone when opened with a stream of its own.

`gyld.ask` (**Ask**) is the ask agent's window, in the `inspector` role
(GyldAskAgent.md section 6). Opened from a box's menu it is wired to that
browser and follows the record it is on; opened with `{ stream, perspective,
ref }` it stands alone. It shows the record's status line, a question box, and
the whole `gyld.ask-context.v1` ENVELOPE that would be sent — the stream, the
perspective, the snapshot the list was built from, the question as the host
drew it, its declared definition, the emitted status block, the alternatives
with the lean marked, the ruling the row names, the tags it cites, the
`Requires` adjacency read both ways, the gates, and a POINTER to the
neighbourhood lens rather than its geometry. Beside the envelope it lists
those source tags one per line: a RESOLVED one with the document, heading,
line range and the index's own passage, an UNRESOLVED one marked as such with
the index's own reason, because a record citing a tag this build resolves to
nothing is a fact the window says rather than hides. A build that emitted no
`sources.json` at all is said the same way. Every field is a read of an
emitted value joined by an emitted id, composed by one pure function
(`src/ask/envelope.ts`), so an absence is said — a stream with no decide-now
list, or a list with no row for the record, is stated in the status block
instead of filled in.

Beside the question box is an **Ask** button, and behind it the `explain`
verb. It is not `ask`: `ask` appends a new QUESTION to a stream's overlay
module and rebuilds, `explain` writes nothing at all — no overlay, no build,
no file — and the two are different names on the supplier's allow-list so an
audit trail can tell them apart. The press sends the envelope WHOLE, with the
question typed into it, attributed to the desk principal like every other
verb, and the supplier answers immediately with a run id. The reply streams
back on the `gyld.ask` log share, keyed by the CONVERSATION rather than by the
run: each turn keeps its own `run_id` on every record, so a conversation is
one mount and one fold however many turns it takes, and a window folds only
the records of its own conversation.

What the window draws is that fold and nothing else: one block per TURN, in
the order the supplier ran them, each with the `question` record the reader's
own turn was appended as, the prose as the model's `answer` chunks arrived —
joined in sequence order and otherwise verbatim — each `citation` as the
passage the supplier resolved, with its tag and the file and heading it came
from, and an UNRESOLVED one marked as such with the reason, because an answer
citing a tag this build resolves to nothing is a fact the window says rather
than hides; and the `end` record's own exit. A turn that has not ended yet
says it is still answering, and a turn a refusal closed is still a turn: its
question, its reason and its exit.

A **`note`** record is a sixth stream on that surface, and the window draws it
the way it draws any line it was given: something the CALL had to do
differently, said beside the answer it weakened. An estimated input budget
because the endpoint has no `count_tokens`, a `strict` or a `cache_control` the
endpoint rejected, a config file that did not decode — each is a line on the
turn, before the prose, never a silence
(`glade-wz/glade-gyld/README.md`, "The compatibility profile"). A consumer that
has never heard of the stream draws nothing for it, which is the rule this
surface already follows.

**`tool_call` and `tool_result`** are the seventh and eighth, and they are the
agent LOOP made visible (GyldAskAgent.md section 11.4). A turn may reach for
`read_source` or `gyld_query` in the supplier — never in the page — and each
call lands as two records: one before it runs, one after. The window folds them
into ordered STEPS, pairing a result with its call by the `tool_use_id` the two
share rather than by position, because one turn may call two tools at once, and
draws each as a collapsible card above the answer it was used to write — the
same place, and for the same reason, the citations already sit. Folded, a card
is the tool's name and one line of what it was asked; opened, it is the input
whole and the result the answer was built on, cut where the supplier cut it and
marked as cut where the record says so. A call whose result has not come back
is drawn as an open call and the in-flight line reads *using read_source*; one
the supplier refused is drawn as a refusal, with the supplier's own sentence.
Nothing is interpreted and nothing is repaired: a result whose call never
arrived is still a card, because dropping it would hide a record the supplier
sent (6.7, MDV-7).

**The conversation is one per window, and it is about a record.** The id is
minted by the gesture that opens the window (`conv-<tabId>-<slot>-<stamp>`)
and kept across every turn, so a follow-up is the same verb with the same id
and a new question rather than a second conversation. It is replaced in
exactly two cases: the window is retargeted onto ANOTHER RECORD — a window
wired to a browser follows whichever box the reader picks, and the window says
so before the next press — or the reader presses **Start over**. The
conversation therefore carries the record it is on beside its id
(`src/ask/conversation.ts`); nothing is parsed back out of the id. The next
question is typed UNDER the last reply, and an accepted turn empties the box,
because what was asked is on the log where the fold draws it; a refused one
leaves the text where it can be fixed.

**A `draft` record is an OFFER, and it is drawn as one.** It carries the model
id that made it (`drafted_by`), the alternative the model named verbatim, the
envelope's own qualified slot for it when the envelope offers it, the ruling
text and the tags it leaned on. The window resolves it AGAIN against the
envelope it holds now — a wired window can have been moved since the turn was
asked — and a draft that resolves to nothing is shown as unresolved with the
reason and cannot be taken. **Take this draft** hands the offer to the decide
window wired to the same browser, opening it if there is none: the hand-off
goes through the browser's own `Gyld.Tab.Draft.Taken`, because the browser is
the one context both windows resolve. An ask window wired to no browser offers
the button and refuses it with that as the reason.

**A refusal is data, and is drawn as data** — never a toast. The three that
come back before a run starts, each in the supplier's own words, are: no model
key configured, a build that emitted no `sources.json` (grounding was ruled in
from day one, so an ungrounded answer is refused rather than given), and an
envelope that did not decode or names a stream the build does not list. One
that stops a turn mid-stream — an input budget crossed, a transport that broke
— closes it with a line and a non-zero exit, and whatever prose had already
arrived is KEPT and said to be partial. The envelope itself stays in the
window once a reply exists, folded away rather than removed: what was sent is
as much a fact as what came back.

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
Export and Submit, side by side, over the SAME composed text: Export puts the
overlay module text in the box in the shape section 4.2 writes down, composed
against the classes the projection declares, and Submit puts that very text on
the wire as `answer` or `ask` with the window's own principal. The composed
module carries the stream's `gyld-stream-record:` block, because an overlay
that lost it would stop being that stream. Under the header the window prints
the stream's `validation.json` by code, with the details Gyld wrote, and under
the forms it prints what the supplier answered and the run's own output lines
as the log folds them.

A draft taken in the ask window fills FOUR fields of the answer form — the
question, the alternative, the ruling text, and a `drafted` mark naming the
model — and not one more. The principal, the stamp and the sources stay the
reader's: the tags the draft leaned on are OFFERED beside the sources field
for the reader to take, the shape checks still demand a principal and a stamp,
and every refusal the window had is the refusal it has. The mark is shown on
the form, it says what clears it, and it goes the moment the reader changes
the alternative or the ruling text; a submit that still carries it stamps the
ruling's own docstring with a line saying which model drafted it and which
principal accepted it, in the export box and on the wire alike, because there
is one composition. Each take is applied exactly ONCE, by a tap
(`src/decide/GyldTakenDraftTap.ts`), so nothing a reader typed afterwards is
ever reverted.

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
the command that would write it and a button that asks the supplier to write
it, because this window never compares two bundles itself. Each pane carries a Detail button that opens the record in hand
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
or a link from a kind, a parent and a name, with Export beside Submit over the
same operands: Export writes the exact command line that makes it, and Submit
asks the supplier to run it. A Rebuild button in the header re-captures the
latest bundle into a new build directory, which is spec section 6.4's explicit
rebuild for a stream whose parent moved or whose overlay text changed outside
the UI. What came back and what is still coming is under the form.

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
Open that, then click `+ Graph` in the launcher down the left side.
`pnpm dev` has no grazel behind it, so no glade node answers and the window
opens on the set picker, which says so.

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
`Next up` open the other two windows already wired to this one.

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

## What an empty desk lands on

A desk with no bundle root used to open on the set picker whatever else was
true, and a reader who had started the whole composition and opened the URL it
printed was shown a picker that said "this desk has no bundle root" while a
glade node was answering the whole time. So the desk LANDS.

`GyldLandingTap` (`src/landing/`) is registered once at the plugin root. It
watches `Gyld.Ops.Status` — this package's mirror of the glade connection — and
on the EDGE into `live`, with no root of any kind on the desk, it adds the
glade root the way `Add glade node` does, through the set atom's own handle. It
is a tap and not a React effect because the transition is state: the session
can come up before a window mounts, after it mounts, or not at all, and a tap
sees all three the same way. The edge is the whole rule, so a reader who
removes that root keeps it removed while the session stays up, and a desk that
already has a root of its own is left alone.

`Gyld.Landing` is what it publishes, and the set picker is a pure read of it.
Three states, and the picker says one of them:

| the glade session | what the picker says |
|---|---|
| `connecting` | `connecting to the glade node at ws://...`, and nothing to press: the desk lands on the node by itself when it answers, and a picker drawn here would be a picker drawn over that |
| `live`, desk emptied | the node is live and this desk has no root; `Add glade node` puts it back |
| `offline`, or no glade in the composition at all | `No glade node answered at ws://...`, then the command that starts the composition (`python3 gyld-ui.py start` from the gryth-ui root, which prints the URL), then the two file roots as the other way in |

The URL in those lines is `Gyld.Node`, mirrored from `Glade.Node`, which
`startGlade()` publishes as soon as grazel's `/bootstrap.json` has been asked
and BEFORE the socket is tried. So it is the node this page would have
attached to, which is exactly the thing to name beside "nothing answered". A
page whose bootstrap has not answered yet names none, and the copy says "the
node URL this page would use" rather than inventing one.

A composition with no glade at all registers no producer for `Gyld.Ops.Status`,
so it reads as the empty default, which is `ABSENT` and not `offline`: nothing
lands, the picker shows, and its two file roots are the whole of what that desk
can do. That is the case `pnpm dev:gyld` alone is in.

### What a window opens on

A window whose opening link named no stream, or no perspective, fills what it
did not carry from the census: the first stream `streams.json` lists, and for
the perspective `decisions` when that stream's own lens manifest emitted it and
the first entry of that manifest when it did not (the architecture lineage is
the second case). `GyldFirstPickTap`, one per browser window, seeded by
`browserTabTaps`; the pure rule is `src/browser/firstPick.ts` and what a window
chose for itself is `Gyld.Tab.Picked`.

Every choice is emitted data and every choice is a fill, never an overwrite: it
writes only into a destination atom that is EMPTY, which is how "this window
has no destination yet" is spelled. A reader's pick is never moved, and a
census that names nothing chooses nothing.

## The glade node as a root

There is a third kind of root beside a served URL and a picked directory: the
glade node itself. `Add glade node` in the set picker adds it — and the landing
above adds it for an empty desk — and the bundle then arrives on the value
shares the `glade-gyld` supplier publishes onto after each build
(`glade-wz/glade-gyld/README.md`, "Results"):

| surface | key | what the root reads from it |
|---|---|---|
| `gyld.streams` | none | `streams.json`, the census |
| `gyld.stream` | stream id | that stream's `stream.json` |
| `gyld.decisions` | stream id | that stream's `decide-now.json` |
| `gyld.lens` | `<stream>/<perspective>` | a `{path, digest, bytes}` pointer |
| `gyld.file` | `<stream>/<file>` | the same pointer, for `projection.json` and `validation.json` |

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

`projection.json` (the records every record window reads) and `validation.json`
travel on `gyld.file` as the same kind of pointer, through the same fetch and
the same digest check. A glade root therefore reads records like any other
root; before they were published it could read none at all, and the only way in
was to point a static root at the build directory by hand and re-point it after
every build.

What is still on no share is an emitted `diffs/<left>..<right>.json`. On a
glade root it reads as absent, which is true, and the windows show absence. It
is a real file of the build the last answer named, on the static path, so the
way to see it is to point a static root at that build: grazel serves the bundle
root at `/gyld/`, so a build directory `builds/build-1789247615547` is at
`http://localhost:PORT/gyld/builds/build-1789247615547`. The supplier panel
offers that root as one press when an answer names a build (below).

### A root that is there and empty

The supplier's bundle root is app-owned and starts empty: `glade-gyld`
publishes onto those five shares AFTER a build, so a composition that has never
built anything answers every read with "nothing has landed". That used to
render as `glade node: error (nothing has landed on gyld.streams for
streams.json)`, which is a lie about a state nothing went wrong in — the node
answered, the mounts are there, and the share is simply empty.

It is its own status now. `ShareStore` throws `NothingPublished`, the store tap
turns that into a root whose status is `waiting` and whose `error` is absent,
and the stream manager leads with what the wait is for: the supplier has
published no build yet; its first build may be running; otherwise press
Rebuild, which captures every stream the Gyld checkout declares into the first
build. When a run whose id begins with `boot` is in view — the supplier's own
first build, announced on the `gyld.output` log share — that run is NAMED
instead, and the Rebuild advice is withheld, because pressing it over a build
already going starts a second one and every build is minutes of Python. The
sentences are `src/store/waiting.ts` and the one-line status every window
prints per root is its `rootLine`.

The limit is which boot run a desk can see: `Gyld.Ops.RunId` is the run this
desk's own output mount is on, so a `boot` run is named once this desk is
following it. A supplier that publishes its boot run where the desk reads it
without having asked is a supplier-side change and is not this package's to
make.

The root reads as a loud error when there is no glade in the composition at
all, rather than as a bundle with nothing in it. `@grythjs/glade` is reached
from exactly one file of this package, `src/live.ts`, because that module
computes the per-tab principal from `location.search` and a `sessionStorage`
origin at import and owns the one session; every window, the store, the
contract readers and the whole test suite run with no DOM and no socket. For
the same reason `registerGyldLive()` is called by the APPLICATION
(`gryth-ui/src/plugins/index.ts`) rather than by this package's `index.ts`,
which is what the package's own registration test imports.

## Submitting to the supplier

Every window that composed something to run now has a Submit beside its
Export, and the Export path is untouched: the two send the SAME text, because
one function composes it and the button either puts it in the box or puts it
on the wire.

| window | button | verb | operands |
|---|---|---|---|
| `gyld.decide`, answer | Submit answer | `answer` | the stream, and the composed overlay module |
| `gyld.decide`, ask | Submit question | `ask` | the stream, the composed module's head, and the records under it |
| `gyld.streams` | Submit | `fork` / `link` | the parent and the new stream's id, the two operands the exported command names |
| `gyld.streams` | List | `list` | none; it runs no host and builds nothing |
| `gyld.streams`, `gyld.browser` | Rebuild | `rebuild` | none |
| `gyld.diff` | Request this diff | `diff` | the pair the window is on, in its own order |
| `gyld.ask` | Ask | `explain` | the `gyld.ask-context.v1` envelope, whole, with the question typed into it |

`List` is there because an unbuilt bundle root and an absent supplier look
similar from the outside. A bundle root that has never been built publishes nothing on
the shares, so the census stays empty; `list` reads the latest build's
`streams.json` without running a host, and its answer says which of the two it
is. The first thing to press against a fresh bundle root is `Rebuild`, which
captures every stream the Gyld checkout declares into the first build.

A submit is refused before it is sent in four cases, each with the reason on
the button and beside it: `Gyld.Ops` UNRESOLVED, which means there is no glade
node in this desktop at all; a glade connection that is `offline`; a stream
whose PROJECTION is not here, because the classes an overlay names are declared
in it and no share carries it; and a stream whose own overlay module declares
something the submit would drop, because a submit writes that module whole and
this window composes one holding the draft's record alone.

That last one is the important one, and a live run is what found it. The
supplier's `answer` and `ask` write the overlay MODULE, and section 4.2's shape
is one module per stream; this window composes the ONE record the draft adds,
which is right for a text the owner merges by hand and wrong for a text sent
as the whole module. Submitted over a fork of `stream-a`, that composed module
took the stream from three rulings to one. So the window reads what the
stream's own module already declares - the emitted slots whose module is this
stream's that name a MEMBER of its root, `<module>:<Root>.<member>` - and
refuses the submit with the count and the module named, while Export stays
exactly as it was.

The root class itself is not one of those records. Its slot is
`<module>:<Root>`, with no member after the module prefix, and it is the one
memberless occurrence slot a module contributes; every generated overlay
declares it and the composed module declares it again, so counting it refused
every stream ever forked or linked FOR one ruling, which is the very flow the
refusal advises, and left no submittable stream at all. A second live run found
that (2026-09-14: a link's module owned one slot, its root class, and the
window said "already declares 1 record"). What the window does read off the
root is its NAME: a module whose declared root is not the root the stream
record registers is refused too, with both names given, because the submit
writes the registered one and that would drop the other. A stream forked or
linked for one ruling submits; a stream that already carries records is merged
by hand.
Anything else is sent, and what comes back is data, including a refusal: a
button that could be pressed and would fail honestly is worth more than one
disabled on a guess. The shape checks are unchanged and still local: a draft
that does not compose is not sent, and nothing half-composed ever leaves a
window.

Every build is minutes of Python, so every building verb is sent with
`stream_output: true` and followed on the `gyld.output` log share keyed by the
run the supplier answered with. The panel under each form prints what came
back — the verb, `ok` or refused, the exit code, the run id, who it was
attributed to, the error, the captured stdout and stderr — and then the run's
lines in the order the log folded them, ending with the `end` record's own exit
code. Nothing there is derived: no line is parsed for a meaning, no run is
called successful beyond the `ok` the supplier set, and a field the answer did
not carry is not shown.

There is one panel per window and one `Gyld.Ops.Result` per desk, because the
supplier is one and a run is one: a rebuild started from the stream manager is
the run the decide window is watching.

`explain` is the one verb that streams and builds nothing, so it is followed
differently: its reply is keyed by the conversation on `gyld.ask` rather than
by the run on `gyld.output`, its answer is held on the asking window's own
`Gyld.Tab.Ask.Answer` rather than on the desk-wide result — a refusal about
one conversation belongs beside the question that drew it — and nothing is
asked to be read again when it returns, because it wrote nothing.

### Where the result is read from

A successful build lands in a NEW directory; nothing is ever built over an
existing one. On a **glade root** the desk converges by itself: the supplier
publishes the new build's documents onto the four value shares and the store
reads the shares again as soon as an answer arrives, so every open window
re-resolves with no reload and no root change.

On a **static or picked root** there is nothing to converge: those roots are
the directory the reader chose. The panel therefore resolves the build the
answer named to grazel's static path and offers it as a root to add, in one
press, rather than adding one itself. That is deliberate. The supplier answers
with an absolute filesystem path; the only part of it this package knows the
shape of is the `builds/<stamp>` tail its README fixes, and whether
`/gyld/builds/<stamp>` is reachable at all depends on the page being served by
the same grazel that serves the bundle root. Under `pnpm dev` it is reachable
because the dev server proxies `/gyld/` to grazel (below); under a page served
from somewhere else it is not, and a root added on a guess would be a root that
does not load. An answer whose `output_dir` carries no `builds/` segment
resolves to no URL at all and the panel says so.

A STREAMING answer carries no `output_dir` at all, so today that offer never
appears for a verb that builds. `stream_output: true` is answered immediately
with `{ok, run_id, done: false}` and the build directory is only on a
SYNCHRONOUS answer, which every building verb avoids because a build is minutes
of Python; the `end` record on the log carries the exit code and not the
directory either. The consequence is honest and stated rather than papered
over: on a static root, a submitted build converges nowhere until the reader
points a root at it themselves, and the panel resolves a build only when a
synchronous answer names one. Putting `output_dir` on the log's `end` record,
or publishing the build on a value share of its own, is a supplier-side change
and is not this package's to make.

### The one text, twice

`answer` takes the overlay module and writes it as the stream's own; `ask`
takes the module and a question fragment and writes the second under the first
(`glade-gyld/src/verbs.rs`, `overlay_text`, which joins them as
`overlay.trim_end() + "\n\n" + question.trim_end() + "\n"`). The ask form
composes ONE module, so it composes it as those two operands and the export box
holds their join by that same rule. The module a reader reads and the module
the supplier writes are therefore the same bytes, not two texts that look
alike, and a test pins the join against the whole composed module.

### The stream registration block

Gyld discovers streams from the overlays that declare them: a line that is
exactly `gyld-stream-record:` at the end of a module docstring, followed by one
JSON object of exactly `id`, `kind`, `parent`, `follows`, `imports`,
`revision`, `root` and `note` (`gyld/examples/README.md`, "Which streams exist,
and how a host knows"). The supplier passes an overlay's text through
unchanged, so a module this window submits without the block would stop being
that stream. Every exported and submitted overlay therefore carries it, with
every field read off the emitted stream record.

Two of the eight are not fields of `stream.json`. `follows` is the stream whose
module the overlay imports, and `imports` is that module: a link follows its
parent, and a fork restates what still stands over the base and follows the
base, keeping its parent as provenance only. The record emits a `follows` field
when the host writes one, and today it does not, so the emitted `chain` answers
instead — the host builds that chain by walking `follows`
(`capture_decision_stream.chain`), which makes the entry before this stream in
its own chain the stream it follows. That is also what the composed module
imports and what its root subclasses, which is what `STREAM_REGISTRATION_MISMATCH`
checks.

The five codes that reader raises — `STREAM_REGISTRATION_INVALID`,
`STREAM_REGISTRATION_MISMATCH`, `STREAM_ID_COLLISION`, `STREAM_PARENT_UNKNOWN`
and `STREAM_CHAIN_CYCLE` — travel into `validation.json` verbatim the way a
rejected capture does, and render like every other finding. This package holds
no list of codes, so a code it has never heard of renders as itself with the
details Gyld wrote.

## Running the write path

The short way is `gyld-ui.py` at the root of this repository:

```sh
python3 gyld-ui.py start          # -> URL: http://localhost:5173/
python3 gyld-ui.py status         # every check, then working / not working
python3 gyld-ui.py stop --purge
```

That is everything below, done and checked: grazel with this leg switched on,
a wait for the supplier to publish the build it lays the root and makes itself, `pnpm dev:gyld` in front with
both proxied paths pointed at THAT grazel, and the URL as the last line. It is
idempotent, it takes `--port` for a second instance with its own ports and its
own data, and `--mode built` serves `dist-gyld` from grazel with no dev server
at all. `gryth-ui/README.md` has the option surface;
`gryth-wz/dev-docs/GrythGyldDemoRunbook.md` walks the same composition by hand.

The rest of this section is what the script does, for when you want to drive a
piece of it yourself.

The supplier is a composed child of grazel and the leg is default off
(`glade-wz/grazel/README.md`, "Composed suppliers"). From the grazel checkout:

```sh
grazel --mode local --data /tmp/gyld-data \
  --gyld-supplier-bin ../glade-gyld/target/debug/glade-gyld \
  --gyld-root /path/to/gyld-wz/gyld
```

That spawns `glade-node` on `ws://127.0.0.1:9099`, loads `apps/gyld-app.glade`
beside `apps/grazel-app.glade`, spawns `glade-gyld` against the read-only Gyld
checkout with the app-owned bundle root `<data>/files/gyld`, and serves that
bundle root at `/gyld/` on the HTTP port. `--gyld-root` is READ ONLY: the
supplier seeds its own overlays tree from the checkout's `examples/` and never
writes a byte back into it.

Then `pnpm dev:gyld` in this repository. That is the GYLD-ONLY target
(`entries/gyld`, `vite.gyld.config.ts`): the same desktop with this plugin as
its whole plugin list, so the launcher offers the Gyld windows and nothing
unrelated to them. `pnpm dev` still runs the full desktop and works exactly the
same way for this path; the two dev servers differ only in the plugin list.

Either way the dev server proxies TWO of grazel's paths onto its own origin, at
`GRAZEL_URL` (default `http://127.0.0.1:8080`). `/gyld/` is what makes a lens
pointer resolve and the pictures draw; without it a glade root lists streams and
draws nothing, because a lens file is fetched over HTTP and only grazel serves
it. `/bootstrap.json` is what tells the page which node to attach to, so a
composition on other ports is followed rather than guessed — `gyld-ui.py start
--port 5180` proves it, its page opening `ws://127.0.0.1:9106` and not the
default. With no grazel behind the proxy the fetch does not answer and
`@grythjs/glade` falls back to `ws://127.0.0.1:9099` exactly as it always did.
The status line in the browser chrome says `live` once the socket is up, and
the desk puts the glade node on itself at that moment (above, "What an empty
desk lands on"), so the census arrives on `gyld.streams` with nothing pressed.
`Add glade node` is still there for a desk whose root was removed.

Serving the built application from grazel itself needs no proxy at all, because
then the page and the bundle root are one origin:

```sh
pnpm build:gyld                  # -> dist-gyld/, root-absolute asset URLs
grazel ... --ui /path/to/gryth-ui/dist-gyld
```

and the desk is then at `http://127.0.0.1:8080/`. `pnpm build` and `--ui dist`
do the same for the full desktop.

## The bundle the dev server serves

`/gyld-bundle/` is mounted over a directory of real Gyld output. Nothing is
copied into this repository: the files are about five megabytes and they belong
to the Gyld workspace. By default the mount points at
`../../gyld-wz/gyld/artifacts/decision-streams-v11` relative to this repository,
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

The default names `decision-streams-v11` because that is the newest published
run; it has moved forward with each one, as it did for v7, v8, v9 and v10. That
run exists for two reasons: it is the first built from revision 4 of the decision
declaration, whose `ucan` box no longer argues from JWT because UCAN 1.0 encodes
its proofs as DAG-CBOR in its own envelope, and it is the first emitted under the
rule that a chosen alternative OPENS the questions it implies. The second is the
one a reader of this desk sees: under an older host a branch-induced question was
never answerable, so a notebook that answered `scope_model` still showed
`metadata_exposure` as a question nobody could answer, and from v11 on a rebuilt
notebook emits it as answerable with the choice that opened it named in its
`answerable_because`. Three of this package's own needs put a FLOOR under the
default as well, and each still holds of v11. From the v5 run every lens node
carries the point size and the
justification the host drew it with, and this package reads both rather than
guessing a font; an older bundle has no `fontsize` on its nodes, so its lens
files report the missing field instead of drawing. From the v6 run every
overlay module carries the `gyld-stream-record:` block Gyld discovers streams
by, which is the block the decide window's exported and submitted text has to
keep. And from the v7 run on every run emits `sources.json`, the SOURCE INDEX
the ask window resolves a record's citations against
(`gyld-wz/dev-docs/ui/GyldAskAgent.md` section 5). Pointed at an older run the
window renders the index's absence, which is correct and is not what this
default is for.

The committed bundle holds five streams over two lineages:

- `base`, lineage `glade-decision-graph` revision v4. Twenty four questions,
  four roots, six tiers, a projection, a decide-now list and a validation
  report that passes with no findings. Its four perspectives are `branch`,
  `decisions`, `status` and `tiers`; the `decisions` lens draws twenty nine
  nodes, thirty two edges and two groups. Four of those questions are in tier
  `branch-induced`, which is what a stream that has chosen nothing emits: this
  declaration records no ruling, so no branch of it is open.
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

The landing is on the EDGE into a ready session, so a desk whose glade session
drops and comes back with no root on it lands again. That is the same rule read
twice rather than a second one, and the case it makes is the honest one: the
reader emptied the desk, the composition restarted, and the desk comes back on
the node the page is attached to. A root removed while the session stays up is
never put back.

The reload story is unchanged and is what makes the landing worth having: the
desk is not persisted, so every reload starts with no root and lands again.

`Gyld.Tab.Picked` records what a window chose for itself and nothing reads it
but a test. It exists because the tap that fills the destination has to publish
something, and what it publishes is the act rather than a second copy of the
destination — the destination is still `Gyld.Dest.Stream` and
`Gyld.Dest.Perspective`, which is what the whole graph resolves from.

A window that opens itself on a stream and then has its stream changed by the
reader keeps the perspective it was on, exactly as it always did. The opening
pick fills an EMPTY value and nothing else, so a perspective the new stream
never emitted reads as absent with the stream's own list beside it, which is
the answer the window has always given.

Each tool declares a `role` in `tools.ts`, and that is what places its window
on a locked desk: `gyld.streams` is the `explorer` (the stream tree is the
selector), `gyld.browser`, `gyld.compare` and `gyld.diff` take the `stage`,
`gyld.decidenow` the `pulse` under it, and `gyld.detail` and `gyld.decide` the
`inspector`. The desktop resolves a window's home as designation, then role,
then fallback, so the Gyld pane preset (`GYLD` in the desktop's
`foundations.ts`, which the Gyld target locks at boot) names no gyld tool at
all — it carries areas of those names and the roles do the rest. On a preset
without them, a gyld window still lands on the fallback.

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

The submit path stamps the GLADE principal, and the decide window's own
principal field is the one that goes into the ruling text. Those are two
different things and both are as the owner ruled. `Gyld.Ops` carries the
per-tab glade principal on every envelope, which is what attributes the RUN and
what comes back as `attributed_to`; the ruling's `principal =` line is the
field the reader filled in, which is what the overlay records. A desk where the
two differ submits a ruling stamped with one and attributed to the other, and
both are shown.

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
6.3 also names a note; neither the exported command nor the submitted request
carries one, because the host's `--note` is a flag on the run rather than an
operand of the subcommand, the window will not guess how the two are spelled
together, and the submitted operands are exactly the ones the exported command
names. The supplier's `fork` and `link` do take a `note`, so a note field in
this form is one field and one line away the day the exported command can spell
it too.

A new stream's overlay module is the SUPPLIER's, not this window's.
`manage_decision_streams.py fork` and `link` generate it, registration block
and all, so the stream manager submits two operands rather than text. The
decide window is the one that writes overlay text, and it only ever rewrites
the module of a stream that already exists.

A submit never retargets a static root by itself; the panel offers the build as
a root and the reader takes it. The reasons are in "Where the result is read
from" above: the URL depends on the page's origin, and a root added on a guess
is a root that does not load.

One answer per stream, then. The refusal above is not a workaround for a
missing merge: with the supplier writing whole modules and this window
composing single records, a stream carries one submitted ruling and the next
one wants its own fork or link, which is the flow section 6.1 describes anyway.
Reading a stream's current overlay TEXT would be the other answer, and nothing
emits it: `stream.json` carries the module, the root and a fingerprint of the
text, never the text.

`occurred` is not offered anywhere. Spec section 4.7 names it, the supplier
refuses it, and no Gyld host verb exists for it yet, so recording a trigger as
occurred is still an overlay the owner writes by hand. The same goes for `lens`
and `inspect`.

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
