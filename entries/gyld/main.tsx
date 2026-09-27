import '../../src/index.css';
import { establishDeskIdentity, pageSources } from '@grythjs/glade/identity';
import { establishAppearanceStore, pageStoreSources } from '@grythjs/plugin-settings/store';

// The Gyld-only target's entry (`pnpm dev:gyld`, `vite.gyld.config.ts`): a
// LOADER. The principal is captured as the composition's modules load, so it
// first resolves who this page is — `?principal=`, else the principal grazel
// serves in `/bootstrap.json` (1.5 s at most), else the tab alone — and only
// then imports `./compose`, which holds everything else (Glial appearance
// plan, Step 1.3). Beside the identity it opens the appearance instance's
// store, the site's IndexedDB (1 s at most, else memory), which the
// composition's appearance zone is kept in (Step 3.1). Nothing else is
// imported up front, and `src/boot.test.ts` holds it to that.
const store = establishAppearanceStore(pageStoreSources());
await establishDeskIdentity(pageSources());
await store;
await import('./compose');
