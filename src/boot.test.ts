import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The two targets must SHARE the render.
//
// A target is an entry directory whose whole job is to choose a plugin list;
// everything after that — taps, the glade session, the React root — is
// `boot()`. This test is the guard on that: it reads the entry modules as
// source rather than importing them, because `boot` reaches `@grythjs/glade`,
// which reads `location.search` and `sessionStorage` at import and so cannot
// load in this suite's node environment (see
// `packages/plugins/gyld/src/live.ts`). Source is enough to prove the shape:
// each entry calls `boot()` and none of them mounts a React root of its own.
// An entry may hand `boot()` its DESK (the pane preset, and whether the first
// desk opens locked) — that is a target's choice like its plugin list, and it
// goes through the shared render rather than around it.

const here = fileURLToPath(new URL('.', import.meta.url));
const read = (path: string) => readFileSync(new URL(path, `file://${here}`), 'utf8');

const BOOT = read('./boot.tsx');
const ENTRIES: Record<string, string> = {
  // the full desktop: index.html -> src/main.tsx -> src/bootstrap.tsx
  'src/bootstrap.tsx': read('./bootstrap.tsx'),
  // Gyld only: entries/gyld/index.html -> entries/gyld/main.tsx
  'entries/gyld/main.tsx': read('../entries/gyld/main.tsx'),
};

describe('the shared boot', () => {
  it('owns the React root, the taps and the glade session', () => {
    expect(BOOT).toMatch(/export function boot\(desk\?: DesktopSetup\)/);
    expect(BOOT).toContain('createRoot');
    expect(BOOT).toContain('registerAllTaps(desk)');
    expect(BOOT).toContain('startGlade()');
  });

  it.each(Object.keys(ENTRIES))('%s calls boot() and renders nothing itself', (name) => {
    const source = ENTRIES[name];
    expect(source).toMatch(/import \{ boot \} from '[^']*\/boot'/);
    // bare, or with this target's desk — and nothing else
    expect(source).toMatch(/^boot\((GYLD_DESK)?\);$/m);
    // A target that mounted its own root would be a second render path, and
    // the two desktops would start drifting the moment one of them changed.
    expect(source).not.toContain('createRoot');
    expect(source).not.toContain('GripProvider');
  });
});
