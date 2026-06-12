// Preset desktop themes. Full theme editing is deliberately out of scope —
// these are coherent presets whose CSS variables drive everything downstream
// (borders/tints derive from the text colour via currentColor mixes, accent
// drives focus highlights, thumbnails, snap previews).

export type ThemeId = 'light' | 'dark' | 'nord' | 'solar';

export interface ThemeDef {
  label: string;
  scheme: 'light' | 'dark';
  vars: {
    '--bg': string;      // desktop canvas behind windows
    '--panel': string;   // sidebar
    '--win': string;     // window / menu / dock surfaces
    '--text': string;    // foreground; borders & tints derive from it
    '--accent': string;  // focus, current desktop, snap preview
  };
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  light: {
    label: 'Graphite Light',
    scheme: 'light',
    vars: {
      '--bg': '#e6e7ea',
      '--panel': '#dcdee3',
      '--win': '#f5f6f8',
      '--text': '#2b2e33',
      '--accent': '#4f7fe0',
    },
  },
  dark: {
    label: 'Graphite Dark',
    scheme: 'dark',
    vars: {
      '--bg': '#1f2125',
      '--panel': '#26282d',
      '--win': '#2c2f34',
      '--text': '#d6d8dd',
      '--accent': '#6f9bff',
    },
  },
  nord: {
    label: 'Nord',
    scheme: 'dark',
    vars: {
      '--bg': '#2e3440',
      '--panel': '#353c4a',
      '--win': '#3b4252',
      '--text': '#e5e9f0',
      '--accent': '#88c0d0',
    },
  },
  solar: {
    label: 'Solarized Light',
    scheme: 'light',
    vars: {
      '--bg': '#eee8d5',
      '--panel': '#e4ddc4',
      '--win': '#fdf6e3',
      '--text': '#586e75',
      '--accent': '#268bd2',
    },
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

// Default wallpaper per colour scheme (served from public/wallpapers/).
// A custom URL in settings overrides; unticking "theme wallpaper" disables.
export const SCHEME_WALLPAPERS: Record<ThemeDef['scheme'], string> = {
  light: '/wallpapers/gryth_light.jpeg',
  dark: '/wallpapers/gryth_dark.jpeg',
};
