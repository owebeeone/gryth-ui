import { BaseTap, type Grip, type GripContext } from '@owebeeone/grip-react';
import {
  attempt, readComparison, readDecideNow, readEvaluatorRun, readLens, readProjection,
  readStream, readStreamDiff, readStreamsIndex, readValidation,
  type ContractResult, type GyldContractError, type GyldEvaluatorRun, type RunProposal,
} from '../contract';
import { CompareSide } from '../compare/sides';
import {
  GYLD_BUNDLE, GYLD_COMPARISON, GYLD_DECIDE_NOW, GYLD_DEST_LEFT, GYLD_DEST_PERSPECTIVE,
  GYLD_DEST_PROPOSAL, GYLD_DEST_RIGHT, GYLD_DEST_RUN, GYLD_DEST_SIDE, GYLD_DEST_STREAM,
  GYLD_DIFF, GYLD_LENS, GYLD_RUN, GYLD_SET, GYLD_STORE_RELOAD, GYLD_STORE_STATUS,
  GYLD_STREAMS, GYLD_VALIDATION,
} from '../grips';
import {
  STREAMS_INDEX_PATH, diffPath, lensPath, streamFilePath, type StreamFile,
} from './layout';
import {
  DirectoryStore, StaticStore, errorMessage,
  type GyldDirectoryHandle, type GyldStore,
} from './stores';
import { NothingPublished, ShareStore, type GyldShareProvider } from './shareStore';
import { ROOT_WAITING } from './waiting';
import {
  BUNDLE_UNSET, CENSUS_EMPTY, CENSUS_LOADING, LENS_UNSET, VALUE_LOADING, VALUE_UNSET,
  type CensusStream, type GyldBundle, type GyldFault, type GyldLensState,
  type GyldLoadStatus, type GyldRootStatus, type GyldSet, type GyldStreamsCensus,
  type GyldValue, type RootStatusKind, type StreamCollision,
} from './state';

// GyldStoreTap: the ONE tap between the bundle stores and the context graph
// (spec section 3.4). Registered once at the plugin root; no view ever sees a
// store.
//
// It owns:
//  - one GyldStore per root of Gyld.Set (static URL or picked directory; the
//    directory HANDLES are runtime-only tap state, registered by the picker's
//    gesture through setDirectoryHandle and never serialized);
//  - the census of streams and, per stream, of the perspectives its lenses
//    directory carries, published as Gyld.Streams and Gyld.Store.Status;
//  - a cache of loaded files keyed (root, bundle path), and the per
//    destination resolution of Gyld.Bundle, Gyld.Lens, Gyld.DecideNow and
//    Gyld.Validation from the window's own Gyld.Dest.* seeds;
//  - the watch tick (house rule: timers live in taps), which runs only while
//    the tap has destinations, re-censuses and re-reads cached files with
//    cache busting, and publishes only where the BYTES changed.
//
// THE FENCE: it renders what was emitted. It never derives a Gyld fact, never
// repairs a file and never substitutes a value for one that is missing. A
// file that is not there publishes as `absent`; a file that is there and does
// not read publishes as `invalid` with the contract violation attached.

export const DEFAULT_POLL_MS = 4000;

export interface TimerHost {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface GyldStoreTapOptions {
  /** Watch tick interval in milliseconds. */
  pollMs?: number;
  /** false: never start the timer. Tests drive pollOnce() by hand. */
  watch?: boolean;
  /** Injected so a test can run the real watch loop on a fake clock. */
  timers?: TimerHost;
  /** Injected so a StaticStore root can be tested with no network. */
  fetch?: (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
}

const KEY_SEP = '\u0000';

/** Where the index namespace of the RUN stores starts. A run is addressed by
 *  its own URL and is never a member of `Gyld.Set`, so its files share the one
 *  cache without colliding with a set root's indexes. */
const RUN_ROOT_BASE = 1_000_000;

/** The run index every run directory carries (spec section 7.8). */
export const RUN_INDEX_PATH = 'run.json';

interface RootRuntime {
  index: number;
  ref: GyldSet['roots'][number];
  store: GyldStore | null;
  bustStore: GyldStore | null;
  describe: string;
  status: RootStatusKind;
  error?: string;
  streams: CensusStream[] | null;
}

/** How the bytes of one bundle path become a value. */
type FileReader = (json: unknown) => unknown;

interface FileEntry {
  raw: string;
  /** Memoized so repeated produces of an unchanged file keep one identity. */
  value: GyldValue<unknown>;
}

/** The slice of grip-core's Destination this tap reads. Structural, because
 *  the concrete class is not part of grip-core's public export surface. */
interface StoreDestination {
  getContext(): GripContext | undefined;
  getGrips(): ReadonlySet<Grip<unknown>>;
  getDestinationParamValue<T>(grip: Grip<T>): T | undefined;
}

const FILE_READERS: Record<StreamFile, FileReader> = {
  record: readStream,
  projection: readProjection,
  decideNow: readDecideNow,
  validation: readValidation,
};

const BUNDLE_FILE_ORDER: StreamFile[] = ['record', 'projection', 'decideNow', 'validation'];

function faultOf(path: string, result: ContractResult<unknown>): GyldFault | undefined {
  if (result.ok) {
    return undefined;
  }
  const error = result.error as GyldContractError;
  return { path, message: error.message, code: error.code, at: error.path };
}

function valueFrom(path: string, raw: string, read: FileReader): GyldValue<unknown> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return {
      status: 'invalid',
      fault: { path, message: `not valid JSON: ${errorMessage(err)}` },
    };
  }
  const result = attempt(() => read(json));
  if (result.ok) {
    return { status: 'ok', value: result.value };
  }
  return { status: 'invalid', fault: faultOf(path, result) };
}

