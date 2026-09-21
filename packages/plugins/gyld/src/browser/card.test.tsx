import { describe, it, expect } from 'vitest';
import {
  createAtomValueTap, type AtomTapHandle, type Drip, type Grip,
} from '@owebeeone/grip-react';
import {
  DESKTOP_OPEN_TOOL, DESKTOP_OPEN_WIRED, DESKTOP_RETARGET_TAB, type ToolLink,
} from '@grythjs/plugin-api';
import { readDecideNow, readLens, type GyldDecideNow } from '../contract';
import {
  GYLD_DECIDE_NOW, GYLD_DEST_REF, GYLD_DEST_REF_TAP, GYLD_LENS, GYLD_RECORDS,
  GYLD_STREAM_DRAFT, GYLD_STREAMS, GYLD_TAB_HOVER, GYLD_TAB_HOVER_TAP, GYLD_TAB_ID,
} from '../grips';
import { GyldBrowser } from '../GyldBrowser';
import { DecideWindow } from '../decide/DecideWindow';
import { decideTabTaps } from '../decide/decideTabTaps';
import { StreamManager } from '../streams/StreamManager';
import { streamsTabTaps } from '../streams/streamsTabTaps';
import {
  StreamOperation, draftCommand, draftFromParams, draftShapeFaults, rulingStreamName,
  type StreamDraft,
} from '../streams/operations';
import { GYLD_DECIDE_TOOL, GYLD_DETAIL_TOOL, GYLD_STREAMS_TOOL } from '../tools';
import { buildScene } from '../lens/scene';
import { answerableBecause, answerableSays, blockedSays, cardFor } from './card';
import { slotTitle } from '../records/records';
import { browserTabTaps } from './browserTabTaps';
import { linkForRulingLink } from './links';
import { nextUpOf } from './nextUp';
import { decideOn, detailOn, type BrowserFocusHandles } from './useBrowserFocus';
import type { GyldLensState, GyldStreamsCensus, GyldValue } from '../store/state';
import { mountDesk, wireSink } from '../../test/mount';
import decisionsFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';
import decideNowFixture from '../../test/fixtures/bundle/streams/base/decide-now.json';

// The node card (GyldUiSimplification.md 2.2, owner ruling U3: on hover).
//
// The card decides nothing: the question's text is the box text the host drew,
// the alternatives are that row's own `offers` with its own `preferred`
// marked, and the reason it cannot be answered is its own `blocked_by`,
// `gated_by` or `ruling`. The presses only open windows, and each one is
// asserted by calling the ACT with the handles the hook resolves — this
// package renders to static markup and dispatches no click.

const lens = readLens(decisionsFixture);
const decideNow = readDecideNow(decideNowFixture);
const KEY_CUSTODY = 'glade_decisions:GladeDecisions.key_custody';
const SCOPE_MODEL = 'glade_decisions:GladeDecisions.scope_model';
const SHAKU = 'glade_decisions:GladeDecisions.shaku_injector';
const VERSION_PIN = 'glade_decisions:GladeDecisions.version_pin';

const scene = buildScene(lens, { nextUp: nextUpOf(lens, decideNow) });
const nodeAt = (slot: string) => scene.nodes.find((node) => node.slot === slot)!;
const rowAt = (slot: string) => decideNow.questions.find((row) => row.slot === slot)!;

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

