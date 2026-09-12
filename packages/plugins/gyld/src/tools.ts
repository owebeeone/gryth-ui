import type { ToolId } from '@grythjs/plugin-api';

// The tool ids this plugin advertises (spec section 2). They are the KEYS of
// the tools record in src/index.ts and the `toolId` of every link written from
// inside the plugin, so they are named once here rather than spelled out at
// each call site where a typo would open nothing.

export const GYLD_BROWSER_TOOL: ToolId = 'gyld.browser';
export const GYLD_DETAIL_TOOL: ToolId = 'gyld.detail';
export const GYLD_DECIDE_NOW_TOOL: ToolId = 'gyld.decidenow';
export const GYLD_STREAMS_TOOL: ToolId = 'gyld.streams';
export const GYLD_DECIDE_TOOL: ToolId = 'gyld.decide';

/**
 * The `role` each tool advertises, per the table in spec section 2.
 *
 * Advisory only: packages/desktop/src/foundations.ts places a window by TOOL
 * ID through its own `designate` map and never reads `role`, so every gyld
 * window lands on the `stage` fallback today. Declared because the contract
 * asks for it and it is what a designate entry would say.
 */
export const BROWSER_ROLE = 'explorer';
export const DETAIL_ROLE = 'stage';
export const DECIDE_NOW_ROLE = 'crew';
export const STREAMS_ROLE = 'crew';
export const DECIDE_ROLE = 'stage';
