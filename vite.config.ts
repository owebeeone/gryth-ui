/// <reference types="vitest/config" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** This repository's root — the directory holding this file. Every path below
 *  is resolved against it rather than against Vite's `root`, because the
 *  second target (`vite.gyld.config.ts`) moves `root` into `entries/gyld` and
 *  a relative `server.fs.allow` entry would move with it. */
export const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url))

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
 *  workspace layout needs no environment at all.
 *
 *  v7 was the first run that emits `sources.json`, the source index the ask
 *  window resolves a record's citations against
 *  (`gyld-wz/dev-docs/ui/GyldAskAgent.md` section 5), and v8 the first whose
 *  decide-now rows say WHY a question is answerable now and not only that it
 *  is (`answerable_because`), and v9 the first built from revision 2 of the
 *  decision declaration, whose docstrings ask their decision outright and
 *  whose lens nodes carry that question as `title`. The default moves forward
 *  with each: pointed at an older run the windows would render those absences,
 *  which is correct and is not what this default is for. */
const GYLD_BUNDLE_DEFAULT = '../../gyld-wz/gyld/artifacts/decision-streams-v9'

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
  const configured = process.env[options.env]
  const root = resolve(
    REPO_ROOT,
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

/**
 * Everything the gryth TARGETS share.
 *
 * There are two entry points into this application and they differ only in
 * which plugins they import: `index.html` is the full desktop and
 * `entries/gyld/index.html` is the Gyld-only one (`vite.gyld.config.ts`,
 * `pnpm dev:gyld`). Their dev servers must behave identically — the same
 * static mounts, the same singletons, the same `/gyld/` proxy — so those
 * options are produced here once and spread into both configs, rather than
 * copied and left to drift.
 *
 * A FACTORY rather than a constant: `react()` and the two static-mount
 * middlewares are stateful plugin instances, and two Vite configs must not
 * share one.
 */
export function grythShared(): UserConfig {
  // One grazel, two proxied paths (below). `gyld-ui.py` sets GRAZEL_URL to the
  // HTTP port of the grazel it just started, so a second instance on other
  // ports proxies to ITS grazel and not to the default one.
  const grazelUrl = process.env.GRAZEL_URL ?? 'http://127.0.0.1:8080'
  return {
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
      // Two paths of GRAZEL's are proxied onto this dev server's origin, both
      // at `GRAZEL_URL` (default `http://127.0.0.1:8080`).
      //
      // `/gyld/` is grazel's static path over the glade-gyld supplier's bundle
      // root, and it is what a published `gyld.lens` pointer's `path` names. A
      // page served by grazel reaches it on its own origin; a page served by
      // this dev server does not, so a glade root would list streams and draw
      // nothing. Proxying it here is what makes `pnpm dev` a complete write-path
      // runbook. The key is a REGEX, deliberately: a plain `/gyld` prefix would
      // also swallow `/gyld-bundle/` and `/gyld-evaluator/` above, which are
      // this dev server's own mounts and nothing to do with grazel.
      //
      // `/bootstrap.json` is grazel's session-placement seam (GDL-032): the
      // body carries `node_ws`, and `@grythjs/glade` fetches it to learn which
      // node to attach to. Unproxied, this dev server answers it with the SPA
      // fallback, so the page falls back to `ws://127.0.0.1:9099` and a second
      // composition on other ports would attach to the FIRST one's node, or to
      // none. Proxied, `pnpm dev` and `pnpm dev:gyld` both follow grazel's own
      // placement. With no grazel behind it the proxy errors and the fetch does
      // not answer `ok`, which is the same path `resolveNodeWs` already takes
      // when nothing is there: the dev fallback still applies, with the proxy
      // error visible in the console.
      proxy: {
        '^/gyld/': { target: grazelUrl },
        '/bootstrap.json': { target: grazelUrl },
      },
    },
  }
}

/** The FULL desktop target: `index.html` -> `src/main.tsx`, every plugin the
 *  composition root lists. This config also carries the vitest setup for the
 *  whole repository. */
export default defineConfig({
  ...grythShared(),
  // scripts/*.test.mjs are node check scripts (run by `npm test` directly), not vitest suites
  test: {
    include: [
      'src/**/*.test.{ts,tsx}',
      'packages/**/src/**/*.test.{ts,tsx}',
      // the targets under entries/ carry their own suites — one per entry,
      // over the plugin list that entry chooses
      'entries/**/*.test.{ts,tsx}',
    ],
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
