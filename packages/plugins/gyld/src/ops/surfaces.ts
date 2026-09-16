import { glialTap } from '@owebeeone/glial-runtime/grip';
import { defineManifest } from '@owebeeone/glial-runtime/manifest';
import type {
  Fill, GladeDestination, GlialBinder,
} from '@owebeeone/glial-runtime';
import type { Tap } from '@owebeeone/grip-react';
import {
  GYLD_ASK_CONVERSATION, GYLD_ASK_STREAM, GYLD_OPS_RUN_ID, GYLD_OPS_STREAM,
} from '../grips';
import {
  GYLD_ASK_ID, GYLD_DECISIONS_ID, GYLD_FILE_ID, GYLD_LENS_ID, GYLD_OUTPUT_ID,
  GYLD_SHARE, GYLD_STREAMS_ID, GYLD_STREAM_ID,
} from './verbs';
import type { GyldOutputRecord } from './ops';
import type { GyldAskRecord } from '../ask/reply';

// The glade surfaces this package mounts, as TYPED handles, and the one glial
// mount the ops path owns (step 4.3).
//
// This module imports glial, which is the client-side kernel and reads no DOM,
// and it does NOT import `@grythjs/glade`, which owns the session and reads
// `sessionStorage` at import. That is the line the whole package is written
// against: everything here is exercised by the test suite against a local
// binder with no connectivity at all, and only `src/live.ts` lights the wire.

/** The seven surfaces `grazel/apps/gyld-app.glade` declares. Referenced through
 *  these handles, never by their id strings (the P0.S5a compile wall). */
export const GyldSurfaces = defineManifest({
  /** A run's stdout and stderr lines, keyed by run id. */
  output: {
    id: GYLD_OUTPUT_ID, shape: 'log', share: GYLD_SHARE, domain: 'document', zone: 'commons',
  },
  /** The ask agent's reply, keyed by CONVERSATION rather than by run: one
   *  deviation from `gyld.output`'s shape, and the one that makes a
   *  conversation one fold and one mount (GyldAskAgent.md section 6). */
  ask: {
    id: GYLD_ASK_ID, shape: 'log', share: GYLD_SHARE, domain: 'document', zone: 'commons',
  },
  /** The build's `streams.json`, unkeyed. */
  streams: {
    id: GYLD_STREAMS_ID, shape: 'value', share: GYLD_SHARE, domain: 'document', zone: 'commons',
  },
  /** One stream's `stream.json`, keyed by stream id. */
  stream: {
    id: GYLD_STREAM_ID, shape: 'value', share: GYLD_SHARE, domain: 'document', zone: 'commons',
  },
  /** One stream's `decide-now.json`, keyed by stream id. */
  decisions: {
    id: GYLD_DECISIONS_ID, shape: 'value', share: GYLD_SHARE, domain: 'document', zone: 'commons',
  },
  /** A `{path, digest, bytes}` pointer, keyed `<stream>/<perspective>`. */
  lens: {
    id: GYLD_LENS_ID, shape: 'value', share: GYLD_SHARE, domain: 'document', zone: 'commons',
  },
  /** The same kind of pointer for one stream's `projection.json` (the records)
   *  or `validation.json`, keyed `<stream>/<file>`. */
  file: {
    id: GYLD_FILE_ID, shape: 'value', share: GYLD_SHARE, domain: 'document', zone: 'commons',
  },
});

/** The fill domain every gyld mount of this app uses. One app, one domain; the
 *  key is what separates a run from a run and a stream from a stream. */
export const GYLD_DOMAIN = 'gyld';

/**
 * The `gyld.output` log mount, keyed by the current run id.
 *
 * The key is a FILL PARAM (`Gyld.Ops.RunId`), which is what makes a run switch
 * a remount rather than an append to the last run's fold: a distinct run is a
 * distinct instance, exactly as the gwz plugin's output mount is
 * (`packages/plugins/gwz/src/live.ts`).
 *
 * `gladeFor` is optional so the same mount is built with a local binder and no
 * connectivity, which is how it is tested.
 */
export function gyldOutputTap(
  binder: GlialBinder,
  gladeFor?: (fill: Fill) => GladeDestination | undefined,
): Tap {
  return glialTap<GyldOutputRecord[]>({
    binder,
    decl: GyldSurfaces.output,
    grip: GYLD_OPS_STREAM,
    fill: { domain: GYLD_DOMAIN, key: { param: GYLD_OPS_RUN_ID } },
    ...(gladeFor === undefined ? {} : { gladeFor }),
  }) as unknown as Tap;
}

/**
 * The `gyld.ask` log mount, keyed by the conversation being followed.
 *
 * The same shape as the output mount above and the same reason for it: the key
 * is a FILL PARAM (`Gyld.Ask.Conversation`), so pointing the atom at another
 * conversation is a remount rather than an append to the last one's fold. What
 * differs is WHAT keys it — each turn keeps its own `run_id` on every record
 * for the audit trail, and each turn's `end` closes that turn without closing
 * the conversation, so keying by run id would need one mount per question
 * asked.
 *
 * A window still folds only its OWN conversation (`foldAskReply`): the mount
 * follows one conversation at a time, and a record naming another is dropped.
 */
export function gyldAskTap(
  binder: GlialBinder,
  gladeFor?: (fill: Fill) => GladeDestination | undefined,
): Tap {
  return glialTap<GyldAskRecord[]>({
    binder,
    decl: GyldSurfaces.ask,
    grip: GYLD_ASK_STREAM,
    fill: { domain: GYLD_DOMAIN, key: { param: GYLD_ASK_CONVERSATION } },
    ...(gladeFor === undefined ? {} : { gladeFor }),
  }) as unknown as Tap;
}
