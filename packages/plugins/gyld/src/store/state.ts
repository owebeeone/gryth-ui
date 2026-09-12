import type {
  GyldDecideNow, GyldLens, GyldProjection, GyldStream, GyldValidation,
} from '../contract';

// The values the store tap publishes. Every one of them makes ABSENCE a
// rendered state (spec section 3.4: "Absence is a rendered state, never a
// default"), so no consumer has to ask whether an empty value means "nothing
// there" or "not read yet".

/** Where one bundle is read from. A directory handle is runtime-only state
 *  held by the tap, so the set carries the picked directory's NAME, never the
 *  handle, and a reloaded desktop asks for the directory again. */
export type GyldRootRef =
  | { kind: 'static'; baseUrl: string }
  | { kind: 'directory'; name: string };

export interface GyldSet {
  roots: GyldRootRef[];
}

export const EMPTY_SET: GyldSet = Object.freeze({ roots: [] });

export type RootStatusKind = 'idle' | 'loading' | 'ready' | 'error';

export interface GyldRootStatus {
  root: GyldRootRef;
  /** What the store reads from, for the status line. */
  describe: string;
  status: RootStatusKind;
  /** Whether the tap's watch tick is running. */
  watchLive: boolean;
  error?: string;
  /** The stream ids this root censused, once it has. */
  streams?: string[];
}

export interface CensusStream {
  id: string;
  /** Which root of the set this stream was found in. */
  rootIndex: number;
  /** The record from `streams.json`, verbatim. */
  record: GyldStream;
  /** The perspectives this stream carries, from the stream record's own
   *  `lenses` manifest when it has one and from the store's directory listing
   *  when it does not. ABSENT means neither was available (a plain static host
   *  with no autoindex and a record with no manifest), which is not the same
   *  as a stream with no lenses. */
  perspectives?: string[];
  /** The manifest entries the host marked NOT emitted, with its own reason.
   *  Shown as "not emitted", never filtered away (spec section 3.5). */
  notEmitted?: { perspective: string; reason?: string }[];
}

export interface StreamCollision {
  id: string;
  rootIndexes: number[];
}

export type GyldStreamsCensus =
  | { status: 'empty' }
  | { status: 'loading' }
  | {
      status: 'ready';
      streams: CensusStream[];
      collisions: StreamCollision[];
      loadedAt: string;
    };

export const CENSUS_EMPTY: GyldStreamsCensus = Object.freeze({ status: 'empty' });
export const CENSUS_LOADING: GyldStreamsCensus = Object.freeze({ status: 'loading' });

/** One file that could not be turned into a value, named by its bundle path. */
export interface GyldFault {
  path: string;
  message: string;
  /** The contract violation code, when the bytes arrived and failed to read. */
  code?: string;
  /** Where inside the envelope, when the violation names a place. */
  at?: string;
}

export type GyldLoadStatus = 'unset' | 'loading' | 'absent' | 'invalid' | 'ok';

/** One loaded file. `value` is present only when `status` is `ok`. */
export interface GyldValue<T> {
  status: GyldLoadStatus;
  value?: T;
  fault?: GyldFault;
}

export const VALUE_UNSET: GyldValue<never> = Object.freeze({ status: 'unset' });
export const VALUE_LOADING: GyldValue<never> = Object.freeze({ status: 'loading' });

export interface GyldBundle {
  status: GyldLoadStatus;
  /** The destination's stream id, echoed so a view can say what it is showing
   *  without reading a second grip. Empty when the window has no destination. */
  stream: string;
  record?: GyldStream;
  projection?: GyldProjection;
  decideNow?: GyldDecideNow;
  validation?: GyldValidation;
  perspectives?: string[];
  notEmitted?: { perspective: string; reason?: string }[];
  /** Every file of this bundle that failed, in bundle path order. */
  faults?: GyldFault[];
}

export const BUNDLE_UNSET: GyldBundle = Object.freeze({ status: 'unset', stream: '' });

export interface GyldLensState extends GyldValue<GyldLens> {
  stream: string;
  perspective: string;
}

export const LENS_UNSET: GyldLensState = Object.freeze({
  status: 'unset', stream: '', perspective: '',
});
