import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUB } from './foundations';
import { foldDocument } from './layoutDocument';
import { WRITE_DELAY_MS, layoutKey } from './layoutStorageTap';
import type { DesktopSetup } from './taps.desktop';
import type { ThemeId } from './themes';

// A target whose appearance lives elsewhere says so in its DesktopSetup, and
// the composition's one persistence session honours it (Glial appearance plan,
// Step 2.2); a target that says nothing keeps the stored desk as it was.
// registerDesktopTaps keeps ONE session per module, so each desk below is
// composed from fresh modules, against a browser whose stored desk holds a
// `nord` theme.

const KEY = layoutKey('probe');

async function composedDesk(setup: DesktopSetup) {
  vi.resetModules();
  const saved = new Map<string, string>([[KEY, JSON.stringify(foldDocument('probe', {
    current: 1, windows: [], gridMemory: {}, preset: HUB, sidebarOpen: true, sidebarWidth: 320,
    theme: 'nord', wallpaper: '', wallpaperThemed: true, zoom: 1, fontScale: 13,
  }))]]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value);
    },
    removeItem: (key: string) => {
      saved.delete(key);
    },
  });
  const { createAtomValueTap } = await import('@owebeeone/grip-react');
  const { grok } = await import('@grythjs/plugin-api');
  const { DESKTOP_THEME, DESKTOP_THEME_TAP } = await import('./grips.desktop');
  const { SidebarWidthTap, registerDesktopTaps } = await import('./taps.desktop');
  // the settings plugin's theme producer, registered before the desk as a
  // plugin's import registers it
  const theme = createAtomValueTap<ThemeId>(DESKTOP_THEME, {
    initial: 'light', handleGrip: DESKTOP_THEME_TAP,
  });
  grok.registerTap(theme);
  registerDesktopTaps(grok, { entry: 'probe', ...setup });
  grok.flush();
  return {
    theme,
    sidebarWidth: SidebarWidthTap,
    /** Move the layout, and let the write land. */
    moveTheSidebar(width: number): Record<string, unknown> {
      SidebarWidthTap.set(width);
      grok.flush();
      vi.advanceTimersByTime(WRITE_DELAY_MS);
      return JSON.parse(saved.get(KEY) ?? '{}') as Record<string, unknown>;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the stored desk of a composed target', () => {
  it('keeps the appearance for a target that says nothing, as before', async () => {
    const desk = await composedDesk({});
    expect(desk.sidebarWidth.get()).toBe(320);
    expect(desk.theme.get()).toBe('nord');
    const doc = desk.moveTheSidebar(280);
    expect((doc.appearance as Record<string, unknown>).theme).toBe('nord');
  });

  it('keeps only the layout for a target whose appearance lives elsewhere', async () => {
    const desk = await composedDesk({ persistAppearance: false });
    expect(desk.sidebarWidth.get()).toBe(320);
    expect(desk.theme.get()).toBe('light');
    const doc = desk.moveTheSidebar(280);
    expect(doc.sidebar).toEqual({ open: true, width: 280 });
    expect(doc).not.toHaveProperty('appearance');
  });
});
