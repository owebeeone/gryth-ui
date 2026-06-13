import { useGrip } from '@owebeeone/grip-react';
import { WORKSPACE_NAME } from '@grythjs/plugin-api';
import {
  DESKTOP_THEME, DESKTOP_THEME_TAP,
  DESKTOP_WALLPAPER, DESKTOP_WALLPAPER_TAP,
  DESKTOP_WALLPAPER_THEMED, DESKTOP_WALLPAPER_THEMED_TAP,
  DESKTOP_ZOOM, DESKTOP_ZOOM_TAP,
  DESKTOP_FONT_SCALE, DESKTOP_FONT_SCALE_TAP,
} from './grips.desktop';
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

export function ExplorerFacet({ params }: { params?: Record<string, unknown> }) {
  // mock file tree until the workspace tree surface lands. A link may ask
  // us to REVEAL a file ('repo::path' in params): the tree renders that
  // path expanded with the file highlighted.
  const reveal = typeof params?.reveal === 'string' ? params.reveal : '';
  if (reveal) {
    const [repo, file] = reveal.split('::');
    const segments = (file ?? '').split('/');
    const fileName = segments[segments.length - 1];
    const dirs = segments.slice(0, -1);
    return (
      <div className="facet-pad explorer-tree">
        <div className="explorer-dir">{repo}/</div>
        {dirs.map((d, i) => (
          <div key={d} className={`explorer-dir indent-${Math.min(3, i + 1)}`}>{d}/</div>
        ))}
        <div className={`explorer-file revealed indent-${Math.min(3, dirs.length + 1)}`}>{fileName}</div>
      </div>
    );
  }
  return (
    <div className="facet-pad explorer-tree">
      <div className="explorer-dir">gryth-ui/</div>
      <div className="explorer-dir indent-1">src/</div>
      <div className="explorer-dir indent-2">desktop/</div>
      <div className="explorer-file indent-3">Desktop.tsx</div>
      <div className="explorer-file indent-3">Window.tsx</div>
      <div className="explorer-file indent-3">ops.ts</div>
      <div className="explorer-file indent-2">grips.desktop.ts</div>
      <div className="explorer-file indent-2">taps.ts</div>
      <div className="explorer-dir indent-1">dev-docs/</div>
      <div className="explorer-file indent-2">CodingRules.md</div>
      <div className="explorer-file indent-1">package.json</div>
    </div>
  );
}

export function DiffFacet() {
  return <div className="facet-pad">Diff — waiting on endpoint design.</div>;
}

// Foundations render through FoundationWindow chrome; this component exists
// only to satisfy the registry contract.
export function GridFacet() {
  return <div className="facet-pad">Foundation grid.</div>;
}

export function SettingsFacet() {
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

// Rendered when no registered plugin provides the tab's tool id — partial
// clients are a defined state, not a crash (see GrythPluginContract.md).
export function MissingToolFacet({ toolId }: { toolId: string }) {
  return (
    <div className="facet-pad">
      <h2>Missing tool</h2>
      <p>No registered plugin provides <code>{toolId}</code>.</p>
    </div>
  );
}
