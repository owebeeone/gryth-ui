import { describe, it, expect } from 'vitest';
import type { AtomTapHandle, Drip, Grip } from '@owebeeone/grip-react';
import { DESKTOP_OPEN_TOOL, DESKTOP_OPEN_WIRED, type ToolLink } from '@grythjs/plugin-api';
import {
  readDecideNow, readLens, readProjection, readStream,
  type GyldDecideNow,
} from '../contract';
import {
  GYLD_DECIDE_NOW, GYLD_DEST_REF, GYLD_DEST_STREAM, GYLD_LENS, GYLD_RECORD,
  GYLD_TAB_ASK_CONVERSATION, GYLD_TAB_ASK_CONVERSATION_TAP,
  GYLD_TAB_ASK_DRAFT, GYLD_TAB_ASK_DRAFT_TAP,
} from '../grips';
import { GYLD_ASK_TOOL } from '../tools';
import { askOn, type BrowserFocusHandles } from '../browser/useBrowserFocus';
import { indexProjection, recordView } from '../records/records';
import { AskWindow } from './AskWindow';
import { askTabTaps, conversationFromParams } from './askTabTaps';
import {
  ASK_CONTEXT_FORMAT, CITED_BY_RULING, askEnvelope, conversationId,
} from './envelope';
import type { GyldBundle, GyldLensState, GyldValue } from '../store/state';
import type { GyldRecordView } from '../records/records';
import { STATIC_SET, mountDesk, wireSink } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';
import decisionsFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';
import decideNowFixture from '../../test/fixtures/bundle/streams/base/decide-now.json';
import projectionFixture from '../../test/fixtures/bundle/streams/base/projection.json';
import baseRecordFixture from '../../test/fixtures/bundle/streams/base/stream.json';
import streamBDecideNowFixture from '../../test/fixtures/bundle/streams/stream-b/decide-now.json';
import lifecycleFixture from '../../test/fixtures/bundle/streams/architecture/lenses/lifecycle.lens.json';
import architectureRecordFixture from '../../test/fixtures/bundle/streams/architecture/stream.json';

// Step 0.3 of GyldAskAgent.md: the context envelope, `gyld.ask-context.v1`.
//
// `askEnvelope()` is pure over grip values, so a GOLDEN envelope is asserted
// with no desk at all: the three cases below are a listed question, a box this
// stream's list carries no row for, and a stream that emitted no list. The
// window is a thin reader of it and is asserted through static markup, which
// is all this package renders.

const KEY_CUSTODY = 'glade_decisions:GladeDecisions.key_custody';
const LIFECYCLE = 'glade_decisions:GladeDecisions.lifecycle_composition';
const OWNER_HELD = 'glade_decisions:GladeDecisions.owner_held_only';
const RECOVERY_KEYS = 'glade_decisions:GladeDecisions.recovery_keys';
const SOCIAL_RECOVERY = 'glade_decisions:GladeDecisions.social_recovery';

const lens = readLens(decisionsFixture);
const decideNow = readDecideNow(decideNowFixture);
const streamBDecideNow = readDecideNow(streamBDecideNowFixture);
const records = indexProjection(readProjection(projectionFixture), 'base');
const baseBundle: GyldBundle = {
  status: 'ok',
  stream: 'base',
  perspectives: [
    'branch', 'decisions', 'neighbourhood-key_custody', 'status', 'tiers',
  ],
  notEmitted: [{ perspective: 'neighbourhood', reason: 'parameterised by question' }],
  lenses: readStream(baseRecordFixture).lenses,
};
const architectureBundle: GyldBundle = {
  status: 'ok',
  stream: 'architecture',
  perspectives: ['allocation', 'cooperation', 'dependencies', 'lifecycle', 'state'],
  lenses: readStream(architectureRecordFixture).lenses,
};

const viewOf = (ref: string, list = decideNow): GyldRecordView =>
  recordView(records, ref, list);

/** ONE bundle image for the file, for the reason menu.test.tsx shares one:
 *  nothing here rewrites a byte of it. */
