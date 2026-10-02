import { defineGrip, type GrythPlugin } from '@grythjs/plugin-api';

// @grythjs/plugin-settings identity grip. The appearance GRIPS themselves
// (theme, wallpaper, zoom, font scale) belong to the DESKTOP document — the
// shell renders them — and are imported from @grythjs/desktop. This plugin
// owns their PRODUCERS (the atom taps) and the editor view. Without it the
// shell still renders: each grip falls back to its default.
export const SETTINGS_PLUGIN = defineGrip<GrythPlugin>('Settings.Plugin');

// The user's appearance value (Glial appearance plan, Step 2.3) — environ
// scope, and roamed: the one value in that user's private zone on the node, as
// glial folds it. Only the projection in ./surfaceTaps reads it; the desk and
// the settings window read the five appearance grips.
export const APPEARANCE_VALUE = defineGrip<unknown>('Settings.Appearance.Value');

// The user this page's appearance follows, when it follows one — instance
// scope: who THIS page is. Absent, the appearance stays in this browser with
// the rest of the stored desk. The settings window says which.
export const APPEARANCE_FOLLOWS = defineGrip<string>('Settings.Appearance.Follows');

/** Session desk identity and an absolute link, fixed for this page. */
export interface SessionLink { name: string; href: string }
export const DESK_SESSION = defineGrip<SessionLink | undefined>('Settings.Desk.Session');
