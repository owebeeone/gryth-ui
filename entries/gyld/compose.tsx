import './plugins';
import { grok } from '@grythjs/plugin-api';
import { gyldSessionFields } from '@grythjs/plugin-gyld';
import { deskIdentity } from '@grythjs/glade/identity';
import { registerGyldLive } from '@grythjs/plugin-gyld/live';
import { sessionDesk, registerAppearanceLive } from '@grythjs/plugin-settings/live';
import { boot } from '../../src/boot';
import { GYLD_ENTRY, gyldDesk } from './desk';

// The Gyld-only target's composition root, imported by `main.tsx` once the
// page knows who it is. It is `src/compose.tsx` with a different plugin list
// and a DESK — the Gyld pane preset, locked from the first paint (`desk.ts`) —
// and nothing else: the same `boot()`.
//
// `registerGyldLive()` lights the plugin's write path over the one glade
// session — the `Gyld.Ops` handle, the run-keyed output log and the share
// provider the store reads. The APPLICATION calls it, not the plugin's own
// index, because the module it lives in imports `@grythjs/glade` (see
// `packages/plugins/gyld/src/live.ts`); the full desktop does the same from
// `src/plugins/index.ts`. It must run before `boot()`, which is what replays
// the boot subscriptions this registers.
registerGyldLive();

// The desk's appearance (Glial appearance plan, Step 2.3): the user's own zone
// when the page's principal names a user, and then the desk keeps its layout
// alone in this browser; the settings atoms, kept with the layout, when the
// page is its tab alone.
registerAppearanceLive(GYLD_ENTRY);

boot(sessionDesk(gyldDesk(deskIdentity()), undefined, gyldSessionFields(grok)));
