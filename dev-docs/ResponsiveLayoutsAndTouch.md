# Responsive layouts and touch interaction

Status: **Design proposal for review**. Written 7 November 2026. No responsive-layout or gesture implementation has been made for this proposal.

Gryth should choose a usable arrangement from application-declared layouts as its available space changes. Open views remain the same instances: resizing a browser, rotating a device, or regrouping tabs must preserve their content, selections and unfinished edits. Users must still be able to move, dock, merge and split panels themselves.

The ownership rule is explicit: **generic behavior belongs in Gryth; only Chopstitch-specific behavior belongs in Chopstitch.** Chrome DevTools Device Mode is the primary interactive validation environment. Deployment, LAN exposure and access to additional physical devices are not prerequisites.

## Scope and authority

The user agreed the following behavior during the design discussion:

- Prefer a single column for narrow phone layouts, two columns when more space is available, and three on sufficiently large screens.
- Support both portrait and landscape. Select by actual available workspace dimensions, so browser resizing also exercises the feature.
- Use named tabs for views, with a clear selected tab in each group and a separate indication of the focused group. Keep the selected view visible when other tabs overflow.
- Preserve the project, open views and editing state across layout changes.
- Keep manual handle dragging, docking and edge-drop splitting, including on touch. Offer equivalent menu actions.
- Keep all generic layout, tab and interaction behavior in Gryth. Applications supply layout data and domain behavior.
- Use a small touch vocabulary: taps for controls, normal list scrolling, one finger for the selected canvas tool, and two fingers for canvas navigation. A second finger must not accidentally commit an edit.
- Rely primarily on Chrome responsive and touch emulation plus automated tests. Physical-device testing is optional follow-up work.

The current deliverable is this design document. Runtime implementation should follow review of the proposal, especially the arrangement-persistence model. Numeric breakpoints and the proposed internal structures below are engineering proposals, not additional user requirements.

| Component | Permitted responsibility in the proposed implementation |
|---|---|
| Gryth desktop and plugin API | Layout variants and selection, view grouping, tabs, focus, overflow, docking, splitting, pointer lifecycle, reusable gesture recognition, arrangement persistence and public commands |
| Chopstitch | Its layout declarations, role assignments, preferred views, artwork coordinates, crop and selection operations, measurement, tile editing and print behavior |
| GRIP core and React | Reference-only dependencies; use existing grips, taps, contexts and buffered inputs |
| Reporter, Glial and other applications | Reference-only consumers and compatibility cases; no implementation changes assumed |
| Hosting and networking | Outside scope; do not deploy or expose the development server to implement or validate this work |

No new package or dependency migration is assumed. If an existing interface proves insufficient, record the specific failure and smallest proposed extension before widening the scope.

## Existing foundation

Chopstitch already declares its initial arrangement as data in [its studio preset](../../chopstitch-ui/src/desk.ts). The preset has an 18% left column containing Documents above Projects, a 58% centre column containing Layout above Pages, and a 24% Inspector column. A Settings override places Settings beside Inspector. This is application policy, not geometry hard-coded into Gryth's renderer.

Gryth's [layout and window types](../packages/desktop/src/grips.desktop.ts) describe nested rows and columns, named areas, frames and tabs. [Desktop operations](../packages/desktop/src/ops.ts) calculate rectangles and implement moves, merges, splits and docking. Tool definitions declare roles; layouts supply placement overrides and a fallback. These are the supported starting points for responsive placement.

[Tab contexts](../packages/desktop/src/tabContexts.ts) are retained for the lifetime of tab records. A temporary unmount is not itself the end of the instance. However, that alone does not preserve everything: GRIP's focused input buffer and browser focus/selection live partly in mounted elements. A responsive implementation must account for both context state and mounted editing state.