export class GyldStoreTap extends BaseTap {
  private readonly pollMs: number;
  private readonly watchEnabled: boolean;
  private readonly timers: TimerHost;
  private readonly fetchImpl: GyldStoreTapOptions['fetch'];

  // Every async completion is guarded by an epoch: a set change, a reload or
  // a detach bumps it and anything older is dropped on the floor.
  private epoch = 0;
  private setFingerprint = '';
  private roots: RootRuntime[] = [];
  private census: GyldStreamsCensus = CENSUS_EMPTY;
  private statuses: GyldRootStatus[] = [];
  private censusFingerprint = '';
  private statusFingerprint = '';

  private readonly files = new Map<string, FileEntry>();
  /** How each cached path reads, remembered so a re-read uses the same reader
   *  rather than guessing one back out of the path. */
  private readonly readers = new Map<string, FileReader>();
  private readonly inFlight = new Set<string>();
  private readonly bundles = new Map<string, GyldBundle>();
  // Stable identities for the states that do NOT come from a loaded file (a
  // window with no destination, a stream the census does not carry, a lens
  // still being read). Without these every produce would hand a consumer a
  // fresh object carrying the same answer, and the view would re-render for
  // nothing.
  private readonly settled = new Map<string, unknown>();
  private readonly lensStates = new WeakMap<GyldValue<unknown>, Map<string, GyldLensState>>();
  private readonly handles = new Map<string, GyldDirectoryHandle>();
  // The glade node's published shares, registered by the live module when
  // there is one. Runtime-only state exactly as a directory handle is: a
  // provider is a live mount set, not something a set can carry.
  private shareProvider: GyldShareProvider | undefined;
  private unfollowShares: (() => void) | undefined;
  // The evaluator RUN stores, one per run URL, opened on demand and never
  // censused: a run has no `streams.json` and no streams, so it is not a root
  // of the set and does not appear in `Gyld.Store.Status`.
  private readonly runRoots = new Map<string, RootRuntime>();
  private readonly runByIndex = new Map<number, RootRuntime>();

  private timer: unknown = null;
  private polling = false;

  private readonly reloadFn = (): void => {
    this.reload();
  };

  /** One frozen value per key, built on first ask. */
  private once<T>(key: string, make: () => T): T {
    const held = this.settled.get(key);
    if (held !== undefined) {
      return held as T;
    }
    const built = Object.freeze(make());
    this.settled.set(key, built);
    return built;
  }

  constructor(options: GyldStoreTapOptions = {}) {
    super({
      provides: [
        GYLD_STREAMS, GYLD_STORE_STATUS, GYLD_STORE_RELOAD,
        GYLD_BUNDLE, GYLD_LENS, GYLD_DECIDE_NOW, GYLD_VALIDATION, GYLD_DIFF,
        GYLD_RUN, GYLD_COMPARISON,
      ],
      destinationParamGrips: [
        GYLD_DEST_STREAM, GYLD_DEST_PERSPECTIVE, GYLD_DEST_LEFT, GYLD_DEST_RIGHT,
        GYLD_DEST_RUN, GYLD_DEST_PROPOSAL, GYLD_DEST_SIDE,
      ],
      homeParamGrips: [GYLD_SET],
    });
    this.pollMs = options.pollMs ?? DEFAULT_POLL_MS;
    this.watchEnabled = options.watch ?? true;
    this.timers = options.timers ?? {
      setInterval: (handler, ms) => setInterval(handler, ms),
      clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    };
    this.fetchImpl = options.fetch;
  }

  // --- Tap lifecycle -------------------------------------------------------

  produce(opts?: { destContext?: GripContext }): void {
    if (opts?.destContext) {
      const destination = this.getDestination(opts.destContext);
      if (destination) {
        this.produceDest(destination as unknown as StoreDestination);
      }
      return;
    }
    for (const destination of this.destinations()) {
      this.produceDest(destination);
    }
  }

  produceOnParams(paramGrip: Grip<unknown>): void {
    if (paramGrip !== (GYLD_SET as unknown as Grip<unknown>)) {
      return;
    }
    this.applySet(this.paramDrips.get(GYLD_SET)?.get() as GyldSet | undefined);
  }

  produceOnDestParams(destContext: GripContext | undefined): void {
    if (destContext) {
      this.produce({ destContext });
    } else {
      this.produce();
    }
  }

  onConnect(dest: GripContext, grip: Grip<unknown>): void {
    super.onConnect(dest, grip);
    this.maybeStartWatch();
  }

  onDisconnect(dest: GripContext, grip: Grip<unknown>): void {
    super.onDisconnect(dest, grip);
    if ((this.producer?.getDestinations().size ?? 0) === 0) {
      this.stopWatch();
    }
  }

