import { grok } from '@grythjs/plugin-api';
import { registerSettingsTaps } from '@grythjs/plugin-settings';
import { boot } from './boot';
// plugins self-register on module init (composition-root glob); ordering
// vs registerAllTaps is free — the registry tap registers idempotently on
// first use
import './plugins';

// The FULL desktop target's composition root, imported by `./bootstrap` once
// the page knows who it is: every plugin the composition root knows about,
// then the shared render. The Gyld-only target's is `entries/gyld/compose.tsx`,
// which differs from this file in its plugin list and in where its appearance
// lives.
//
// This desktop keeps its appearance in its stored desk, with its layout, so it
// registers the settings plugin's own atoms (Glial appearance plan, Step 2.3;
// moving it to the user's zone is question 9, ruled for later).
registerSettingsTaps(grok);

boot();
