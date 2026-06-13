import { createAtomValueTap, type Grok } from '@owebeeone/grip-react';
import {
  DESKTOP_THEME, DESKTOP_THEME_TAP,
  DESKTOP_WALLPAPER, DESKTOP_WALLPAPER_TAP,
  DESKTOP_WALLPAPER_THEMED, DESKTOP_WALLPAPER_THEMED_TAP,
  DESKTOP_ZOOM, DESKTOP_ZOOM_TAP,
  DESKTOP_FONT_SCALE, DESKTOP_FONT_SCALE_TAP,
} from '@grythjs/desktop';

// Appearance PRODUCERS — moved out of the desktop shell, which keeps the
// grips and consumes them. Initials match the desktop document's environ
// defaults so behaviour is unchanged with the plugin loaded, and degrades to
// those same defaults without it.

export const DesktopThemeTap = createAtomValueTap(DESKTOP_THEME, {
  initial: 'light', handleGrip: DESKTOP_THEME_TAP,
});
export const DesktopWallpaperTap = createAtomValueTap(DESKTOP_WALLPAPER, {
  initial: '', handleGrip: DESKTOP_WALLPAPER_TAP,
});
export const DesktopWallpaperThemedTap = createAtomValueTap(DESKTOP_WALLPAPER_THEMED, {
  initial: true, handleGrip: DESKTOP_WALLPAPER_THEMED_TAP,
});
export const DesktopZoomTap = createAtomValueTap(DESKTOP_ZOOM, {
  initial: 1, handleGrip: DESKTOP_ZOOM_TAP,
});
export const DesktopFontScaleTap = createAtomValueTap(DESKTOP_FONT_SCALE, {
  initial: 10, handleGrip: DESKTOP_FONT_SCALE_TAP,
});

export function registerSettingsTaps(grok: Grok) {
  grok.registerTap(DesktopThemeTap);
  grok.registerTap(DesktopWallpaperTap);
  grok.registerTap(DesktopWallpaperThemedTap);
  grok.registerTap(DesktopZoomTap);
  grok.registerTap(DesktopFontScaleTap);
}
