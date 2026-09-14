import type { GyldStreamsCensus } from '../store/state';

// What a browser window opens ON when its link named nothing.
//
// A window with a root but no destination drew nothing and waited for two
// picks, which is two clicks between a reader and the first picture on a desk
// that has exactly one bundle in it. So a window that chose nothing is opened
// on what the bundle itself puts first.
//
// EVERY choice here comes from emitted data: the stream is the first one
// `streams.json` lists, and the perspective is `decisions` when that stream's
// own lens manifest emitted it and the first entry of that manifest when it
// did not. Nothing is invented, nothing is preferred by name that the stream
// did not emit, and a census with nothing in it chooses nothing at all.
//
// The reader's own picks always win: this only ever fills a value that is
// EMPTY, and empty is what "this window has no destination yet" is spelled as
// (grips.ts). A window the reader has moved is never moved back.

/** The perspective a window opens a stream on when the stream emitted it. It
 *  is the one every decision stream draws its questions in, and the one the
 *  neighbourhood members are restricted out of. */
export const OPENING_PERSPECTIVE = 'decisions';

/** What a window chose for itself. An empty field is one it chose nothing
 *  for — because the reader had already chosen, or because the emitted data
 *  named nothing to choose. */
export interface GyldFirstPick {
  stream: string;
  perspective: string;
}

export const NOTHING_PICKED: GyldFirstPick = Object.freeze({ stream: '', perspective: '' });

/**
 * The stream and perspective to fill in, given what the window already has.
 *
 * Each field is answered independently, so a link that carried a stream and no
 * perspective still opens on a picture: the perspective is chosen for the
 * stream the window ends up on, which is the one it was given when it was
 * given one and the census's first otherwise.
 */
export function firstPick(
  census: GyldStreamsCensus | undefined,
  stream: string,
  perspective: string,
): GyldFirstPick {
  if (census?.status !== 'ready' || census.streams.length === 0) {
    return NOTHING_PICKED;
  }
  const on = stream === ''
    ? census.streams[0]
    : census.streams.find((entry) => entry.id === stream);
  if (on === undefined) {
    // A window on a stream this set does not carry keeps it and says so; a
    // perspective chosen off some other stream's manifest would be worse.
    return NOTHING_PICKED;
  }
  const pick: GyldFirstPick = {
    stream: stream === '' ? on.id : '',
    perspective: perspective === '' ? openingOf(on.perspectives) : '',
  };
  return pick.stream === '' && pick.perspective === '' ? NOTHING_PICKED : pick;
}

/**
 * The perspective a browser lands on when it is RETARGETED to another stream.
 *
 * A reader who moved a browser to `tiers` and then picks another stream is
 * still reading tiers, so the perspective travels — but only where the stream
 * being moved to emitted it. A perspective the new stream does not carry is
 * not a picture, so the first-pick rule above answers instead, exactly as it
 * does for a window that never had one. Nothing is invented either way: both
 * answers come from that stream's own lens manifest, and a stream the census
 * does not carry answers with nothing at all.
 */
export function keptPerspective(
  census: GyldStreamsCensus | undefined,
  stream: string,
  perspective: string,
): string {
  const on = census?.status === 'ready'
    ? census.streams.find((entry) => entry.id === stream)
    : undefined;
  if (perspective !== '' && (on?.perspectives ?? []).includes(perspective)) {
    return perspective;
  }
  return firstPick(census, stream, '').perspective;
}

/** `decisions` where the stream emitted it, else what its manifest lists
 *  first, else nothing: a stream whose perspectives are not known is a stream
 *  this cannot open, and a window on no perspective is a rendered state. */
function openingOf(emitted: readonly string[] | undefined): string {
  if (emitted === undefined || emitted.length === 0) {
    return '';
  }
  return emitted.includes(OPENING_PERSPECTIVE) ? OPENING_PERSPECTIVE : emitted[0];
}
