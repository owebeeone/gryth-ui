import { GripProvider } from '@owebeeone/grip-react';
import ReactDOM from 'react-dom/client';
import { grok, main } from '@grythjs/plugin-api';
import { registerAllTaps } from './taps';
// plugins self-register on module init (composition-root glob); ordering
// vs registerAllTaps is free — the registry tap registers idempotently on
// first use
import './plugins';
import App from './App';

registerAllTaps();

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <GripProvider grok={grok} context={main}>
    <App />
  </GripProvider>,
);
