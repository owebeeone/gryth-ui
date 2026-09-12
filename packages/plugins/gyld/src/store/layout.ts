// The read-only bundle layout of spec section 4.6, as pure path functions.
//
// One place names the files so the two stores, the tap and the tests cannot
// drift apart. Paths are relative to a bundle root and always use '/', which
// is both a URL path and the directory walk this package performs.

/** The census of streams, at the root of a bundle. */
export const STREAMS_INDEX_PATH = 'streams.json';

/** Files this package reads inside one stream's directory. */
export const STREAM_FILES = {
  record: 'stream.json',
  projection: 'projection.json',
  decideNow: 'decide-now.json',
  validation: 'validation.json',
} as const;

/** The name of a bundle file inside one stream, keyed as `STREAM_FILES` is. */
export type StreamFile = keyof typeof STREAM_FILES;

export const STREAM_FILE_NAMES = Object.keys(STREAM_FILES) as StreamFile[];

/** The suffix of a lens file. Section 4.6 puts `.dot`, `.svg`, `.json0.json`
 *  and `.lens.json` in the same directory; only the last is the UI's input. */
export const LENS_SUFFIX = '.lens.json';

/** The directory of emitted diffs, at the root of a bundle beside `streams/`. */
export const DIFFS_DIRECTORY = 'diffs';

/** `diffs/<left>..<right>.json` (spec section 7.6). The pair is ORDERED: the
 *  diff of (a, b) is not the diff of (b, a), and this package never reverses
 *  one to answer for the other. */
export function diffPath(left: string, right: string): string {
  return `${DIFFS_DIRECTORY}/${left}..${right}.json`;
}

export function streamDirectory(stream: string): string {
  return `streams/${stream}`;
}

export function streamFilePath(stream: string, file: StreamFile): string {
  return `${streamDirectory(stream)}/${STREAM_FILES[file]}`;
}

export function lensDirectory(stream: string): string {
  return `${streamDirectory(stream)}/lenses`;
}

export function lensPath(stream: string, perspective: string): string {
  return `${lensDirectory(stream)}/${perspective}${LENS_SUFFIX}`;
}

/**
 * The perspective a lens file name stands for, or null when the name is one of
 * the other three files the same directory holds. Nothing is guessed: a name
 * that does not end in `.lens.json` is not a perspective.
 */
export function perspectiveOf(fileName: string): string | null {
  if (!fileName.endsWith(LENS_SUFFIX)) {
    return null;
  }
  const perspective = fileName.slice(0, -LENS_SUFFIX.length);
  return perspective === '' ? null : perspective;
}
