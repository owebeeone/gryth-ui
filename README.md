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
