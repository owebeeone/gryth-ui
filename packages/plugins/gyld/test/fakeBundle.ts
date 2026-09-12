import streamsIndex from './fixtures/bundle/streams.json';
import streamRecord from './fixtures/bundle/streams/base/stream.json';
import projection from './fixtures/bundle/streams/base/projection.json';
import decideNow from './fixtures/bundle/streams/base/decide-now.json';
import validation from './fixtures/bundle/streams/base/validation.json';
import architectureRecord from './fixtures/bundle/streams/architecture/stream.json';
import architectureValidation from './fixtures/bundle/streams/architecture/validation.json';
import lifecycleLens from './fixtures/bundle/streams/architecture/lenses/lifecycle.lens.json';
import allocationLens from './fixtures/bundle/streams/architecture/lenses/allocation.lens.json';
import decisionsLens from './fixtures/bundle/streams/base/lenses/decisions.lens.json';
import tiersLens from './fixtures/bundle/streams/base/lenses/tiers.lens.json';
import statusLens from './fixtures/bundle/streams/base/lenses/status.lens.json';
import branchLens from './fixtures/bundle/streams/base/lenses/branch.lens.json';
import streamARecord from './fixtures/bundle/streams/stream-a/stream.json';
import streamADecideNow from './fixtures/bundle/streams/stream-a/decide-now.json';
import streamAProjection from './fixtures/bundle/streams/stream-a/projection.json';
import streamAValidation from './fixtures/bundle/streams/stream-a/validation.json';
import streamADecisionsLens from './fixtures/bundle/streams/stream-a/lenses/decisions.lens.json';
import streamBRecord from './fixtures/bundle/streams/stream-b/stream.json';
import streamBDecideNow from './fixtures/bundle/streams/stream-b/decide-now.json';
import streamBValidation from './fixtures/bundle/streams/stream-b/validation.json';
import streamBDecisionsLens from './fixtures/bundle/streams/stream-b/lenses/decisions.lens.json';
import forkARecord from './fixtures/bundle/streams/fork-a/stream.json';
import forkADecideNow from './fixtures/bundle/streams/fork-a/decide-now.json';
import forkAValidation from './fixtures/bundle/streams/fork-a/validation.json';
import forkADecisionsLens from './fixtures/bundle/streams/fork-a/lenses/decisions.lens.json';
import neighbourhoodLens from './fixtures/bundle/streams/base/lenses/neighbourhood-key_custody.lens.json';
import baseToStreamA from './fixtures/bundle/diffs/base..stream-a.json';
import streamAToStreamB from './fixtures/bundle/diffs/stream-a..stream-b.json';
import streamAToForkA from './fixtures/bundle/diffs/stream-a..fork-a.json';
import type {
  FetchResponse, GyldDirectoryEntry, GyldDirectoryHandle, GyldFile, GyldFileHandle,
} from '../src/store/stores';

// An in-memory copy of the emitted base bundle, and the two fake hosts the
// store tests read it through. Nothing here touches the network or the disk:
// the fixture JSON is imported, re-serialized once, and served as bytes.

export const BUNDLE_FILES: Record<string, unknown> = {
  'streams.json': streamsIndex,
  'streams/base/stream.json': streamRecord,
  'streams/base/projection.json': projection,
  'streams/base/decide-now.json': decideNow,
  'streams/base/validation.json': validation,
  'streams/base/lenses/decisions.lens.json': decisionsLens,
  'streams/base/lenses/tiers.lens.json': tiersLens,
  'streams/base/lenses/status.lens.json': statusLens,
  'streams/base/lenses/branch.lens.json': branchLens,
  // One member of the parameterised `neighbourhood` family: the manifest names
  // it beside the family itself, which it marks not emitted with the reason.
  'streams/base/lenses/neighbourhood-key_custody.lens.json': neighbourhoodLens,
  // The chain over the base: stream A links the base and rules two of its
  // questions, stream B links A and reopens one of them. Stream A carries a
  // projection because the decide window needs the declared CLASS of a record
  // to compose an overlay and only the projection has it; stream B does not,
  // so it reads as a bundle whose projection is absent, which is a state the
  // store renders (test/fixtures/README.md says what was left behind and why).
  'streams/stream-a/stream.json': streamARecord,
  'streams/stream-a/decide-now.json': streamADecideNow,
  'streams/stream-a/projection.json': streamAProjection,
  'streams/stream-a/validation.json': streamAValidation,
  'streams/stream-a/lenses/decisions.lens.json': streamADecisionsLens,
  'streams/stream-b/stream.json': streamBRecord,
  'streams/stream-b/decide-now.json': streamBDecideNow,
  'streams/stream-b/validation.json': streamBValidation,
  'streams/stream-b/lenses/decisions.lens.json': streamBDecisionsLens,
  // A FORK of stream A: its parent is stream A and its chain is base, fork-a,
  // because a fork follows the base and keeps its parent as provenance.
  'streams/fork-a/stream.json': forkARecord,
  'streams/fork-a/decide-now.json': forkADecideNow,
  'streams/fork-a/validation.json': forkAValidation,
  'streams/fork-a/lenses/decisions.lens.json': forkADecisionsLens,
  // The three emitted diffs of the same run.
  'diffs/base..stream-a.json': baseToStreamA,
  'diffs/stream-a..stream-b.json': streamAToStreamB,
  'diffs/stream-a..fork-a.json': streamAToForkA,
  // The second lineage of the same bundle: an architecture stream whose
  // record carries a LENS MANIFEST, and which emits no decide-now list.
  'streams/architecture/stream.json': architectureRecord,
  'streams/architecture/validation.json': architectureValidation,
  'streams/architecture/lenses/lifecycle.lens.json': lifecycleLens,
  'streams/architecture/lenses/allocation.lens.json': allocationLens,
};

