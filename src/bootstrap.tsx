import { establishDeskIdentity, pageSources } from '@grythjs/glade/identity';

// The FULL desktop target's entry after its stylesheet (`./main`): a LOADER,
// the same as `entries/gyld/main.tsx`. The principal is captured as the
// composition's modules load, so it first resolves who this page is and only
// then imports `./compose`, which holds everything else (Glial appearance
// plan, Step 1.3). Nothing else is imported up front, and `./boot.test.ts`
// holds it to that.
await establishDeskIdentity(pageSources());
await import('./compose');
