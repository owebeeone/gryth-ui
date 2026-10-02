/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { grythShared } from './vite.config';

/** Explicit slow check: real isolated nodes are required, never auto-started. */
export default defineConfig({
  ...grythShared(),
  test: {
    include: ['integration/sessionDesk.test.ts'],
    expect: { poll: { timeout: 15000, interval: 20 } },
    testTimeout: 60000,
  },
});
