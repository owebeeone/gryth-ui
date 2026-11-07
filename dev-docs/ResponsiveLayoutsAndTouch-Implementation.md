# Responsive layouts and touch — implementation record

7 November 2026. Implements the [reviewed proposal](ResponsiveLayoutsAndTouch.md), following the user's explicit “Proceed” instruction. This is a local implementation checkpoint, not a claim of complete mobile browser certification.

## Deliverables and boundary

Gryth owns responsive selection, profile persistence, tab groups and stable view mounting, move/split/merge commands, pointer capture and cancellation, and reusable two-pointer navigation. Chopstitch supplies its three layout definitions and binds gestures to artwork editing. Only Gryth and Chopstitch runtime code changed. GRIP, Reporter, Glial and other members remain reference-only; no packages, hosting or network configuration changed. Gryth remains on its integration branch.

The design review's scope rule was retained: concrete behavior needed by this workflow was implemented; unrelated dependency repairs and speculative platform work were not made prerequisites.

## Behavior

- Chopstitch declares single, dual and wide profiles at 0, 700 and 1100 usable container pixels, with 40 pixels of downward hysteresis. Minimum panes are 180 × 140 pixels. Short or undersized custom layouts temporarily collapse to tabs without overwriting the saved tree.
- Tabs have selected styling and keyboard navigation. A separate outline indicates the focused group. Overflow uses a native “More views” selector; the selected tab stays in the visible strip.
- Tool bodies remain in one flat keyed mount tree across profile changes. Tab contexts, source wires and input elements keep their identities. Hidden bodies are inert.
- Handle dragging previews left/right/above/below splits or centre merges. Menus call the same command. Moving the final tab out of a pane removes the vacated presentation pane. Splitters support pointer dragging and keyboard resizing with minimum dimensions.
- Profiles store split trees, tab assignments and selections under a versioned, local key per application entry and family; records are indexed by desktop and variant. Canonical desktop windows are not rewritten by resizing or profile moves. Closing a tab still closes its canonical record and reconciles all visited profiles.
- Existing custom canonical foundation topology seeds the wide profile; the untouched application default uses the new declared defaults. Malformed optional profiles fall back. Reset current restores the declared profile; Reset all clears responsive customisations as well as performing the existing canonical reset.
- Chopstitch's application panel commands explicitly reveal their responsive tab. Its old lock/unlock command is replaced by “Reset current panel layout” because this presentation always uses tab groups. Hosts without a responsive family retain the existing window renderer and compact/full chrome.
- The canvas has a Navigate tool for one-pointer pan. Two pointers pan/zoom in every mode. A second contact discards provisional editing before navigation and requires a fresh press before another edit. Canvas mutations are staged until release, so cancellation does not add an edit/Undo entry. Export toggles, polygon points and measurements are deferred until a completed tap.
- Capture loss, pointer cancellation, Escape, blur, desktop changes and coordinate changes cancel owned interactions. Browser scrolling remains available outside handles and the artwork surface.

The new modules are under `packages/desktop/src/responsive/` and `pointerInteraction.ts`. No generic window manager was copied into Chopstitch.

## Automated evidence

| Check | Result |
|---|---|
| Chopstitch full suite, including four new canvas pointer tests | 537 passed; 15 existing conditional tests skipped across eight suites |
| Gryth desktop suite through the already-installed host Vitest/Vite dependencies | 157 passed across 21 suites, including 15 new responsive/pointer tests |
| Chopstitch lint | Passed |
| New Gryth modules linted with Gryth rules and existing host ESLint dependencies | Passed |
| Gryth no-React-state scan | Passed |
| Chopstitch production build (TypeScript plus Vite, consuming Gryth source) | Passed; existing large-chunk warning remains |
| Gryth standalone `pnpm build` and `pnpm build:gyld` | Both stop at `tsc: command not found`, the existing dependency-installation limitation |
| Syntax-aware control-flow check of new/modified TypeScript | No changed unbraced bodies |

The Gryth mounted-host fixture uses different tool names and real GripInput/GRIP contexts. It keeps the same input node, incomplete `12.` draft, focus and caret through repeated profile changes and a manual split; canonical records remain byte-for-byte equal. Tests also cover role fallback, malformed profiles, closed/sticky/minimised tabs, reset, persistence encoding, shell drag/menu equivalence, minimum splitter widths, and cancelled edits. The canvas tests cover a single committed edit on release, second-pointer cancellation, fresh-press requirements, coordinate-change cancellation and deferred export toggles.

The skipped Chopstitch suites require live debug services or optional asset fixtures; no skips were introduced. Test logs from this pass are in `/tmp/chopstitch-responsive-review/`.

## Interactive evidence

Tests used a separate localhost origin on port 5182 with disposable sample data, leaving the user's original port 5181 data separate. The working browser was the in-app Chromium browser. These were ordinary pointer checks, **not touch-emulation or physical-device results**.

| Actual CSS viewport | Observed result |
|---|---|
| 1440 × 960 | Wide profile with Documents/Projects, Layout/Pages and Inspector groups |
| 390 × 844 | Single group, selected Inspector remains visible; input draft `12.`, caret index 2 and focus retained |
| 844 × 390 | Dual profile; the same draft, caret and focus retained |
| Return to 1440 × 960 | Wide profile and the same focused draft restored |
| Wide → narrow → wide → reload | Menu-created Inspector/Pages split restored, with no duplicate views |
| Wide handle drag into a neighbouring edge | Split applied; vacated source pane removed |

Screenshots: `/tmp/chopstitch-responsive-review/portrait.png`, `landscape.png` and `wide.png`. The checked preview reported no browser console errors. A Chrome test tab opened successfully, but the connection subsequently reported its debugger was not attached and could not be reclaimed. Therefore the full Chrome Device Mode touch matrix remains unverified; automated pointer-event tests cover cancellation and multiple contacts without claiming emulated finger routing.

## Remaining validation and findings

- **Confirmed environment limitation:** standalone Gryth full/Gyld builds cannot find their compiler. The existing supported Chopstitch build consumes and type-checks the changed Gryth code successfully. Validate standalone compositions in the user's other Gryth checkout, or authorise dependency repair separately. No dependency files were changed.
- **Validation gap:** complete Chrome Device Mode touch drag, native scrolling, crop/measurement and on-screen-keyboard checks once its debugger connection is available. Browser geometry and mouse routing were exercised; automated pointer events are supplemental, not a substitute claim for Device Mode.
- **Optional follow-up:** physical-device OS/browser differences and hardware performance remain outside this local pass, as agreed. No deployment or LAN exposure is necessary to review the implementation.
- **Existing style debt:** 41 unbraced control bodies in the edited canvas file and 13 in its edited navigation helpers were wrapped to follow the standing rule. This was a bounded cleanup; no repository-wide migration or cross-language conditional-compilation cleanup is claimed.
