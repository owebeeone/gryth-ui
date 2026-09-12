import { LENS_SUFFIX, STREAMS_INDEX_PATH } from './layout';
import type { GyldStore } from './stores';

// The THIRD bundle store: a bundle that arrives on glade value shares rather
// than out of a directory or off a static host (step 4.3).
//
// The store interface is the matcher flip. `GyldStore` is "give me the bytes
// of this bundle path, and list what a stream's lenses directory holds", and
// that is all the store tap ever asks of a root. So the same `Gyld.Bundle`,
// `Gyld.Lens` and `Gyld.DecideNow` a static root serves are served here with
// no consumer change, no second tap, and no branch anywhere above this file.
//
// What the supplier publishes is what this store can serve, and nothing else
// (`glade-wz/glade-gyld/README.md`, "Results"):
//
//   gyld.streams    unkeyed          -> streams.json
//   gyld.stream     <stream>         -> streams/<stream>/stream.json
//   gyld.decisions  <stream>         -> streams/<stream>/decide-now.json
//   gyld.lens       <stream>/<persp> -> a {path, digest, bytes} POINTER
//
// A lens file is the large one, so it travels as a pointer and is fetched over
// HTTP from grazel's static path. The pointer is never trusted: the bytes are
// digested and counted, and a mismatch is refused AS DATA, which the store tap
// renders as a file that did not read rather than as a picture.
//
// Everything else a bundle holds (`projection.json`, `validation.json`, an
// emitted diff) is NOT on a share. A read of one reports exactly that, and the
// window shows absence, which is true: those files are on the static path of
// the build the answer named, not on this share.

/** A published pointer to one file on grazel's static path. */
export interface GyldFilePointer {
  /** The URL path grazel serves that file at, static base included. */
  path: string;
  /** Lowercase hex sha256 of the file's bytes. */
  digest: string;
  bytes: number;
}

/** Which published surface a value came from. An object rather than a name,
 *  so a surface owns its own key shape and its own reason for existing. */
export class GyldShareSurface {
  private constructor(readonly gladeId: string, readonly keyed: boolean) {}

  static readonly STREAMS = new GyldShareSurface('gyld.streams', false);
  static readonly STREAM = new GyldShareSurface('gyld.stream', true);
  static readonly DECISIONS = new GyldShareSurface('gyld.decisions', true);
  static readonly LENS = new GyldShareSurface('gyld.lens', true);
}

/**
 * What a share-backed root reads through. The live module implements this over
 * glial mounts against the real node; a test implements it over a map.
 *
 * Every method is SYNCHRONOUS except the fetch, because a mounted share value
 * is already in hand: there is nothing to wait for, and a value that has not
 * landed is `undefined`, which is absence and is rendered as such.
 */
export interface GyldShareProvider {
  /** What the status line says this root is. */
  readonly describe: string;
  /** The JSON text on one surface, or undefined when nothing has landed. */
  value(surface: GyldShareSurface, key?: string): string | undefined;
  /** Every `<stream>/<perspective>` key the lens surface has published. */
  lensKeys(): readonly string[];
  /** Fetch one pointed-at file over grazel's static path. */
  fetch(path: string): Promise<string>;
  /** Ask the node to replay the keyed surfaces of these streams. Called with
   *  the census's own stream ids, so nothing is subscribed speculatively. */
  follow(streams: readonly string[]): void;
  /** Tell the store a published value changed, so it reads the shares again.
   *  Returns the unsubscribe. */
  onChange(listener: () => void): () => void;
}

const encoder = new TextEncoder();

/** Lowercase hex sha256 of some bytes, through the platform's own subtle
 *  crypto. Absent in a plain-http non-loopback page, which is a refusal here
 *  rather than a lens taken on trust. */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
  if (subtle === undefined) {
    throw new Error(
      'no SubtleCrypto in this context, so a pointed-at lens cannot be verified; '
      + 'serve the desktop over https or from localhost',
    );
  }
  const digest = await subtle.digest('SHA-256', bytes as unknown as ArrayBufferView);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The pointer one `gyld.lens` value carries, or why it is not one. */