The current [desk document](../packages/desktop/src/layoutDocument.ts) stores frames, tab membership, docking and geometry together. [Canvas measurement](../packages/desktop/src/canvasGuard.ts) also clamps window geometry when its area changes. Simply rewriting this document on every resize would risk replacing users' saved arrangements and broadcasting device-specific geometry to other clients.

Panel movement in [Window](../packages/desktop/src/Window.tsx) currently starts with mouse events. Chopstitch's [canvas](../../chopstitch-ui/src/tools/LayoutCanvas.tsx) mixes mouse-based editing with pointer-based content selection. Enlarged touch controls exist, but do not constitute a complete touch interaction model.

The earlier [desktop layout brainstorm](DesktopLayoutModes.md) explains the foundation-window model. This proposal extends that model with responsive selection and touch behavior; it does not revive the superseded schema in that brainstorm.

## Ownership and interfaces

Gryth measures its container, selects a layout, assigns views to groups and renders the shell. Application code must not inspect viewport width to rearrange windows itself or copy the shell's drag and drop code.

Chopstitch supplies a family of layout definitions through the existing composition boundary. A variant needs a stable identity, a layout tree, applicability constraints, role-to-area placement rules, preferred visible views and an unmatched-view fallback. Extend the current declaration model rather than inventing a parallel Chopstitch window manager.

Generic pointer capture, cancellation, drag thresholds, pinch recognition and viewport transforms should be implemented in Gryth when reusable. Chopstitch translates their results into artwork coordinates and domain commands. Gryth must not import Chopstitch tool identifiers, crop models, printer units or tile specifications.

UI state stays in grips and taps. Event handlers read current gesture state through handles rather than stale render closures. DOM measurement and capture use established ref/tap ownership and cleanup patterns; no React state hooks are introduced into application or shell components.

## Layout families and selection

The proposed Chopstitch family is:

| Variant | Default groups | Initial visible views |
|---|---|---|
| One column | All available views in one tab group | Current focused view, otherwise Layout; Documents when no project is open |
| Two columns | Workspace/navigation group; supporting-tools group | Layout on the left, Inspector on the right |
| Three columns | Documents/Projects; workspace; supporting tools | Documents or Projects on the left, Layout in the centre, Inspector on the right |

Pages remains accessible as a tab; a fourth fixed column is not required. Additional views and unmatched plugin roles use the declared fallback rather than disappearing. Multiple instances remain distinct, with meaningful labels where their usual titles would be identical.

The column counts describe defaults, not a ban on custom splits. A user-created vertical split can remain useful even in a one-column profile.

### Selection rules

Measure the usable Gryth container in CSS layout units, after application navigation and any visible rail consume space. Do not use the physical device screen, user-agent name or individual plugin width. Keep the measurement independent of the selected layout so a layout change cannot create a measurement feedback loop.

Choose the richest declared layout whose minimum pane sizes fit. Orientation follows from the measured dimensions; it is not a requirement to rotate a device. Width is the principal column constraint, while height constrains usable panes and manual splits. Browser and font zoom must be included in validation because usable controls, not nominal device pixels, determine whether a layout fits.

For the first prototype, evaluate two columns around 700 CSS pixels and three around 1100. These are starting measurements only. Tune against the canvas, inspector fields, tab controls and large-text cases. Use separate entry and exit thresholds, initially about 40 pixels apart, to avoid oscillation near a boundary. On first load select directly without requiring a prior layout.

On-screen keyboard changes must keep the editing view visible. A temporary reduction in height should not reset a workspace or repeatedly change groups. Zero-sized or temporarily hidden containers keep their last valid selection until measurable again.

### Transition rules

1. Capture the focused view, each group's selected view and any pending interaction.
2. Cancel an active drag or uncommitted canvas gesture safely before changing its coordinate system. Do not commit a half-finished move.
3. Select the applicable variant and restore its saved arrangement, or derive it from the application definition on first use.
4. Reconcile that arrangement against the current canonical set of views.
5. Keep the focused view visible. When collapsing several groups into one, prefer the focused view, then the main view. Remember each group's prior selection for expansion.
6. Preserve instance identity, source wires, field text and caret, canvas viewport and selection. Never silently round, validate or save a field merely because the layout changed.