describe('the card leads with the question the record asks', () => {
  // The fixture bundle predates the emitted `title`, so its lens nodes carry
  // none and its projection carries the docstring. Both paths are exercised
  // here without refreshing that bundle.
  const withTitle = { ...nodeAt(KEY_CUSTODY), title: 'Who holds the keys?' };

  it('takes the lens node title when the lens carries one', () => {
    expect(cardFor(withTitle, decideNow, undefined).title).toBe('Who holds the keys?');
  });

  it('falls back to the record docstring when the lens carries none', async () => {
    const desk = mountDesk();
    const tab = desk.tab('card-title', browserTabTaps('card-title', { stream: 'base' }));
    const records = await settled(
      () => tab.read(GYLD_RECORDS).get(),
      (value) => value?.status === 'ok',
    );
    const node = nodeAt(KEY_CUSTODY);
    expect(node.title).toBeUndefined();
    expect(cardFor(node, decideNow, records).title)
      .toBe(slotTitle(records, KEY_CUSTODY));
    expect(cardFor(node, decideNow, records).title).not.toBe('');
  });

  it('is empty when neither the lens nor the record carries one', () => {
    // A row this stream does not list takes the same path, so the fallback is
    // not something only a listed question gets.
    expect(cardFor(nodeAt(KEY_CUSTODY), decideNow, undefined).title).toBe('');
    expect(cardFor(nodeAt(KEY_CUSTODY), undefined, undefined).title).toBe('');
  });

  it('renders the question above the identifier, and nothing when there is none', () => {
    expect(cardFor(withTitle, decideNow, undefined).label).toBe(rowAt(KEY_CUSTODY).label);
    // The drawn box text is untouched by the title: the card still shows the
    // host's own lines, in the host's order.
    expect(cardFor(withTitle, decideNow, undefined).lines).toEqual(nodeAt(KEY_CUSTODY).lines);
  });
});

describe('the card says what the row says, and nothing more', () => {
  it('carries an Open question, its drawn text and its alternatives', () => {
    const card = cardFor(nodeAt(KEY_CUSTODY), decideNow, undefined);
    const row = rowAt(KEY_CUSTODY);
    expect(card.listed).toBe(true);
    expect(card.label).toBe(row.label);
    expect(card.status).toBe('Open');
    expect(card.answerable).toBe(true);
    expect(card.blocked).toBe('');
    // the question's TEXT is the lines the host drew in the box
    expect(card.lines).toEqual(lens.nodes.find((n) => n.slot === KEY_CUSTODY)!.text);
    expect(card.alternatives.map((alternative) => alternative.slot)).toEqual(row.offers);
    // Open means no lean is recorded, so none is marked
    expect(card.alternatives.some((alternative) => alternative.preferred)).toBe(false);
  });

  it('marks the recorded lean on a Lean question, and only that one', () => {
    const card = cardFor(nodeAt(SCOPE_MODEL), decideNow, undefined);
    const row = rowAt(SCOPE_MODEL);
    expect(card.status).toBe('Lean');
    expect(row.preferred).toBeDefined();
    expect(card.alternatives.filter((alternative) => alternative.preferred)
      .map((alternative) => alternative.slot)).toEqual([row.preferred]);
  });

  it('carries a Decided question with its offers and the reason it is closed', () => {
    const card = cardFor(nodeAt(SHAKU), decideNow, undefined);
    const row = rowAt(SHAKU);
    expect(card.status).toBe('Decided');
    expect(card.answerable).toBe(false);
    expect(card.blocked).not.toBe('');
    expect(card.blocked).toBe(blockedSays(row));
    // O2: a decided question KEEPS its offers, so the card still lists them
    expect(card.alternatives.map((alternative) => alternative.slot)).toEqual(row.offers);
  });

  it('gives one emitted reason, in the order the list itself groups them', () => {
    const base = rowAt(KEY_CUSTODY);
    expect(blockedSays(base)).toBe('');
    expect(blockedSays({ ...base, answerable_now: false, blocked_by: ['a'], gated_by: ['b'] }))
      .toBe('blocked by a');
    expect(blockedSays({ ...base, answerable_now: false, blocked_by: [], gated_by: ['b'] }))
      .toBe('gated by b');
    expect(blockedSays({
      ...base, answerable_now: false, blocked_by: [], gated_by: [], ruling: 'r',
    })).toBe('ruled by r');
    expect(blockedSays({ ...base, answerable_now: false, blocked_by: [], gated_by: [] }))
      .toBe('this stream does not list it as answerable now');
  });

  it('says why a question IS answerable, as plainly as why one is not', () => {
    const custody = cardFor(nodeAt(KEY_CUSTODY), decideNow, undefined);
    expect(custody.blocked).toBe('');
    expect(custody.answerableBecause).toBe(
      'answerable now: no prerequisite at all, nothing gates it, not branch-induced',
    );
    const scope = cardFor(nodeAt(SCOPE_MODEL), decideNow, undefined);
    expect(scope.answerableBecause).toBe(
      'answerable now: every prerequisite is decided ('
      + 'glade_decisions:GladeDecisions.grants_as_data, '
      + 'glade_decisions:GladeDecisions.iroh_transport'
      + '), nothing gates it, not branch-induced',
    );
    // A question that is not answerable says nothing here and keeps its own line.
    const decided = cardFor(nodeAt(SHAKU), decideNow, undefined);
    expect(decided.answerableBecause).toBe('');
    expect(decided.blocked).not.toBe('');
  });

  it('names the ruling that decided a prerequisite, where the row records one', () => {
    const row = rowAt(KEY_CUSTODY);
    const ruled = {
      ...row,
      answerable_because: {
        prerequisites: [
          { slot: 'a', effective_status: 'Decided', ruling: 'r1' },
          { slot: 'b', effective_status: 'Decided' },
        ],
        gated_by: [],
        induced_by: [],
      },
    };
    expect(answerableBecause(ruled)).toBe(
      'every prerequisite is decided (a by ruling r1, b), nothing gates it, not branch-induced',
    );
  });

  it('says nothing at all for a row an older bundle emitted without the reason', () => {
    const older = { ...rowAt(KEY_CUSTODY) };
    delete older.answerable_because;
    expect(older.answerable_now).toBe(true);
    expect(answerableSays(older)).toBe('');
    expect(answerableBecause(older)).toBe('');
    expect(blockedSays(older)).toBe('');
  });

  it('reads the reason rather than assuming it, when the emitted lists disagree', () => {
    const row = rowAt(KEY_CUSTODY);
    expect(answerableBecause({
      ...row,
      answerable_because: {
        prerequisites: [{ slot: 'a', effective_status: 'Open' }],
        gated_by: ['g'],
        induced_by: ['i'],
      },
    })).toBe('its prerequisites are a (Open), gated by g, induced by i');
  });

  it('says a box is not a question this stream lists, rather than unanswerable', () => {
    const unlisted = scene.nodes.find(
      (node) => !decideNow.questions.some((row) => row.slot === node.slot),
    )!;
    const card = cardFor(unlisted, decideNow, undefined);
    expect(card.listed).toBe(false);
    expect(card.status).toBe('');
    expect(card.blocked).toBe('');
    expect(card.alternatives).toEqual([]);
    // no row, so nothing is named but the slot the picture drew
    expect(card.label).toBe(unlisted.slot);
  });
});

