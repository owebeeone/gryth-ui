import { boot } from './boot';
// plugins self-register on module init (composition-root glob); ordering
// vs registerAllTaps is free — the registry tap registers idempotently on
// first use
import './plugins';

// The FULL desktop target's composition root, imported by `./bootstrap` once
// the page knows who it is: every plugin the composition root knows about,
// then the shared render. The Gyld-only target's is `entries/gyld/compose.tsx`,
// which differs from this file in nothing but its plugin list.
boot();