const image = new FakeBundle();
const desk = () => mountDesk(STATIC_SET, image);

const settled = async <T,>(read: () => T, done: (value: T) => boolean): Promise<T> => {
  await expect.poll(() => done(read())).toBe(true);
  return read();
};

const drawn = async (tab: { read: <T>(grip: Grip<T>) => Drip<T> }): Promise<void> => {
  await settled(
    () => tab.read(GYLD_LENS).get() as GyldLensState,
    (state) => state?.status === 'ok',
  );
  await settled(
    () => tab.read(GYLD_DECIDE_NOW).get() as GyldValue<GyldDecideNow> | undefined,
    (value) => value !== undefined && value.status !== 'unset' && value.status !== 'loading',
  );
};

describe('the golden envelope: a question this stream lists', () => {
  const envelope = askEnvelope({
    stream: 'base',
    perspective: 'decisions',
    slot: KEY_CUSTODY,
    lens,
    decideNow,
    records,
    record: viewOf(KEY_CUSTODY),
    bundle: baseBundle,
    principal: 'gianni',
    conversation: 'conv-browser-1-key_custody-1',
    question: 'why is this blocked?',
  });

  it('is exactly the document section 3 writes down', () => {
    expect(envelope).toEqual({
      format: ASK_CONTEXT_FORMAT,
      stream: 'base',
      perspective: 'decisions',
      snapshot: {
        lineage: 'glade-decision-graph',
        revision: 'v1',
        digest: '94552adafc38d2c6586193d55808901069cc53d72fdd018ebbd6da180682d52c',
      },
      record: {
        slot: KEY_CUSTODY,
        label: 'key_custody',
        lines: [
          'key_custody [Q11]',
          'KeyCustody',
          '  - owner_held_only',
          '  - recovery_keys',
          '  - social_recovery',
        ],
        kind: 'entity',
        definition: 'KeyCustody',
        description: 'Root, device, node and operator key custody and recovery posture.',
      },
      status: {
        emitted: true,
        listed: true,
        declared: 'Open',
        effective: 'Open',
        tier: 'roots',
        answerable_now: true,
        reason: '',
      },
      alternatives: [
        {
          slot: OWNER_HELD,
          label: 'owner_held_only',
          description: "Keys live only on the owner's devices; loss is loss.",
          preferred: false,
        },
        {
          slot: RECOVERY_KEYS,
          label: 'recovery_keys',
          description: 'Offline recovery material minted at genesis.',
          preferred: false,
        },
        {
          slot: SOCIAL_RECOVERY,
          label: 'social_recovery',
          description: 'Threshold recovery across trusted principals.',
          preferred: false,
        },
      ],
      lean: null,
      ruling: null,
      sources: [],
      requires: [],
      unlocks: [
        'glade_decisions:GladeDecisions.transport_key_binding',
        'glade_decisions:GladeDecisions.proof_family',
      ],
      gates: [],
      neighbourhood: {
        stream: 'base',
        perspective: 'neighbourhood-key_custody',
        path: 'streams/base/lenses/neighbourhood-key_custody.lens.json',
        member: true,
      },
      principal: 'gianni',
      conversation: 'conv-browser-1-key_custody-1',
      question: 'why is this blocked?',
    });
  });

  it('carries the question as the host DREW it, not as a label', () => {
    expect(envelope.record.lines)
      .toEqual(lens.nodes.find((node) => node.slot === KEY_CUSTODY)!.text);
  });

  it('reads the Requires adjacency both ways, and nothing transitively', () => {
    // key_custody owns no Requires assertion, so it waits on nothing; two
    // questions name it in their own `questions` role, so it unlocks those two.
    expect(envelope.requires).toEqual([]);
    const proof = askEnvelope({
      stream: 'base',
      perspective: 'decisions',
      slot: 'glade_decisions:GladeDecisions.proof_family',
      lens,
      decideNow,
      records,
      bundle: baseBundle,
    });
    expect(proof.requires).toEqual([
      'glade_decisions:GladeDecisions.grants_as_data',
      KEY_CUSTODY,
    ]);
    expect(proof.unlocks).toEqual(['glade_decisions:GladeDecisions.identity_adapters']);
  });

  it('points at the neighbourhood lens rather than carrying its geometry', () => {
    // A pointer, and only a pointer: no node, edge or box travels in it.
    expect(JSON.stringify(envelope.neighbourhood)).not.toContain('"nodes"');
    // The digest and byte count come from the published `gyld.lens` pointer,
    // which a static root does not have, so they are absent, not invented.
    expect(envelope.neighbourhood?.digest).toBeUndefined();
    expect(envelope.neighbourhood?.bytes).toBeUndefined();
  });

  it('falls back to the decisions lens when the stream emitted no member', () => {
    const other = askEnvelope({
      stream: 'base',
      perspective: 'decisions',
      slot: 'glade_decisions:GladeDecisions.scope_model',
      lens,
      decideNow,
      records,
      bundle: baseBundle,
    });
    expect(other.neighbourhood).toEqual({
      stream: 'base',
      perspective: 'decisions',
      path: 'streams/base/lenses/decisions.lens.json',
      member: false,
    });
  });
});