describe('the card is drawn over the box the pointer is on', () => {
  const hovering = async (tabId: string, stream: string, slot: string) => {
    const desk = mountDesk();
    const home = desk.ctx.getGripHomeContext();
    home.registerTap(createAtomValueTap(DESKTOP_OPEN_WIRED, { initial: () => {} }));
    home.registerTap(createAtomValueTap(DESKTOP_RETARGET_TAB, { initial: () => {} }));
    home.registerTap(createAtomValueTap(DESKTOP_OPEN_TOOL, { initial: () => {} }));
    const tab = desk.tab(tabId, browserTabTaps(tabId, { stream, perspective: 'decisions' }));
    await drawn(tab);
    const state = tab.read(GYLD_LENS).get() as GyldLensState;
    const node = state.value!.nodes.find((entry) => entry.slot === slot)!;
    (tab.read(GYLD_TAB_HOVER_TAP).get() as AtomTapHandle<string>).set(node.id);
    await expect.poll(() => tab.read(GYLD_TAB_HOVER).get()).toBe(node.id);
    return { desk, tab, markup: tab.render(<GyldBrowser tabId={tabId} />) };
  };

  it('draws nothing at all while the pointer is on no box', async () => {
    const desk = mountDesk();
    const tab = desk.tab('card-cold', browserTabTaps('card-cold', {
      stream: 'base', perspective: 'decisions',
    }));
    await drawn(tab);
    expect(tab.render(<GyldBrowser tabId="card-cold" />)).not.toContain('gyld-node-card');
  });

  it('shows the question, its alternatives and its three acts on an Open box', async () => {
    const on = await hovering('card-open', 'base', KEY_CUSTODY);
    expect(on.markup).toContain('gyld-node-card');
    expect(on.markup).toContain(`data-slot="${KEY_CUSTODY}"`);
    expect(on.markup).toContain('data-status="Open"');
    expect(on.markup).toContain('KeyCustody');
    for (const offer of rowAt(KEY_CUSTODY).offers) {
      expect(on.markup).toContain(offer.slice(offer.lastIndexOf('.') + 1));
    }
    expect(on.markup).toContain('Answer</button>');
    expect(on.markup).toContain('Ask a follow-up');
    expect(on.markup).toContain('Details');
    // answerable now, so nothing is disabled and no reason is given
    expect(/<button[^>]*class="gyld-card-answer"[^>]*disabled/.test(on.markup)).toBe(false);
    expect(on.markup).not.toContain('gyld-node-card-blocked');
    // anchored UNDER the emitted box, through the camera, and nothing moved
    expect(on.markup).toContain('gyld-card-anchor');
  });

  it('draws the answerable reason on the card of an answerable box', async () => {
    const on = await hovering('card-why', 'base', KEY_CUSTODY);
    expect(on.markup).toContain('gyld-node-card-answerable');
    expect(on.markup).toContain('answerable now: no prerequisite at all');
    expect(on.markup).toContain('nothing gates it, not branch-induced');
    expect(on.markup).not.toContain('gyld-node-card-blocked');
  });

  it('shows a Decided box closed, with the ruling that closed it', async () => {
    const on = await hovering('card-done', 'base', SHAKU);
    expect(on.markup).toContain('data-status="Decided"');
    expect(/<button[^>]*class="gyld-card-answer"[^>]*disabled/.test(on.markup)).toBe(true);
    expect(on.markup).toContain('gyld-node-card-blocked');
    // Details is still offered: a decided question is still a record to read
    expect(/<button[^>]*class="gyld-card-detail"[^>]*disabled/.test(on.markup)).toBe(false);
  });

  it('offers a follow-up on a box with no row, and withholds only Answer', async () => {
    // The card and the MENU must agree about one box (`menu.ts`,
    // `MenuAct.needsRow`): a follow-up is a NEW question with this one ticked
    // as a prerequisite, which any drawn question can take, and only Answer
    // needs a decide-now row to be answerable at all. A card that withheld the
    // follow-up here would be the second surface saying something different
    // about the same box.
    const unlisted = buildScene(lens, { nextUp: nextUpOf(lens, decideNow) }).nodes.find(
      (node) => node.slot !== '' && !decideNow.questions.some((row) => row.slot === node.slot),
    )!;
    const on = await hovering('card-unlisted', 'base', unlisted.slot);
    expect(on.markup).toContain('gyld-node-card');
    expect(on.markup).toContain('not a question this stream lists');
    expect(on.markup).toContain('gyld-card-ask');
    expect(on.markup).toContain('Ask a follow-up');
    expect(on.markup).not.toContain('gyld-card-answer');
    // Details is offered on every box, listed or not
    expect(on.markup).toContain('gyld-card-detail');
  });

  it('marks the lean on the card of a Lean box', async () => {
    const on = await hovering('card-lean', 'base', SCOPE_MODEL);
    expect(on.markup).toContain('data-status="Lean"');
    expect(on.markup).toContain('the recorded lean');
    expect(on.markup).toContain('data-preferred="yes"');
  });
});