## Custom arrangements and persistence

Recommended design: keep automatic presentation separate from canonical open-view records. Retain the existing tab identities, parameters and source relationships. Do not create independent copies of projects, tools or tab contexts for each layout size.

Each layout profile may have an arrangement containing a split tree, tab-to-group assignments, group selections and floating placement where applicable. These entries reference canonical tab identities. A profile is keyed by application, desktop and stable layout-variant identity, rather than by an exact pixel width.

Automatic selection and measured geometry are local to the client. Resizing one browser must not reorganise another client's shared session. Initially keep responsive arrangement overrides local too, using Gryth's storage infrastructure; synchronising or explicitly sharing them is separate work. Canonical open/close and tool content continue to use their existing scope.

Manual split, move, merge and resize operations update the selected profile's arrangement. Returning to that profile restores the user's customisation. A narrower profile can regroup views into tabs without destroying the wider profile's split tree. For example, splitting Inspector and Pages on a large screen, switching to a phone-sized viewport, then widening again must restore that split.

Closing a view is a canonical close, not merely hiding it in one profile. Reconcile closed references from other profiles so they do not resurrect the view. Newly opened views are assigned by role when a profile is next used. Moving a view to another desktop similarly removes obsolete placement references. Selection must fall back to an existing view after a close.

Presentation groups must have their own identities and must not masquerade as canonical frame IDs when invoking existing desktop operations. An adapter should resolve a visible group/tab action to the appropriate canonical action or profile edit. Validate that adapter with the existing docking and tab-context machinery before committing to a persisted schema.

The first feasibility step should project existing frame/tab records into two different layouts without mutating them. This checks the supported route before any wider document migration. Prefer an additive, versioned arrangement extension and explicit migration over changing the current document version in a way that discards old layouts. Existing saved geometry should seed the appropriate wide profile. A malformed optional arrangement must fall back without losing views.

An explicit reset may clear the chosen profile's customisation. Existing “reset all panel layouts” behavior must be documented and tested if it is extended to clear all profiles. Automatic switching is never a reset.

## Tabs and focused groups

Every responsive group has a visible tab strip, including a group with only one view. This is the selected-view identity discussed for mobile navigation; it does not require adding duplicate titles inside plugin content. Keep existing compact/full chrome preferences for ordinary docked and floating windows outside this presentation.

The selected tab uses a readable name, underline and contrasting surface. A separate group outline indicates keyboard/input focus. Colour alone must not carry either meaning. Use tab, tablist and tabpanel semantics, keyboard navigation and meaningful accessible names.

Keep the selected tab in the visible strip. Put overflow views in a tap-accessible “More views” control; do not shrink labels or close buttons until they are unusable. The overflow control must also be keyboard operable. Choosing a tab changes presentation, not the project's identity or desktop assignment.

Do not key a tool body by layout variant or move it between React parents in a way that resets its local editing buffer. The implementation must demonstrate preservation with a focused numeric draft such as `12.` and a caret in the middle of a text field. Existing per-tab contexts are necessary but not sufficient evidence of this guarantee.

## Touch interaction contract

| Area or mode | Input | Result | Owner |
|---|---|---|---|
| View tabs and controls | Tap | Select or invoke the visible control | Gryth shell; application commands |
| Lists and settings | One-finger swipe | Native scrolling | Browser; Gryth must not steal it |
| Panel move handle | One-finger drag | Move panel, show docking/merge/split targets, commit on valid release | Gryth |
| Panel menu | Tap Move or Split | Select destination and direction without dragging | Gryth |
| Splitter | Drag its enlarged hit area | Resize adjacent panes within usable limits | Gryth |
| Canvas Navigate mode | One-finger drag | Pan without modifying artwork | Generic recognition in Gryth; view binding in Chopstitch |
| Canvas any mode | Two-finger drag or pinch | Pan and zoom around the fingers | Generic recognition in Gryth; view binding in Chopstitch |
| Canvas Select, Crop or other edit mode | One-finger gesture | Execute the explicitly selected operation | Chopstitch |
| Two-point scale | Tap each point | Place measurement points | Chopstitch |
| Numeric controls, zoom buttons and Undo | Tap or type | Precise alternatives to direct manipulation | Owning tool |