  onDetach(): void {
    this.stopWatch();
    this.unfollowShares?.();
    this.unfollowShares = undefined;
    this.epoch += 1;
    this.files.clear();
    this.inFlight.clear();
    this.bundles.clear();
    super.onDetach();
  }

  // --- Public surface beyond the grips --------------------------------------

  /**
   * Register a picked directory for a `{ kind: 'directory', name }` root. The
   * set picker's gesture calls this: a handle is runtime-only state, so a root
   * whose handle is not registered reports a loud `error` status rather than
   * quietly reading nothing.
   */
  setDirectoryHandle(name: string, handle: GyldDirectoryHandle): void {
    this.handles.set(name, handle);
    const rebuilt = new Set<number>();
    this.roots = this.roots.map((root) => {
      if (root.ref.kind !== 'directory' || root.ref.name !== name) {
        return root;
      }
      rebuilt.add(root.index);
      return this.makeRoot(root.ref, root.index);
    });
    if (rebuilt.size === 0) {
      return;
    }
    // The store behind the existing cache keys just changed, so anything still
    // in flight against the old handle must not be allowed to publish.
    this.epoch += 1;
    const epoch = this.epoch;
    this.inFlight.clear();
    for (const key of [...this.files.keys()]) {
      if (rebuilt.has(Number(key.slice(0, key.indexOf(KEY_SEP))))) {
        this.files.delete(key);
      }
    }
    this.bundles.clear();
    void this.refreshCensus(epoch, { bust: false, quiet: false });
  }

  /**
   * Register (or retire) the glade node's published shares. The live module
   * calls this once; a composition with no glade never calls it, and a
   * `{ kind: 'share' }` root then reads as a loud error rather than as a
   * bundle with nothing in it.
   *
   * A provider is runtime-only state, exactly as a directory handle is: it is
   * a set of live mounts, not something `Gyld.Set` could carry across a
   * reload.
   */
  setShareProvider(provider: GyldShareProvider | undefined): void {
    if (provider === this.shareProvider) {
      return;
    }
    this.unfollowShares?.();
    this.unfollowShares = undefined;
    this.shareProvider = provider;
    if (provider !== undefined) {
      this.unfollowShares = provider.onChange(() => {
        this.refreshShares();
      });
    }
    const rebuilt = new Set<number>();
    this.roots = this.roots.map((root) => {
      if (root.ref.kind !== 'share') {
        return root;
      }
      rebuilt.add(root.index);
      return this.makeRoot(root.ref, root.index);
    });
    if (rebuilt.size === 0) {
      this.publishShared();
      return;
    }
    this.epoch += 1;
    const epoch = this.epoch;
    this.inFlight.clear();
    for (const key of [...this.files.keys()]) {
      if (rebuilt.has(Number(key.slice(0, key.indexOf(KEY_SEP))))) {
        this.files.delete(key);
      }
    }
    this.bundles.clear();
    void this.refreshCensus(epoch, { bust: false, quiet: false });
  }

  /**
   * A published value changed, so read the shares again. Only the share roots:
   * a desk holding a static root beside a glade node must not re-fetch that
   * host every time a build lands.
   */
  refreshShares(): void {
    const indexes = new Set(
      this.roots.filter((root) => root.ref.kind === 'share').map((root) => root.index),
    );
    if (indexes.size === 0) {
      return;
    }
    const stale = [...this.files.keys()].filter(
      (key) => indexes.has(Number(key.slice(0, key.indexOf(KEY_SEP)))),
    );
    for (const key of stale) {
      this.files.delete(key);
    }
    this.bundles.clear();
    const epoch = this.epoch;
    void this.refreshCensus(epoch, { bust: false, quiet: true }).then(() => {
      if (epoch !== this.epoch) {
        return;
      }
      for (const key of stale) {
        const separator = key.indexOf(KEY_SEP);
        this.ensureLoad(Number(key.slice(0, separator)), key.slice(separator + 1), false);
      }
      this.produce();
    });
  }

  /** Drop every cached file and read the whole set again with cache busting. */
  reload(): void {
    if (this.roots.length === 0) {
      return;
    }
    const stale = [...this.files.keys()];
    this.epoch += 1;
    const epoch = this.epoch;
    this.files.clear();
    this.inFlight.clear();
    this.bundles.clear();
    void this.refreshCensus(epoch, { bust: true, quiet: false }).then(() => {
      if (epoch !== this.epoch) {
        return;
      }
      for (const key of stale) {
        const separator = key.indexOf(KEY_SEP);
        this.ensureLoad(Number(key.slice(0, separator)), key.slice(separator + 1), true);
      }
      this.produce();
    });
  }

  /**
   * One watch tick: re-census every root and re-read every cached file, both
   * with cache busting, and publish only where the bytes changed. Public so a
   * test drives it without a clock, and so a later window-focus handler can.
   */
  async pollOnce(): Promise<void> {
    if (this.polling || !this.homeContext) {
      return;
    }
    this.polling = true;
    const epoch = this.epoch;
    try {
      await this.refreshCensus(epoch, { bust: true, quiet: true });
      if (epoch !== this.epoch) {
        return;
      }
      await this.rereadCached(epoch);
    } finally {
      this.polling = false;
    }
  }

  // --- The set -------------------------------------------------------------

