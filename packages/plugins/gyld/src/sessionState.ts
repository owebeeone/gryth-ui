import type { Grok } from '@owebeeone/grip-react';
import type { SessionFields } from '@grythjs/desktop';
import { GYLD_FOCUS, GYLD_SET } from './grips';
import { GyldFocusTap, GyldSetTap } from './rootTaps';
import type { GyldRootRef } from './store/state';

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function roots(value: unknown): GyldRootRef[] {
  if (!Array.isArray(value)) { return []; }
  const result: GyldRootRef[] = [];
  for (const raw of value) {
    const root = object(raw);
    if (root.kind === 'share') { result.push({ kind: 'share' }); }
    if (root.kind === 'static' && typeof root.baseUrl === 'string') { result.push({ kind: 'static', baseUrl: root.baseUrl }); }
    if (root.kind === 'directory' && typeof root.name === 'string') { result.push({ kind: 'directory', name: root.name }); }
  }
  return result;
}

/** Session scope until promoted to a doc. Directory handles are held by the
 *  store tap, never by these JSON fields, and must be picked again per page. */
export function gyldSessionFields(grok: Grok): SessionFields {
  let held: Record<string, unknown> = {};
  return {
    read: () => ({ ...held, gyld: {
      ...object(held.gyld), roots: roots(GyldSetTap.get().roots), focus: GyldFocusTap.get(),
    } }),
    seed(value) {
      held = value;
      const state = object(value.gyld);
      if ('roots' in state) { GyldSetTap.set({ roots: roots(state.roots) }); }
      if ('focus' in state) {
        const focus = object(state.focus);
        GyldFocusTap.set({ stream: typeof focus.stream === 'string' ? focus.stream : '', ref: typeof focus.ref === 'string' ? focus.ref : '' });
      }
    },
    watch(changed) {
      grok.mainPresentationContext.getOrCreateConsumer(GYLD_SET).subscribe(() => changed());
      grok.mainPresentationContext.getOrCreateConsumer(GYLD_FOCUS).subscribe(() => changed());
    },
  };
}