Dragging a panel starts only from its handle/tab affordance, not from arbitrary content. The existing desktop mouse behavior remains usable; touch support is not a mobile-only replacement. Do not use a hover or long press as the only way to discover or invoke an action.

The shell must preview the actual proposed split or merge before release. Edge targets allow left, right, above and below splits where they fit. Centre/header targets retain existing merge semantics. Invalid targets explain or visibly indicate why no drop will occur. Minimum pane sizes govern feasibility; the automatically chosen column count must not itself forbid manual splits.

Move/Split menus and dragging invoke the same commands and obey the same read-only restrictions. A drag commits one structural change on successful release. Cancelling, losing capture or dropping outside a valid target leaves the original arrangement intact.

## Pointer lifecycle and gesture arbitration

Use Pointer Events consistently rather than parallel touch and mouse implementations that can apply the same gesture twice. Track pointer identity, capture ownership and gesture state in Gryth. Handle pointer release, cancellation, lost capture, view closure and desktop changes. Rendering reads grips; gesture handlers read current tap handles.

When a second finger arrives during an edit, cancel its provisional mutation before starting two-finger navigation. This requires an explicit begin/preview/commit/cancel contract. Operations that currently write on every move must either keep a reversible start snapshot or stage a preview. Cancellation must not add a misleading Undo entry or undo another actor's unrelated edit.

When a pinch ends with one finger remaining, require a fresh press before starting a new edit. Apply the same conservative rule to a second contact arriving during a panel drag: cancel or ignore it without committing the panel move; canvas pinch handling must not capture shell handles.

Constrain browser gesture suppression to handles and dedicated canvas surfaces. Preserve scrolling, text selection and browser zoom elsewhere. Provide button/field alternatives for essential operations. Keyboard operation, pointer input and accessibility actions remain supported together.

