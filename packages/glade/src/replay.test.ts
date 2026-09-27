import { describe, expect, it } from 'vitest';
import { ZoneReplays, type GladeSubscription, type ReplayClient } from './replay';

// When a zone's replay is in (Glial appearance plan, Step 2.4), with the client
// faked. The fake keeps each subscribe's answer until the test gives it, and
// delivers the zone's replay first, as client-ts does since client-writes Step
// 3.4: its subscribe resolves once the ack has come and every op the ack names
// has been delivered (R7).

const THEMES: GladeSubscription = { share: 'ws-razel', gladeId: 'gyld.appearance', key: new Uint8Array([1]) };
const STREAMS: GladeSubscription = { share: 'ws-razel', gladeId: 'gyld.streams' };

/** A client whose subscribes wait, each answered by hand, in order. */
class Client implements ReplayClient {
  readonly log: string[] = [];
  private answers: Array<{ zone: string; answer: (ok: boolean) => void; fail: (e: Error) => void }> = [];

  subscribeOutcome(share: string, gladeId: string): Promise<{ ok: boolean }> {
    this.log.push(`subscribe ${gladeId}`);
    return new Promise((resolve, reject) => {
      this.answers.push({
        zone: gladeId,
        answer: (ok) => {
          this.log.push(`replay delivered ${gladeId}`);
          resolve({ ok });
        },
        fail: reject,
      });
    });
  }

  /** The node answers the oldest subscribe waiting. */
  answer(ok = true): void {
    this.answers.shift()?.answer(ok);
  }

  /** The connection ends. */
  drop(): void {
    this.answers.shift()?.fail(new Error('the connection ended'));
  }

  get waiting(): number {
    return this.answers.length;
  }
}

/** Let every settled promise's callbacks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a zone\'s replay', () => {
  it('is in only once its subscribe has answered, after its replay was delivered', async () => {
    const replays = new ZoneReplays();
    const client = new Client();
    let replayed: boolean | undefined;
    void replays.whenReplayed(THEMES).then((ok) => {
      client.log.push(`replayed ${ok}`);
      replayed = ok;
    });
    const all = replays.subscribeAll(client);
    await settle();
    expect(replayed).toBeUndefined();
    client.answer();
    await all;
    await settle();
    expect(client.log).toEqual([
      'subscribe gyld.appearance', 'replay delivered gyld.appearance', 'replayed true',
    ]);
  });

  it('subscribes zones one at a time, in the order they were added', async () => {
    const replays = new ZoneReplays();
    const client = new Client();
    void replays.whenReplayed(THEMES);
    void replays.whenReplayed(STREAMS);
    const all = replays.subscribeAll(client);
    await settle();
    expect(client.waiting).toBe(1);
    client.answer();
    await settle();
    client.answer();
    await all;
    expect(client.log).toEqual([
      'subscribe gyld.appearance', 'replay delivered gyld.appearance',
      'subscribe gyld.streams', 'replay delivered gyld.streams',
    ]);
  });

  it('is not in when the node refuses the subscribe', async () => {
    const replays = new ZoneReplays();
    const client = new Client();
    const replayed = replays.whenReplayed(THEMES);
    const all = replays.subscribeAll(client);
    await settle();
    client.answer(false);
    await all;
    expect(await replayed).toBe(false);
  });

  it('is not in for any zone left when the connection ends, and the failure is thrown on', async () => {
    const replays = new ZoneReplays();
    const client = new Client();
    const first = replays.whenReplayed(THEMES);
    const second = replays.whenReplayed(STREAMS);
    const all = replays.subscribeAll(client);
    await settle();
    client.drop();
    await expect(all).rejects.toThrow(/connection ended/);
    expect([await first, await second]).toEqual([false, false]);
  });

  it('is never in for a page that did not connect, nor for a zone added too late', async () => {
    const replays = new ZoneReplays();
    const early = replays.whenReplayed(THEMES);
    replays.abandon();
    expect(await early).toBe(false);
    expect(await replays.whenReplayed(STREAMS)).toBe(false);
  });
});
