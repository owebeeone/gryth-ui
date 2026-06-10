import type { AtomTapHandle } from '@owebeeone/grip-react';
import { defineGrip } from './runtime';

// Session scope: per-participant UI state (the "google-docs session").
// Every grip here is a candidate for delegated control — a participant or
// agent holding a session capability can drive it ("open the debugger").
export type Page = 'workspace' | 'terminal' | 'debugger';
export const CURRENT_PAGE = defineGrip<Page>('Session.CurrentPage', 'workspace');
export const CURRENT_PAGE_TAP = defineGrip<AtomTapHandle<Page>>('Session.CurrentPage.Tap');

// Doc scope: shared collaboration state (the "google-docs document").
// Mock-backed today; the gryth provider registers the same grips later.
export const WORKSPACE_NAME = defineGrip<string>('Doc.WorkspaceName', '');
