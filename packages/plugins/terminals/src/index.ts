import { addEntry, grok } from '@grythjs/plugin-api';
import { TERMINALS_PLUGIN } from './grips';
import { TerminalSessionsTap } from './mock';
import { TerminalView } from './Terminal';
import { SessionBrowser, SessionsMenuTitle } from './SessionBrowser';
import './terminals.css';

// @grythjs/plugin-terminals — terminal + session browser: one package, one
// provider seam (the session service). The contract's worked example:
// sessions carry attribution, the browser derives attached/orphaned from
// the desktop's tab links, and send-to-terminal uses the open/retarget
// intents. Importing this module IS registering.

addEntry(TERMINALS_PLUGIN, {
  tools: {
    terminal: {
      label: 'Terminal',
      defaultSize: { w: 640, h: 400 },
      role: 'pulse',
      windowComponent: TerminalView,
    },
    sessions: {
      label: 'Sessions',
      defaultSize: { w: 640, h: 360 },
      role: 'crew',
      menuTitle: SessionsMenuTitle,
      windowComponent: SessionBrowser,
    },
  },
});
grok.registerTap(TerminalSessionsTap);
