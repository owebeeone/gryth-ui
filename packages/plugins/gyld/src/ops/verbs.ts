// The verbs the `glade-gyld` supplier answers, and the request envelope each
// one rides in (step 4.3).
//
// The supplier's README is the contract this file is written against
// (`glade-wz/glade-gyld/README.md`, "Command surface" and "The allow-list"):
// one verb per request, `args` a TYPED OBJECT rather than an argv list, and
// `stream_output` opting the run onto the log surface. Nothing a window writes
// ever reaches a command line, because nothing here composes one.
//
// A verb is an OBJECT, not a string carried around (AGENTS.md, "no magic
// strings when the concept has semantics). It owns its name, what it is
// called in a window, whether it builds, whether its reply streams, and which
// fields of the argument object it carries. A verb the supplier does not allow is not
// spelled here at all: `occurred`, `lens` and `inspect` are named by spec
// section 4.7 and the supplier refuses them, because no Gyld host verb exists
// for them yet.

import type { GyldAskContext } from '../ask/envelope';
import type { OverlayFragment } from '../decide/overlay';

/** The workspace share the surfaces live on (`grazel/apps/gyld-app.glade`). */
export const GYLD_SHARE = 'ws-razel';

/** The directed exchange surface the supplier answers. */
export const GYLD_OPS_ID = 'gyld.ops';

/** The log surface a streaming run's stdout and stderr lines append to, keyed
 *  by run id, in the `gwz.output` record shape exactly. */
export const GYLD_OUTPUT_ID = 'gyld.output';

/** The log surface the ask agent's reply appends to, keyed by the CONVERSATION
 *  rather than the run (GyldAskAgent.md section 6): each turn keeps its own
 *  `run_id` on every record, and a conversation is one fold and one mount. */
export const GYLD_ASK_ID = 'gyld.ask';

/** The three value surfaces a successful build publishes onto, and the
 *  pointer surface the large lens files travel on. */
export const GYLD_STREAMS_ID = 'gyld.streams';
export const GYLD_STREAM_ID = 'gyld.stream';
export const GYLD_DECISIONS_ID = 'gyld.decisions';
export const GYLD_LENS_ID = 'gyld.lens';
export const GYLD_FILE_ID = 'gyld.file';

/**
 * The typed argument object. Every field is optional here and validated per
 * verb by the supplier, which refuses a missing or surplus one AS DATA with a
 * readable reason. This package never guesses a value into one of these.
 */
export interface GyldOpsArgs {
  /** The stream a verb acts on (`answer`, `ask`, and the NEW id of a fork or
   *  a link). */
  stream?: string;
  /** The parent a fork or a link is taken from. */
  parent?: string;
  /** `diff`: the left-hand stream of the ordered pair. */
  left?: string;
  /** `diff`: the right-hand stream. */
  right?: string;
  /** `answer` and `ask`: the overlay module text the decide window exported,
   *  written verbatim as the stream's overlay module. */
  overlay?: string;
  /** `ask`: the added question's module fragment, appended to `overlay`. */
  question?: string;
  /**
   * `answer` and `ask`: the records to FOLD into the notebook that is already
   * there, rather than the whole module to write over it (spec section 4.8).
   *
   * The alternative to `overlay`, never its companion: the supplier refuses a
   * request carrying both or neither. A Gyld host — `manage_decision_streams.py
   * merge` — does the folding, so one notebook holds as many answers as the owner
   * makes and no merge logic lives here.
   */
  fragment?: OverlayFragment;
  /** One line of provenance recorded on a generated stream record. */
  note?: string;
  /** `rebuild`: an explicit build stamp; the host defaults it to now. */
  built?: string;
  /** Overwrite an existing overlay module or diff document. */
  force?: boolean;
  /** `explain`: the ask context envelope, whole (GyldAskAgent.md section 4).
   *  A TYPED OBJECT like every other field here, so nothing a window composes
   *  reaches a command line — and for this verb, no subprocess at all. */
  context?: GyldAskContext;
}

/** The JSON envelope the exchange payload carries. */
export interface GyldOpsRequest {
  verb: string;
  args: GyldOpsArgs;
  /** The supplier's own spelling. `stream` is accepted as an alias there; the
   *  name spec section 4.7 writes down is the one sent. */
  stream_output: boolean;
  principal: string;
}

