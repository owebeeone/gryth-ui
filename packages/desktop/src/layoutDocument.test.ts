import { describe, expect, it } from 'vitest';
import { GYLD } from './foundations';
import type { WindowRecord } from './grips.desktop';
import {
  LAYOUT_DOCUMENT_VERSION, foldDocument, seedFrom, type DeskState,
} from './layoutDocument';

// The INTERIM desk document (./layoutDocument), which is the only part of the
// demo persistence that is worth asserting: the storage side is a try/catch
// around `localStorage`, and everything that can actually lose a reader's desk
// is in the fold and the read back.

const WINDOW: WindowRecord = {
  id: 'w1',
  tabs: [{
    id: 't1',
    facet: 'gyld.browser',
    params: { stream: 'alpha', perspective: 'decisions', preview: '', focus: '' },
  }],
  activeTab: 't1',
  x: 40,
  y: 60,
  w: 520,
  h: 380,
  minimized: false,
  desktop: 1,
  sticky: false,
  dock: { foundation: 'f1', area: 'stage' },
};

const STATE: DeskState = {
  current: 2,
  windows: [WINDOW],
  gridMemory: { 1: { def: GYLD, assignments: { w1: 'stage' } } },
  preset: GYLD,
  sidebarOpen: false,
  sidebarWidth: 260,
  theme: 'nord',
  wallpaper: 'https://example.test/wide.png',
  wallpaperThemed: false,
  zoom: 1.1,
  fontScale: 12,
};

/** Through the wire the document actually travels on, not through the object
 *  it was built as: JSON is what a reload hands back. */
function roundTrip(entry: string, state: DeskState): Partial<DeskState> | null {
  return seedFrom(JSON.parse(JSON.stringify(foldDocument(entry, state))), entry);
}

/** A stored document as untyped JSON, so a test can break one field of it. */
function stored(entry: string, state: DeskState): Record<string, unknown> {
  return JSON.parse(JSON.stringify(foldDocument(entry, state)));
}

describe('the interim desk document', () => {
  it('comes back as the values it was folded from', () => {
    expect(roundTrip('gyld', STATE)).toEqual(STATE);
  });

  it('is ignored whole when the version is not this one', () => {
    const doc = stored('gyld', STATE);
    doc.version = LAYOUT_DOCUMENT_VERSION + 1;
    expect(seedFrom(doc, 'gyld')).toBeNull();
    // and when it is not a document at all
    expect(seedFrom(null, 'gyld')).toBeNull();
    expect(seedFrom('{}', 'gyld')).toBeNull();
    expect(seedFrom([], 'gyld')).toBeNull();
  });

  it('is ignored when another entry wrote it', () => {
    // the key already separates them; this is the second line, so a copied
    // profile does not open the Gyld desk on the full desktop's windows
    expect(seedFrom(stored('desktop', STATE), 'gyld')).toBeNull();
    expect(seedFrom(stored('desktop', STATE))).not.toBeNull();
  });

  it('drops a malformed window and keeps the desk', () => {
    const doc = stored('gyld', STATE);
    const desks = doc.desks as Record<string, unknown>;
    desks.windows = [{ id: 'broken' }, ...(desks.windows as unknown[])];
    const seed = seedFrom(doc, 'gyld');
    expect(seed?.windows).toEqual([WINDOW]);
    expect(seed?.fontScale).toBe(12);
  });

  it('drops a malformed field and leaves that grip alone', () => {
    const doc = stored('gyld', STATE);
    (doc.appearance as Record<string, unknown>).fontScale = 'twelve';
    (doc.appearance as Record<string, unknown>).theme = 'chartreuse';
    (doc.sidebar as Record<string, unknown>).width = null;
    const seed = seedFrom(doc, 'gyld');
    expect(seed).not.toBeNull();
    expect(seed).not.toHaveProperty('fontScale');
    expect(seed).not.toHaveProperty('theme');
    expect(seed).not.toHaveProperty('sidebarWidth');
    // what was readable still restores
    expect(seed?.zoom).toBe(1.1);
    expect(seed?.sidebarOpen).toBe(false);
  });

  it('drops a foundation window whose layout tree is broken', () => {
    const doc = stored('gyld', STATE);
    const desks = doc.desks as Record<string, unknown>;
    desks.windows = [{ ...WINDOW, id: 'f1', foundation: { fallback: 'stage' } }];
    // half a layout would dock windows into areas that do not exist
    expect(seedFrom(doc, 'gyld')?.windows).toEqual([]);
  });

  it('keeps a tool id it does not know', () => {
    // the desktop renders MissingTool for it; dropping the window would lose a
    // reader's layout over a plugin that is merely not loaded here
    const state: DeskState = {
      ...STATE,
      windows: [{ ...WINDOW, tabs: [{ id: 't1', facet: 'nobody.knows' }] }],
    };
    expect(roundTrip('gyld', state)?.windows?.[0].tabs[0].facet).toBe('nobody.knows');
  });
});
