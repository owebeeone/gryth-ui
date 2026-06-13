import { defineGrip, type GrythPlugin } from '@grythjs/plugin-api';

// @grythjs/plugin-settings identity grip. The appearance GRIPS themselves
// (theme, wallpaper, zoom, font scale) belong to the DESKTOP document — the
// shell renders them — and are imported from @grythjs/desktop. This plugin
// owns their PRODUCERS (the atom taps) and the editor view. Without it the
// shell still renders: each grip falls back to its default.
export const SETTINGS_PLUGIN = defineGrip<GrythPlugin>('Settings.Plugin');
