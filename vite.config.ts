/// <reference types="vitest/config" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// --------------------------------------------------------------------------
// gyld-bundle: a DEV-ONLY static host for an emitted Gyld bundle.
// --------------------------------------------------------------------------
//
// `@grythjs/plugin-gyld`'s StaticStore reads a bundle over plain HTTP: one
// GET per bundle-relative path, plus — for a stream whose record carries no
// `lenses` manifest — a GET of the lenses DIRECTORY, whose autoindex anchors
// it parses for the `*.lens.json` names. The emitted `base` stream has no
// manifest, so a host that serves files and refuses listings would leave the
// perspective picker empty. This middleware therefore does both, exactly as
// `python3 -m http.server` over the bundle would.
//
// The bundle itself is NOT in this repository: it is Gyld output, it is large,
// and it lives in the gyld workspace. Nothing is copied in; the directory is
// read where it already is. Point it somewhere else with GYLD_BUNDLE_DIR.
//
// Dev server only. `configureServer` does not run for `vite build`, so no byte
// of this reaches a production bundle and no build depends on the directory
// being there.

/** Where the browser reaches the bundle: `http://localhost:5173/gyld-bundle`. */
const GYLD_BUNDLE_MOUNT = '/gyld-bundle/'

/** The sibling gwz workspace member that emits the bundle, relative to this
 *  repository's root. A documented default, so `pnpm dev` in the usual
 *  workspace layout needs no environment at all. */
const GYLD_BUNDLE_DEFAULT = '../../gyld-wz/gyld/artifacts/decision-streams-v2'

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

function gyldBundleServer(): Plugin {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const configured = process.env.GYLD_BUNDLE_DIR
  const root = resolve(
    here,
    configured === undefined || configured.trim() === '' ? GYLD_BUNDLE_DEFAULT : configured.trim(),
  )
  return {
    name: 'gyld-bundle-server',
    apply: 'serve',
    configureServer(server) {
      // Two parameters, not three: this middleware answers every request under
      // its mount and never calls `next`, so a miss stays a 404 here instead
      // of reaching Vite's SPA fallback.
      server.middlewares.use(GYLD_BUNDLE_MOUNT, (req, res) => {
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
        // A request must not escape the bundle root, whatever `..` it carries.
        if (target !== root && !target.startsWith(root + sep)) {
          res.statusCode = 403
          res.end('outside the bundle root')
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
              ? `no Gyld bundle at ${root} (set GYLD_BUNDLE_DIR)`
              : `no such bundle file: ${relative}`,
          )
          return
        }
        res.setHeader('Cache-Control', 'no-store')
        if (stats.isDirectory()) {
          if (!raw.endsWith('/')) {
            res.statusCode = 301
            res.setHeader('Location', `${GYLD_BUNDLE_MOUNT.replace(/\/$/, '')}${relative}/`)
            res.end()
            return
          }
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(autoindex(join(GYLD_BUNDLE_MOUNT, relative), target))
          return
        }
        res.setHeader('Content-Type', CONTENT_TYPES[extname(target)] ?? 'application/octet-stream')
        res.end(readFileSync(target))
      })
      server.config.logger.info(`  ➜  gyld bundle: ${GYLD_BUNDLE_MOUNT} → ${root}`)
    },
  }
}

export default defineConfig({
  plugins: [react(), gyldBundleServer()],
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
  },
  // scripts/*.test.mjs are node check scripts (run by `npm test` directly), not vitest suites
  test: { include: ['src/**/*.test.{ts,tsx}', 'packages/**/src/**/*.test.{ts,tsx}'] },
})
