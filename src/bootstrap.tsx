import { GripProvider } from '@owebeeone/grip-react';
import ReactDOM from 'react-dom/client';
import { grok, main } from './runtime';
import { registerAllTaps } from './taps';
import App from './App';

registerAllTaps();

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <GripProvider grok={grok} context={main}>
    <App />
  </GripProvider>,
);
