# Glial Workspace-Name Cutover

Status: first incremental Taut-shape consumer cutover

Date: 2026-08-22

## Contract preserved

All UI and plugin consumers MUST continue to read the existing
`WORKSPACE_NAME` grip (`Doc.WorkspaceName`). They MUST NOT import Glial or learn
about value operations, fills, stores, shares, or delivery messages.

Only the composition-root provider changed. `WorkspaceNameTap` is now a Glial
`value` tap declared by the typed `GrythSurfaces.workspaceName` manifest. Its
provider-side `WORKSPACE_NAME_CONTROL` grip exposes a `set` operation for a real
workspace service or headless participant. The existing `mock-workspace` demo
value is retained, but is seeded through Glial's instance write/fold path rather
than by an `AtomValueTap` initial value.

## Dependency boundary

Glial is a GWZ-managed sibling member. `pnpm-workspace.yaml` declares it as a
workspace package and `overrides` pins `@owebeeone/glial-runtime` to
`workspace:*`, so every consumer - the shell, every plugin, and the transitive
edges reached through the `file:` dependencies into `glade-wz` - resolves the
one `gryth-wz/glial` member. The same applies to `@owebeeone/glade-decl` and to
Grip. Gryth does not link to the uncommitted Glial checkout in `taut-dev`.

The pinned Glial revision is recorded by GWZ in `gwz.conf/gwz.lock.yml`, not by
`pnpm-lock.yaml`: the pnpm workspace entry resolves to `link:../glial`, which is
a bare link and records no revision and no integrity hash. Read the GWZ lock,
not the pnpm lock, to learn which Glial revision a given Gryth commit was built
against.

This is a development/private package link. A Gryth release MUST depend on a
released Glial semver and pass the Taut-shape release compatibility gate.

### Correction, 2026-09-13

Two statements in this section were wrong as originally written on 2026-08-22
and have been rewritten above:

1. It claimed the workspace lock "records the clean Glial revision used by this
   cutover". It does not, and could not: a `link:` workspace entry pins nothing.
2. It claimed `pnpm-workspace.yaml` made "Glial and Grip resolve as workspace
   singletons". That was true of Grip only. There was no `overrides` entry for
   Glial, so the shell resolved `link:../glial` while every plugin resolved
   `file:../../glade-wz/glial` - a different checkout of the same repository,
   sitting on a different commit. Two copies of the client-side kernel means two
   binder and instance registries and no shared state between the shell's Glial
   surfaces and the plugins'. The `overrides` entries for
   `@owebeeone/glial-runtime` and `@owebeeone/glade-decl` that make the claim
   true were added on 2026-09-13, together with the fast-forward of the
   `gryth-wz` `glial` and `glade-decl-ts` members onto the revisions previously
   held only in `glade-wz`.

## Acceptance evidence

`src/seam.test.ts` proves:

1. the unchanged `WORKSPACE_NAME` grip initially yields `mock-workspace`;
2. the Glial controller is available through the graph;
3. `set("glial-workspace")` crosses the Glial write/fold path; and
4. the original grip consumer observes `glial-workspace` without a rewrite.

The complete Gryth tests, TypeScript/Vite production build, no-React-state scan,
and ESLint gate pass. Future surface cutovers SHOULD follow the same pattern one
provider at a time; no additional mock replacement is implied by this first row.

That acceptance statement was written against Glial `eefc9c8` and was
invalidated by the later Glial commits `03578db` and `da06989`, which moved the
`@owebeeone/taut-shape` dependency to the released package without a matching
reinstall here. It was re-verified on 2026-09-13 against Glial `0dfe4b9` and
`glade-decl-ts` `7e16e32`, with `@owebeeone/taut-shape` 0.9.2 installed from the
registry: `pnpm test` (10 files, 74 tests), `pnpm lint` and `pnpm build` all
exit 0, as does `pnpm install --frozen-lockfile`.