  private applySet(set: GyldSet | undefined): void {
    const next = set ?? { roots: [] };
    const fingerprint = JSON.stringify(next.roots);
    if (fingerprint === this.setFingerprint) {
      return;
    }
    this.setFingerprint = fingerprint;
    this.epoch += 1;
    const epoch = this.epoch;
    this.files.clear();
    this.inFlight.clear();
    this.bundles.clear();
    this.roots = next.roots.map((ref, index) => this.makeRoot(ref, index));
    this.census = this.roots.length === 0 ? CENSUS_EMPTY : CENSUS_LOADING;
    this.publishShared();
    this.produce();
    if (this.roots.length > 0) {
      void this.refreshCensus(epoch, { bust: false, quiet: false });
    }
    this.maybeStartWatch();
  }

  private makeRoot(ref: GyldSet['roots'][number], index: number): RootRuntime {
    if (ref.kind === 'static') {
      const options = this.fetchImpl === undefined ? {} : { fetch: this.fetchImpl };
      return {
        index,
        ref,
        store: new StaticStore(ref.baseUrl, options),
        bustStore: new StaticStore(ref.baseUrl, { ...options, cacheBust: true }),
        describe: ref.baseUrl,
        status: 'idle',
        streams: null,
      };
    }
    if (ref.kind === 'share') {
      const provider = this.shareProvider;
      if (!provider) {
        return {
          index,
          ref,
          store: null,
          bustStore: null,
          describe: 'glade node',
          status: 'error',
          error:
            'no glade node in this composition: the gyld live module is not '
            + 'registered, so nothing is mounted on the gyld shares',
          streams: null,
        };
      }
      // A share value is already in hand when it is in hand, so there is no
      // cache to bust and one store serves both paths.
      const store = new ShareStore(provider);
      return {
        index, ref, store, bustStore: store, describe: provider.describe,
        status: 'idle', streams: null,
      };
    }
    const handle = this.handles.get(ref.name);
    if (!handle) {
      return {
        index,
        ref,
        store: null,
        bustStore: null,
        describe: ref.name,
        status: 'error',
        error:
          `no directory handle registered for "${ref.name}": directory access is `
          + 'runtime only, so pick the directory again',
        streams: null,
      };
    }
    // A directory read always goes back to the handle, so there is nothing to
    // bust and one store serves both paths.
    const store = new DirectoryStore(handle);
    return { index, ref, store, bustStore: store, describe: ref.name, status: 'idle', streams: null };
  }

  /** The root one cache index belongs to: a root of the set, or a run store. */
  private rootAt(index: number): RootRuntime | undefined {
    return index >= RUN_ROOT_BASE ? this.runByIndex.get(index) : this.roots[index];
  }

  /** The store for one run URL, opened on the first read of that run. Static
   *  only: a run is addressed by URL, and a picked directory handle has none. */
  private runRoot(url: string): RootRuntime {
    const held = this.runRoots.get(url);
    if (held) {
      return held;
    }
    const options = this.fetchImpl === undefined ? {} : { fetch: this.fetchImpl };
    const index = RUN_ROOT_BASE + this.runRoots.size;
    const root: RootRuntime = {
      index,
      ref: { kind: 'static', baseUrl: url },
      store: new StaticStore(url, options),
      bustStore: new StaticStore(url, { ...options, cacheBust: true }),
      describe: url,
      status: 'idle',
      streams: null,
    };
    this.runRoots.set(url, root);
    this.runByIndex.set(index, root);
    return root;
  }

  // --- Census --------------------------------------------------------------

  private async refreshCensus(
    epoch: number,
    opts: { bust: boolean; quiet: boolean },
  ): Promise<void> {
    if (epoch !== this.epoch) {
      return;
    }
    if (this.roots.length === 0) {
      this.census = CENSUS_EMPTY;
      this.publishShared();
      return;
    }
    if (!opts.quiet) {
      for (const root of this.roots) {
        if (root.store) {
          root.status = 'loading';
          root.error = undefined;
        }
      }
      this.publishShared();
    }
    await Promise.all(this.roots.map((root) => this.censusRoot(root, epoch, opts.bust)));
    if (epoch !== this.epoch) {
      return;
    }
    const streams: CensusStream[] = [];
    const seen = new Map<string, number[]>();
    for (const root of this.roots) {
      for (const entry of root.streams ?? []) {
        const previous = seen.get(entry.id);
        if (previous) {
          previous.push(root.index);
          continue;
        }
        seen.set(entry.id, [root.index]);
        streams.push(entry);
      }
    }
    const collisions: StreamCollision[] = [...seen.entries()]
      .filter(([, rootIndexes]) => rootIndexes.length > 1)
      .map(([id, rootIndexes]) => ({ id, rootIndexes }));
    this.census = {
      status: 'ready',
      streams,
      collisions,
      loadedAt: new Date().toISOString(),
    };
    if (this.publishShared()) {
      // A census change can re-route which root a stream resolves in.
      this.bundles.clear();
      this.produce();
    }
  }

