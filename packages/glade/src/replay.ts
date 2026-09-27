// When a zone's replay is in (Glial appearance plan, Step 2.4): what a page
// waits for before it may read one of its zones as empty, as the appearance
// migration does before it seeds one.
//
// A page subscribes its zones when it connects, and client-ts's subscribe
// resolves once the node's ack has come AND every op the ack names has been
// delivered (R7, client-writes Step 3.4): the ops go to the page's `onOps`, so
// glial has folded them, before they count toward the replay. So a zone's own
// subscribe is the barrier. Before 3.4 a subscribe resolved at the ack, ahead
// of its replay, and a second subscribe of the zone, whose ack comes after the
// first one's replay, stood in for it (owner ruling 6 of 2026-09-25). That form
// is not built: the client this page links is past 3.4.
//
// DOM-free: the client is injected, so a suite drives the order by hand.

/** A zone a page subscribes when it connects: the node's interest, and the
 *  zone's history replayed to a late joiner. An absent key is the commons. */
export interface GladeSubscription {
  readonly share: string;
  readonly gladeId: string;
  readonly key?: Uint8Array;
}

/** The part of the glade client the zones are subscribed through: its answer
 *  comes once the replay is in, and says whether the node accepted. */
export interface ReplayClient {
  subscribeOutcome(share: string, gladeId: string, key?: Uint8Array): Promise<{ readonly ok: boolean }>;
}

interface Waiting {
  readonly zone: GladeSubscription;
  readonly settle: (replayed: boolean) => void;
}

/** The zones a page subscribes when it connects, in the order they were added,
 *  each with the answer to whether its replay came in. */
export class ZoneReplays {
  private waiting: Waiting[] = [];
  private subscribing = false;

  /** Subscribe `zone` when the page connects, and learn whether its replay
   *  came in: true once the node acked it and its replay was delivered, false
   *  if the node refused it or the page never subscribed it. A zone added once
   *  the page has subscribed its zones is never subscribed here. */
  whenReplayed(zone: GladeSubscription): Promise<boolean> {
    if (this.subscribing) {
      return Promise.resolve(false);
    }
    return new Promise((settle) => {
      this.waiting.push({ zone, settle });
    });
  }

  /** Subscribe every zone through `client`, one at a time, in the order they
   *  were added, each answered as its subscribe resolves. A failure answers
   *  every zone not yet answered as not replayed, and is thrown on. */
  async subscribeAll(client: ReplayClient): Promise<void> {
    this.subscribing = true;
    const zones = this.waiting;
    this.waiting = [];
    let answered = 0;
    try {
      for (const { zone, settle } of zones) {
        const outcome = await client.subscribeOutcome(zone.share, zone.gladeId, zone.key);
        settle(outcome.ok);
        answered += 1;
      }
    } finally {
      for (const { settle } of zones.slice(answered)) {
        settle(false);
      }
    }
  }

  /** The page will not subscribe its zones: none of them is replayed. */
  abandon(): void {
    this.subscribing = true;
    for (const { settle } of this.waiting.splice(0)) {
      settle(false);
    }
  }
}