describe('Answer and Ask open the decide window on this question', () => {
  /** The handles `useBrowserFocus` resolves, read off a real browser tab. */
  const overBrowser = async (tabId: string, stream: string) => {
    const desk = mountDesk();
    const opened: ToolLink[] = [];
    const wired: { source: string; link: ToolLink }[] = [];
    const retargets: { tab: string; params: Record<string, unknown> }[] = [];
    const home = desk.ctx.getGripHomeContext();
    home.registerTap(createAtomValueTap(DESKTOP_OPEN_TOOL, {
      initial: (link: ToolLink) => { opened.push(link); },
    }));
    home.registerTap(createAtomValueTap(DESKTOP_OPEN_WIRED, {
      initial: (source: string, link: ToolLink) => { wired.push({ source, link }); },
    }));
    home.registerTap(createAtomValueTap(DESKTOP_RETARGET_TAB, {
      initial: (tab: string, params: Record<string, unknown>) => {
        retargets.push({ tab, params });
      },
    }));
    const browser = desk.tab(tabId, browserTabTaps(tabId, { stream, perspective: 'decisions' }));
    await drawn(browser);
    const handles: BrowserFocusHandles = {
      wiredTo: browser.read(GYLD_TAB_ID).get() ?? '',
      stream,
      perspective: 'decisions',
      ref: browser.read(GYLD_DEST_REF_TAP).get() as AtomTapHandle<string>,
      retarget: browser.read(DESKTOP_RETARGET_TAB).get(),
      openTool: browser.read(DESKTOP_OPEN_TOOL).get(),
      openWired: browser.read(DESKTOP_OPEN_WIRED).get(),
    };
    return {
      desk, browser, handles, opened, wired, retargets,
    };
  };

  it('moves the browser onto the question and opens the decide window wired', async () => {
    const on = await overBrowser('card-answer', 'base');
    expect(on.handles.wiredTo).toBe('card-answer');
    decideOn(on.handles, KEY_CUSTODY);
    // the live window moved, through its own handle
    expect(on.browser.read(GYLD_DEST_REF).get()).toBe(KEY_CUSTODY);
    // and its tab RECORD carries it, so a reload comes back on it
    expect(on.retargets).toEqual([{
      tab: 'card-answer',
      params: { stream: 'base', perspective: 'decisions', focus: KEY_CUSTODY },
    }]);
    // one decide window, wired to this browser, with NO param copied: the
    // question travels as the browser's own Gyld.Dest.Ref
    expect(on.wired).toEqual([{ source: 'card-answer', link: { toolId: GYLD_DECIDE_TOOL } }]);
    expect(on.opened).toEqual([]);
  });

  it('opens the detail window the same way, through the wire', async () => {
    const on = await overBrowser('card-detail', 'base');
    detailOn(on.handles, SCOPE_MODEL);
    expect(on.browser.read(GYLD_DEST_REF).get()).toBe(SCOPE_MODEL);
    expect(on.wired).toEqual([{ source: 'card-detail', link: { toolId: GYLD_DETAIL_TOOL } }]);
  });

  it('opens a standalone window on the spec link when there is no browser', () => {
    const opened: ToolLink[] = [];
    const handles: BrowserFocusHandles = {
      wiredTo: '',
      stream: 'base',
      perspective: 'decisions',
      openTool: (link: ToolLink) => { opened.push(link); },
    };
    decideOn(handles, KEY_CUSTODY);
    detailOn(handles, KEY_CUSTODY);
    expect(opened).toEqual([
      { toolId: GYLD_DECIDE_TOOL, params: { stream: 'base', question: KEY_CUSTODY } },
      { toolId: GYLD_DETAIL_TOOL, params: { stream: 'base', ref: KEY_CUSTODY } },
    ]);
  });

  it('opens the wired decide window ON that question, with nothing to pick again', async () => {
    const desk = mountDesk();
    const browser = desk.tab('card-wired', browserTabTaps('card-wired', {
      stream: 'stream-a', perspective: 'decisions', focus: VERSION_PIN,
    }));
    const decide = wireSink(browser, 'tab:card-decide', decideTabTaps('card-decide'));
    await settled(
      () => decide.read(GYLD_DECIDE_NOW).get() as GyldValue<GyldDecideNow>,
      (value) => value?.status === 'ok',
    );
    // the decide window seeds no destination of its own, so it resolves the
    // browser's — which is the record the card's Answer just wrote
    expect(decide.read(GYLD_DEST_REF).get()).toBe(VERSION_PIN);
    const markup = decide.render(<DecideWindow />);
    expect(markup).toContain('wired to card-wired');
    expect(markup).not.toContain('choose the question this answers');
    expect(markup).toContain('bump_to_current');
  });
});

