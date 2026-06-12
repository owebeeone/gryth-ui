// @grythjs/plugin-api — the bidirectional plugin contract (see
// dev-docs/GrythPluginContract.md). Hosts the shared grip runtime (one
// GripRegistry per app — every package mints grips through THIS
// defineGrip), the contract-surface grips, and the plugin registry tap.
export { registry, defineGrip, grok, main } from './runtime';
export * from './grips';
export * from './registry';
