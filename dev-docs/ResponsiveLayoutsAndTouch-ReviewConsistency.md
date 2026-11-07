# ResponsiveLayoutsAndTouch.md — CONSISTENCY-AXIS REVIEW

**Review object:** `gryth-ui/dev-docs/ResponsiveLayoutsAndTouch.md` at `e4b7e5ca2b4f858e18e9c6228a6c494f5e1a0060`, status **Design proposal for review**, written 7 November 2026.

**Baseline:**

| Repository | Exact HEAD |
|---|---|
| Workspace root | `82ea58ea005dd13336e806868593cd4a77a8dd91` |
| gryth-ui | `e4b7e5ca2b4f858e18e9c6228a6c494f5e1a0060` |
| chopstitch-ui | `48bcf012220e6c0c12ae245b877c42e5bea1465e` |
| grip-core | `b9d7149a1c3748ad2b4490d9d70ca23ee121268f` |
| grip-react | `2a42485c95a40d81f527db5f246cb5c6d8b579c0` |

Committed proposal, brief and supporting sources were read using `git show <exact SHA>:<path>`, with numbered output. All five HEADs matched at both the beginning and end.

**Date:** 7 November 2026.

**Axis:** Consistency — internal coherence, agreement with controlling requirements and cited foundations, and satisfiability of proposed evidence. Independent, adversarial, read-only. The other axis runs in parallel; nothing here relies on it. Filed verbatim by the lane owner.

**Verdict: GO** — zero P0, P1, P2 or P3 findings. This accepts the proposal’s consistency at the stated draft stage; it does not establish implementation readiness or verified runtime behavior.

---

## 0. Evidence base

Read the complete generated reviewer prompt and the review-loop skill. Read the user-supplied workspace instructions, `AGENTS_GWZ.md`, Gryth’s `AGENTS.md`, and committed `dev-docs/CodingRules.md`, lines 1–68.

Reviewed these committed documents:

- `ResponsiveLayoutsAndTouch.md`, lines 1–198, including user-facing layout, tabs and touch behavior before examining implementation sources.
- `ResponsiveLayoutsAndTouch-ReviewBrief.md`, lines 1–43.
- `DesktopLayoutModes.md`, lines 1–296, checking its superseded schema, foundation model and older tab-strip decisions.
- `GrythPluginContract.md`, lines 1–95, 305–346 and 392–440, covering ownership, context identity, persistence, read-only behavior and desktop context access.

Checked these supporting sources at the baseline revisions:

| Source | Inspected evidence |
|---|---|
| Chopstitch `src/desk.ts`, lines 1–85 | Application-owned layout tree, proportions, designation, fallback and initial tool set |
| Gryth `grips.desktop.ts`, lines 1–280 | Layout, foundation, canonical tab/frame records, focus, scope and gesture state |
| Gryth `ops.ts`, lines 72–120, 278–336, 386–407, 439–454 and 646–690 | Role assignment, merge/select/close/move operations, geometry clamping and projected placement |
| Gryth `tabContexts.ts`, lines 1–213 | Context lifetime, canonical-record reconciliation and source wiring |
| Gryth `layoutDocument.ts`, particularly lines 5–63 and 113–270 | Shared codec, document contents, version policy and decoding |
| Gryth `layoutStorageTap.ts`, lines 1–210 | Browser-local storage, separate named-session route, storage keys and desk ports |
| Gryth `canvasGuard.ts`, lines 1–60 | Measurement and writes that clamp canonical geometry |
| Gryth `Window.tsx`, lines 50–115 and 135–193 | Active-tab rendering, context resolution, compact chrome and mouse drag initiation |
| Chopstitch `LayoutCanvas.tsx`, lines 485–562 and 730–753 | Mixed mouse/pointer handling and existing cancellation hooks |
| GRIP React `inputs.tsx`, lines 1–91, and `hooks.ts`, lines 414–501 | Mounted input binding, local focused draft and blur publication |

Used `rg` for source discovery and `git status --short` in Gryth; Gryth reported a clean working tree at that check. No files were written, no builds or tests ran, and no network access occurred. External standards and Device Mode links were not independently fetched under this review’s inspection-only command restrictions.

## Problem, requirement provenance, and scope

The requested outcome is a workspace that selects one, two or three columns from available container space while retaining named views, visible selection/focus, unfinished edits and custom splits. Touch must support handle dragging, docking and splitting with menu alternatives. Generic behavior belongs in Gryth; application declarations and artwork behavior belong in Chopstitch. The original authority is recorded in the ReviewBrief, lines 7–19, including the explicit instruction to establish practical relevance before adopting review recommendations.

The source evidence supports the concrete problem. Chopstitch currently supplies a fixed studio layout. Gryth already has reusable layout trees, role-based placement and tab identities, but its canvas watcher writes geometry changes into canonical window records. Panel movement starts from mouse handlers, while Chopstitch’s canvas mixes mouse and pointer handling. Those observations justify responsive presentation and coordinated pointer handling without requiring dependency redesign.

The proposal uses a localized supported route: project existing records into alternative presentations, preserve canonical tab identities and source relationships, and validate the action adapter before choosing the persistence schema. Existing `placeWindows` projection and `dockingHome` placement provide concrete foundations for this investigation. They do not prove the complete responsive implementation, and the proposal does not claim otherwise.

