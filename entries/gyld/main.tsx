import '../../src/index.css';
import './plugins';
import { registerGyldLive } from '@grythjs/plugin-gyld/live';
import { boot } from '../../src/boot';
import { GYLD_DESK } from './desk';

// The Gyld-only target's composition root (`pnpm dev:gyld`,
// `vite.gyld.config.ts`). It is `src/bootstrap.tsx` with a different plugin
// list and a DESK — the Gyld pane preset, locked from the first paint
// (`desk.ts`) — and nothing else: the same stylesheet, the same `boot()`.
//
// `registerGyldLive()` lights the plugin's write path over the one glade
// session — the `Gyld.Ops` handle, the run-keyed output log and the share
// provider the store reads. The APPLICATION calls it, not the plugin's own
// index, because the module it lives in imports `@grythjs/glade` (see
// `packages/plugins/gyld/src/live.ts`); the full desktop does the same from
// `src/plugins/index.ts`. It must run before `boot()`, which is what replays
// the boot subscriptions this registers.
registerGyldLive();

boot(GYLD_DESK);