describe('a stream that cannot take the ruling says so, and offers the link', () => {
  it('offers a plain Answer on a stream whose notebook already holds rulings', async () => {
    const desk = mountDesk();
    const home = desk.ctx.getGripHomeContext();
    home.registerTap(createAtomValueTap(DESKTOP_OPEN_WIRED, { initial: () => {} }));
    home.registerTap(createAtomValueTap(DESKTOP_OPEN_TOOL, { initial: () => {} }));
    // stream-a's own module declares six placed records. A submit sends a
    // fragment now and a Gyld host folds it in beside them, so this is the
    // ORDINARY case: no refusal on the card and no stream of its own needed.
    // Until that landed the card said "Answer (needs its own stream)" here.
    const tab = desk.tab('card-refused', browserTabTaps('card-refused', {
      stream: 'stream-a', perspective: 'decisions',
    }));
    await drawn(tab);
    await settled(
      () => tab.read(GYLD_RECORDS).get(),
      (records) => (records?.definitions.size ?? 0) > 0,
    );
    const state = tab.read(GYLD_LENS).get() as GyldLensState;
    const node = state.value!.nodes.find((entry) => entry.slot === VERSION_PIN)!;
    (tab.read(GYLD_TAB_HOVER_TAP).get() as AtomTapHandle<string>).set(node.id);
    await expect.poll(() => tab.read(GYLD_TAB_HOVER).get()).toBe(node.id);
    const markup = tab.render(<GyldBrowser tabId="card-refused" />);
    expect(markup).toContain('>Answer<');
    expect(markup).not.toContain('needs its own stream');
    expect(markup).not.toContain('gyld-node-card-refusal');
    expect(markup).not.toContain('gyld-card-link');
  });

  it('offers no such button on a stream whose module declares nothing yet', async () => {
    const desk = mountDesk();
    const home = desk.ctx.getGripHomeContext();
    home.registerTap(createAtomValueTap(DESKTOP_OPEN_WIRED, { initial: () => {} }));
    const tab = desk.tab('card-plain', browserTabTaps('card-plain', {
      stream: 'base', perspective: 'decisions',
    }));
    await drawn(tab);
    const state = tab.read(GYLD_LENS).get() as GyldLensState;
    const node = state.value!.nodes.find((entry) => entry.slot === KEY_CUSTODY)!;
    (tab.read(GYLD_TAB_HOVER_TAP).get() as AtomTapHandle<string>).set(node.id);
    await expect.poll(() => tab.read(GYLD_TAB_HOVER).get()).toBe(node.id);
    const markup = tab.render(<GyldBrowser tabId="card-plain" />);
    expect(markup).not.toContain('needs its own stream');
    expect(markup).not.toContain('gyld-card-link');
  });

  it('writes a link the stream manager opens already filled in', () => {
    const link = linkForRulingLink('demo-keys', 'key_custody');
    expect(link).toEqual({
      toolId: GYLD_STREAMS_TOOL,
      params: { operation: 'link', parent: 'demo-keys', name: 'demo-keys-key_custody' },
    });
    expect(rulingStreamName('demo-keys', 'key_custody')).toBe('demo-keys-key_custody');
    // a question with no emitted member name names the parent and no more
    expect(rulingStreamName('demo-keys', '')).toBe('demo-keys');
    // and the manager reads it back into its own draft
    expect(draftFromParams(link.params)).toEqual({
      operation: StreamOperation.LINK, parent: 'demo-keys', name: 'demo-keys-key_custody',
    });
    // an unknown verb picks nothing rather than defaulting to the other one
    expect(draftFromParams({ operation: 'squash' }).operation).toBe(StreamOperation.FORK);
    expect(draftFromParams(undefined)).toEqual({
      operation: StreamOperation.FORK, parent: '', name: '',
    });
  });

  it('opens the stream manager with the link already composed', async () => {
    const desk = mountDesk();
    const tab = desk.tab('card-link', streamsTabTaps('card-link', {
      operation: 'link', parent: 'stream-a', name: 'stream-a-version_pin',
    }));
    await settled(
      () => tab.read(GYLD_STREAMS).get() as GyldStreamsCensus,
      (value) => value?.status === 'ready',
    );
    const draft = tab.read(GYLD_STREAM_DRAFT).get() as StreamDraft;
    expect(draft).toEqual({
      operation: StreamOperation.LINK, parent: 'stream-a', name: 'stream-a-version_pin',
    });
    // the form opens on it, with nothing left to fill in and the command ready
    expect(draftShapeFaults(draft)).toEqual([]);
    expect(draftCommand(draft))
      .toBe(StreamOperation.LINK.command('stream-a', 'stream-a-version_pin'));
    const markup = tab.render(<StreamManager tabId="card-link" />);
    expect(markup).toContain('value="stream-a-version_pin"');
  });
});