describe('the golden envelope: a box this stream lists no row for', () => {
  const envelope = askEnvelope({
    stream: 'base',
    perspective: 'decisions',
    slot: OWNER_HELD,
    lens,
    decideNow,
    records,
    record: viewOf(OWNER_HELD),
    bundle: baseBundle,
  });

  it('says the list carries no row, and guesses no status', () => {
    expect(envelope.status).toEqual({
      emitted: true,
      listed: false,
      declared: '',
      effective: '',
      tier: '',
      answerable_now: false,
      reason: '',
    });
    expect(envelope.alternatives).toEqual([]);
    expect(envelope.lean).toBeNull();
    expect(envelope.ruling).toBeNull();
    expect(envelope.gates).toEqual([]);
  });

  it('still carries what the projection DID declare about it', () => {
    expect(envelope.record).toEqual({
      slot: OWNER_HELD,
      label: 'owner_held_only',
      lines: lens.nodes.find((node) => node.slot === OWNER_HELD)?.text ?? [],
      kind: 'entity',
      definition: 'OwnerHeldOnly',
      description: "Keys live only on the owner's devices; loss is loss.",
    });
    // the snapshot is the decide-now file's own field, and that file is there
    expect(envelope.snapshot).not.toBeNull();
  });
});

describe('the golden envelope: a stream that emitted no decide-now list', () => {
  const envelope = askEnvelope({
    stream: 'architecture',
    perspective: 'lifecycle',
    slot: 'glade_architecture:GladeArchitecture.iroh',
    lens: readLens(lifecycleFixture),
    bundle: architectureBundle,
  });

  it('says so in the status block rather than filling one in', () => {
    expect(envelope.status).toEqual({
      emitted: false,
      listed: false,
      declared: '',
      effective: '',
      tier: '',
      answerable_now: false,
      reason: '',
    });
  });

  it('carries no snapshot, because the snapshot is that file`s own field', () => {
    expect(envelope.snapshot).toBeNull();
  });

  it('still carries the drawn text, which is the lens`s and not the list`s', () => {
    expect(envelope.record.lines).toEqual(['iroh', 'IrohAdapter']);
    expect(envelope.record.label).toBe('glade_architecture:GladeArchitecture.iroh');
  });

  it('points at no neighbourhood, because this stream emitted no decisions lens', () => {
    expect(envelope.neighbourhood).toBeNull();
  });
});

