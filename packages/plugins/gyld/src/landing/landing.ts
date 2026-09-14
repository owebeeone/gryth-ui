import type { GyldSet } from '../store/state';

// What a desk LANDS on, as pure values over what the glade session reported.
//
// A desk with no bundle root used to show the set picker whatever else was
// true, which is the wrong answer when a glade node was answering the whole
// time: the node is a root this desk can add for itself, and the census is
// what the reader came for. So the landing is two facts — the connection as
// this package mirrors it, and the node URL the page would attach to — and one
// decision taken off them: whether becoming ready should put the glade node on
// an empty desk.
//
// Nothing here reads a grip, writes one or touches a socket. The tap beside
// this file does that; these are the rules it applies, so a test asks them
// without a graph and the picker says them without a branch of its own.

/**
 * The glade node as this desk sees it.
 *
 * An object rather than one of four names, because the four differ in what
 * they MEAN and every reader wants the meaning: `ready` is the edge the
 * landing waits for, `settling` is the state where nothing has been decided
 * yet and the picker must not accuse the composition of having no node.
 *
 * `Gyld.Ops.Status` is the vocabulary (`src/live.ts` mirrors `Glade.Status`
 * into it): `connecting`, `live` and `offline` while a glade module is
 * registered, and the empty string when there is no glade in the composition
 * at all — which is a different fact from `offline` and is rendered as one.
 */
export class GladePresence {
  private constructor(
    /** The `Gyld.Ops.Status` text this presence is of. */
    readonly status: string,
    /** The session is up. The desk lands when it BECOMES this. */
    readonly ready: boolean,
    /** The desk is still finding out, so it accuses nothing and offers
     *  nothing: a picker drawn here would be a picker drawn over a node that
     *  is about to answer. */
    readonly settling: boolean,
  ) {}

  /** No glade module in this composition at all. */
  static readonly ABSENT = new GladePresence('', false, false);
  static readonly CONNECTING = new GladePresence('connecting', false, true);
  static readonly LIVE = new GladePresence('live', true, false);
  static readonly OFFLINE = new GladePresence('offline', false, false);

  private static readonly KNOWN: readonly GladePresence[] = [
    GladePresence.CONNECTING, GladePresence.LIVE, GladePresence.OFFLINE,
  ];

  /** The presence one mirrored status is. A status this package has never
   *  heard of is not a node it can vouch for, so it reads as none. */
  static of(status: string): GladePresence {
    return GladePresence.KNOWN.find((known) => known.status === status)
      ?? GladePresence.ABSENT;
  }
}

/** What the desk's landing did, and what it is waiting for. Published by
 *  `GyldLandingTap`, read by the set picker to say why there is no picture. */
export interface GyldLanding {
  presence: GladePresence;
  /** The node URL the page would attach to, once the bootstrap resolved one.
   *  Empty before that, and in a composition with no glade at all. */
  node: string;
  /** Whether this desk added the glade root by itself. */
  landed: boolean;
}

export const LANDING_UNSET: GyldLanding = Object.freeze({
  presence: GladePresence.ABSENT,
  node: '',
  landed: false,
});

/**
 * Whether becoming ready should put the glade node on this desk.
 *
 * It is an EDGE, not a state: only the transition into `live` lands, so a
 * reader who removes the root while the session stays up keeps it removed. A
 * desk that already has a root of any kind is left alone — the reader chose
 * that root, and a second one added underneath would be a root nobody asked
 * for.
 */
export function landsGladeRoot(
  was: GladePresence,
  now: GladePresence,
  set: GyldSet,
): boolean {
  return now.ready && !was.ready && set.roots.length === 0;
}

/** What the set picker leads with, and whether it draws its controls at all. */
export interface LandingSays {
  /** The fact, or what the desk is still doing. */
  lead: string;
  /** What to do about it. Empty when there is nothing to say yet. */
  fix: string;
  /** Whether there is anything to press. A desk still connecting has not been
   *  told there is no node, so it is offered no way around one. */
  offers: boolean;
}

/** The node, named, or a phrase for the one this page has not resolved yet. */
function nodeNamed(node: string): string {
  return node === '' ? 'the node URL this page would use' : node;
}

/**
 * What the picker says for one landing.
 *
 * Three states and no more. Still connecting: say so, and offer nothing.
 * Nothing answered: lead with that fact and with the one command that starts
 * the composition, because a reader looking at an empty desk wants the fix and
 * not an inventory of root kinds. Live with an empty set: the reader took the
 * root off, so the node is offered back.
 */
export function landingSays(landing: GyldLanding): LandingSays {
  if (landing.presence.settling) {
    return {
      lead: `connecting to the glade node at ${nodeNamed(landing.node)}`,
      fix: '',
      offers: false,
    };
  }
  if (landing.presence.ready) {
    return {
      lead: `The glade node at ${nodeNamed(landing.node)} is live, and this desk`
        + ' has no root. Add it back to read the bundle the glade-gyld supplier'
        + ' publishes.',
      fix: '',
      offers: true,
    };
  }
  return {
    lead: `No glade node answered at ${nodeNamed(landing.node)}, so this desk has`
      + ' nothing to read.',
    fix: 'Start the composition with python3 gyld-ui.py start from the gryth-ui'
      + ' root; it prints the URL to open.',
    offers: true,
  };
}
