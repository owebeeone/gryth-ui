import { useGrip } from '@owebeeone/grip-react';
import {
  DESKTOP_THEME, DESKTOP_THEME_TAP,
  DESKTOP_WALLPAPER, DESKTOP_WALLPAPER_TAP,
  DESKTOP_WALLPAPER_THEMED, DESKTOP_WALLPAPER_THEMED_TAP,
  DESKTOP_ZOOM, DESKTOP_ZOOM_TAP,
  DESKTOP_FONT_SCALE, DESKTOP_FONT_SCALE_TAP,
  THEMES, THEME_IDS,
} from '@grythjs/desktop';

// The desktop appearance editor. A thin projection over the environ
// appearance grips: read the value, write through the handle. It edits the
// DESKTOP document, not its own state — any other view (or an agent) sees
// the same change.
export function Settings() {
  const theme = useGrip(DESKTOP_THEME) ?? 'light';
  const themeTap = useGrip(DESKTOP_THEME_TAP);
  const wallpaper = useGrip(DESKTOP_WALLPAPER) ?? '';
  const wallpaperTap = useGrip(DESKTOP_WALLPAPER_TAP);
  const wallpaperThemed = useGrip(DESKTOP_WALLPAPER_THEMED) ?? true;
  const wallpaperThemedTap = useGrip(DESKTOP_WALLPAPER_THEMED_TAP);
  const zoom = useGrip(DESKTOP_ZOOM) ?? 1;
  const zoomTap = useGrip(DESKTOP_ZOOM_TAP);
  const fontScale = useGrip(DESKTOP_FONT_SCALE) ?? 10;
  const fontScaleTap = useGrip(DESKTOP_FONT_SCALE_TAP);
  return (
    <div className="facet-pad settings-facet">
      <h3>Display</h3>
      <div className="settings-row">
        <span>Scale</span>
        <button onClick={() => zoomTap?.update((v) => Math.max(0.7, Math.round((v - 0.05) * 20) / 20))}>−</button>
        <span className="settings-val">{Math.round(zoom * 100)}%</span>
        <button onClick={() => zoomTap?.update((v) => Math.min(1.5, Math.round((v + 0.05) * 20) / 20))}>+</button>
      </div>
      <div className="settings-row">
        <span>Font scale</span>
        <button onClick={() => fontScaleTap?.update((v) => Math.max(5, Math.round((v - 0.5) * 2) / 2))}>−</button>
        <span className="settings-val">{fontScale % 1 === 0 ? fontScale : fontScale.toFixed(1)}</span>
        <button onClick={() => fontScaleTap?.update((v) => Math.min(15, Math.round((v + 0.5) * 2) / 2))}>+</button>
      </div>
      <h3>Theme</h3>
      <div className="theme-grid">
        {THEME_IDS.map((id) => {
          const t = THEMES[id];
          return (
            <button
              key={id}
              className={`theme-card${theme === id ? ' selected' : ''}`}
              onClick={() => themeTap?.set(id)}
            >
              <span className="theme-swatch" style={{ background: t.vars['--bg'] }}>
                <span className="theme-swatch-win" style={{ background: t.vars['--win'], color: t.vars['--text'] }}>Aa</span>
                <span className="theme-swatch-accent" style={{ background: t.vars['--accent'] }} />
              </span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
      <h3>Wallpaper</h3>
      <p className="settings-hint">
        One wide image, panned continuously across the desktops.
      </p>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={wallpaperThemed}
          onChange={(e) => wallpaperThemedTap?.set(e.target.checked)}
        />
        Use the theme&apos;s wallpaper
      </label>
      <input
        type="text"
        className="settings-input"
        placeholder="https://… custom image URL (overrides the theme wallpaper)"
        value={wallpaper}
        onChange={(e) => wallpaperTap?.set(e.target.value)}
      />
    </div>
  );
}