describe('the ruling block, joined the way the list joins it', () => {
  it('takes the ruling the ROW names, not the first that decides the slot', () => {
    // stream-b carries two rulings that decide lifecycle_composition: the one
    // stream-a made, retired (live: false), and the one that reopened it. The
    // row's own `ruling` field names the second, so that is the one carried.
    const envelope = askEnvelope({
      stream: 'stream-b',
      perspective: 'decisions',
      slot: LIFECYCLE,
      decideNow: streamBDecideNow,
    });
    expect(envelope.ruling).toEqual({
      slot: 'glade_decisions_stream_b:GladeDecisionsStreamB.lifecycle_reopened',
      text: streamBDecideNow.rulings.find(
        (row) => row.slot === 'glade_decisions_stream_b:GladeDecisionsStreamB.lifecycle_reopened',
      )!.text,
      sources: ['GDL-049', 'AR-08'],
      principal: 'gianni',
      stamp: '2026-09-13T02:00:00Z',
      live: true,
    });
  });

  it('carries the tags it cites, each as unresolved until an index is read', () => {
    const envelope = askEnvelope({
      stream: 'stream-b',
      perspective: 'decisions',
      slot: LIFECYCLE,
      decideNow: streamBDecideNow,
    });
    expect(envelope.sources).toEqual([
      {
        tag: 'GDL-049',
        cites: CITED_BY_RULING,
        stream: 'stream-b',
        resolved: false,
        reason: 'this build emitted no source index',
      },
      {
        tag: 'AR-08',
        cites: CITED_BY_RULING,
        stream: 'stream-b',
        resolved: false,
        reason: 'this build emitted no source index',
      },
    ]);
  });
});

describe('the conversation id', () => {
  it('is conv-<tabId>-<slot>-<stamp>', () => {
    expect(conversationId('browser-1', KEY_CUSTODY, 1789400045084))
      .toBe(`conv-browser-1-${KEY_CUSTODY}-1789400045084`);
  });

  it('names the window even when there is no tab id to name', () => {
    expect(conversationId('', KEY_CUSTODY, 7)).toBe(`conv-tab-${KEY_CUSTODY}-7`);
  });

  it('is read back off the opening link, and is empty when the link had none', () => {
    expect(conversationFromParams({ conversation: 'conv-a-b-1' })).toBe('conv-a-b-1');
    expect(conversationFromParams({})).toBe('');
    expect(conversationFromParams({ conversation: 7 })).toBe('');
  });
});

describe('Ask about this opens the window', () => {
  const handles = (over: Partial<BrowserFocusHandles> = {}): BrowserFocusHandles & {
    opened: ToolLink[]; wired: { source: string; link: ToolLink }[];
  } => {
    const opened: ToolLink[] = [];
    const wired: { source: string; link: ToolLink }[] = [];
    return {
      opened,
      wired,
      wiredTo: '',
      stream: 'base',
      perspective: 'decisions',
      openTool: (link: ToolLink) => opened.push(link),
      openWired: (source: string, link: ToolLink) => wired.push({ source, link }),
      ...over,
    };
  };

  it('opens a standalone window on the stream, the record and the conversation', () => {
    const on = handles();
    askOn(on, KEY_CUSTODY, 'conv-tab-x-1');
    expect(on.opened).toEqual([{
      toolId: GYLD_ASK_TOOL,
      params: {
        stream: 'base',
        ref: KEY_CUSTODY,
        perspective: 'decisions',
        conversation: 'conv-tab-x-1',
      },
    }]);
  });

  it('moves the wired browser and copies NO destination into the sink', () => {
    const moved: string[] = [];
    const on = handles({
      wiredTo: 'browser-1',
      ref: { set: (slot: string) => { moved.push(slot); } } as unknown as BrowserFocusHandles['ref'],
      retarget: () => {},
    });
    askOn(on, KEY_CUSTODY, 'conv-browser-1-x-1');
    expect(moved).toEqual([KEY_CUSTODY]);
    expect(on.wired).toEqual([{
      source: 'browser-1',
      link: { toolId: GYLD_ASK_TOOL, params: { conversation: 'conv-browser-1-x-1' } },
    }]);
    expect(on.opened).toEqual([]);
  });
});

