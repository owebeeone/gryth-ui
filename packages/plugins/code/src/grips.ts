import type { AtomTapHandle } from '@owebeeone/grip-react';
import { defineGrip } from '@grythjs/plugin-api';

// WTA — Workspace Temporal Address: (workspace, file path, git state). The
// explorer (a SOURCE) publishes its current WTA into its tab context; a
// wired viewer (a SINK) inherits it through the graph and renders it.
// Submodule ref vectors come later — `ref` is one branch/commit for now.
export interface WTA {
  workspace: string;
  path: string;
  ref: string;
}

// The wire's payload and the source's identity colour, published by a
// source at its tab home. A sink reads them from whatever source context is
// wired in as a parent; unwired, both resolve to defaults and the sink
// falls back to its own params.
export const WTA = defineGrip<WTA | null>('Code.WTA', null);
export const WTA_TAP = defineGrip<AtomTapHandle<WTA | null>>('Code.WTA.Tap');
export const SOURCE_ACCENT = defineGrip<string>('Code.SourceAccent', '');

// Deterministic per-source hue — two explorers feeding one diff stay
// distinguishable (the patchbay's persistent layer). Tab ids are sequential
// ("t5"), so GOLDEN-ANGLE spacing keeps successive sources ~137° apart on
// the wheel: no clustering, no collisions for a long run. Falls back to a
// hash if the seed carries no number.
export function sourceHue(seed: string): string {
  const m = seed.match(/\d+/);
  let n: number;
  if (m) {
    n = Number(m[0]);
  } else {
    n = 0;
    for (let i = 0; i < seed.length; i += 1) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `hsl(${Math.round((n * 137.508) % 360)} 70% 55%)`;
}

// Read a WTA out of an opening link's params (the seed for an explorer
// opened AT a file, and the snapshot a pinned viewer falls back to).
export function wtaFromParams(params?: Record<string, unknown>): WTA {
  const s = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
  return {
    workspace: s(params?.workspace, WORKSPACES[0]),
    path: s(params?.path, ''),
    ref: s(params?.ref, 'main'),
  };
}

// Mock workspace list for the explorer's selector — a provider tap binds
// this for real later (taps are the mock seam; the plugin is production).
export const WORKSPACES = ['gryth-ui', 'glial-dev', 'razel'];

// Mock file tree per workspace (flat paths; a real tree provider replaces it).
export const MOCK_TREE: Record<string, string[]> = {
  'gryth-ui': [
    'packages/desktop/src/Window.tsx',
    'packages/desktop/src/ops.ts',
    'packages/plugins/code/src/Explorer.tsx',
    'packages/plugins/code/src/grips.ts',
    'src/bootstrap.tsx',
  ],
  'glial-dev': [
    'grip-core/src/core/graph.ts',
    'grip-core/src/core/context.ts',
    'dev-docs/StackMap.md',
  ],
  razel: [
    'src/main.rs',
    'src/fetch.rs',
    'Cargo.toml',
  ],
};
