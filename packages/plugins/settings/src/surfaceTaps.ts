import { BaseTap, type Grip, type GripContext, type Grok } from '@owebeeone/grip-react';
import type { Fill, GladeDestination, GlialBinder } from '@owebeeone/glial-runtime';
import { glialTap, type GlialTap } from '@owebeeone/glial-runtime/grip';
import { defineManifest } from '@owebeeone/glial-runtime/manifest';
import {
  DESKTOP_FONT_SCALE, DESKTOP_FONT_SCALE_TAP, DESKTOP_THEME, DESKTOP_THEME_TAP,
  DESKTOP_WALLPAPER, DESKTOP_WALLPAPER_TAP, DESKTOP_WALLPAPER_THEMED,
  DESKTOP_WALLPAPER_THEMED_TAP, DESKTOP_ZOOM, DESKTOP_ZOOM_TAP,
} from '@grythjs/desktop';
import {
  APPEARANCE_VERSION, AppearanceHandles, appearanceManifest, selfKey,
  type Appearance, type AppearanceController, type Schedule,
} from './appearance';
import { APPEARANCE_FOLLOWS, APPEARANCE_VALUE } from './grips';
import type { AppearanceZone } from './migrate';
import { registerSettingsTaps } from './taps';

// Which producers a composition registers for the desk's five appearance grips
// (Glial appearance plan, Step 2.3), from parts handed in: DOM-free, and free of
// `@grythjs/glade`, so a suite drives it with fakes. `./live` hands it the page's
// session and identity.
//
// A page whose principal names a user takes the appearance from that user's
// private zone: one glial tap mounts the `value`, and a projection tap publishes
// the five grips and their handles, the same grips the desk and the settings
// window already read, so neither changes. A page that is its tab alone keeps
// the settings plugin's own atoms, and the stored desk keeps its appearance.

/** Who the page is, as far as its appearance goes (`@grythjs/glade`'s
 *  `DeskIdentity` is one). */
export interface AppearanceIdentity {
  readonly principal: string;
  readonly roams: boolean;
}

/** What `registerAppearance` builds the producers from. */
export interface AppearanceParts {
  readonly binder: GlialBinder;
  /** The glade destination of the user's zone, for the instance's fill. */
  readonly destination: (fill: Fill) => GladeDestination | undefined;
  readonly identity: AppearanceIdentity;
  /** The composition's name, which names its surface (`<entry>.appearance`). */
  readonly entry: string;
  /** What the zone is taken to hold until it holds a value. */
  readonly placeholder: Appearance;
  /** The clock the wallpaper text settles on; the tap's real one by default. */
  readonly schedule?: Schedule;
  /** Told each value the zone takes, for the browser to keep (`./migrate`). */
  readonly remember?: (value: unknown) => void;
}

/** The real clock. It runs in the projection tap, where a timer belongs
 *  (`dev-docs/CodingRules.md`). */
function timeoutSchedule(fn: () => void, ms: number): () => void {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
}

/** The five appearance grips and their handles, projected from the zone's
 *  value as the handles show it: settling wallpaper text over the value, and
 *  the placeholder where the zone holds none. */
class AppearanceProjectionTap extends BaseTap {
  private readonly handles: AppearanceHandles;

  constructor(
    controller: AppearanceController,
    schedule: Schedule,
    private readonly follows: string,
    /** Called as the zone's value changes, before the grips are published. */
    private readonly zoneChanged: () => void,
  ) {
    super({
      provides: [
        DESKTOP_THEME, DESKTOP_THEME_TAP, DESKTOP_ZOOM, DESKTOP_ZOOM_TAP,
        DESKTOP_FONT_SCALE, DESKTOP_FONT_SCALE_TAP, DESKTOP_WALLPAPER, DESKTOP_WALLPAPER_TAP,
        DESKTOP_WALLPAPER_THEMED, DESKTOP_WALLPAPER_THEMED_TAP, APPEARANCE_FOLLOWS,
      ],
      homeParamGrips: [APPEARANCE_VALUE],
    });
    this.handles = new AppearanceHandles(controller, { schedule, changed: () => this.produce() });
  }

  onAttach(home: GripContext): void {
    super.onAttach(home);
    // the zone's value resolves to the glial tap, and each change of it
    // reaches produceOnParams
    const params = this.getParamsContext();
    if (params !== undefined) {
      params.getOrCreateConsumer(APPEARANCE_VALUE);
      params.getGrok().resolver.addConsumer(params, APPEARANCE_VALUE);
    }
  }

  onDetach(): void {
    try {
      // settling wallpaper text is written, not dropped
      this.handles.flush();
    } finally {
      super.onDetach();
    }
  }

  produce(opts?: { destContext?: GripContext }): void {
    const shown = this.handles.shown();
    const handles = this.handles;
    this.publish(new Map<Grip<unknown>, unknown>([
      [DESKTOP_THEME, shown.theme], [DESKTOP_THEME_TAP, handles.theme],
      [DESKTOP_ZOOM, shown.zoom], [DESKTOP_ZOOM_TAP, handles.zoom],
      [DESKTOP_FONT_SCALE, shown.fontScale], [DESKTOP_FONT_SCALE_TAP, handles.fontScale],
      [DESKTOP_WALLPAPER, shown.wallpaper], [DESKTOP_WALLPAPER_TAP, handles.wallpaper],
      [DESKTOP_WALLPAPER_THEMED, shown.wallpaperThemed],
      [DESKTOP_WALLPAPER_THEMED_TAP, handles.wallpaperThemed],
      [APPEARANCE_FOLLOWS, this.follows],
    ]), opts?.destContext);
  }

  produceOnParams(): void {
    this.zoneChanged();
    this.produce();
  }

  produceOnDestParams(): void {}
}

/** The zone's controller as the handles use it: glial's, reading the
 *  placeholder while the zone holds no value. */
function controllerOver(zone: GlialTap<unknown>, placeholder: Appearance): AppearanceController {
  const standIn = { v: APPEARANCE_VERSION, ...placeholder };
  return {
    get: () => zone.get() ?? standIn,
    set: (value) => zone.set(value),
  };
}

/** Register the producers of the desk's five appearance grips on `grok`: the
 *  user's zone when the identity names a user, today's atoms when it does not.
 *  Returns the zone, for the one-time seed (`./migrate`), or nothing when
 *  there is none. */
export function registerAppearance(grok: Grok, parts: AppearanceParts): AppearanceZone | undefined {
  if (!parts.identity.roams) {
    registerSettingsTaps(grok);
    return undefined;
  }
  const surface = defineManifest(appearanceManifest(parts.entry)).appearance;
  const zone = glialTap<unknown>({
    binder: parts.binder,
    decl: surface,
    grip: APPEARANCE_VALUE,
    fill: { domain: parts.entry, zone: surface.zone, key: selfKey(parts.identity.principal) },
    gladeFor: parts.destination,
  });
  grok.registerTap(zone);
  grok.registerTap(new AppearanceProjectionTap(
    controllerOver(zone, parts.placeholder),
    parts.schedule ?? timeoutSchedule,
    parts.identity.principal,
    () => {
      const value = zone.get();
      if (value !== undefined) {
        parts.remember?.(value);
      }
    },
  ));
  return {
    empty: () => zone.get() === undefined,
    write: (value) => zone.set(value),
  };
}