  private async censusRoot(root: RootRuntime, epoch: number, bust: boolean): Promise<void> {
    const store = bust ? root.bustStore : root.store;
    if (!store) {
      return; // a missing handle already reads as 'error'
    }
    try {
      const raw = await store.read(STREAMS_INDEX_PATH);
      if (epoch !== this.epoch) {
        return;
      }
      const index = readStreamsIndex(JSON.parse(raw));
      if (root.ref.kind === 'share') {
        // The listing is the authority for which streams exist, so it is also
        // the authority for which keyed surfaces to ask the node to replay.
        // Nothing is subscribed before a build said the stream is there.
        this.shareProvider?.follow(index.streams.map((record) => record.id));
      }
      const entries: CensusStream[] = [];
      for (const record of index.streams) {
        const entry: CensusStream = { id: record.id, rootIndex: root.index, record };
        // The host's own manifest first: it is emitted data, it works over a
        // static host that cannot list a directory, and it carries the
        // perspectives the host decided NOT to emit with its reason. Only a
        // record without one falls back to asking the store what is there.
        const manifest = record.lenses;
        if (manifest !== undefined) {
          entry.lenses = manifest;
          entry.perspectives = manifest
            .filter((lens) => lens.emitted)
            .map((lens) => lens.perspective);
          const withheld = manifest
            .filter((lens) => !lens.emitted)
            .map((lens) => (lens.reason === undefined
              ? { perspective: lens.perspective }
              : { perspective: lens.perspective, reason: lens.reason }));
          if (withheld.length > 0) {
            entry.notEmitted = withheld;
          }
        } else {
          const perspectives = await store.listPerspectives(record.id);
          if (epoch !== this.epoch) {
            return;
          }
          if (perspectives !== null) {
            entry.perspectives = perspectives;
          }
        }
        entries.push(entry);
      }
      root.streams = entries;
      root.status = 'ready';
      root.error = undefined;
    } catch (err) {
      if (epoch !== this.epoch) {
        return;
      }
      if (err instanceof NothingPublished) {
        // Not a failure. The node answered and its shares are empty, which is
        // what a bundle root nobody has built into looks like: the root is
        // WAITING, and the windows say what for (./waiting.ts).
        root.status = ROOT_WAITING;
        root.error = undefined;
        return;
      }
      root.status = 'error';
      root.error = errorMessage(err);
      // The last good census stays: one failed tick must not blank the desk,
      // and the failure is loud through Gyld.Store.Status.
    }
  }

  /** Publish the two home values, and only when their content changed.
   *  Returns whether the CENSUS changed. */
  private publishShared(): boolean {
    this.statuses = this.roots.map((root) => {
      const status: GyldRootStatus = {
        root: root.ref,
        describe: root.describe,
        status: root.status,
        watchLive: this.timer !== null,
      };
      if (root.error !== undefined) {
        status.error = root.error;
      }
      if (root.streams !== null) {
        status.streams = root.streams.map((entry) => entry.id);
      }
      return status;
    });
    const statusFingerprint = JSON.stringify(this.statuses);
    const census = this.census;
    // loadedAt is excluded, so a quiet tick over unchanged bytes publishes
    // nothing at all.
    const censusFingerprint = census.status === 'ready'
      ? JSON.stringify({ streams: census.streams, collisions: census.collisions })
      : census.status;
    const updates = new Map<Grip<unknown>, unknown>();
    const censusChanged = censusFingerprint !== this.censusFingerprint;
    if (censusChanged) {
      this.censusFingerprint = censusFingerprint;
      updates.set(GYLD_STREAMS as unknown as Grip<unknown>, this.census);
    }
    if (statusFingerprint !== this.statusFingerprint) {
      this.statusFingerprint = statusFingerprint;
      updates.set(GYLD_STORE_STATUS as unknown as Grip<unknown>, this.statuses);
    }
    if (updates.size > 0) {
      this.publish(updates);
    }
    return censusChanged;
  }

  // --- Per destination resolution ------------------------------------------

  private destinations(): StoreDestination[] {
    return Array.from(
      (this.producer?.getDestinations().values() ?? []) as Iterable<StoreDestination>,
    );
  }

  private produceDest(dest: StoreDestination): void {
    const context = dest.getContext();
    if (!context) {
      return;
    }
    const updates = new Map<Grip<unknown>, unknown>();
    for (const grip of dest.getGrips()) {
      const value = this.valueForGrip(dest, grip);
      if (value !== undefined) {
        updates.set(grip, value);
      }
    }
    if (updates.size > 0) {
      this.publish(updates, context);
    }
  }

  private valueForGrip(dest: StoreDestination, grip: Grip<unknown>): unknown {
    if (grip === (GYLD_STREAMS as unknown as Grip<unknown>)) {
      return this.census;
    }
    if (grip === (GYLD_STORE_STATUS as unknown as Grip<unknown>)) {
      return this.statuses;
    }
    if (grip === (GYLD_STORE_RELOAD as unknown as Grip<unknown>)) {
      return this.reloadFn;
    }
    if (grip === (GYLD_BUNDLE as unknown as Grip<unknown>)) {
      return this.bundleFor(dest);
    }
    if (grip === (GYLD_LENS as unknown as Grip<unknown>)) {
      return this.lensFor(dest);
    }
    if (grip === (GYLD_DECIDE_NOW as unknown as Grip<unknown>)) {
      return this.fileFor(dest, 'decideNow');
    }
    if (grip === (GYLD_VALIDATION as unknown as Grip<unknown>)) {
      return this.fileFor(dest, 'validation');
    }
    if (grip === (GYLD_DIFF as unknown as Grip<unknown>)) {
      return this.diffFor(dest);
    }
    if (grip === (GYLD_RUN as unknown as Grip<unknown>)) {
      return this.runFor(dest);
    }
    if (grip === (GYLD_COMPARISON as unknown as Grip<unknown>)) {
      return this.comparisonFor(dest);
    }
    return undefined;
  }

