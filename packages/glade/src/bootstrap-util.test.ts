import { describe, it, expect } from 'vitest';
import { DEV_FALLBACK_NODE_WS, pickNodeWs, pickPrincipal } from './bootstrap-util';

// The glade bootstrap's decision logic (GLP-0006 P1.S4). The runtime module
// itself touches sessionStorage/location/WebSocket at import, so the testable
// contract is these pure helpers driven by fakes.

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

describe('pickPrincipal — URL identity, else per-tab origin', () => {
  it('prefers ?principal=, then ?user=, else the origin', () => {
    expect(pickPrincipal('?principal=alice', 'tab7')).toBe('alice');
    expect(pickPrincipal('?user=bob', 'tab7')).toBe('bob');
    expect(pickPrincipal('?principal=alice&user=bob', 'tab7')).toBe('alice');
    expect(pickPrincipal('', 'tab7')).toBe('tab7');
  });

  it('two tabs with no param are distinct participants; the same param converges them', () => {
    // per-tab origins → different principals (the two-participant demo intent)
    expect(pickPrincipal('', 'tabA')).not.toBe(pickPrincipal('', 'tabB'));
    // the same ?principal on both → the same participant
    expect(pickPrincipal('?principal=gianni', 'tabA')).toBe(pickPrincipal('?principal=gianni', 'tabB'));
  });
});
