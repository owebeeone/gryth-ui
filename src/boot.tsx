import { GripProvider } from '@owebeeone/grip-react';
import ReactDOM from 'react-dom/client';
import { grok, main } from '@grythjs/plugin-api';
import type { DesktopSetup } from '@grythjs/desktop';
import { startGlade } from '@grythjs/glade';
import { registerAllTaps } from './taps';
import App from './App';

// The render every gryth TARGET shares.
//
// A target is an entry directory whose whole job is to choose a plugin list:
// its `main.tsx` imports the plugins it wants — an ES import IS the
// registration — and then calls this. Everything after the plugin list is the
// same desktop, so it lives here once rather than once per entry; "which
// plugins" is the entire difference between `index.html` (the full desktop)
// and `entries/gyld/index.html` (Gyld only). See AGENTS.md, "Targets".
//
// The desktop shell needs no plugin at all: its own builtins (welcome, grid)
// and its appearance grips ship with the chrome, so a target may list one
// plugin and still render.

// A target may also say what its DESK is — which pane preset a lock opens
// and whether the first desk opens locked (see @grythjs/desktop's
// DesktopSetup). Omitted, the desk is the full desktop's: HUB, floating.
export function boot(desk?: DesktopSetup): void {
  // The registry tap registers idempotently on first use, so ordering against
  // the plugin imports that already ran is free. The desk setup rides with it:
  // the plugin list is complete by now, so a boot-time lock adopts by role.
  registerAllTaps(desk);

  // Connect to grazel's glade node (GLP-0006 P1.S4). Plugins have registered
  // their glial mounts + boot subscriptions by the time a target calls this;
  // this fetches grazel's /bootstrap.json (dev fallback ws://127.0.0.1:9099),
  // connects the one session, binds the principal, and replays the
  // subscriptions.
  void startGlade();

  const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(
    <GripProvider grok={grok} context={main}>
      <App />
    </GripProvider>,
  );
}
