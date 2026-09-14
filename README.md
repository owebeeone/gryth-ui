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
pnpm dev         # vite dev server
pnpm build       # tsc + vite build
```

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
