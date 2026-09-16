import type { ToolId } from '@grythjs/plugin-api';

// The tool ids this plugin advertises (spec section 2). They are the KEYS of
// the tools record in src/index.ts and the `toolId` of every link written from
// inside the plugin, so they are named once here rather than spelled out at
// each call site where a typo would open nothing.
//
// An id is NOT a label. What a launcher shows is the `label` beside each id in
// src/index.ts, and those were renamed plain — `Graph`, `Streams`, `Details`,
// `Next up` (GyldUiSimplification.md 2.3, owner ruling U5 of 2026-09-16). The
// ids below did not change and must not: a stored desk layout, a wire between
// two tabs and every link this plugin writes all resolve by them.

export const GYLD_BROWSER_TOOL: ToolId = 'gyld.browser';
export const GYLD_DETAIL_TOOL: ToolId = 'gyld.detail';
export const GYLD_DECIDE_NOW_TOOL: ToolId = 'gyld.decidenow';
export const GYLD_STREAMS_TOOL: ToolId = 'gyld.streams';
export const GYLD_DECIDE_TOOL: ToolId = 'gyld.decide';
export const GYLD_DIFF_TOOL: ToolId = 'gyld.diff';
export const GYLD_COMPARE_TOOL: ToolId = 'gyld.compare';

/** The ask agent's window (GyldAskAgent.md section 6). Its own tool id rather
 *  than a second pane of the inspector merge, which is open question (i) of
 *  section 10 and is the owner's to close. */
export const GYLD_ASK_TOOL: ToolId = 'gyld.ask';

/**
 * The `role` each tool advertises: the KIND of pane it belongs in, named
 * once here and read by the desktop when a desk is locked
 * (`ops.dockingHome` — a designation on the preset still wins, and a role no
 * preset has an area for falls back).
 *
 * These are the areas of the Gyld desk (`packages/desktop/src/foundations.ts`,
 * GYLD): the stream tree is the SELECTOR on the left, what you read is on the
 * `stage`, what wants a decision now is the `pulse` under it, and what the
 * stage's selection IS — the record, and the ruling being written about it —
 * is the `inspector` on the right. On a preset without those areas (HUB) a
 * gyld window still lands on the fallback.
 */
export const STREAMS_ROLE = 'explorer';
export const BROWSER_ROLE = 'stage';
export const COMPARE_ROLE = 'stage';
export const DIFF_ROLE = 'stage';
export const DECIDE_NOW_ROLE = 'pulse';
export const DETAIL_ROLE = 'inspector';
export const DECIDE_ROLE = 'inspector';
// What the stage's record IS, asked about: the ask window belongs beside the
// record and the ruling being written about it (GyldAskAgent.md section 6).
export const ASK_ROLE = 'inspector';
