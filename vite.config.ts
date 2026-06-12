/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: { exclude: ['@owebeeone/grip-react'] },
  // scripts/*.test.mjs are node check scripts (run by `npm test` directly), not vitest suites
  test: { include: ['src/**/*.test.{ts,tsx}', 'packages/**/src/**/*.test.{ts,tsx}'] },
})
