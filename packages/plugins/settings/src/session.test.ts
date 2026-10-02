import { describe, expect, it } from 'vitest';
import { resolveDeskSession } from './session';

function browser() {
  const rows = new Map<string, string>();
  return { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); } };
}
const user = { principal: 'owner', roams: true, origin: 'tab' };
describe('SS-02 session names', () => {
  it('uses the named session and makes an encoded link retaining other URL options', () => {
    const session = resolveDeskSession(user, 'gyld', '?session=desk%20one', browser(), () => 'new');
    expect(session.name).toBe('desk one');
    expect(session.key).toBe('self:owner/desk one');
    const link = new URL(session.link('https://desk.test/?x=1#view'));
    expect(link.searchParams.get('principal')).toBe('owner');
    expect(link.searchParams.get('session')).toBe('desk one');
    expect(link.searchParams.get('x')).toBe('1');
    expect(link.hash).toBe('#view');
  });
  it('reuses the generated name for one browser, principal and entry', () => {
    const store = browser();
    const first = resolveDeskSession(user, 'gyld', '', store, () => 'one');
    expect(resolveDeskSession(user, 'gyld', '', store, () => 'two').name).toBe(first.name);
    expect(resolveDeskSession(user, 'desktop', '', store, () => 'three').name).toBe('three');
    expect(resolveDeskSession({ ...user, principal: 'bob' }, 'gyld', '', store, () => 'four').name).toBe('four');
  });
  it('ignores a session on an unnamed page and survives blocked storage', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(resolveDeskSession(user, 'gyld', '', blocked, () => 'one').name).toBe('one');
    expect(resolveDeskSession({ ...user, roams: false }, 'gyld', '?session=shared', blocked, () => 'one').shared).toBe(false);
  });
  it('refuses an ambiguous principal boundary', () => {
    expect(() => resolveDeskSession({ ...user, principal: 'a/b' }, 'gyld', '?session=c', browser())).toThrow('principal');
  });
});
