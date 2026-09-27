import { addEntry } from '@grythjs/plugin-api';
import { SETTINGS_PLUGIN } from './grips';
import { Settings } from './Settings';
import './settings.css';

// @grythjs/plugin-settings — the desktop appearance editor. It PRODUCES the
// environ appearance grips the shell consumes (theme, wallpaper, zoom, font
// scale); the shell ships those grips with defaults, so it renders fine
// without this plugin. Importing this module registers the editor; each
// composition registers ONE set of producers (Glial appearance plan, Step
// 2.3): these atoms, kept in the stored desk, or the user's own zone through
// `@grythjs/plugin-settings/live`.

addEntry(SETTINGS_PLUGIN, {
  tools: {
    settings: {
      label: 'Settings',
      defaultSize: { w: 460, h: 440 },
      role: 'crew',
      windowComponent: Settings,
    },
  },
});

export { registerSettingsTaps } from './taps';
