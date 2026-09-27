import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdentitySources } from './identity';

// The runtime captures the principal as it loads: its own `principal` and
// `origin`, and every plugin handle built from them. So it reads the identity
// the entry's loader resolved, and never the page. Each test loads a fresh
// copy (vi.resetModules), as a page does, after resolving an identity from
// faked sources.

function sources(): IdentitySources {
  const held = new Map([['glade-origin', 'tab7']]);
  return {
    search: '',
    tabStore: {
      getItem: (key) => held.get(key) ?? null,
      setItem: (key, value) => {
        held.set(key, value);
      },
    },
    bootstrap: Promise.resolve({
      node_ws: 'ws://127.0.0.1:9106',
      mode: 'both',
      name: 'grazel',
      principal: 'owner',
    }),
    schedule: () => () => {},
  };
}

beforeEach(() => {
  vi.resetModules();
});

describe('the glade runtime', () => {
  it('will not load before its loader has resolved the identity', async () => {
    await expect(import('./runtime')).rejects.toThrow(/before .*loader/);
  });

  it('stamps the principal the loader resolved, and mints under the tab origin', async () => {
    const { establishDeskIdentity } = await import('./identity');
    const identity = await establishDeskIdentity(sources());
    const runtime = await import('./runtime');
    expect(runtime.principal).toBe('owner');
    expect(runtime.origin).toBe('tab7');
    expect(runtime.session.origin).toBe('tab7');
    const { grok } = await import('@grythjs/plugin-api');
    const held = grok.query(runtime.GLADE_IDENTITY, grok.mainContext);
    grok.flush();
    expect(held.get()).toBe(identity);
  });

  it('keeps a write made while the socket connects, rather than throwing it', async () => {
    const { establishDeskIdentity } = await import('./identity');
    await establishDeskIdentity(sources());
    const runtime = await import('./runtime');
    const { utf8 } = await import('@owebeeone/glial-runtime');
    // What the browser's WebSocket.send does while the socket is CONNECTING.
    vi.spyOn(runtime.client, 'sendOps').mockImplementation(() => {
      throw new Error("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.");
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const destination = runtime.gladeDest({
      share: 'ws-razel',
      gladeId: 'gyld.appearance',
      shape: 'value',
      key: utf8('self:owner'),
    })();
    let sent: unknown;
    expect(() => {
      sent = destination.send(utf8('{"v":1}'));
    }).not.toThrow();
    // The op waits in the session, whose ops startGlade ships once the socket
    // is up; and the instance, handed it back, folds it now.
    expect(runtime.session.dump()).toContainEqual(sent);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