  /** The destination's stream, as a census entry. `null` means the window has
   *  no destination or the census does not carry that stream; `'loading'`
   *  means the census has not landed yet. */
  private resolve(dest: StoreDestination): CensusStream | 'loading' | null {
    const stream = dest.getDestinationParamValue(GYLD_DEST_STREAM);
    if (typeof stream !== 'string' || stream === '') {
      return null;
    }
    if (this.census.status === 'loading') {
      return 'loading';
    }
    if (this.census.status !== 'ready') {
      return null;
    }
    return this.census.streams.find((entry) => entry.id === stream) ?? null;
  }

  private streamParam(dest: StoreDestination): string {
    const stream = dest.getDestinationParamValue(GYLD_DEST_STREAM);
    return typeof stream === 'string' ? stream : '';
  }

  private bundleFor(dest: StoreDestination): GyldBundle {
    const stream = this.streamParam(dest);
    if (stream === '') {
      return BUNDLE_UNSET;
    }
    const entry = this.resolve(dest);
    if (entry === 'loading') {
      return this.once(`bundle-loading${KEY_SEP}${stream}`, () => ({
        status: 'loading' as GyldLoadStatus, stream,
      }));
    }
    if (entry === null) {
      return this.once(`bundle-absent${KEY_SEP}${stream}`, () => ({
        status: 'absent' as GyldLoadStatus, stream,
      }));
    }
    const key = `${entry.rootIndex}${KEY_SEP}${stream}`;
    const held = this.bundles.get(key);
    if (held) {
      return held;
    }
    const faults: GyldFault[] = [];
    const values = new Map<StreamFile, GyldValue<unknown>>();
    let loading = false;
    for (const file of BUNDLE_FILE_ORDER) {
      const value = this.load(entry.rootIndex, streamFilePath(stream, file), FILE_READERS[file]);
      values.set(file, value);
      if (value.status === 'loading') {
        loading = true;
      }
      if (value.fault) {
        faults.push(value.fault);
      }
    }
    const record = values.get('record');
    let status: GyldLoadStatus;
    if (loading) {
      status = 'loading';
    } else if (faults.some((fault) => fault.code !== undefined)) {
      status = 'invalid';
    } else if (record?.status !== 'ok') {
      // No `stream.json` means no stream here, whatever else the directory has.
      status = 'absent';
    } else {
      status = 'ok';
    }
    const bundle: GyldBundle = { status, stream };
    if (record?.status === 'ok') {
      bundle.record = record.value as GyldBundle['record'];
    }
    const projection = values.get('projection');
    if (projection?.status === 'ok') {
      bundle.projection = projection.value as GyldBundle['projection'];
    }
    const decideNow = values.get('decideNow');
    if (decideNow?.status === 'ok') {
      bundle.decideNow = decideNow.value as GyldBundle['decideNow'];
    }
    const validation = values.get('validation');
    if (validation?.status === 'ok') {
      bundle.validation = validation.value as GyldBundle['validation'];
    }
    if (entry.perspectives !== undefined) {
      bundle.perspectives = entry.perspectives;
    }
    if (entry.notEmitted !== undefined) {
      bundle.notEmitted = entry.notEmitted;
    }
    if (entry.lenses !== undefined) {
      bundle.lenses = entry.lenses;
    }
    if (faults.length > 0) {
      bundle.faults = faults;
    }
    if (!loading) {
      // Only a settled bundle is memoized: a loading one must be rebuilt when
      // the file it is waiting for arrives.
      this.bundles.set(key, bundle);
    }
    return bundle;
  }

  private fileFor(dest: StoreDestination, file: StreamFile): GyldValue<unknown> {
    const stream = this.streamParam(dest);
    if (stream === '') {
      return VALUE_UNSET;
    }
    const entry = this.resolve(dest);
    if (entry === 'loading') {
      return VALUE_LOADING;
    }
    if (entry === null) {
      return this.once('value-absent', () => ({ status: 'absent' as GyldLoadStatus }));
    }
    return this.load(entry.rootIndex, streamFilePath(stream, file), FILE_READERS[file]);
  }

  /**
   * `Gyld.Diff` for the destination's PAIR. The diff is Gyld's own comparison,
   * read from the file the host wrote and nothing else: a pair with no emitted
   * diff publishes as `absent`, and this tap never compares two bundles to
   * make one (spec section 6.7).
   *
   * The file lives at the root of a bundle, so it is read from the root that
   * carries the LEFT stream. A pair whose two streams are in different roots
   * of a set has no one bundle to hold their diff, and reads as absent there
   * too.
   */
  private diffFor(dest: StoreDestination): GyldValue<unknown> {
    const left = this.pairParam(dest, GYLD_DEST_LEFT);
    const right = this.pairParam(dest, GYLD_DEST_RIGHT);
    if (left === '' || right === '') {
      return VALUE_UNSET;
    }
    if (this.census.status === 'loading') {
      return VALUE_LOADING;
    }
    if (this.census.status !== 'ready') {
      return this.once('value-absent', () => ({ status: 'absent' as GyldLoadStatus }));
    }
    const entry = this.census.streams.find((held) => held.id === left);
    if (entry === undefined) {
      return this.once('value-absent', () => ({ status: 'absent' as GyldLoadStatus }));
    }
    return this.load(entry.rootIndex, diffPath(left, right), readStreamDiff);
  }

