/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
    fs: { allow: ['..', '../../wyred-wz'] },
  },
  // scripts/*.test.mjs are node check scripts (run by `npm test` directly), not vitest suites
  test: { include: ['src/**/*.test.{ts,tsx}', 'packages/**/src/**/*.test.{ts,tsx}'] },
})
