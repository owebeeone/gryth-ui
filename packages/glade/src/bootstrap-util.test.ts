import { describe, it, expect } from 'vitest';
import { DEV_FALLBACK_NODE_WS, pickNodeWs, pickPrincipal } from './bootstrap-util';

// The glade bootstrap's decision logic (GLP-0006 P1.S4): pure helpers, driven
// by fakes. Who a page is, resolved from these before it composes, is
// `identity.ts`'s (identity.test.ts).

describe('pickNodeWs — grazel /bootstrap.json → node_ws (dev fallback)', () => {
  it('uses the payload node_ws when grazel provides one', () => {
    expect(pickNodeWs({ node_ws: 'ws://10.0.0.5:9099', mode: 'both', name: 'grazel' })).toBe(
      'ws://10.0.0.5:9099',
    );
  });

  it('falls back to the dev node when the payload is absent or blank', () => {
    expect(pickNodeWs(undefined)).toBe(DEV_FALLBACK_NODE_WS);
    expect(pickNodeWs({})).toBe(DEV_FALLBACK_NODE_WS);
    expect(pickNodeWs({ node_ws: '   ' })).toBe(DEV_FALLBACK_NODE_WS);
  });

  it('honors an explicit fallback override', () => {
    expect(pickNodeWs(undefined, 'ws://custom:1234')).toBe('ws://custom:1234');
  });
});

describe('pickPrincipal — the URL, else the principal grazel serves', () => {
  const boot = { node_ws: 'ws://127.0.0.1:9099', mode: 'both', name: 'grazel', principal: 'owner' };

  it('prefers ?principal=, then ?user=, then the bootstrap', () => {
    expect(pickPrincipal('?principal=alice', boot)).toBe('alice');
    expect(pickPrincipal('?user=bob', boot)).toBe('bob');
    expect(pickPrincipal('?principal=alice&user=bob', boot)).toBe('alice');
    expect(pickPrincipal('', boot)).toBe('owner');
  });

  it('names nobody when neither does, as with no grazel or one given no --principal', () => {
    expect(pickPrincipal('', undefined)).toBeUndefined();
    expect(pickPrincipal('', { node_ws: 'ws://127.0.0.1:9099', mode: 'both', name: 'grazel' })).toBeUndefined();
  });

  it('reads a blank name, or one that is not a string, as no name', () => {
    expect(pickPrincipal('?principal=', boot)).toBe('owner');
    expect(pickPrincipal('?principal=%20', boot)).toBe('owner');
    expect(pickPrincipal('?principal=&user=bob', boot)).toBe('bob');
    expect(pickPrincipal('', { principal: '  ' })).toBeUndefined();
    expect(pickPrincipal('', { principal: 7 } as never)).toBeUndefined();
  });
});
