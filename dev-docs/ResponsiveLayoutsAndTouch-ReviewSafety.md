# ResponsiveLayoutsAndTouch — SAFETY-AXIS REVIEW

**Review object:** `gryth-ui/dev-docs/ResponsiveLayoutsAndTouch.md` at `e4b7e5ca2b4f858e18e9c6228a6c494f5e1a0060`; status: **Design proposal for review**, dated 7 November 2026.

**Baseline:**

| Repository | Exact HEAD |
|---|---|
| `/Volumes/projects/limbo/chopstitch-wz` | `82ea58ea005dd13336e806868593cd4a77a8dd91` |
| `gryth-ui` | `e4b7e5ca2b4f858e18e9c6228a6c494f5e1a0060` |
| `chopstitch-ui` | `48bcf012220e6c0c12ae245b877c42e5bea1465e` |
| `grip-core` | `b9d7149a1c3748ad2b4490d9d70ca23ee121268f` |
| `grip-react` | `2a42485c95a40d81f527db5f246cb5c6d8b579c0` |

The proposal, brief and substantive source evidence were read with `git show <exact SHA>:<path>`. All five HEADs matched at the start and end. All five repositories returned empty `git status --short` output during inspection.

**Date:** 7 November 2026  
**Axis:** Safety — degraded paths, state loss, cancellation, persistence boundaries and scope expansion. Independent, adversarial, read-only. The other axis runs in parallel; nothing here relies on it. Filed verbatim by the lane owner.

**Verdict: GO** — zero P0, P1, P2 or P3 findings. This verdict accepts the proposal's safety constraints for draft design review. It does not establish implementation readiness or verified runtime behavior.

---

## 0. Evidence base

Read in full:

- Generated Safety review prompt.
- Workspace `AGENTS_GWZ.md`, `gryth-ui/AGENTS.md`, and `gryth-ui/dev-docs/CodingRules.md`.
- User-invoked `/Users/owebeeone/.claude/skills/review-loop/SKILL.md`.
- `gryth-ui/dev-docs/ResponsiveLayoutsAndTouch.md`, lines 1–198.
- `gryth-ui/dev-docs/ResponsiveLayoutsAndTouch-ReviewBrief.md`, lines 1–43.
- Gryth `packages/desktop/src/layoutDocument.ts`, lines 1–379: version rejection, canonical records, optional fields and malformed-data recovery.
- Gryth `packages/desktop/src/tabContexts.ts`, lines 1–213: context lifetime, canonical-record reaping and source wiring.
- Gryth `packages/desktop/src/canvasGuard.ts`, lines 1–60: measurement and canonical geometry mutation.
- Gryth `packages/desktop/src/sessionLayout.ts`, lines 1–200: session identity, whole-document persistence, replay and reset.
- Chopstitch `src/desk.ts`, lines 1–85: application-owned layout, role fallback and saved-desk precedence.

Read targeted committed source ranges:

- Gryth `packages/desktop/src/ops.ts`, lines 1–110, 295–350, 440–560 and 690–820: identity allocation, role placement, closing tabs, geometry clamping, splitting and remembered layout restoration.
- Gryth `packages/desktop/src/Window.tsx`, lines 1–180: mounted tool body, frame identities, mouse movement and read-only controls.
- Gryth `packages/desktop/src/layoutStorageTap.ts`, lines 240–334: restored-state precedence, storage availability and explicit reset.
- GRIP React `src/react/hooks.ts`, lines 414–501: mounted focused-input draft and blur publication.
- Chopstitch `src/tools/LayoutCanvas.tsx`, lines 158–288, 506–562 and 732–755: move-time mutations, pointer capture, mouse/pointer routing and cancellation.

Used `rg` to locate relevant definitions before reading committed source. No files were changed, no tests or builds were run, and no network or browser validation was performed. Current-round peer materials were not inspected.

## Problem, requirement provenance, and scope

The required outcome comes from the original directives recorded in ReviewBrief lines 7–19: resize-driven one/two/three-column presentation; named tabs and visible focus; preservation of unfinished edits and custom splits; touch dragging, docking and splitting with menu alternatives; generic shell behavior in Gryth and domain behavior in Chopstitch. Chrome Device Mode is the primary interactive validation route. Dependency repair, deployment and physical-device availability are not prerequisites.

The observed implementation foundation supports the problem statement:

- Chopstitch supplies one initial layout as application data.
- Gryth's current measurement path writes clamped geometry into canonical window records.
- Tab contexts outlive temporary unmounts, but GRIP React's focused input draft is component-local.
- Shell dragging starts with mouse events, while Chopstitch mixes mouse and pointer paths and mutates some edits during movement.

These observations materially justify the proposal's separation of presentation from canonical records and its explicit preservation and cancellation requirements. Merely retaining tab contexts or enlarging touch controls would not establish the agreed behavior.

No unsupported dependency or infrastructure prerequisite was found. The proposal first requires an existing-record projection without canonical mutation, before settling the persistence schema. Existing role placement, retained tab contexts and pure layout transforms provide concrete evidence for investigating that supported route. They do not prove the future renderer feasible; the proposal correctly leaves that proof to its first implementation gate.