/** A mutable byte image of the bundle: a test edits one path and the watch
 *  tick sees exactly what a rebuilt bundle on disk would look like. */
export class FakeBundle {
  readonly bytes = new Map<string, string>();
  /** Every path read since the last `reads.length = 0`, in order. */
  readonly reads: string[] = [];

  constructor(files: Record<string, unknown> = BUNDLE_FILES) {
    for (const [path, json] of Object.entries(files)) {
      this.bytes.set(path, JSON.stringify(json, null, 2));
    }
  }

  write(path: string, json: unknown): void {
    this.bytes.set(path, JSON.stringify(json, null, 2));
  }

  writeText(path: string, text: string): void {
    this.bytes.set(path, text);
  }

  remove(path: string): void {
    this.bytes.delete(path);
  }

  read(path: string): string {
    this.reads.push(path);
    const text = this.bytes.get(path);
    if (text === undefined) {
      throw new Error(`no such path: ${path}`);
    }
    return text;
  }

  names(directory: string): string[] {
    const prefix = directory === '' ? '' : `${directory}/`;
    const names = new Set<string>();
    for (const path of this.bytes.keys()) {
      if (!path.startsWith(prefix)) {
        continue;
      }
      const rest = path.slice(prefix.length);
      if (rest !== '' && !rest.includes('/')) {
        names.add(rest);
      }
    }
    return [...names];
  }
}

/** A fetch that serves the bundle, plus an autoindex page per directory. */
export function fakeFetch(bundle: FakeBundle, baseUrl = 'https://example.test/out') {
  return async (url: string): Promise<FetchResponse> => {
    const withoutQuery = url.split('?')[0];
    if (!withoutQuery.startsWith(`${baseUrl}/`)) {
      return { ok: false, status: 404, text: async () => '' };
    }
    const path = withoutQuery.slice(baseUrl.length + 1);
    if (path.endsWith('/')) {
      const names = bundle.names(path.slice(0, -1));
      if (names.length === 0) {
        return { ok: false, status: 404, text: async () => '' };
      }
      const links = names.map((name) => `<li><a href="${name}">${name}</a></li>`).join('');
      return { ok: true, status: 200, text: async () => `<ul>${links}</ul>` };
    }
    try {
      const text = bundle.read(path);
      return { ok: true, status: 200, text: async () => text };
    } catch {
      return { ok: false, status: 404, text: async () => '' };
    }
  };
}

/** A directory handle over the same bundle image. */
export function fakeDirectory(bundle: FakeBundle, name = 'gyld-out', prefix = ''): GyldDirectoryHandle {
  const at = (child: string): string => (prefix === '' ? child : `${prefix}/${child}`);
  return {
    name,
    async *values(): AsyncIterable<GyldDirectoryEntry> {
      const directories = new Set<string>();
      const files: string[] = [];
      const base = prefix === '' ? '' : `${prefix}/`;
      for (const path of bundle.bytes.keys()) {
        if (!path.startsWith(base)) {
          continue;
        }
        const rest = path.slice(base.length);
        const slash = rest.indexOf('/');
        if (slash === -1) {
          files.push(rest);
        } else {
          directories.add(rest.slice(0, slash));
        }
      }
      for (const directory of directories) {
        yield { kind: 'directory', name: directory };
      }
      for (const file of files) {
        yield { kind: 'file', name: file };
      }
    },
    getFileHandle(child: string): Promise<GyldFileHandle> {
      const path = at(child);
      if (!bundle.bytes.has(path)) {
        return Promise.reject(new Error(`no such file: ${path}`));
      }
      const file: GyldFile = { text: async () => bundle.read(path) };
      return Promise.resolve({ getFile: async () => file });
    },
    getDirectoryHandle(child: string): Promise<GyldDirectoryHandle> {
      const path = at(child);
      const has = [...bundle.bytes.keys()].some((key) => key.startsWith(`${path}/`));
      if (!has) {
        return Promise.reject(new Error(`no such directory: ${path}`));
      }
      return Promise.resolve(fakeDirectory(bundle, name, path));
    },
  };
}

/** A clock the test advances by hand: nothing fires until `tick` is called. */
export class FakeClock {
  private handlers = new Map<number, { handler: () => void; ms: number }>();
  private next = 1;

  readonly host = {
    setInterval: (handler: () => void, ms: number): unknown => {
      const id = this.next++;
      this.handlers.set(id, { handler, ms });
      return id;
    },
    clearInterval: (handle: unknown): void => {
      this.handlers.delete(handle as number);
    },
  };

  get running(): number {
    return this.handlers.size;
  }

  /** Fire every live interval once. */
  tick(): void {
    for (const { handler } of [...this.handlers.values()]) {
      handler();
    }
  }
}