  private pairParam(dest: StoreDestination, grip: typeof GYLD_DEST_LEFT): string {
    const value = dest.getDestinationParamValue(grip);
    return typeof value === 'string' ? value : '';
  }

  private lensFor(dest: StoreDestination): GyldLensState {
    // A context that names a SIDE is one pane of the compare window, whose
    // picture is a file of an evaluator run rather than of a stream bundle.
    const rawSide = dest.getDestinationParamValue(GYLD_DEST_SIDE);
    const side = typeof rawSide === 'string' ? CompareSide.byName(rawSide) : undefined;
    if (side !== undefined) {
      return this.evaluatorLens(dest, side);
    }
    const stream = this.streamParam(dest);
    const rawPerspective = dest.getDestinationParamValue(GYLD_DEST_PERSPECTIVE);
    const perspective = typeof rawPerspective === 'string' ? rawPerspective : '';
    if (stream === '' || perspective === '') {
      return LENS_UNSET;
    }
    const entry = this.resolve(dest);
    const where = `${stream}${KEY_SEP}${perspective}`;
    if (entry === 'loading') {
      return this.once(`lens-loading${KEY_SEP}${where}`, () => ({
        status: 'loading' as GyldLoadStatus, stream, perspective,
      }));
    }
    if (entry === null) {
      return this.once(`lens-absent${KEY_SEP}${where}`, () => ({
        status: 'absent' as GyldLoadStatus, stream, perspective,
      }));
    }
    const value = this.load(entry.rootIndex, lensPath(stream, perspective), readLens);
    // One state per (loaded file, destination). The file's value identity only
    // changes when its bytes do, so an unchanged lens keeps one state object.
    let byWhere = this.lensStates.get(value);
    if (!byWhere) {
      byWhere = new Map();
      this.lensStates.set(value, byWhere);
    }
    const held = byWhere.get(where);
    if (held) {
      return held;
    }
    const state: GyldLensState = { status: value.status, stream, perspective };
    if (value.value !== undefined) {
      state.value = value.value as GyldLensState['value'];
    }
    if (value.fault !== undefined) {
      state.fault = value.fault;
    }
    byWhere.set(where, state);
    return state;
  }

  // --- The evaluator runs ---------------------------------------------------

  private runParam(dest: StoreDestination): string {
    const value = dest.getDestinationParamValue(GYLD_DEST_RUN);
    return typeof value === 'string' ? value : '';
  }

  private proposalParam(dest: StoreDestination): string {
    const value = dest.getDestinationParamValue(GYLD_DEST_PROPOSAL);
    return typeof value === 'string' ? value : '';
  }

  /** `Gyld.Run`: the run's own `run.json`, read from the run's own URL. */
  private runFor(dest: StoreDestination): GyldValue<unknown> {
    const run = this.runParam(dest);
    if (run === '') {
      return VALUE_UNSET;
    }
    return this.load(this.runRoot(run).index, RUN_INDEX_PATH, readEvaluatorRun);
  }

  /** The proposal the destination names, once the run index has landed. The
   *  index is the only enumeration of a run there is, so a proposal it does
   *  not carry is absent rather than a path this tap composes. */
  private proposalFor(dest: StoreDestination): {
    root: number;
    proposal?: RunProposal;
    pending?: GyldValue<unknown>;
  } | undefined {
    const run = this.runParam(dest);
    const proposal = this.proposalParam(dest);
    if (run === '' || proposal === '') {
      return undefined;
    }
    const root = this.runRoot(run).index;
    const index = this.load(root, RUN_INDEX_PATH, readEvaluatorRun);
    if (index.status !== 'ok' || index.value === undefined) {
      // Whatever became of the index becomes of what it would have named: a
      // run that is still loading is loading, one that did not read is
      // invalid, with its own fault carried.
      return { root, pending: index };
    }
    const found = (index.value as GyldEvaluatorRun).proposals.find(
      (entry) => entry.id === proposal,
    );
    return found === undefined ? { root } : { root, proposal: found };
  }

  /** `Gyld.Comparison`: one proposal's comparison record, at the path the run
   *  index names for it. */
  private comparisonFor(dest: StoreDestination): GyldValue<unknown> {
    const found = this.proposalFor(dest);
    if (found === undefined) {
      return VALUE_UNSET;
    }
    if (found.pending !== undefined) {
      return found.pending;
    }
    if (found.proposal === undefined) {
      return this.once('value-absent', () => ({ status: 'absent' as GyldLoadStatus }));
    }
    return this.load(found.root, found.proposal.files.comparison, readComparison);
  }

