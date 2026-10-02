import { GlialBinder, utf8 } from '@owebeeone/glial-runtime';
import { grok } from '@grythjs/plugin-api';
import type { LayoutStore } from '@grythjs/desktop';
import { addGladeSubscription, gladeDest } from '@grythjs/glade';
import { deskIdentity } from '@grythjs/glade/identity';
import { DEFAULT_APPEARANCE, appearanceManifest, selfKey } from './appearance';
import { AppearanceMemory } from './migrate';
import { appearanceStore } from './store';
import { registerAppearance } from './surfaceTaps';

// The settings plugin's LIVE wiring (Glial appearance plan, Steps 2.3, 2.4 and 3.1).
// THE ONLY FILE IN THIS PACKAGE THAT IMPORTS `@grythjs/glade`, for the reason
// gyld's `live.ts` gives: the glade runtime owns the one session and reads the
// desk identity as it loads, which only a page's loader resolves. Everything
// else in the package, and its suite, needs neither. A composition calls
// `registerAppearanceLive` before `boot()`, which replays the subscription
// added here, and which starts the desk's persistence: the stored desk's
// appearance is read before that rewrites it.

/** The browser's local storage, or none where site data is blocked. */
function browserStore(): LayoutStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Register this composition's appearance producers for its `entry`: the
 *  user's own zone when the page's principal names a user, subscribed so the
 *  node replays it, and seeded once from what this browser held; the settings
 *  plugin's own atoms when the page is its tab alone. `store` is the browser's
 *  storage, which a suite hands in. */
export function registerAppearanceLive(entry: string, store: LayoutStore | null = browserStore()): void {
  const identity = deskIdentity();
  const surface = appearanceManifest(entry).appearance;
  const route = {
    share: surface.share,
    gladeId: surface.id,
    shape: surface.shape,
    key: utf8(selfKey(identity.principal)),
  };
  const memory = identity.roams && store !== null
    ? new AppearanceMemory(store, entry, identity.principal)
    : undefined;
  memory?.adoptLegacy();
  const replayed = identity.roams
    ? addGladeSubscription({ share: route.share, gladeId: route.gladeId, key: route.key })
    : undefined;
  const zone = registerAppearance(grok, {
    // its own binder, over the store the loader opened (Step 3.1): the
    // runtime's shared binder stays in memory
    binder: new GlialBinder(appearanceStore(), identity.origin),
    destination: gladeDest(route),
    identity,
    entry,
    placeholder: memory?.placeholder() ?? DEFAULT_APPEARANCE,
    remember: memory === undefined ? undefined : (value) => memory.remember(value),
  });
  // Once the zone's replay is in, an empty zone gets what this browser held.
  void replayed?.then((ok) => {
    if (ok && zone !== undefined && memory !== undefined) {
      memory.seedOnce(zone);
    }
  });
}

export { sessionDesk } from './sessionDesk';
