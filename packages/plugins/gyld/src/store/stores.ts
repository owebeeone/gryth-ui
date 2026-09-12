import { LENS_SUFFIX, STREAMS_INDEX_PATH, lensDirectory, perspectiveOf } from './layout';

// The two read-only bundle stores, copied in shape from the wyred data layer
// (`plugin-wyred/src/storeTap.ts`: StaticStore over fetch, DirectoryStore over
// a File System Access handle, the tap owning the cache above them).
//
// A store reads BYTES and lists names. It does not parse, validate, cache or
// interpret: every one of those belongs to the tap or to the contract readers,
// so a store failure is always "these bytes are not there", never "this value
// is wrong".

export interface GyldStore {
  /** A stable description of where this store reads from, for status lines. */
  readonly describe: string;
  /** The bytes of one path relative to the bundle root. Rejects when absent. */
  read(path: string): Promise<string>;
  /**
   * The perspectives one stream carries, or null when this store cannot list a
   * directory at all. Null is "not enumerable here", which the UI renders as
   * such; it is never an empty list, which would mean "this stream has none".
   */
  listPerspectives(stream: string): Promise<string[] | null>;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// StaticStore: a bundle served over HTTP.
// ---------------------------------------------------------------------------

export interface FetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (url: string) => Promise<FetchResponse>;

export interface StaticStoreOptions {
  fetch?: FetchLike;
  /** Append a nonce to every URL, so the watch tick defeats the HTTP cache. */
  cacheBust?: boolean;
}

function defaultFetch(url: string): Promise<FetchResponse> {
  const host = globalThis as unknown as { fetch?: FetchLike };
  if (typeof host.fetch !== 'function') {
    return Promise.reject(new Error('no fetch in this environment'));
  }
  return host.fetch(url);
}

/**
 * Anchor names from a directory autoindex page (the listing `python3 -m
 * http.server` writes over an emitted bundle). Nothing but a file name in THIS
 * directory survives: query links, anchors, sub-paths and parent links go.
 */
export function parseAutoindexNames(html: string): string[] {
  const names: string[] = [];
  const anchor = /<a\s[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  for (let match = anchor.exec(html); match !== null; match = anchor.exec(html)) {
    const raw = match[1] ?? match[2] ?? '';
    if (raw === '' || raw.startsWith('?') || raw.startsWith('#')) {
      continue;
    }
    let name = raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    try {
      name = decodeURIComponent(name);
    } catch {
      // not percent encoded after all, so the raw name is the name
    }
    if (name.includes('/')) {
      continue;
    }
    names.push(name);
  }
  return names;
}

export class StaticStore implements GyldStore {
  readonly describe: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly cacheBust: boolean;
  private bustCounter = 0;

  constructor(baseUrl: string, options: StaticStoreOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.describe = this.baseUrl;
    this.fetchImpl = options.fetch ?? defaultFetch;
    this.cacheBust = options.cacheBust ?? false;
  }

  private url(path: string): string {
    const plain = path === '' ? `${this.baseUrl}/` : `${this.baseUrl}/${path}`;
    if (!this.cacheBust) {
      return plain;
    }
    const separator = plain.includes('?') ? '&' : '?';
    const nonce = `${Date.now().toString(36)}-${(this.bustCounter++).toString(36)}`;
    return `${plain}${separator}gyld_bust=${nonce}`;
  }

  async read(path: string): Promise<string> {
    const url = this.url(path);
    let response: FetchResponse;
    try {
      response = await this.fetchImpl(url);
    } catch (err) {
      throw new Error(`GET ${url} failed: ${errorMessage(err)}`);
    }
    if (!response.ok) {
      throw new Error(`GET ${url}: HTTP ${response.status}`);
    }
    return response.text();
  }

  /**
   * A static server has no manifest of lenses: Gyld emits none, and inventing
   * one would be inventing a Gyld fact. The one listing a plain file server
   * does offer is its autoindex page, so that is tried and nothing else; a
   * server without one reports "not enumerable" and the window says so.
   */
  async listPerspectives(stream: string): Promise<string[] | null> {
    const path = `${lensDirectory(stream)}/`;
    let html: string;
    try {
      html = await this.read(path);
    } catch {
      return null;
    }
    const names = parseAutoindexNames(html).filter((name) => name.endsWith(LENS_SUFFIX));
    if (names.length === 0) {
      return null;
    }
    return names
      .map((name) => perspectiveOf(name))
      .filter((perspective): perspective is string => perspective !== null)
      .sort();
  }
}

// ---------------------------------------------------------------------------
// DirectoryStore: a bundle in a picked directory.
// ---------------------------------------------------------------------------

// Structural handle types, so neither the store nor a test depends on the DOM
// lib. A real FileSystemDirectoryHandle satisfies GyldDirectoryHandle as is.

export interface GyldDirectoryEntry {
  kind: string;
  name: string;
}

export interface GyldFile {
  text(): Promise<string>;
}

export interface GyldFileHandle {
  getFile(): Promise<GyldFile>;
}

export interface GyldDirectoryHandle {
  readonly name: string;
  values(): AsyncIterable<GyldDirectoryEntry>;
  getFileHandle(name: string): Promise<GyldFileHandle>;
  getDirectoryHandle(name: string): Promise<GyldDirectoryHandle>;
}

/**
 * A bundle under a directory handle. Every read goes back to the handle, so
 * the tap's tick sees current bytes with no cache busting to do; the tap owns
 * the only cache there is.
 */
export class DirectoryStore implements GyldStore {
  readonly describe: string;

  constructor(private readonly handle: GyldDirectoryHandle) {
    this.describe = handle.name;
  }

  private async walk(segments: string[]): Promise<GyldDirectoryHandle> {
    let directory = this.handle;
    for (const segment of segments) {
      directory = await directory.getDirectoryHandle(segment);
    }
    return directory;
  }

  async read(path: string): Promise<string> {
    const segments = path.split('/');
    const name = segments.pop() ?? '';
    try {
      const directory = await this.walk(segments);
      const file = await (await directory.getFileHandle(name)).getFile();
      return await file.text();
    } catch (err) {
      throw new Error(`${path} absent or unreadable: ${errorMessage(err)}`);
    }
  }

  async listPerspectives(stream: string): Promise<string[] | null> {
    let directory: GyldDirectoryHandle;
    try {
      directory = await this.walk(lensDirectory(stream).split('/'));
    } catch {
      // No lenses directory at all. That is a stream with no lens files, which
      // is a listable fact, not an unlistable store.
      return [];
    }
    const perspectives: string[] = [];
    for await (const entry of directory.values()) {
      if (entry.kind !== 'file') {
        continue;
      }
      const perspective = perspectiveOf(entry.name);
      if (perspective !== null) {
        perspectives.push(perspective);
      }
    }
    return perspectives.sort();
  }
}

/** The bundle root each store reads its census from, named once. */
export const CENSUS_PATH = STREAMS_INDEX_PATH;
