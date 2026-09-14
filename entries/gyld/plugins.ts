// The Gyld-only target's plugin list. This one import is the WHOLE list, and
// that is the point of the target: a desk for the Gyld decision graph and
// nothing unrelated to it.
//
// Nothing else is needed to have a working desktop. The shell's own facets
// (welcome, grid), its appearance grips and its window management ship with
// `@grythjs/desktop` and are registered by `registerAllTaps()` inside `boot()`,
// not by any plugin; `@grythjs/plugin-settings` only adds an EDITOR for
// appearance grips the chrome already defaults (see its index.ts). So the
// desktop the full target renders and the desktop this one renders differ in
// their launcher and in nothing else.
//
// There is deliberately no `import.meta.glob` here. `src/plugins/index.ts`
// globs `./*/index.ts` so that dropping a directory in adds a plugin; this
// target's whole contract is that its list is closed, and a glob would let a
// future directory widen it silently.
//
// The LIVE wiring — `registerGyldLive()` — is called by `main.tsx` rather than
// here, for the reason `packages/plugins/gyld/src/live.ts` states about its own
// package: that module imports `@grythjs/glade`, which reads `location.search`
// and `sessionStorage` at import. Keeping it out of this file is what lets
// `plugins.test.ts` import the list and check it against the registry.
import '@grythjs/plugin-gyld';
