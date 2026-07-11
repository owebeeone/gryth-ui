import { describe, it, expect } from 'vitest';
import { groupKey, postChat, type ChatController, type ChatLine } from '@owebeeone/glade-chat';
import { CHAT_GROUPS, chatM, groupLabel, groupListGrip, groupSurface } from './groups';

// The Chat plugin's LIVE wiring contract (GLP-0006 P1.S4), tested DOM-free. The
// glial mounts + connect path need the runtime; here we pin the pre-declared
// config against grazel-app.glade and the keyed-surface + attribution contract
// the panel relies on.

describe('chat groups — pre-declared config (matches grazel-app.glade)', () => {
  it('declares exactly #general and #dev, in order', () => {
    expect(CHAT_GROUPS.map((g) => g.id)).toEqual(['general', 'dev']);
    expect(CHAT_GROUPS.map((g) => g.label)).toEqual(['#general', '#dev']);
  });

  it('maps a group id to its label, falling back to the id', () => {
    expect(groupLabel('general')).toBe('#general');
    expect(groupLabel('dev')).toBe('#dev');
    expect(groupLabel('nope')).toBe('nope');
  });
});

describe('chat surfaces — one keyed commons log per group (chat.msgs, group=key)', () => {
  it('shares the chat.msgs glade id + "chat" share, keyed distinctly per group', () => {
    const general = groupSurface('general');
    const dev = groupSurface('dev');
    expect(general.glade_id.id).toBe('chat.msgs');
    expect(dev.glade_id.id).toBe('chat.msgs');
    expect(general.share).toBe('chat');
    expect(general.shape).toBe('log');
    // the group id IS the wire key — isolation is a routing property
    expect(general.key).toEqual(groupKey('general'));
    expect(dev.key).toEqual(groupKey('dev'));
    expect(general.key).not.toEqual(dev.key);
  });

  it('exposes the metadata group-list value + declaration log surfaces', () => {
    expect(chatM.groups.glade_id.id).toBe('chat.groups');
    expect(chatM.decl.glade_id.id).toBe('chat.decl');
  });

  it('a foreign group throws (only pre-declared groups exist in stage 1)', () => {
    expect(() => groupSurface('random')).toThrow(/unknown group/);
    expect(() => groupListGrip('random')).toThrow(/unknown group/);
  });
});

describe('groupListGrip — distinct shared line-list grip per group', () => {
  it('returns a stable, distinct grip per group', () => {
    expect(groupListGrip('general')).toBe(groupListGrip('general'));
    expect(groupListGrip('general')).not.toBe(groupListGrip('dev'));
  });
});

describe('post attribution — the client-append contract postToGroup relies on', () => {
  it('stamps {ts,user,text,principal} through the group log controller', () => {
    const appended: ChatLine[] = [];
    const ctl: ChatController = { append: (l) => appended.push(l) };
    const line = postChat(ctl, 'hello #general', 'alice', { ts: 1000 });
    expect(line).toEqual({ ts: 1000, user: 'alice', text: 'hello #general', principal: 'alice' });
    expect(appended).toEqual([line]);
  });
});
