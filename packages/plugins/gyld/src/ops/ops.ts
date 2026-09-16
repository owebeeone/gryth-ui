import {
  GYLD_OPS_ID, GYLD_OUTPUT_ID, GYLD_SHARE, GyldVerb, encodeRequest,
  type GyldOpsArgs,
} from './verbs';

// The operations handle: the one thing a window holds to ask the supplier for
// something (step 4.3). It is the `Gyld.Ops` grip's value, and it knows
// nothing about glade: the WIRE is injected, so the same handle serves the
// live exchange and a test's fake with no branch of its own.
//
// FAILURE IS DATA, always. A wire that says no provider, a payload that does
// not decode, an exchange that rejects outright: each one becomes an answer
// carrying the reason. Nothing here throws at a call site and nothing here
// hangs, so a button that has been pressed always comes back.
//
// The window is told what came back and nothing else. This module never reads
// a reply's `stdout` for a fact, never decides that a run "worked" beyond the
// `ok` the supplier set, and never invents an output directory.

/** The answer the supplier writes on the exchange payload (`envelope.rs`,
 *  `GyldResponse`). `ok` is the RUN's success; the wire's own ok is separate
 *  and a wire failure is folded into this same shape below. */
export interface GyldOpsResponse {
  ok: boolean;
  /** Every answer carries one: it keys the log surface for a streaming run
   *  and stamps a synchronous one for the audit trail. */
  run_id?: string;
  /** The NEW bundle directory a mutating verb built, when it built one. A
   *  failed run never reports one: nothing was built. */
  output_dir?: string;
  exit?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  /** `false` on a streaming accept; the `done` marker lands on the log. */
  done?: boolean;
  attributed_to?: string;
}

/** One record on the `gyld.output` log for a streaming run. The `gwz.output`
 *  shape field for field, so one consumer folds both. */
export interface GyldOutputRecord {
  run_id: string;
  seq: number;
  principal?: string;
  /** `"stdout" | "stderr" | "end"`. */
  stream: string;
  line?: string;
  done?: boolean;
  exit?: number;
}

/** What landed in `Gyld.Ops.Result`: the answer, and which verb asked. */
export interface GyldOpsResult {
  verb: string;
  response: GyldOpsResponse;
}

/** The outcome of one exchange, as the glade client reports it. */
export interface GyldExchangeOutcome {
  ok: boolean;
  payload?: Uint8Array;
  error?: string;
}

/**
 * Everything the handle needs from the outside world. The live module supplies
 * the glade client; a test supplies a recording double. Neither the handle nor
 * anything that calls it knows which it has.
 */
export interface GyldOpsWire {
  /** The acting principal, stamped on every request (owner ruling O6: the
   *  stage-one stub, carried as data). */
  readonly principal: string;
  exchange(share: string, gladeId: string, payload: Uint8Array): Promise<GyldExchangeOutcome>;
  /** Ask the node to replay one keyed surface. Called for a streaming run's
   *  output BEFORE the mount is pointed at it. */
  subscribe(share: string, gladeId: string, key: string): Promise<void>;
  /** Where the answer lands (the `Gyld.Ops.Result` atom). */
  onResult(result: GyldOpsResult): void;
  /** The run whose output the log mount should follow (the `Gyld.Ops.RunId`
   *  atom, which is that mount's fill key). */
  onRunId(runId: string): void;
  /** A build landed, so whatever reads the shares should read them again.
   *  Optional: a wire with no store behind it supplies none. */
  onBuilt?(response: GyldOpsResponse): void;
}

const decoder = new TextDecoder();

/**
 * The reply, as data, whatever happened. A wire `ok: false` is a real answer
 * about the world (no provider is attached, or the route failed) and is
 * reported as such rather than swallowed or thrown.
 */
