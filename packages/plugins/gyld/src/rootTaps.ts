import { createAtomValueTap } from '@owebeeone/grip-react';
import { GYLD_FOCUS, GYLD_FOCUS_TAP, GYLD_SET, GYLD_SET_TAP } from './grips';
import { NO_FOCUS } from './focus';
import { EMPTY_SET } from './store/state';
import { GyldStoreTap } from './store/GyldStoreTap';
import { GyldIndexTap, GyldRecordTap } from './records/taps';

// The plugin-root taps. They live here rather than in index.ts so a gesture in
// a view can reach `gyldStoreTap.setDirectoryHandle(...)` without importing
// the registration module, which would be an import cycle.

/** The set of bundle roots. Class 1 atom, environ scope (see grips.ts). It
 *  starts EMPTY: a desk with no root shows the picker, and the plugin never
 *  invents a place to read Gyld output from. */
export const GyldSetTap = createAtomValueTap(GYLD_SET, {
  initial: EMPTY_SET,
  handleGrip: GYLD_SET_TAP,
});

/** The cross-window focus (spec section 3.2). Plugin root, not per tab: it is
 *  what several windows share to correlate dimensions (MDV-5), and it starts
 *  at nothing rather than at some record the user never picked. */
export const GyldFocusTap = createAtomValueTap(GYLD_FOCUS, {
  initial: NO_FOCUS,
  handleGrip: GYLD_FOCUS_TAP,
});

/** The one store tap for this plugin (spec section 3.4: registered once at the
 *  plugin root). Directory handles are runtime-only state on this instance. */
export const gyldStoreTap = new GyldStoreTap();

/** The two conversion taps over whatever the store tap resolved for a
 *  destination. Pure, so one instance serves every window. */
export const gyldIndexTap = new GyldIndexTap();
export const gyldRecordTap = new GyldRecordTap();
