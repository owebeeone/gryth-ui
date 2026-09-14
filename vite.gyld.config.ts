import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { REPO_ROOT, grythShared } from './vite.config'

// The GYLD-ONLY target: `pnpm dev:gyld`, `pnpm build:gyld`, `pnpm preview:gyld`.
//
// The same application as `vite.config.ts` serves, with one difference — the
// entry it starts from, and therefore the plugin list. Everything a dev server
// needs to behave the same (the react plugin, the two Gyld static mounts, the
// singleton dedupe, the optimizer exclusions, `server.fs.allow` and the
// `/gyld/` proxy to grazel) comes from `grythShared()`; nothing is copied here,
// so the two targets cannot drift.
//
// Every path is resolved against REPO_ROOT rather than against `root`, because
// `root` is no longer the repository.

export default defineConfig({
  ...grythShared(),
  // The entry directory. `entries/gyld/index.html` is what Vite serves at `/`
  // and what `vite build` emits, so nothing has to rewrite an entry name.
  root: resolve(REPO_ROOT, 'entries/gyld'),
  // The repository's own public/ — favicon and wallpapers. Both targets ship
  // the same assets; only the plugin list differs.
  publicDir: resolve(REPO_ROOT, 'public'),
  build: {
    // Beside dist/ rather than under the entry directory: the two targets are
    // peers, and `grazel --ui dist-gyld` should name a top-level directory.
    outDir: resolve(REPO_ROOT, 'dist-gyld'),
    // outDir is outside `root`, so Vite will not clear it without being told.
    emptyOutDir: true,
  },
})
