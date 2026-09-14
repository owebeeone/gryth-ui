# AGENTS

## Scope

This file defines repository-specific working instructions for `gryth-ui`,
the React + TypeScript front-end of gryth, built on `@owebeeone/grip-react`.
Adopted from grip-lab's AGENTS.md.

## Agent requests: review vs edit

- When the user asks to review, verify, analyze, assess, report, or check,
  respond with read-only analysis only.
- Do not change files or implement fixes unless the user explicitly asks for
  edits, fixes, implementation, or an update.
- If analysis surfaces a problem, describe it and wait for direction rather
  than patching the tree unprompted.

## Start here

- Read `dev-docs/CodingRules.md` — state is modeled **exclusively with grip**
  (grips, taps, contexts); React local state is banned and enforced by lint
  and tests.
- Design context lives in `../dev-docs/` (gryth-dev): `GrythVision.md` and
  `GripLabGripAndTapInventory.md`.
- This is a Vite + React 19 + TypeScript app.

## Project layout

- `src/runtime.ts` — the shared `GripRegistry` and `Grok` runtime instances.
- `src/grips.ts` — grip (typed value handle) definitions, grouped by scope
  (doc / environ / instance).
- `src/taps.ts` — taps (data producers) and the `registerAllTaps()` helper.
- `src/boot.tsx` — `boot()`: registers taps, starts the glade session and
  mounts the app under `GripProvider`. Every target calls it.
- `src/bootstrap.tsx` — the FULL desktop target's entry: the whole plugin list
  (`src/plugins/`), then `boot()`.
- `entries/<target>/` — an additional entry point. A target is `index.html` +
  `main.tsx` + a `plugins.ts` that chooses the plugin list; it differs from the
  full desktop in nothing else. `entries/gyld/` is the Gyld-only desktop, built
  by `vite.gyld.config.ts` into `dist-gyld/`. See README.md, "Targets".
- `src/App.tsx` — the root React component.

## Design rules

- Do not introduce enums without explicit project-owner approval. Do not work
  around this with magic strings, magic integers, sentinel strings, or other
  passive tags when the concept has semantics. Semantic concepts should be
  represented by objects/classes that can own behavior, validation, and
  documentation.
- Model all reactive state as grips + taps. Consumers never know the
  producer; mock → real is a provider swap with no consumer rewrite.

## Dependency policy

- Do not add any npm package version that was published less than one week
  ago. The window right after publish is the highest-risk period for
  supply-chain malware; let versions age before adopting them.
- Before installing, check the candidate version's publish date and pin to a
  specific version that is at least a week old.
- Prefer mature, widely used packages with a stable release history, and keep
  the dependency footprint small. Be mindful of large transitive trees, not
  just the direct dependency.

## Roll-build method

- When the user asks for a phased rollout using the roll-build method, start
  from a clean git tree and tag that point before implementation begins.
- Use the requested start tag name when one is given. If none is given, ask
  or use a clearly scoped phase-start tag name.
- An unqualified `roll-build` means: run all phases for that plan in
  sequence, committing and tagging each completed phase, and continue into
  the next phase without stopping unless the guardrails below require a
  pause.
- Run the roll-build in the current owning checkout and current branch. Do
  not create git worktrees, sibling checkouts, or parallel rollout branches
  unless the user explicitly asks for them in that request.
- Do not split phases or adjacent roll-build requests into parallel branches.
  If one roll-build has already produced commits, the next roll-build starts
  on top of those commits after they are integrated into the current branch.
- If the current branch is not the intended integration branch, stop and ask
  before creating or switching branches. Do not invent a branch/worktree
  strategy from the tag prefix.
- Implement one phase at a time.
- After a phase is complete, only commit and tag it if:
  - the phase goal is actually met
  - focused verification passes
  - the remaining ambiguities are minor and non-blocking
- If there are no more phases, or if confidence drops because of material
  ambiguity or instability, stop and wait instead of forcing the next phase.
- If work starts cycling on the same persistent bug or bug family, stop,
  report the cycle clearly, and ask for direction.

## When to push back on roll-build

- Push back when the next phase has too many unresolved ambiguities to
  produce a trustworthy checkpoint.
- Push back when the requested phase is too large or too coupled to complete
  safely as one checkpoint.
- Push back when implementation reveals facts that materially break the
  current design or plan assumptions.
- Push back when the resulting checkpoint would be misleadingly partial,
  unstable, or hard to recover from.

## Verification commands

- Dev server: `pnpm dev` (full desktop), `pnpm dev:gyld` (Gyld only)
- Whole Gyld composition: `python3 gyld-ui.py start` (below)
- Type-check + build: `pnpm build` → `dist/`, `pnpm build:gyld` → `dist-gyld/`
- Lint (includes the no-React-state ban): `pnpm lint`
- Tests (no-React-state scan + vitest): `pnpm test`
- `gyld-ui.py`'s own tests: `pnpm test:py` (stdlib `unittest`; NOT part of
  `pnpm test`), plus `uvx ruff@0.13.0 check` and `format --check` on
  `gyld-ui.py` and `scripts/gyld_ui_test.py`

A change to the shared render, to a Vite option or to the plugin lists must be
checked against BOTH targets — `pnpm build` and `pnpm build:gyld`.

## `gyld-ui.py` — the running composition

The Gyld write path is grazel + a glade node + the `glade-gyld` supplier + a
seeded bundle root + the desktop. Do not stand that up by hand: `gyld-ui.py` at
the repository root does it, and `../dev-docs/GrythGyldDemoRunbook.md` explains
what each piece is.

- Verbs: `start`, `stop`, `restart`, `status`. `start` and `restart` end by
  running `status`'s checks and printing the URL as their last line; `status`
  exits 0 when it works and 1 when it does not.
- `--port` is the port you open. grazel's `--http` and the node's `--node-port`
  derive from it (5173 → 8080/9099), so two instances never collide.
- Instances live in `~/.gyld-ui/instances/<port>/` and are kept across a stop:
  a ruling submitted from the UI is written into the bundle root there. Only
  `stop --purge` deletes one. Never point `--data` at `/tmp`.
- Python 3.10 compatible ON PURPOSE — it runs on the system `python3`. Only the
  Gyld hosts it invokes need 3.13 (`--python`). Stdlib only: no dependency may
  be added to it.
- It mirrors two things that live in other repositories: `ensure_stage` from
  `glade-gyld/src/bundle.rs`, and the stream discovery
  `manage_decision_streams.py rebuild` does. Both are marked in the source. If
  either moves, this script moves with it.
