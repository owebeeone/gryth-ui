import { GripProvider } from '@owebeeone/grip-react';
import ReactDOM from 'react-dom/client';
import { grok, main } from '@grythjs/plugin-api';
import { startGlade } from '@grythjs/glade';
import { registerAllTaps } from './taps';
// plugins self-register on module init (composition-root glob); ordering
// vs registerAllTaps is free — the registry tap registers idempotently on
// first use
import './plugins';
import App from './App';

registerAllTaps();

// Connect to grazel's glade node (GLP-0006 P1.S4). Plugins have registered
// their glial mounts + boot subscriptions during `import './plugins'`; this
// fetches grazel's /bootstrap.json (dev fallback ws://127.0.0.1:9099), connects
// the one session, binds the principal, and replays the subscriptions.
void startGlade();

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <GripProvider grok={grok} context={main}>
    <App />
  </GripProvider>,
);