No unsupported dependency or infrastructure prerequisite blocks this design. The reported standalone Gryth build limitation is explicitly separated from proposal acceptance. The required full/Gyld build checks have repository-rule provenance; inability to run them here is disclosed rather than converted into authorization for dependency repair. This review did not reproduce the reported installation failure or the earlier successful Chopstitch build.

The current editable boundary is proposal and review records, with checkpoint mechanics owned by the lane owner. All runtime sources and dependencies are reference-only. Future Gryth and Chopstitch responsibilities are described, but the document expressly does not authorize implementing them now. GRIP, Reporter, Glial, hosting and networking remain outside the implementation boundary.

The already-recorded compact-chrome documentation drift is confirmed: the plugin contract describes opt-in behavior, while `Window.tsx:77` defaults single docked frames to compact unless disabled. The proposal discloses this mismatch and distinguishes responsive tab presentation from ordinary window chrome. It is an existing documentation issue, not a blocker or a reason to expand this task.

## 2. Invariant analysis

**Resize must change presentation without destroying identity or content.**  
I traced collapse and expansion with different selected tabs and a focused unfinished field. Proposal lines 84–89 preserve focus, selections, tab identity, source wiring, draft text and caret. Lines 93–105 separate profile arrangements from canonical records. This avoids assuming that merge operations—which currently modify frame membership—can be invoked unchanged during automatic regrouping.

**Preserved tab contexts are insufficient evidence for preserved input drafts.**  
The attempted counterexample was a focused `12.` draft surviving context retention but disappearing after a tool-body remount. GRIP’s buffer is mounted React state, and blur publishes the field value. The proposal explicitly identifies this distinction at lines 40 and 117 and requires a draft/caret preservation demonstration at line 161. It therefore does not rely on the false inference that stable context identity alone satisfies the user requirement.

**Custom splits must survive temporary narrow presentation.**  
The wide custom split → narrow layout → wide layout sequence is expressly required at line 99 and checked with reload at line 162. Lines 95–99 retain profile-specific topology; line 188 defers how an arrangement that no longer fits is temporarily displayed, while retaining the requirement that its saved topology remain intact. That deferral concerns implementation technique rather than permission to discard the split.

**Canonical close and desktop moves must reconcile presentation references.**  
Closing a tab while another profile is inactive could otherwise resurrect it on restoration. Line 101 explicitly makes close canonical and requires stale references to be reconciled. The same paragraph covers desktop moves and selection fallback. Line 103 requires presentation identities to be adapted rather than passed as canonical frame IDs. These requirements address the actual frame-oriented operations inspected in `ops.ts`.

**Layout selection must have a deterministic starting point and avoid feedback.**  
Lines 74–80 define container-based measurement, minimum usable pane sizes, hysteresis, first-load selection and retention during temporarily unmeasurable states. The proposed numeric thresholds are clearly provisional. No requirement depends on physical screen size, device identity or deployment.

**Touch, menu and mouse paths must describe compatible operations.**  
The interaction table and lines 134–148 consistently restrict panel dragging to its affordance, preserve ordinary scrolling, provide menu alternatives and require one structural commit on successful release. Cancellation, second-contact arbitration and fresh-press behavior complete the described gesture lifecycle. Tool-specific rollback remains an implementation investigation, with its required observable outcome already stated.

**Ownership must remain consistent with repository rules.**  
Proposal lines 48–56 agree with shell ownership of layout and tab presentation, application ownership of domain behavior, and Gryth’s grip/tap state rules. A small second-host fixture tests the explicitly requested generic ownership boundary without assuming implementation changes in another application. No new package or GRIP modification is made a prerequisite.

**The older brainstorm must not silently become a controlling frozen design.**  
The proposal identifies the old schema as superseded and uses the existing foundation model as its starting point. Its visible tabs and tap-accessible overflow intentionally differ from the brainstorm’s squeezed ticker and hover picker. The review authority explicitly treats that older brainstorm as superseded; these differences are not violations of a frozen interface. Ordinary nonresponsive chrome is separately addressed.

**Acceptance evidence must correspond to the agreed outcome.**  
The matrix covers resize boundaries, selected views, unfinished editing, custom splits, close/open/move reconciliation, keyboard/touch access and gesture cancellation. Device Mode is primary; automated pointer sequences supplement its limitations. Hardware, deployment and LAN exposure are not prerequisites. Full/Gyld build coverage follows Gryth’s repository instructions, while the current inability to claim those builds remains visible. These are future implementation checks, not tests claimed by this document review.

## 3. Risks and next action

The principal unresolved engineering risks are preservation of mounted editing state, adaptation of frame-oriented commands to presentation groups, persistence migration and tool-specific gesture cancellation. The proposal already names these risks and places feasibility checks before schema commitment or broader implementation. None supplies a concrete contradiction requiring another design work package.

This review does not certify external documentation claims, physical-device compatibility, dependency health or runtime correctness.

The next action is for the lane owner to merge this independent GO with the other axis’s report and apply the ReviewBrief’s practical-relevance test to any proposed correction. No correction is required by this Consistency review.
