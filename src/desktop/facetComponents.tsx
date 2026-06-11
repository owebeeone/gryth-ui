import { useGrip } from '@owebeeone/grip-react';
import { WORKSPACE_NAME } from '../grips';
import {
  DESKTOP_THEME, DESKTOP_THEME_TAP,
  DESKTOP_WALLPAPER, DESKTOP_WALLPAPER_TAP,
  DESKTOP_WALLPAPER_THEMED, DESKTOP_WALLPAPER_THEMED_TAP,
} from '../grips.desktop';
import { THEMES, THEME_IDS } from './themes';

// Facet components are ordinary grip components — they render content and
// talk to their own grips. They know nothing about windows or the desktop;
// all desktop behavior (drag, resize, z-order, focus, minimize) lives in the
// window chrome.

export function WelcomeFacet() {
  const workspace = useGrip(WORKSPACE_NAME);
  return (
    <div className="facet-pad">
      <h2>gryth</h2>
      <p>
        Workspace <strong>{workspace}</strong>. Every window here is a row in
        the <code>Desktop.Windows</code> grip — environ state. Move one, and
        you are editing a document an agent could edit too.
      </p>
    </div>
  );
}

export function ChatFacet() {
  return <div className="facet-pad">Chat — first real facet, to be built.</div>;
}

export function TerminalFacet() {
  return <div className="facet-pad">Terminal — waiting on flow-type design.</div>;
}

export function DiffFacet() {
  return <div className="facet-pad">Diff — waiting on endpoint design.</div>;
}

export function SettingsFacet() {
  const theme = useGrip(DESKTOP_THEME) ?? 'light';
  const themeTap = useGrip(DESKTOP_THEME_TAP);
  const wallpaper = useGrip(DESKTOP_WALLPAPER) ?? '';
  const wallpaperTap = useGrip(DESKTOP_WALLPAPER_TAP);
  const wallpaperThemed = useGrip(DESKTOP_WALLPAPER_THEMED) ?? true;
  const wallpaperThemedTap = useGrip(DESKTOP_WALLPAPER_THEMED_TAP);
  return (
    <div className="facet-pad settings-facet">
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