  /** One side's picture of one proposal, at the path the run index names. */
  private evaluatorLens(dest: StoreDestination, side: CompareSide): GyldLensState {
    const run = this.runParam(dest);
    const proposal = this.proposalParam(dest);
    const where = `${run}${KEY_SEP}${proposal}${KEY_SEP}${side.name}`;
    const state = (status: GyldLoadStatus): GyldLensState => this.once(
      `run-lens-${status}${KEY_SEP}${where}`,
      () => ({ status, stream: '', perspective: side.name }),
    );
    const found = this.proposalFor(dest);
    if (found === undefined) {
      return LENS_UNSET;
    }
    if (found.pending !== undefined) {
      return state(found.pending.status === 'loading' ? 'loading' : 'absent');
    }
    if (found.proposal === undefined) {
      return state('absent');
    }
    const value = this.load(found.root, side.lensFile(found.proposal), readLens);
    let byWhere = this.lensStates.get(value);
    if (!byWhere) {
      byWhere = new Map();
      this.lensStates.set(value, byWhere);
    }
    const held = byWhere.get(where);
    if (held) {
      return held;
    }
    // A lens of an evaluator run belongs to a SNAPSHOT, not to a stream, so
    // the state names the side it is of where a bundle lens names the stream.
    const built: GyldLensState = { status: value.status, stream: '', perspective: side.name };
    if (value.value !== undefined) {
      built.value = value.value as GyldLensState['value'];
    }
    if (value.fault !== undefined) {
      built.fault = value.fault;
    }
    byWhere.set(where, built);
    return built;
  }

  // --- Loading -------------------------------------------------------------

  private load(rootIndex: number, path: string, read: FileReader): GyldValue<unknown> {
    const key = `${rootIndex}${KEY_SEP}${path}`;
    const held = this.files.get(key);
    if (held) {
      return held.value;
    }
    this.ensureLoad(rootIndex, path, false, read);
    return VALUE_LOADING;
  }

  private ensureLoad(rootIndex: number, path: string, bust: boolean, read?: FileReader): void {
    const key = `${rootIndex}${KEY_SEP}${path}`;
    if (read !== undefined) {
      this.readers.set(key, read);
    }
    const reader = this.readers.get(key);
    if (reader === undefined || this.inFlight.has(key) || this.files.has(key)) {
      return;
    }
    const root = this.rootAt(rootIndex);
    const store = bust ? (root?.bustStore ?? root?.store) : root?.store;
    if (!store) {
      return;
    }
    this.inFlight.add(key);
    const epoch = this.epoch;
    void (async () => {
      let entry: FileEntry;
      try {
        const raw = await store.read(path);
        entry = { raw, value: valueFrom(path, raw, reader) };
      } catch (err) {
        // Not there, or unreadable. No bytes means no value; the reason is
        // carried, and nothing is fabricated in its place.
        entry = {
          raw: '',
          value: { status: 'absent', fault: { path, message: errorMessage(err) } },
        };
      }
      this.inFlight.delete(key);
      if (epoch !== this.epoch) {
        return;
      }
      this.files.set(key, entry);
      this.invalidate(rootIndex, path);
      this.produce();
    })();
  }

  /** A file changed, so the bundle memo that folds it is no longer current. A
   *  diff is not folded into a bundle, so it invalidates nothing, and neither
   *  is anything under an evaluator run: a run is not a bundle. */
  private invalidate(rootIndex: number, path: string): void {
    if (path.startsWith('diffs/') || rootIndex >= RUN_ROOT_BASE) {
      return;
    }
    const stream = path.startsWith('streams/') ? path.split('/')[1] : undefined;
    if (stream === undefined) {
      this.bundles.clear();
      return;
    }
    this.bundles.delete(`${rootIndex}${KEY_SEP}${stream}`);
  }

  /** Re-read every cached file with cache busting; keep the held value where
   *  the bytes are identical, so an unchanged file publishes nothing. */
  private async rereadCached(epoch: number): Promise<void> {
    let changed = false;
    await Promise.all([...this.files.keys()].map(async (key) => {
      const separator = key.indexOf(KEY_SEP);
      const rootIndex = Number(key.slice(0, separator));
      const path = key.slice(separator + 1);
      const store = this.rootAt(rootIndex)?.bustStore;
      if (!store) {
        return;
      }
      let entry: FileEntry;
      try {
        const raw = await store.read(path);
        if (this.files.get(key)?.raw === raw) {
          return;
        }
        entry = { raw, value: valueFrom(path, raw, this.readers.get(key) ?? readLens) };
      } catch (err) {
        if (this.files.get(key)?.value.status === 'absent') {
          return;
        }
        entry = {
          raw: '',
          value: { status: 'absent', fault: { path, message: errorMessage(err) } },
        };
      }
      if (epoch !== this.epoch) {
        return;
      }
      this.files.set(key, entry);
      this.invalidate(rootIndex, path);
      changed = true;
    }));
    if (epoch !== this.epoch || !changed) {
      return;
    }
    this.produce();
  }

  // --- The watch loop (timers live in taps) --------------------------------

  private maybeStartWatch(): void {
    if (!this.watchEnabled || this.timer !== null) {
      return;
    }
    if ((this.producer?.getDestinations().size ?? 0) === 0) {
      return;
    }
    this.timer = this.timers.setInterval(() => {
      void this.pollOnce();
    }, this.pollMs);
    this.publishShared(); // watchLive turns true
  }

  private stopWatch(): void {
    if (this.timer === null) {
      return;
    }
    this.timers.clearInterval(this.timer);
    this.timer = null;
    this.publishShared(); // watchLive turns false
  }
}
