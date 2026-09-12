# @grythjs/plugin-gyld

Gyld windows for the gryth desktop. Gyld emits a decision graph as a bundle of
JSON files: a census of streams, a record and a projection per stream, a
decide-now list, a validation report, and one lens file per perspective with
the picture already laid out by Graphviz. This plugin reads that bundle and
renders it. It never derives a Gyld fact, never repairs a file and never
substitutes a value for a missing one, so a file that is not there shows as
absent and a file that does not read shows the contract violation that stopped
it.

## The three windows

`gyld.browser` is the one that draws. It carries a stream switcher, a
perspective picker, a search box over emitted labels and qualified slots, one
dim toggle per value each drawn dimension carries, and the emitted picture
itself with pan, zoom, fit and selection. Under the picture it states what the
lens omitted and, in the provenance footer, which lineage, revision, snapshot
digest, relations and layout engine the file was built from. It writes three
links: a detail window wired to it, a decide-now window wired to it, and a
neighbourhood window on the focused record. With no bundle root on the desk it
shows the set picker instead of a picture, because the plugin will not invent a
place to read Gyld output from.

`gyld.detail` shows one record: its kind, definition, description, record id,
the place it was declared, its declared and effective status, its tier, whether
it is answerable now, the lean recorded for it, any ruling, the relations the
record itself carries and its definition closure. Opened from a browser through
the Details button it is wired to that browser and follows its selection live,
with no parameter copied. Opened from the launcher with a stream and a record
in the link it stands alone on that record.

`gyld.decidenow` lists the stream's emitted decide-now rows grouped by what the
host said about them: answerable now, blocked by an open prerequisite, gated,
induced, and already settled. Each row carries the declared and effective
status, the tier, the preference recorded for it and the slots that block or
gate it. Like the detail window it is wired when opened from a browser and
standalone when opened with a stream of its own.

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

The status line under the buttons then says `ready` and the stream switcher
fills in. Choose `base`, then `decisions`, and the graph draws. Clicking a box
focuses that record, clicking empty canvas clears it, dragging anywhere pans,
the wheel zooms, and `Fit` puts the whole picture back in view. `Details` and
`Decide now` open the other two windows already wired to this one.

The desk is not persisted yet, so a page reload comes back with no windows and
no bundle root. Add the root again after a reload.

## The bundle the dev server serves

`/gyld-bundle/` is mounted over a directory of real Gyld output. Nothing is
copied into this repository: the files are about five megabytes and they belong
to the Gyld workspace. By default the mount points at
`../../gyld-wz/gyld/artifacts/decision-streams-v2` relative to this repository,
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

The committed bundle holds two streams over two lineages:

- `base`, lineage `glade-decision-graph` revision v1. Twenty four questions,
  four roots, six tiers, a projection, a decide-now list and a validation
  report that passes with no findings. Its record carries no `lenses` manifest,
  so its four perspectives (`branch`, `decisions`, `status` and `tiers`) come
  from the directory listing. The `decisions` lens draws twenty nine nodes,
  thirty two edges and two groups.
- `architecture`, lineage `glade-architecture-candidate-1` revision v3. Its
  record does carry a `lenses` manifest, listing nine emitted perspectives and
  one, `full`, that the host declined to emit with its reason. The picker shows
  that entry disabled with the reason attached rather than hiding it. This
  stream emits no decide-now list, which the windows render as absent.

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

`Gyld.Focus` is written but not followed. Picking a record publishes it as the
shared focus, and the browser chrome prints it, but no window changes what it
shows because another window's focus moved. The cross window correlation that
grip is there to carry is still only half wired.

There is no diff, compare, stream manager or ruling window. The specification
names `gyld.streams`, `gyld.decide`, `gyld.diff` and `gyld.compare`; none is
declared here, because none has a window that can render it yet.

`pnpm build` prints a chunk size advisory: the single application chunk is over
Vite's 500 kB default warning threshold. It is an advisory about code splitting
for the whole application, not a fault in this package, and the build succeeds.

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