describe('the gyld.ask window', () => {
  it('seeds the conversation and the draft, and the destination when the link has one',
    async () => {
      const tab = desk().tab('ask-seeded', askTabTaps('ask-seeded', {
        stream: 'base', ref: KEY_CUSTODY, conversation: 'conv-browser-1-key-1',
      }));
      await expect.poll(() => tab.read(GYLD_DEST_STREAM).get()).toBe('base');
      expect(tab.read(GYLD_DEST_REF).get()).toBe(KEY_CUSTODY);
      expect(tab.read(GYLD_TAB_ASK_CONVERSATION).get()).toBe('conv-browser-1-key-1');
      expect(tab.read(GYLD_TAB_ASK_DRAFT).get()).toBe('');
    });

  it('seeds NO destination when the link carries none, so a wired window follows',
    async () => {
      const browser = desk().tab('browser-1', [
        ...askTabTaps('browser-1', { stream: 'base', ref: KEY_CUSTODY }),
      ]);
      await expect.poll(() => browser.read(GYLD_DEST_REF).get()).toBe(KEY_CUSTODY);
      const sink = wireSink(browser, 'ask-wired', askTabTaps('ask-wired', {
        conversation: 'conv-browser-1-key-1',
      }));
      await expect.poll(() => sink.read(GYLD_DEST_REF).get()).toBe(KEY_CUSTODY);
      expect(sink.read(GYLD_DEST_STREAM).get()).toBe('base');
      expect(sink.read(GYLD_TAB_ASK_CONVERSATION).get()).toBe('conv-browser-1-key-1');
    });

  it('draws the envelope as pretty JSON beside the question box, with NO submit',
    async () => {
      const tab = desk().tab('ask-draw', askTabTaps('ask-draw', {
        stream: 'base',
        perspective: 'decisions',
        ref: KEY_CUSTODY,
        conversation: 'conv-browser-1-key-1',
      }));
      await settled(
        () => tab.read(GYLD_RECORD).get() as GyldRecordView | undefined,
        (view) => view?.status === 'ok',
      );
      await drawn(tab);
      (tab.read(GYLD_TAB_ASK_DRAFT_TAP).get() as AtomTapHandle<string>)
        .set('why is this blocked?');
      const markup = tab.render(<AskWindow />);
      expect(markup).toContain(ASK_CONTEXT_FORMAT);
      expect(markup).toContain('conversation conv-browser-1-key-1');
      expect(markup).toContain('why is this blocked?');
      expect(markup).toContain('&quot;label&quot;: &quot;key_custody&quot;');
      expect(markup).toContain('&quot;tier&quot;: &quot;roots&quot;');
      expect(markup).toContain('neighbourhood-key_custody');
      // the question as the host DREW it, out of the lens this window names
      expect(markup).toContain('key_custody [Q11]');
      expect(markup).toContain('Nothing is sent yet');
      expect(markup).not.toContain('<button');
    });

  it('says it has no record rather than composing an envelope of nothing', async () => {
    const tab = desk().tab('ask-bare', askTabTaps('ask-bare'));
    await expect.poll(() => tab.read(GYLD_TAB_ASK_CONVERSATION).get()).toBe('');
    const markup = tab.render(<AskWindow />);
    expect(markup).toContain('no record on this window yet');
    expect(markup).not.toContain(ASK_CONTEXT_FORMAT);
  });

  it('takes the conversation from the opening link and offers none of its own',
    async () => {
      const tab = desk().tab('ask-noconv', askTabTaps('ask-noconv', {
        stream: 'base', ref: KEY_CUSTODY,
      }));
      await settled(
        () => tab.read(GYLD_RECORD).get() as GyldRecordView | undefined,
        (view) => view?.status === 'ok',
      );
      expect(tab.read(GYLD_TAB_ASK_CONVERSATION_TAP).get()).toBeDefined();
      expect(tab.render(<AskWindow />)).toContain('no conversation on this window yet');
    });
});

describe('the menu reaches the window', () => {
  it('is ready as soon as the desk can open a window', async () => {
    // The hook's readiness is the shell intent it resolved; a desk with none
    // says the act cannot be carried out rather than doing nothing.
    const tab = desk().tab('ask-ready', askTabTaps('ask-ready', { stream: 'base' }));
    expect(tab.read(DESKTOP_OPEN_TOOL).get()).toBeUndefined();
    expect(tab.read(DESKTOP_OPEN_WIRED).get()).toBeUndefined();
  });
});
