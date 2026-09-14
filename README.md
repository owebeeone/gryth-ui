# gryth-ui

React UI for gryth — the productized successor to grip-lab's client.

Developed mock-first, in the style of `grip-react-demo`: grips declared in
`src/grips.ts`, producers in `src/taps.ts`, components as thin projections.
Doc-scope surfaces are mock-backed; the real gryth provider later binds the
same grips behind the seam with no consumer rewrite.

Grip model:

- **Session scope** (`Session.*`) — per-participant UI state. Tap handles are
  published as grips so an authorized collaborator or agent can drive the UI
  ("open the debugger").
- **Doc scope** (`Doc.*`) — shared collaboration state.

Coding rules: [dev-docs/CodingRules.md](dev-docs/CodingRules.md) — state is
modeled **exclusively with grip**; `useState`/`useEffect` are banned (lint +
test enforced). Working instructions: [AGENTS.md](AGENTS.md).

## Setup

Requires sibling checkouts `../grip-core` and `../grip-react` with `dist/`
built (`pnpm build` in each). In the `gryth-wz` workspace these are real
checkouts managed by gwz.

```sh
pnpm install
pnpm test        # headless seam tests (vitest)
pnpm test:py     # gyld-ui.py's own unit tests (stdlib unittest)
pnpm dev         # vite dev server
pnpm build       # tsc + vite build
```

`pnpm test` is unchanged by `test:py`: the two suites are separate runs, so a
checkout with no Python 3 still runs the whole TypeScript suite.

## Running the Gyld composition: `gyld-ui.py`

The Gyld write path needs more than a dev server — grazel with the `glade-gyld`
supplier behind it, a node, a bundle root with a build in it, and the desktop in
front. `./gyld-ui.py` stands all of that up, checks it, and prints the URL:

```sh
python3 gyld-ui.py start                    # -> http://localhost:5173/
python3 gyld-ui.py status                   # ok/FAIL per check, then working / not working
python3 gyld-ui.py start --port 5180        # a second instance, its own ports and data
python3 gyld-ui.py restart --port 5180
python3 gyld-ui.py stop [--purge]           # no --port: every instance
```

| verb | what it does |
|---|---|
| `start` | prerequisites, then grazel, then the bundle root and its first build, then the desktop, then the same checks `status` runs. Idempotent: an instance already running is reported, not restarted. |
| `status` | grazel's `/bootstrap.json`, the node's WS port, the supplier serving, the bundle root seeded and how many streams it lists, the page, and in dev mode the two proxied paths. Exit 0 when it works, 1 when it does not. `--json` for a machine. |
| `stop` | SIGTERM to grazel's process group (which takes the node and both suppliers) and to vite's, SIGKILL what is left, clear a lock the node did not, and confirm nothing of the instance survives. The data stays unless `--purge`. |
| `restart` | `stop`, then `start` with the options the instance recorded. |

`--mode dev` (the default) is `pnpm dev:gyld` in front of grazel, with `/gyld/`
and `/bootstrap.json` proxied back to it. `--mode built` is `dist-gyld` handed
to grazel — one origin, no proxy, and `--port` is then grazel's own HTTP port.

**Where an instance lives.** `~/.gyld-ui/instances/<port>/`, and NOT under
`/tmp`: a ruling submitted from the UI is written into the bundle root there, so
the directory has to survive a reboot. `--data` moves it; `stop --purge` deletes
it. Ports derive from the one port you open (5173 → 8080/9099, which is what the
runbook prints), so two instances never collide and each page attaches to its
own node.

The Gyld hosts need Python 3.13 (`--python`, default
`/opt/homebrew/bin/python3.13`); the script itself runs on the system `python3`.
The whole composition, and what each piece is, is in
`../dev-docs/GrythGyldDemoRunbook.md`.

## Targets

There are two entry points into this application, and they differ in one thing:
which plugins they import. Everything after the plugin list — the taps, the
glade session, the React root — is `src/boot.tsx`, which both call.

| target | entry | plugins | scripts |
|---|---|---|---|
| full desktop | `index.html` → `src/main.tsx` → `src/bootstrap.tsx` | `src/plugins/` — every plugin the composition root lists | `pnpm dev`, `pnpm build` → `dist/` |
| Gyld only | `entries/gyld/index.html` → `entries/gyld/main.tsx` | `entries/gyld/plugins.ts` — `@grythjs/plugin-gyld`, and nothing else | `pnpm dev:gyld`, `pnpm build:gyld` → `dist-gyld/` |

The Gyld-only target is a desk for the Gyld decision graph with nothing
unrelated on it. It needs no other plugin: the shell's own facets and its
appearance grips ship with `@grythjs/desktop`, so the two desktops differ in
their launcher and in nothing else. Its config, `vite.gyld.config.ts`, takes
every shared option from `grythShared()` in `vite.config.ts` rather than
copying it.

Adding a target means adding a directory under `entries/` and a config that
spreads `grythShared()`; `entries/` is already covered by the type-check, the
lint, the vitest include and the no-React-state scan.