Pointer Events provide a shared mouse, pen and touch model, including capture and cancellation; keyboard handling remains a separate concern. See the [W3C Pointer Events specification](https://www.w3.org/TR/pointerevents3/). Tap alternatives to dragging follow [W3C dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements). Both orientations should remain usable, following [W3C orientation guidance](https://www.w3.org/WAI/WCAG22/Understanding/orientation.html).

## Validation without deployment

Chrome DevTools **Device Mode**, using Responsive dimensions and a touch-enabled device type, is the primary interactive test route. It supports viewport resizing, rotation and simulated touch input. Merely narrowing a desktop-mode window tests geometry, not touch event routing. Chrome describes emulation as an approximation, so record what was actually exercised rather than claiming hardware coverage. See [Chrome Device Mode](https://developer.chrome.com/docs/devtools/device-mode/).

Use ordinary browser resizing to sweep boundaries, then Device Mode to exercise taps, scrolling and handle drag/drop at phone and tablet sizes. Where the UI emulator cannot express a required multi-pointer or cancellation sequence reliably, use automated pointer-event tests; keep real-device confirmation as a nonblocking follow-up. No deployment or LAN binding change is part of this plan.

Acceptance checks:

1. Sweep narrow, medium and wide viewports in both directions, including widths just inside each hysteresis boundary. There is no oscillation, unreachable panel or clipped essential control.
2. Select a different view in every group, focus a field, type an incomplete number and place its caret mid-string. Collapse and expand the layout: draft, caret and relevant selected views survive.
3. Create a custom split by both drag and menu. Narrow, widen and reload: the wide custom arrangement returns and no duplicate views appear.
4. Close, open and move views between desktops while using different profiles. No stale placement resurrects a closed view or changes its project/source wiring.
5. Switch tabs and use overflow with touch and keyboard. Selected tabs and focused groups remain distinguishable, including with enlarged text.
6. Pan, pinch, crop, select and measure. Add a second pointer mid-edit, cancel capture and resize during a gesture. There are no stuck drags, unintended edits or extra commits.
7. Scroll a settings list beside a canvas, use form controls and open the on-screen keyboard simulation where available. Shell gestures do not steal these interactions.
8. Exercise touch-enabled desktop input as well as mouse input. A touch-capable device is not assumed to have no mouse or keyboard.
9. Run Gryth's focused and integration tests and both full and Gyld build targets. Run Chopstitch's affected tests, lint and production build; verify production still excludes debug activation.

Record viewport dimensions, input-emulation mode, selected profile, expected/observed outcome and screenshots for the interactive matrix. Physical browser/OS differences, real soft-keyboard behavior and hardware performance remain follow-up coverage, not a condition for completing the locally validated implementation.

## Implementation sequence and review gates

1. **Selector and placement feasibility in Gryth.** Model variants and deterministic role assignment, test dimensions/hysteresis, and project an existing desk without changing its canonical records. Confirm stable tab instances and no resize-triggered persistence before choosing the final schema.
2. **Responsive groups and tabs.** Add selected/focused presentation, overflow and keyboard navigation. Integrate Chopstitch's declarations. Prove unfinished-edit preservation through repeated one/two/three-column transitions.
3. **Custom arrangement commands and persistence.** Adapt move, merge, split, close and resize to responsive groups. Add saved-profile reconciliation and migration. Prove user customisation and existing saved desks survive.
4. **Shared pointer handling in Gryth.** Add capture/cancellation and touch handle docking/splitting, with equivalent menus. Preserve mouse behavior and read-only constraints.
5. **Chopstitch gesture bindings.** Apply reusable navigation handling to the artwork canvas; add domain preview/commit/cancel behavior for editing tools and second-pointer transitions.
6. **Integrated Device Mode validation.** Complete the matrix, tune thresholds and hit areas, and document remaining hardware-only gaps.

Each phase needs focused evidence before broadening the change. Do not introduce a generic framework merely to move application-specific code out of Chopstitch. A second small Gryth host fixture should demonstrate that the layout and panel interaction logic contains no Chopstitch assumptions.

## Remaining engineering decisions

- Final threshold and minimum-pane values, including large text and unusually short landscape windows.
- Exact additive persistence schema and migration strategy after the projection feasibility test.
- Whether a particular domain tool can stage previews or needs rollback; verify tool by tool before claiming complete gesture cancellation.
- How a customised arrangement that no longer fits is temporarily represented as tabs while its saved topology remains intact.

These require implementation evidence and review, not more device purchases or a deployment project.

## Findings outside the implementation boundary

| Finding and evidence | Impact | Follow-up and blocking status |
|---|---|---|
| This checkout's Gryth standalone dependency installation is blocked by its stale lockfile and older Glial package mapping; its build commands currently cannot find the local compiler. Chopstitch builds and consumes Gryth sources successfully. | Full and Gyld builds cannot yet be claimed here. | Validate in the user's other Gryth location or separately authorise dependency repair. Does not block this design; remains a validation limitation for implementation. |
| `GrythPluginContract.md` still describes compact chrome as opt-in, while the current integration branch defaults single docked panels to compact unless explicitly disabled. | Existing prose is stale. | Reconcile separately or as a narrowly scoped documentation correction when editing that contract; it does not block responsive design. |
| Device Mode does not run the mobile browser/OS or reproduce all hardware behavior. | Emulation cannot establish complete iOS/Android compatibility. | Keep an optional physical-device follow-up list. It is explicitly not an implementation prerequisite. |
