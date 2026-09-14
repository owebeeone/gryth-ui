// The Gyld-only target's plugin list: the Gyld plugin, and the desk's own
// appearance editor. Two imports, and the list is closed at two.
//
// `@grythjs/plugin-gyld` is the point of the target: a desk for the Gyld
// decision graph and nothing unrelated to it.
//
// `@grythjs/plugin-settings` is not a tool of another subject, which is the
// test this list applies. It is the editor for THIS desk's own appearance —
// theme, wallpaper, UI zoom, font size — and it owns the PRODUCERS of the
// appearance grips the chrome consumes (see its index.ts). The chrome
// defaults every one of them, so the desk renders without it; what it cannot
// do without it is change any of them, and a desk whose reader cannot set
// their own font size is not a narrower desk, it is an unfinished one.
// Its tool declares the `crew` role, which this desk has no area for, so the
// GYLD preset designates it to `inspector`
// (packages/desktop/src/foundations.ts).
//
// The shell's own facets (welcome, grid) and its window management are not
// plugins at all: they ship with `@grythjs/desktop` and are registered by
// `registerAllTaps()` inside `boot()`. So the desktop the full target renders
// and the desktop this one renders differ in their launcher and in nothing
// else.
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
import '@grythjs/plugin-settings';
