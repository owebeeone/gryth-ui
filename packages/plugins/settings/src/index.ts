import { addEntry, grok } from '@grythjs/plugin-api';
import { SETTINGS_PLUGIN } from './grips';
import { registerSettingsTaps } from './taps';
import { Settings } from './Settings';
import './settings.css';

// @grythjs/plugin-settings — the desktop appearance editor. It PRODUCES the
// environ appearance grips the shell consumes (theme, wallpaper, zoom, font
// scale); the shell ships those grips with defaults, so it renders fine
// without this plugin. Importing this module IS registering.

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
registerSettingsTaps(grok);
