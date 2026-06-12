import { defineGrip } from './runtime';

// Doc scope: shared collaboration state (the "google-docs document").
// Mock-backed today; the gryth provider registers the same grips later.
export const WORKSPACE_NAME = defineGrip<string>('Doc.WorkspaceName', '');