The localized approaches considered by the document are proportionate: application-declared variants, local arrangement overrides, an adapter around existing desktop operations, and staging or targeted rollback for existing domain gestures. It does not require replacing GRIP, creating a second Chopstitch window manager or repairing unrelated applications.

The present editable boundary is proposal/review records and authorized GWZ checkpoint metadata. Runtime code and dependencies are reference-only. Future responsibilities in the proposal do not authorize implementation now. I found no concrete expansion beyond that boundary.

The standalone Gryth build limitation, stale compact-chrome prose and physical-device coverage gap are separately recorded in proposal lines 192–198. This review did not independently reproduce the dependency-installation failure. None is used as evidence that broader work is necessary for this document deliverable.

## 2. Invariant analysis

| Attack | Evidence and result |
|---|---|
| Collapse a focused field containing `12.` and later expand it. Retained tab context alone could still lose the draft or publish it on blur. | The existing input implementation confirms this risk: draft/focus live in component state and blur publishes the value. Proposal lines 89 and 117 explicitly require field text and caret preservation, forbid silent validation/save, and reject context retention alone as proof. Acceptance check 2 exercises the material failure. The attack does not expose a missing proposal requirement. |
| Create a wide custom split, narrow the viewport, then widen or reload. | Lines 93–105 separate canonical views from per-profile arrangements and require restoring the wide topology. Lines 162 and 176 require preservation evidence, including reload. The remaining choice of how to render a nonfitting custom topology is explicitly deferred without relaxing preservation. |
| Close or move a view while another profile contains its saved placement. | Lines 87 and 101 require reconciliation against the current canonical view set, removal of closed/moved references, role assignment for newly opened views and valid selection fallback. This prevents an inactive profile from being authority to recreate a closed tool. Existing context reaping follows canonical records, making that distinction consequential. |
| Treat a responsive group ID as an existing frame ID and accidentally close or move the wrong canonical object. | Line 103 expressly prohibits this substitution and requires adapter validation with docking and tab-context machinery. The proposal does not assume that current frame-oriented operations can be invoked unchanged against presentation groups. |
| Resize one client and broadcast its narrow geometry to another client sharing the session. | Current `canvasGuard.ts` updates canonical windows, and `sessionLayout.ts` persists whole desk documents. Proposal lines 42, 97, 105 and 174 identify this exact hazard and require local automatic geometry plus a no-canonical-mutation projection gate. Preserving the current resize writer unchanged would fail the proposal. |
| Load an existing desk after introducing responsive persistence, or encounter a malformed optional arrangement. | The current decoder rejects other document versions wholesale and restores valid canonical records independently of entry defaults. Line 105 specifically warns against losing old layouts through a version change, prefers an additive extension, requires old geometry to seed the wide profile, and requires malformed optional arrangements to fall back without view loss. Exact migration and mixed-version mechanics remain deferred; no incompatible format is prescribed by this draft. |
| Add a second finger after a canvas gesture has already changed artwork. | Current canvas movement can publish domain changes before release. Line 144 therefore requires an explicit begin/preview/commit/cancel contract, staged preview or reversible start state, no misleading Undo entry and no rollback of another actor's unrelated edit. Tool-specific implementation remains a required investigation, not an unsupported claim that clearing a gesture handle is enough. |
| End a pinch with one finger remaining, lose capture, resize during dragging, or add another contact over a shell handle. | Lines 85 and 138–146 require cancellation before coordinate changes, no structural commit on failed release, capture-loss handling, a fresh press before editing after pinch, and shell/canvas ownership separation. Acceptance check 6 includes these sequences. No permitted path requires an accidental edit or panel commit. |
| Obtain touch behavior by suppressing scrolling globally or bypassing read-only commands through menus. | Lines 124, 138 and 148 preserve native list scrolling, share commands and restrictions between menus and dragging, and limit browser-gesture suppression to dedicated surfaces. These are direct constraints on implementation. |
| Use automatic profile selection as an implicit destructive reset. | Line 107 explicitly distinguishes switching from reset and limits profile reset to an explicit action. It requires documentation and tests if the existing global reset expands to all profiles. The draft does not silently broaden the existing destructive operation. |

These are document-level attacks checked against the committed source foundation. They establish that the proposal addresses the credible failures; they are not executed runtime tests.

## 3. Risks and next action

The principal remaining uncertainties are already declared implementation gates: preserving mounted editing state through regrouping, safely adapting frame-oriented operations, selecting an additive persistence representation, and implementing cancellation for each domain tool. Source inspection confirms that these deserve evidence before implementation claims. It does not establish that any requires dependency changes or a broader project.

Existing storage limitations and whole-document session conflict behavior are not repaired by this proposal. No new guarantee of arbitrary downgrade compatibility or complete mobile-browser coverage should be inferred from this GO.

**Next action:** File this report and merge the independent verdicts under the review brief's relevance filter. No Safety-axis remediation is required for this revision.
