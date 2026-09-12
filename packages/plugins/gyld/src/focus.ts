// `Gyld.Focus`: the cross-window "what are you looking at" value (spec section
// 3.2 and 3.3). It is a plugin-ROOT atom, not a per-tab seed: MDV-5 correlates
// dimensions with several windows sharing one focus, never with one overloaded
// picture, and the same value becomes a share when the write stage lands.
//
// A focus is a stream and a QUALIFIED SLOT, because the slot is the identity
// that survives a restream (spec R1) while an occurrence id does not.

export interface GyldFocus {
  stream: string;
  ref: string;
}

/** Nothing focused. Rendered as such; it is never a stand-in for a record. */
export const NO_FOCUS: GyldFocus = Object.freeze({ stream: '', ref: '' });

export function sameFocus(a: GyldFocus, b: GyldFocus): boolean {
  return a.stream === b.stream && a.ref === b.ref;
}
