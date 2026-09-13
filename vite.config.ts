/// <reference types="vitest/config" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// --------------------------------------------------------------------------
// gyld-bundle and gyld-evaluator: DEV-ONLY static hosts for emitted Gyld
// output.
// --------------------------------------------------------------------------
//
// `@grythjs/plugin-gyld`'s StaticStore reads a bundle over plain HTTP: one
// GET per bundle-relative path, plus, for a stream whose record carries no
// `lenses` manifest, a GET of the lenses DIRECTORY, whose autoindex anchors
// it parses for the `*.lens.json` names. Every record of the current run does
// carry a manifest, but a bundle from a host that writes none would leave the
// perspective picker empty against a server that refuses listings. This
// middleware therefore does both, exactly as `python3 -m http.server` over the
// bundle would.
//
// TWO roots are mounted, because Gyld emits two unrelated kinds of output and
// neither is under the other: a decision-stream BUNDLE (`streams.json` and one
// directory per stream), and an evaluator RUN directory (`run.json` and one
// directory per proposal). The evaluator mount points at the directory that
// HOLDS the runs rather than at one run, because a run that skipped the
// inspector report names the sibling run that holds it (`reports.run`), and
// `gyld.compare` resolves that report as a sibling of the run it is showing.
//
// Neither directory is in this repository: they are Gyld output, they are
// large, and they live in the gyld workspace. Nothing is copied in; the
// directories are read where they already are. Point them somewhere else with
// GYLD_BUNDLE_DIR and GYLD_EVALUATOR_DIR.
//
// Dev server only. `configureServer` does not run for `vite build`, so no byte
// of this reaches a production bundle and no build depends on the directories
// being there.

/** Where the browser reaches the bundle: `http://localhost:5173/gyld-bundle`. */
const GYLD_BUNDLE_MOUNT = '/gyld-bundle/'

/** The sibling gwz workspace member that emits the bundle, relative to this
 *  repository's root. A documented default, so `pnpm dev` in the usual
 *  workspace layout needs no environment at all. */
const GYLD_BUNDLE_DEFAULT = '../../gyld-wz/gyld/artifacts/decision-streams-v6'

/** Where the browser reaches the evaluator runs:
 *  `http://localhost:5173/gyld-evaluator`, with one directory per run under
 *  it (`iroh-integration-v2/run.json`). */
const GYLD_EVALUATOR_MOUNT = '/gyld-evaluator/'

/** The directory that holds the emitted evaluator runs, in the same sibling
 *  member. Both `iroh-integration-v1` (which holds the inspector reports) and
 *  `iroh-integration-v2` (which holds `run.json` and the lens files) are under
 *  it, which is what lets a run name its sibling for the report. */
const GYLD_EVALUATOR_DEFAULT = '../../gyld-wz/gyld/artifacts'

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.dot': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** The same listing shape `python3 -m http.server` writes: one anchor per
 *  entry, named by the file name and nothing else, so `parseAutoindexNames`
 *  reads back exactly the names in THIS directory. */
function autoindex(urlPath: string, directory: string): string {
  const entries = readdirSync(directory, { withFileTypes: true })
    .map((entry) => ({
      // The trailing slash of a directory stays OUTSIDE the encoding, so the
      // link still walks; `parseAutoindexNames` drops it on the '/' it carries,
      // which is right — a directory is not a lens file.
      href: `${encodeURIComponent(entry.name)}${entry.isDirectory() ? '/' : ''}`,
      name: `${entry.name}${entry.isDirectory() ? '/' : ''}`,
    }))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
  const items = entries
    .map((entry) => `<li><a href="${escapeHtml(entry.href)}">${escapeHtml(entry.name)}</a></li>`)
    .join('\n')
  return `<!doctype html>
<title>Index of ${escapeHtml(urlPath)}</title>
<h1>Index of ${escapeHtml(urlPath)}</h1>
<ul>
${items}
</ul>
`
}

/** One read-only static mount over a directory of emitted Gyld output. The two
 *  roots differ only in where they point and what they are called, so they are
 *  one middleware with two configurations rather than two copies of it. */
