// @grythjs/glade — gryth-ui's glade seam (GLP-0006 P1.S4). The one session +
// client + glial binder + bootstrap, ported from the glade demo's glial.ts /
// glade.ts into the plugin runtime. Plugins depend on this for `glial`,
// `principal`, `gladeDest`, `addGladeSubscription` and `resolveController`; the
// app calls `startGlade()` once after plugins have registered.
export {
  origin,
  principal,
  session,
  client,
  bus,
  glial,
  gladeDest,
  addGladeSubscription,
  startGlade,
  resolveController,
  GLADE_STATUS,
  GLADE_STATUS_TAP,
  type GladeStatus,
  type GladeSubscription,
} from './runtime';