export class GyldVerb {
  private constructor(
    /** The name the allow-list matches. */
    readonly name: string,
    /** What a button says. */
    readonly title: string,
    /**
     * Whether this verb BUILDS. A build is minutes of Python, so every one of
     * them is sent with `stream_output: true` and followed on the log surface
     * rather than held on the exchange until it finishes (the supplier's
     * README says so in as many words).
     */
    readonly builds: boolean,
    /**
     * Whether the reply is STREAMED onto a log surface rather than held on the
     * exchange until it is finished. Every build is; `explain` is the one verb
     * that streams and builds nothing at all, because a consultation is model
     * time and its reply is a stream by nature (GyldAskAgent.md section 4).
     * Defaulted from `builds`, so the seven verbs that had only that one fact
     * still state it once.
     */
    readonly streams: boolean = builds,
  ) {}

  /** Read the latest build's `streams.json`. Runs no host at all. */
  static readonly LIST = new GyldVerb('list', 'List', false);

  /** Write a stream's overlay module, then rebuild. */
  static readonly ANSWER = new GyldVerb('answer', 'Answer', true);

  /** The same, with the new question's fragment appended. */
  static readonly ASK = new GyldVerb('ask', 'Ask', true);

  /**
   * Ask the agent about one record, with the envelope of section 3.
   *
   * It is NOT `ask`, and the collision is not cosmetic: `ask` means append a
   * new QUESTION to a stream's overlay module and rebuild, and a second
   * meaning on that name would make the allow-list ambiguous and put a verb
   * that writes Gyld source behind the same word as one that writes nothing
   * (GyldAskAgent.md section 4, "Why `explain`, not `ask`").
   *
   * It builds nothing — no overlay, no bundle, no file at all — and streams,
   * so it is the one verb whose two flags differ.
   */
  static readonly EXPLAIN = new GyldVerb('explain', 'Ask', false, true);

  /** Flatten the parent's overlay chain into one module. */
  static readonly FORK = new GyldVerb('fork', 'Fork', true);

  /** Import the parent's overlay module and subclass its root. */
  static readonly LINK = new GyldVerb('link', 'Link', true);

  /** Re-capture the latest bundle into a new build directory. */
  static readonly REBUILD = new GyldVerb('rebuild', 'Rebuild', true);

  /** Write the ordered pair's diff into the bundle's own `diffs/`. */
  static readonly DIFF = new GyldVerb('diff', 'Diff', true);

  /**
   * Whether a run of this verb can have changed what the published shares
   * carry, so the store is asked to read them again when it answers.
   *
   * `explain` is the one verb with NO filesystem effect at all — no overlay,
   * no build, no diff document — so nothing it answers can have moved a
   * share, and a refresh after it would be a re-read asked for on a guess.
   */
  get touchesBundle(): boolean {
    return this !== GyldVerb.EXPLAIN;
  }

  /** The envelope for this verb with these arguments. `stream_output` is the
   *  verb's own, never a caller's: which verbs stream is the supplier's fact. */
  request(args: GyldOpsArgs, principal: string): GyldOpsRequest {
    return { verb: this.name, args, stream_output: this.streams, principal };
  }
}

/** The allow-list, in the order the supplier's README tables it. */
export const GYLD_VERBS: readonly GyldVerb[] = Object.freeze([
  GyldVerb.LIST, GyldVerb.ANSWER, GyldVerb.ASK, GyldVerb.EXPLAIN, GyldVerb.FORK,
  GyldVerb.LINK, GyldVerb.REBUILD, GyldVerb.DIFF,
]);

/** The verb a name stands for, or undefined when it stands for none. A name
 *  that is not a verb selects nothing rather than falling back to one. */
export function verbNamed(name: string): GyldVerb | undefined {
  return GYLD_VERBS.find((verb) => verb.name === name);
}

const encoder = new TextEncoder();

/** The exchange payload bytes for one request. */
export function encodeRequest(request: GyldOpsRequest): Uint8Array {
  return encoder.encode(JSON.stringify(request));
}
