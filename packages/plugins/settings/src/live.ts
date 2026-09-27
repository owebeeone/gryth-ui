import { utf8 } from '@owebeeone/glial-runtime';
import { grok } from '@grythjs/plugin-api';
import { addGladeSubscription, gladeDest, glial } from '@grythjs/glade';
import { deskIdentity } from '@grythjs/glade/identity';
import { DEFAULT_APPEARANCE, appearanceManifest, selfKey } from './appearance';
import { registerAppearance } from './surfaceTaps';

// The settings plugin's LIVE wiring (Glial appearance plan, Step 2.3). THE ONLY
// FILE IN THIS PACKAGE THAT IMPORTS `@grythjs/glade`, for the reason gyld's
// `live.ts` gives: the glade runtime owns the one session and reads the desk
// identity as it loads, which only a page's loader resolves. Everything else in
// the package, and its suite, needs neither. A composition calls
// `registerAppearanceLive` before `boot()`, which replays the subscription
// added here.

/** Register this composition's appearance producers for its `entry`: the
 *  user's own zone when the page's principal names a user, and subscribe it so
 *  the node replays it; the settings plugin's own atoms when the page is its
 *  tab alone. */
export function registerAppearanceLive(entry: string): void {
  const identity = deskIdentity();
  const surface = appearanceManifest(entry).appearance;
  const route = {
    share: surface.share,
    gladeId: surface.id,
    shape: surface.shape,
    key: utf8(selfKey(identity.principal)),
  };
  if (identity.roams) {
    addGladeSubscription({ share: route.share, gladeId: route.gladeId, key: route.key });
  }
  registerAppearance(grok, {
    binder: glial,
    destination: gladeDest(route),
    identity,
    entry,
    placeholder: DEFAULT_APPEARANCE,
  });
}
