import { addEntry } from '@grythjs/plugin-api';
import { GWZ_PLUGIN } from './grips';
import { registerGwzLive } from './live';
import { Gwz } from './Gwz';
import './gwz.css';

// @grythjs/plugin-gwz — LIVE gwz command surface over glade (GLP-0006 P1.S4):
// grazel's composed glade-gwz supplier answers (ws-razel, gwz.ops); long ops
// stream through gwz.output. Mirrors the demo's GwzPanel — shared state (one
// gwz tool), atom taps + the run-keyed output mount registered on grok.
// Importing this module IS registering.

registerGwzLive();

addEntry(GWZ_PLUGIN, {
  tools: {
    gwz: {
      label: 'Gwz',
      defaultSize: { w: 560, h: 460 },
      role: 'crew',
      windowComponent: Gwz,
    },
  },
});
