import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The two targets must SHARE the render, and each must know who the page is
// before anything captures it.
//
// A target is an entry directory whose whole job is to choose a plugin list;
// everything after that — taps, the glade session, the React root — is
// `boot()`. These tests read the modules as source rather than importing them:
// a composition reaches `@grythjs/glade`, whose runtime will not load until an
// entry's loader has resolved the desk identity, and a loader reads the page.
// Source is enough to prove the shape.
//
// Each entry is a LOADER and a COMPOSITION (Glial appearance plan, Step 1.3).
// The principal is captured as modules load, by the glade runtime and by the
// plugins' handles, so the loader resolves the identity from the URL and
// grazel's `/bootstrap.json` first, and only then imports the composition that
// holds everything else. The composition calls `boot()` and mounts no React
// root of its own. It may hand `boot()` its DESK (the pane preset, and whether
// the first desk opens locked) — that is a target's choice like its plugin
// list, and it goes through the shared render rather than around it.

const here = fileURLToPath(new URL('.', import.meta.url));
const read = (path: string) => readFileSync(new URL(path, `file://${here}`), 'utf8');
/** A module by its path from the repository root. */
const source = (path: string) => read(`../${path}`);

const BOOT = read('./boot.tsx');
const TARGETS = [
  // the full desktop: index.html -> src/main.tsx -> src/bootstrap.tsx
  { loader: 'src/bootstrap.tsx', composition: 'src/compose.tsx' },
  // Gyld only: entries/gyld/index.html -> entries/gyld/main.tsx
  { loader: 'entries/gyld/main.tsx', composition: 'entries/gyld/compose.tsx' },
];

/** The modules a file imports up front, one line each. */
const staticImports = (text: string) => text.match(/^import .*$/gm) ?? [];

describe('the shared boot', () => {
  it('owns the React root, the taps and the glade session', () => {
    expect(BOOT).toMatch(/export function boot\(desk\?: DesktopSetup\)/);
    expect(BOOT).toContain('createRoot');
    expect(BOOT).toContain('registerAllTaps(desk)');
    expect(BOOT).toContain('startGlade()');
  });

  it.each(TARGETS.map((target) => target.composition))(
    '%s calls boot() and renders nothing itself',
    (name) => {
      const text = source(name);
      expect(text).toMatch(/import \{ boot \} from '[^']*\/boot'/);
      // bare, or with this target's desk — and nothing else
      expect(text).toMatch(/^boot\((GYLD_DESK)?\);$/m);
      // A target that mounted its own root would be a second render path, and
      // the two desktops would start drifting the moment one of them changed.
      expect(text).not.toContain('createRoot');
      expect(text).not.toContain('GripProvider');
    },
  );
});

describe('each entry knows who the page is before it composes', () => {
  it.each(TARGETS)('$loader resolves the identity, then imports $composition', ({ loader }) => {
    const text = source(loader);
    // Nothing it imports up front may capture the principal: the identity
    // module and, at most, a stylesheet.
    for (const line of staticImports(text)) {
      expect(line).toMatch(/^import (\{ [^}]+ \} from '@grythjs\/glade\/identity'|'[^']+\.css');$/);
    }
    const resolves = text.indexOf('await establishDeskIdentity(pageSources());');
    const composes = text.indexOf("await import('./compose');");
    expect(resolves).toBeGreaterThanOrEqual(0);
    expect(composes).toBeGreaterThan(resolves);
    expect(text).not.toMatch(/^boot\(/m);
  });

  it('src/main.tsx imports its stylesheet and its loader, and nothing else', () => {
    expect(staticImports(source('src/main.tsx'))).toEqual([
      "import './index.css';",
      "import './bootstrap';",
    ]);
  });
});
