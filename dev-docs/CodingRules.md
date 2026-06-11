# gryth-ui coding rules

Repository-specific coding rules for `gryth-ui`. Adopted from grip-lab's
`GLCodingRules.md`. See also `AGENTS.md`.

## State management: no React local state — use exclusively grip

- **Do not use `useState` or `useEffect`** (nor `useRef`/`useReducer`/
  `useMemo`/`useCallback`/`useLayoutEffect`) for application or UI state. All
  state lives in **grips** (atom taps) so it is shared, inspectable,
  reproducible, and — in gryth — persistable and delegable as environ state.
- Patterns to use instead:
  - **UI state** (selections, toggles, widths, open/collapsed, form fields,
    drag-in-progress): a grip + atom tap. Read with `useGrip`, write with the
    tap handle's `set`/`update`.
  - **DOM side effects** (scroll-into-view): a **ref callback**
    (`ref={el => el?.scrollIntoView(...)}`), keyed so it re-mounts when the
    target changes — never `useEffect`.
  - **Drag with global movement** (panel/window resize, window drag): render a
    full-window `.drag-overlay` that captures `onMouseMove`/`onMouseUp` as
    React events while a `*Dragging` grip is set — never
    `window.addEventListener` in an effect.
  - **Animation / timers**: a **tap** that owns the loop and publishes to a
    grip (cf. grip-lab's `graphEngine.ts` + `GraphSimTap`, grip-react's
    `TickTap`). The component stays pure.
  - **Gesture handlers read via tap handles, rendering reads via `useGrip`.**
    Event handlers that participate in a multi-event gesture (drag move/end)
    MUST read current state with the tap handle's `get()`, not the render
    closure — drip notifications are queued, so a mouse can move and release
    within one notification cycle and a closure-read drops the gesture's
    final state. (Found the hard way: drag-to-desktop-icon failed on real
    mice while passing slow synthetic tests.)
- This is enforced, for **all seven hooks**: `npm run lint` bans calls and
  imports, and `npm test` runs `scripts/no-react-state.test.mjs`, which scans
  `src/` and fails on any unapproved use outside comments/strings.

### Approved exceptions

A use site may be explicitly approved. Requirements:

1. A registry entry in `scripts/no-react-state.test.mjs` (`APPROVALS`):
   `{ id, hook, file, reason }`. **Do not add entries without explicit
   project-owner approval**; record the approval in the commit that adds it.
2. A marker on the **same line** as the use (import lines included):
   `/* Approved: useMemo: Approval ID 333 */` — hook, ID, and file must all
   match the registry entry; anything else fails as a forged marker.
3. An `// eslint-disable-next-line no-restricted-syntax` for the lint ban.

When the approved use is removed, remove the registry entry too — a stale
entry fails the test.

## Gryth addition: declare scope with the grip

- Every class-1 (atom) grip is declared with its scope in mind —
  **doc** (team-shared), **environ** (user's desktop, persisted/roamed), or
  **instance** (this client only, never replicated) — per
  `gryth-dev/dev-docs/GrythVision.md`. Until the declaration schema carries a
  scope tag, record the intended scope in a comment block grouping the grips
  (see `src/grips.ts`).

## General

- Prefer modeling new reactive state as grips + taps (see `AGENTS.md`).
- Consumers never know the producer: mock → real is a provider swap, not a
  consumer rewrite.
- Keep the dependency footprint small and honor the dependency-age policy in
  `AGENTS.md`.
