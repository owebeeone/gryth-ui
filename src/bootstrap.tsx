import { boot } from './boot';
// plugins self-register on module init (composition-root glob); ordering
// vs registerAllTaps is free — the registry tap registers idempotently on
// first use
import './plugins';

// The FULL desktop target: every plugin the composition root knows about, then
// the shared render. The Gyld-only target is `entries/gyld/main.tsx`, which
// differs from this file in nothing but its plugin list.
boot();