export function readPointer(raw: string): GyldFilePointer {
  const json: unknown = JSON.parse(raw);
  const held = json as Partial<GyldFilePointer>;
  if (typeof held?.path !== 'string' || held.path === '') {
    throw new Error('lens pointer carries no path');
  }
  if (typeof held.digest !== 'string' || held.digest === '') {
    throw new Error('lens pointer carries no digest');
  }
  if (typeof held.bytes !== 'number') {
    throw new Error('lens pointer carries no byte count');
  }
  return { path: held.path, digest: held.digest, bytes: held.bytes };
}

/** The text a pointer points at, once it is the text the pointer promised.
 *  The count is checked first because it is the cheap half of the same claim. */
export async function verified(
  pointer: GyldFilePointer,
  text: string,
): Promise<string> {
  const bytes = encoder.encode(text);
  if (bytes.length !== pointer.bytes) {
    throw new Error(
      `${pointer.path}: the pointer promised ${pointer.bytes} bytes and `
      + `${bytes.length} arrived`,
    );
  }
  const digest = await sha256Hex(bytes);
  if (digest !== pointer.digest) {
    throw new Error(
      `${pointer.path}: the pointer promised sha256 ${pointer.digest} and the `
      + `bytes are ${digest}`,
    );
  }
  return text;
}

/** The stream and perspective a lens path names, or null when the path is not
 *  a lens path at all. Nothing is guessed: the layout module owns the shape. */
function lensKeyOf(path: string): string | null {
  const match = /^streams\/([^/]+)\/lenses\/(.+)$/.exec(path);
  if (match === null || !match[2].endsWith(LENS_SUFFIX)) {
    return null;
  }
  return `${match[1]}/${match[2].slice(0, -LENS_SUFFIX.length)}`;
}

/** The stream and file name a bundle path names inside `streams/`. */
function streamFileOf(path: string): { stream: string; file: string } | null {
  const match = /^streams\/([^/]+)\/([^/]+)$/.exec(path);
  return match === null ? null : { stream: match[1], file: match[2] };
}

export class ShareStore implements GyldStore {
  readonly describe: string;

  constructor(private readonly provider: GyldShareProvider) {
    this.describe = provider.describe;
  }

  async read(path: string): Promise<string> {
    if (path === STREAMS_INDEX_PATH) {
      return this.required(GyldShareSurface.STREAMS, undefined, path);
    }
    const lens = lensKeyOf(path);
    if (lens !== null) {
      return this.lens(lens);
    }
    const inStream = streamFileOf(path);
    if (inStream?.file === 'stream.json') {
      return this.required(GyldShareSurface.STREAM, inStream.stream, path);
    }
    if (inStream?.file === 'decide-now.json') {
      return this.required(GyldShareSurface.DECISIONS, inStream.stream, path);
    }
    // Everything else is a real file of a real build that the supplier does
    // not publish onto a share. Saying so is the honest answer; inventing a
    // static path for it would be inventing a place the bytes might be.
    throw new Error(
      `${path} is not published on a gyld share; it is in the build directory `
      + 'the last answer named, which is a static root',
    );
  }

  /**
   * The perspectives this stream has published lens pointers for. A share root
   * always CAN list: what the node replayed is the list, so a stream with no
   * pointers has no perspectives rather than an unlistable store.
   */
  async listPerspectives(stream: string): Promise<string[] | null> {
    const prefix = `${stream}/`;
    return this.provider
      .lensKeys()
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length))
      .filter((perspective) => perspective !== '')
      .sort();
  }

  private required(surface: GyldShareSurface, key: string | undefined, path: string): string {
    const value = this.provider.value(surface, key);
    if (value === undefined) {
      throw new Error(
        `nothing has landed on ${surface.gladeId}${key === undefined ? '' : ` (${key})`} `
        + `for ${path}`,
      );
    }
    return value;
  }

  private async lens(key: string): Promise<string> {
    const raw = this.provider.value(GyldShareSurface.LENS, key);
    if (raw === undefined) {
      throw new Error(`nothing has landed on ${GyldShareSurface.LENS.gladeId} (${key})`);
    }
    const pointer = readPointer(raw);
    return verified(pointer, await this.provider.fetch(pointer.path));
  }
}
