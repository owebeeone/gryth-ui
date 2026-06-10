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

## Setup

Requires sibling checkouts `../grip-core` and `../grip-react` with `dist/`
built (`npm run build` in each). In `gryth-dev` these are symlinks into
`glial-dev`.

```sh
npm install
npm test        # headless seam tests (vitest)
npm run dev     # vite dev server
npm run build   # tsc + vite build
```