export function responseFrom(outcome: GyldExchangeOutcome): GyldOpsResponse {
  if (!outcome.ok) {
    return {
      ok: false,
      error: outcome.error
        ?? `no provider for ${GYLD_OPS_ID} (is the glade-gyld supplier attached?)`,
    };
  }
  if (outcome.payload === undefined) {
    return { ok: false, error: 'gyld.ops: empty response payload' };
  }
  try {
    return JSON.parse(decoder.decode(outcome.payload)) as GyldOpsResponse;
  } catch {
    return { ok: false, error: 'gyld.ops: undecodable response payload' };
  }
}

/** The handle a window holds. One method per allowed verb, each taking the
 *  argument object that verb's row of the supplier's table names. */
export interface GyldOps {
  /** The acting principal every request of this handle is stamped with (owner
   *  ruling O6). Read by the ask envelope, which records who a run would be
   *  attributed to (GyldAskAgent.md section 3). */
  readonly principal: string;
  /** The latest build's stream listing. Builds nothing. */
  list(): Promise<GyldOpsResponse>;
  /** Write `overlay` as the stream's overlay module, then rebuild. */
  answer(args: { stream: string; overlay: string }): Promise<GyldOpsResponse>;
  /** The same, with the new question's fragment appended. */
  ask(args: { stream: string; overlay: string; question: string }): Promise<GyldOpsResponse>;
  fork(args: {
    parent: string; stream: string; note?: string; force?: boolean;
  }): Promise<GyldOpsResponse>;
  link(args: {
    parent: string; stream: string; note?: string; force?: boolean;
  }): Promise<GyldOpsResponse>;
  rebuild(args?: { built?: string }): Promise<GyldOpsResponse>;
  diff(args: { left: string; right: string; force?: boolean }): Promise<GyldOpsResponse>;
}

/** Drop the fields a caller did not fill in, so the envelope carries exactly
 *  the operands its verb's row names and no `undefined` reaches the wire. */
function given(args: GyldOpsArgs): GyldOpsArgs {
  const out: GyldOpsArgs = {};
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export function createGyldOps(wire: GyldOpsWire): GyldOps {
  const run = async (verb: GyldVerb, args: GyldOpsArgs): Promise<GyldOpsResponse> => {
    const request = verb.request(given(args), wire.principal);
    let response: GyldOpsResponse;
    try {
      response = responseFrom(
        await wire.exchange(GYLD_SHARE, GYLD_OPS_ID, encodeRequest(request)),
      );
    } catch (err) {
      // An exchange that REJECTS is the one way a press could hang. It is an
      // answer like any other: the reason is carried and the window redraws.
      response = {
        ok: false,
        error: `gyld.ops: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    wire.onResult({ verb: verb.name, response });
    if (!response.ok) {
      return response;
    }
    if (request.stream_output && response.run_id !== undefined && response.run_id !== '') {
      // Subscribe BEFORE the mount is pointed at the run, so the node's replay
      // of the lines already appended is not raced by the first delta.
      try {
        await wire.subscribe(GYLD_SHARE, GYLD_OUTPUT_ID, response.run_id);
      } catch (err) {
        wire.onResult({
          verb: verb.name,
          response: {
            ...response,
            error: `the run was accepted but its output could not be followed: `
              + `${err instanceof Error ? err.message : String(err)}`,
          },
        });
      }
      wire.onRunId(response.run_id);
    }
    wire.onBuilt?.(response);
    return response;
  };

  return {
    principal: wire.principal,
    list: () => run(GyldVerb.LIST, {}),
    answer: (args) => run(GyldVerb.ANSWER, { stream: args.stream, overlay: args.overlay }),
    ask: (args) => run(GyldVerb.ASK, {
      stream: args.stream, overlay: args.overlay, question: args.question,
    }),
    fork: (args) => run(GyldVerb.FORK, {
      parent: args.parent, stream: args.stream, note: args.note, force: args.force,
    }),
    link: (args) => run(GyldVerb.LINK, {
      parent: args.parent, stream: args.stream, note: args.note, force: args.force,
    }),
    rebuild: (args) => run(GyldVerb.REBUILD, { built: args?.built }),
    diff: (args) => run(GyldVerb.DIFF, {
      left: args.left, right: args.right, force: args.force,
    }),
  };
}