function gyldStaticServer(options: {
  name: string
  mount: string
  env: string
  fallback: string
  describe: string
}): Plugin {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const configured = process.env[options.env]
  const root = resolve(
    here,
    configured === undefined || configured.trim() === '' ? options.fallback : configured.trim(),
  )
  const MOUNT = options.mount
  return {
    name: options.name,
    apply: 'serve',
    configureServer(server) {
      // Two parameters, not three: this middleware answers every request under
      // its mount and never calls `next`, so a miss stays a 404 here instead
      // of reaching Vite's SPA fallback.
      server.middlewares.use(MOUNT, (req, res) => {
        // The store's watch tick appends `?gyld_bust=...` to defeat the HTTP
        // cache, so the query is stripped before the path is resolved.
        const raw = (req.url ?? '/').split('?')[0]
        let relative: string
        try {
          relative = decodeURIComponent(raw)
        } catch {
          res.statusCode = 400
          res.end('bad percent encoding')
          return
        }
        const target = resolve(root, `.${relative}`)
        // A request must not escape the mounted root, whatever `..` it carries.
        if (target !== root && !target.startsWith(root + sep)) {
          res.statusCode = 403
          res.end('outside the mounted root')
          return
        }
        let stats: ReturnType<typeof statSync>
        try {
          stats = statSync(target)
        } catch {
          // Absence is an answer the store renders; it must never fall through
          // to Vite's SPA fallback, which would hand back index.html and the
          // contract reader would report "not valid JSON" instead.
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(
            target === root
              ? `no ${options.describe} at ${root} (set ${options.env})`
              : `no such file under ${options.describe}: ${relative}`,
          )
          return
        }
        res.setHeader('Cache-Control', 'no-store')
        if (stats.isDirectory()) {
          if (!raw.endsWith('/')) {
            res.statusCode = 301
            res.setHeader('Location', `${MOUNT.replace(/\/$/, '')}${relative}/`)
            res.end()
            return
          }
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(autoindex(join(MOUNT, relative), target))
          return
        }
        res.setHeader('Content-Type', CONTENT_TYPES[extname(target)] ?? 'application/octet-stream')
        res.end(readFileSync(target))
      })
      server.config.logger.info(`  ➜  ${options.describe}: ${MOUNT} → ${root}`)
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    gyldStaticServer({
      name: 'gyld-bundle-server',
      mount: GYLD_BUNDLE_MOUNT,
      env: 'GYLD_BUNDLE_DIR',
      fallback: GYLD_BUNDLE_DEFAULT,
      describe: 'gyld bundle',
    }),
    gyldStaticServer({
      name: 'gyld-evaluator-server',
      mount: GYLD_EVALUATOR_MOUNT,
      env: 'GYLD_EVALUATOR_DIR',
      fallback: GYLD_EVALUATOR_DEFAULT,
      describe: 'gyld evaluator runs',
    }),
  ],
  // dedupe: the wyred test mount links source from the wyred-wz sibling
  // workspace; these must resolve to THIS app's copies so there is exactly
  // one GripRegistry / grip-react / react per running app
  // (wyred-wz/dev-docs/GrythWyredUiDesignPlan.md §3.1).
  // glial-runtime / glade-decl are pnpm singletons via the `overrides` block
  // in pnpm-workspace.yaml; dedupe them here too so a future second copy
  // cannot reach the bundle. Glial is a refcounted kernel: two copies means
  // two binder/instance registries and silently unshared state.
  resolve: { dedupe: ['react', 'react-dom', '@grythjs/plugin-api', '@owebeeone/grip-react', '@owebeeone/grip-core', '@owebeeone/glial-runtime', '@owebeeone/glade-decl'] },
  optimizeDeps: { exclude: ['@owebeeone/grip-react', '@wyredjs/plugin-wyred', '@wyredjs/artifacts'] },
  server: {
    // The wyred plugin is link:'d from the wyred-wz sibling workspace and its
    // store tap imports schema JSON from wyred-contract there; allow the dev
    // server to serve files from that tree (it resolves through the symlink's
    // real path). Verification-time only for the test mount.
    // The Gyld bundle is NOT reached this way: `gyldBundleServer` above reads
    // it directly, so no fs.allow entry points outside the gwz workspace.
    fs: { allow: ['..', '../../wyred-wz'] },
    // `/gyld/` is GRAZEL's static path over the glade-gyld supplier's bundle
    // root, and it is what a published `gyld.lens` pointer's `path` names. A
    // page served by grazel reaches it on its own origin; a page served by
    // this dev server does not, so a glade root would list streams and draw
    // nothing. Proxying it here is what makes `pnpm dev` a complete write-path
    // runbook. The key is a REGEX, deliberately: a plain `/gyld` prefix would
    // also swallow `/gyld-bundle/` and `/gyld-evaluator/` above, which are
    // this dev server's own mounts and nothing to do with grazel.
    proxy: { '^/gyld/': { target: process.env.GRAZEL_URL ?? 'http://127.0.0.1:8080' } },
  },
  // scripts/*.test.mjs are node check scripts (run by `npm test` directly), not vitest suites
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'packages/**/src/**/*.test.{ts,tsx}'],
    // Several suites wait on an asynchronous store: a tap that reads a bundle
    // of a few dozen files and publishes as each one lands. Vitest's default
    // `expect.poll` deadline is one second and its test deadline five, which
    // are ample on an idle machine and not always ample on a loaded one, and a
    // deadline that depends on the machine is a flaky suite rather than a fast
    // one. A poll that succeeds returns at once, so the ceiling costs nothing
    // when the value arrives; the test deadline stays above the poll's so a
    // poll can actually spend its budget before the test is failed under it.
    expect: { poll: { timeout: 10000, interval: 20 } },
    testTimeout: 15000,
  },
})
