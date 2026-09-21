import { describe, it, expect } from 'vitest';
import { createAtomValueTap, type AtomTapHandle } from '@owebeeone/grip-react';
import { readDecideNow, readLens, readProjection, readStream, type GyldDecideNow } from '../contract';
import {
  GYLD_ANSWER_DRAFT, GYLD_ANSWER_DRAFT_TAP, GYLD_ASK_STREAM, GYLD_DECIDE_NOW,
  GYLD_LENS, GYLD_OPS, GYLD_OPS_STATUS, GYLD_RECORDS, GYLD_TAB_DRAFT_TAKEN,
  GYLD_TAB_DRAFT_TAKEN_TAP, GYLD_TAB_DRAFT_TOOK,
} from '../grips';
import { browserTabTaps } from '../browser/browserTabTaps';
import { DecideWindow } from '../decide/DecideWindow';
import { decideTabTaps } from '../decide/decideTabTaps';
import {
  ANSWER_EMPTY, NOTHING_TAKEN, answerShapeFaults, edited, takenInto, withSources,
  type AnswerDraft, type TakenDraft,
} from '../decide/drafts';
import { composeRefusal, overwriteRefusal } from '../decide/compose';
import {
  answerOverlay, draftedStamp, isRefusal, overlayTarget, rulingProse,
  type OverlayTarget,
} from '../decide/overlay';
import { declaredSymbol } from '../decide/symbols';
import { RECORDS_UNSET, indexProjection, recordView, type GyldRecords } from '../records/records';
import type { GyldStreamsCensus } from '../store/state';
import { readStreamsIndex } from '../contract';
import { AskWindow } from './AskWindow';
import { askTabTaps } from './askTabTaps';
import { draftOffer, takeDraft, takeRefusal, type TakeDraftHandles } from './draft';
import { askEnvelope, type GyldAskContext } from './envelope';
import { foldAskReply, type GyldAskDraft, type GyldAskRecord } from './reply';
import { STATIC_SET, mountDesk, wireSink } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';
import type { GyldBundle, GyldLensState, GyldValue } from '../store/state';
import decisionsFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';
import decideNowFixture from '../../test/fixtures/bundle/streams/base/decide-now.json';
import projectionFixture from '../../test/fixtures/bundle/streams/base/projection.json';
import baseRecordFixture from '../../test/fixtures/bundle/streams/base/stream.json';
import streamsFixture from '../../test/fixtures/bundle/streams.json';
import streamAProjection from '../../test/fixtures/bundle/streams/stream-a/projection.json';

// Step 3.2 of GyldAskAgent.md: TAKE THIS DRAFT.
//
// The agent proposes and a human decides, and every test here is one half of
// that sentence. The draft is an OFFER: it is resolved against the envelope
// the window holds, it is SAID when it resolves to nothing, and taking it
// fills a form — the question, the alternative, the ruling text and the mark
// that names the model — in the decide window wired to the same browser.
//
// It fills nothing else. The principal, the stamp and the sources are the
// reader's; the shape checks still demand them; the window's refusals are
// exactly the refusals it had before; and a submit that still carries the
// mark stamps the ruling with the line section 8 writes down.
//
// Nothing here touches glade, a model or a DOM. The draft records are written
// by hand in the shape `glade-gyld/src/ask.rs` emits, the acts are called
// rather than clicked, and the hand-off runs through a real grip graph.

const KEY_CUSTODY = 'glade_decisions:GladeDecisions.key_custody';
const RECOVERY_KEYS = 'glade_decisions:GladeDecisions.recovery_keys';
const LIFECYCLE = 'glade_decisions:GladeDecisions.lifecycle_composition';
const CONVERSATION = 'conv-browser-1-key_custody-1789247615547';
const MODEL = 'claude-opus-5';

const lens = readLens(decisionsFixture);
const decideNow = readDecideNow(decideNowFixture);
const records = indexProjection(readProjection(projectionFixture), 'base');
const baseBundle: GyldBundle = {
  status: 'ok',
  stream: 'base',
  perspectives: ['branch', 'decisions', 'neighbourhood-key_custody', 'status', 'tiers'],
  lenses: readStream(baseRecordFixture).lenses,
};

const envelopeOn = (slot: string): GyldAskContext => askEnvelope({
  stream: 'base',
  perspective: 'decisions',
  slot,
  lens,
  decideNow,
  records,
  record: recordView(records, slot, decideNow),
  bundle: baseBundle,
  principal: 'gianni',
  conversation: CONVERSATION,
});

const envelope = envelopeOn(KEY_CUSTODY);

/** A draft record in the shape the supplier emits (`AskDraft`). */
const drafted = (over: Partial<GyldAskDraft> = {}): GyldAskDraft => ({
  slot: KEY_CUSTODY,
  alternative: 'recovery_keys',
  alternative_slot: RECOVERY_KEYS,
  ruling_text: '2026-09-16, owner: hold recovery keys; the owner-held default '
    + 'loses the account with the device.',
  sources: ['Q11', 'AZ-7'],
  drafted_by: MODEL,
  resolved: true,
  ...over,
});

const draftRecord = (record: GyldAskDraft, run = 'run-7', seq = 4): GyldAskRecord => ({
  run_id: run, seq, principal: 'gianni', conversation: CONVERSATION, stream: 'draft', record,
});

// ---------------------------------------------------------------------------
// The record, on its turn.
// ---------------------------------------------------------------------------

describe('a draft record folds onto its turn, whole and uncorrected', () => {
  it('is an offer on the turn that proposed it', () => {
    const turn = foldAskReply([
      { run_id: 'run-7', seq: 1, conversation: CONVERSATION, stream: 'question', line: 'what should we do?' },
      { run_id: 'run-7', seq: 2, conversation: CONVERSATION, stream: 'answer', line: 'two alternatives stand.' },
      draftRecord(drafted()),
      { run_id: 'run-7', seq: 5, conversation: CONVERSATION, stream: 'end', done: true, exit: 0 },
    ], CONVERSATION).turns[0];
    expect(turn.drafts).toEqual([drafted()]);
    expect(turn.prose).toBe('two alternatives stand.');
    expect(turn.citations).toEqual([]);
  });

  it('keeps an UNRESOLVED draft, which is the one the window must show', () => {
    const unresolved = drafted({
      alternative: 'a third way',
      alternative_slot: undefined,
      resolved: false,
      reason: 'this record offers owner_held_only, recovery_keys, social_recovery, and not this one',
    });
    const turn = foldAskReply([draftRecord(unresolved)], CONVERSATION).turns[0];
    expect(turn.drafts).toEqual([unresolved]);
  });

  it('draws nothing for a draft record that carries no offer at all', () => {
    const turn = foldAskReply([
      { run_id: 'run-7', seq: 1, conversation: CONVERSATION, stream: 'draft' },
    ], CONVERSATION).turns[0];
    expect(turn.drafts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The offer, resolved against the envelope this window holds.
// ---------------------------------------------------------------------------

describe('a draft is resolved against the envelope the window holds', () => {
  it('takes the alternative the supplier resolved, with the envelope`s own label', () => {
    const offer = draftOffer(drafted(), envelope);
    expect(offer.takeable).toBe(true);
    expect(offer.slot).toBe(RECOVERY_KEYS);
    expect(offer.label).toBe('recovery_keys');
    expect(offer.alternative).toBe('recovery_keys');
    expect(offer.drafted).toBe(MODEL);
    expect(offer.question).toBe(KEY_CUSTODY);
    expect(offer.sources).toEqual(['Q11', 'AZ-7']);
    expect(offer.reason).toBe('');
  });

  it('matches the model`s own name on the two names the envelope gave it', () => {
    // no `alternative_slot` at all: the qualified slot, and the label
    expect(draftOffer(
      drafted({ alternative: RECOVERY_KEYS, alternative_slot: undefined }), envelope,
    ).slot).toBe(RECOVERY_KEYS);
    expect(draftOffer(
      drafted({ alternative: 'recovery_keys', alternative_slot: undefined }), envelope,
    ).slot).toBe(RECOVERY_KEYS);
  });

  it('SAYS an alternative this record does not offer, and cannot take it', () => {
    const offer = draftOffer(drafted({
      alternative: 'a fourth way',
      alternative_slot: undefined,
      resolved: false,
      reason: 'this record offers ["owner_held_only", "recovery_keys"], and not this one',
    }), envelope);
    expect(offer.takeable).toBe(false);
    expect(offer.slot).toBe('');
    // the SUPPLIER's own sentence, because it resolved against the envelope
    // the turn was answered from
    expect(offer.reason).toContain('and not this one');
    // and the model's name is kept, verbatim, rather than bent onto one that
    // is offered
    expect(offer.alternative).toBe('a fourth way');
  });

  it('refuses a draft the supplier marked unresolved even when the name would match', () => {
    const offer = draftOffer(drafted({
      resolved: false, reason: 'the envelope this turn was answered from offered no such thing',
    }), envelope);
    expect(offer.takeable).toBe(false);
    expect(offer.reason).toContain('answered from offered no such thing');
  });

  it('refuses a draft about another record, which a retargeted window can hold', () => {
    const offer = draftOffer(drafted({ slot: LIFECYCLE }), envelope);
    expect(offer.takeable).toBe(false);
    expect(offer.reason).toContain(`this draft rules on ${LIFECYCLE}`);
    expect(offer.reason).toContain(KEY_CUSTODY);
  });

  it('refuses a draft with no ruling text: there would be nothing to take', () => {
    const offer = draftOffer(drafted({ ruling_text: '' }), envelope);
    expect(offer.takeable).toBe(false);
    expect(offer.reason).toBe('this draft carries no ruling text');
  });

  it('says a record that offers nothing at all offers nothing at all', () => {
    // A box this stream lists no row for offers nothing, so there is nothing
    // for a draft to name — and the window says that rather than the generic
    // "not this one", because the two are different facts.
    const nothing = 'glade_decisions:GladeDecisions.nothing';
    const bare = draftOffer(
      drafted({ slot: nothing, alternative_slot: undefined, reason: undefined }),
      envelopeOn(nothing),
    );
    expect(bare.takeable).toBe(false);
    expect(bare.reason).toContain('no alternatives at all');
  });
});

// ---------------------------------------------------------------------------
// Taking it.
// ---------------------------------------------------------------------------

/** The two handles a take writes through, recording what it did. */
function takeHandles(wiredTo = 'browser-1') {
  let held: TakenDraft = NOTHING_TAKEN;
  const opened: string[] = [];
  const handles: TakeDraftHandles = {
    taken: {
      get: () => held,
      set: (next: TakenDraft) => { held = next; },
    } as unknown as AtomTapHandle<TakenDraft>,
    browser: {
      wiredTo,
      decideReady: true,
      decide: (slot: string) => { opened.push(slot); },
    },
  };
  return { handles, opened, taken: () => held };
}

describe('taking a draft fills a form, and opens the window that holds it', () => {
  it('hands over the question, the alternative, the text, the tags and the model', () => {
    const on = takeHandles();
    const took = takeDraft(on.handles, draftOffer(drafted(), envelope));
    expect(took).toEqual({
      question: KEY_CUSTODY,
      alternative: RECOVERY_KEYS,
      text: drafted().ruling_text,
      sources: ['Q11', 'AZ-7'],
      drafted: MODEL,
      take: 1,
    });
    expect(on.taken()).toEqual(took);
    // and the decide window wired to this browser is opened ON the question
    expect(on.opened).toEqual([KEY_CUSTODY]);
  });

  it('counts each take, so the form is filled again rather than not at all', () => {
    const on = takeHandles();
    takeDraft(on.handles, draftOffer(drafted(), envelope));
    const second = takeDraft(on.handles, draftOffer(drafted({
      alternative_slot: 'glade_decisions:GladeDecisions.owner_held_only',
    }), envelope));
    expect(second?.take).toBe(2);
    expect(on.opened).toEqual([KEY_CUSTODY, KEY_CUSTODY]);
  });

  it('takes nothing that cannot be taken, and nothing from a window with no wire', () => {
    const on = takeHandles();
    expect(takeDraft(on.handles, draftOffer(drafted({ resolved: false }), envelope)))
      .toBeUndefined();
    expect(on.taken()).toBe(NOTHING_TAKEN);
    expect(on.opened).toEqual([]);

    const standalone = takeHandles('');
    expect(takeRefusal(standalone.handles)).toContain('not wired to a graph window');
    expect(takeDraft(standalone.handles, draftOffer(drafted(), envelope))).toBeUndefined();
    expect(standalone.taken()).toBe(NOTHING_TAKEN);
    expect(standalone.opened).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The decide window, wired to the same browser.
// ---------------------------------------------------------------------------

const settled = async <T,>(read: () => T, done: (value: T) => boolean): Promise<T> => {
  await expect.poll(() => done(read())).toBe(true);
  return read();
};

/** A browser with a decide window wired to it, as the desktop wires one. */
function wiredDesk(name: string, stream = 'stream-a', ref = KEY_CUSTODY) {
  const desk = mountDesk(STATIC_SET, new FakeBundle());
  const browser = desk.tab(name, browserTabTaps(name, { stream, ref }));
  const decide = wireSink(browser, `${name}-decide`, decideTabTaps(`${name}-decide`));
  return {
    desk,
    browser,
    decide,
    taken: () => browser.read(GYLD_TAB_DRAFT_TAKEN_TAP).get() as AtomTapHandle<TakenDraft>,
    draft: () => decide.read(GYLD_ANSWER_DRAFT).get() as AnswerDraft,
    draftTap: () => decide.read(GYLD_ANSWER_DRAFT_TAP).get() as AtomTapHandle<AnswerDraft>,
    render: () => decide.render(<DecideWindow />),
  };
}

const TAKE: TakenDraft = {
  question: KEY_CUSTODY,
  alternative: RECOVERY_KEYS,
  text: '2026-09-16, owner: hold recovery keys.',
  sources: ['Q11', 'AZ-7'],
  drafted: MODEL,
  take: 1,
};

describe('the decide window wired to the same browser takes the draft', () => {
  it('fills the question, the alternative, the ruling text and the mark', async () => {
    const on = wiredDesk('take-fill');
    await settled(() => on.draft(), (draft) => draft !== undefined);
    on.taken().set(TAKE);
    await expect.poll(() => on.draft()?.drafted).toBe(MODEL);
    expect(on.draft()).toEqual({
      ...ANSWER_EMPTY,
      question: KEY_CUSTODY,
      alternative: RECOVERY_KEYS,
      text: TAKE.text,
      drafted: MODEL,
    });
    // what it filled, published for the form to offer the tags beside
    await expect.poll(() => (on.decide.read(GYLD_TAB_DRAFT_TOOK).get() as TakenDraft)?.take)
      .toBe(1);
  });

  it('fills NOTHING else: the principal, the stamp and the sources stay the reader`s',
    async () => {
      const on = wiredDesk('take-only-four');
      await settled(() => on.draft(), (draft) => draft !== undefined);
      on.draftTap().update((held) => ({
        ...held, principal: 'gianni', stamp: '2026-09-16T04:00:00Z', sources: 'GQ-9',
      }));
      await expect.poll(() => on.draft()?.principal).toBe('gianni');
      on.taken().set(TAKE);
      await expect.poll(() => on.draft()?.drafted).toBe(MODEL);
      expect(on.draft().principal).toBe('gianni');
      expect(on.draft().stamp).toBe('2026-09-16T04:00:00Z');
      expect(on.draft().sources).toBe('GQ-9');
    });

  it('applies each take ONCE, so the reader`s own edits are never reverted', async () => {
    const on = wiredDesk('take-once');
    await settled(() => on.draft(), (draft) => draft !== undefined);
    on.taken().set(TAKE);
    await expect.poll(() => on.draft()?.drafted).toBe(MODEL);
    on.draftTap().update((held) => edited(held, { text: 'my own words' }));
    await expect.poll(() => on.draft()?.text).toBe('my own words');
    // the same take, published again: nothing is re-applied
    on.taken().set({ ...TAKE });
    await expect.poll(() => on.draft()?.text).toBe('my own words');
    expect(on.draft().drafted).toBe('');
    // a SECOND take is a second fill
    on.taken().set({ ...TAKE, text: 'a second draft', take: 2 });
    await expect.poll(() => on.draft()?.text).toBe('a second draft');
    expect(on.draft().drafted).toBe(MODEL);
  });

  it('shows the mark, and loses it the moment the reader edits either field', async () => {
    const on = wiredDesk('take-mark');
    await settled(() => on.draft(), (draft) => draft !== undefined);
    on.taken().set(TAKE);
    await expect.poll(() => on.draft()?.drafted).toBe(MODEL);
    const markup = on.render();
    expect(markup).toContain('gyld-answer-drafted');
    expect(markup).toContain(`this alternative and this ruling are a draft by ${MODEL}`);
    expect(markup).toContain(`data-drafted="${MODEL}"`);
    // the tags it leaned on are OFFERED beside the sources field, never in it
    expect(markup).toContain('the draft leans on Q11, AZ-7');
    expect(markup).toContain('gyld-answer-take-sources');
    expect(on.draft().sources).toBe('');

    // the reader edits the ruling text: the mark goes
    on.draftTap().update((held) => edited(held, { text: 'my own words' }));
    await expect.poll(() => on.draft()?.drafted).toBe('');
    expect(on.render()).not.toContain('gyld-answer-drafted');

    // and so it does when they choose another alternative
    on.taken().set({ ...TAKE, take: 2 });
    await expect.poll(() => on.draft()?.drafted).toBe(MODEL);
    on.draftTap().update((held) => edited(held, { alternative: RECOVERY_KEYS }));
    await expect.poll(() => on.draft()?.drafted).toBe('');
  });

  it('lets the reader take the tags the draft leaned on, and keeps the mark', async () => {
    const on = wiredDesk('take-tags');
    await settled(() => on.draft(), (draft) => draft !== undefined);
    on.taken().set(TAKE);
    await expect.poll(() => on.draft()?.drafted).toBe(MODEL);
    on.draftTap().update((held) => ({
      ...held, sources: withSources(held.sources, TAKE.sources),
    }));
    await expect.poll(() => on.draft()?.sources).toBe('Q11\nAZ-7');
    // taking the evidence is not editing the draft
    expect(on.draft().drafted).toBe(MODEL);
    // and it is never added twice
    expect(withSources('Q11\nAZ-7', TAKE.sources)).toBe('Q11\nAZ-7');
  });

  it('fills nothing in a decide window wired to no browser at all', async () => {
    const desk = mountDesk(STATIC_SET, new FakeBundle());
    const alone = desk.tab('take-alone', decideTabTaps('take-alone', { stream: 'stream-a' }));
    await settled(
      () => alone.read(GYLD_ANSWER_DRAFT).get() as AnswerDraft,
      (draft) => draft !== undefined,
    );
    expect(alone.read(GYLD_ANSWER_DRAFT).get()).toEqual(ANSWER_EMPTY);
    expect(alone.read(GYLD_TAB_DRAFT_TAKEN).get()).toEqual(NOTHING_TAKEN);
    expect(alone.read(GYLD_TAB_DRAFT_TOOK).get()).toEqual(NOTHING_TAKEN);
  });
});

// ---------------------------------------------------------------------------
// The submitted ruling, and the refusals that did not change.
// ---------------------------------------------------------------------------

const census: GyldStreamsCensus = {
  status: 'ready',
  streams: readStreamsIndex(streamsFixture).streams.map(
    (record) => ({ id: record.id, rootIndex: 0, record }),
  ),
  collisions: [],
  loadedAt: 'now',
};
const target = overlayTarget(census, 'stream-a') as OverlayTarget;
const streamA = indexProjection(readProjection(streamAProjection), 'stream-a');
const VERSION_PIN = 'glade_decisions:GladeDecisions.version_pin';
const BUMP = 'glade_decisions:GladeDecisions.bump_to_current';

const answerDraft = (over: Partial<AnswerDraft> = {}): AnswerDraft => ({
  ...ANSWER_EMPTY,
  question: VERSION_PIN,
  alternative: BUMP,
  principal: 'gianni',
  stamp: '2026-09-16T04:00:00Z',
  text: '2026-09-16, owner: take iroh 1.2.0 now.',
  ...over,
});

const overlayFor = (draft: AnswerDraft): string => answerOverlay({
  target,
  draft,
  question: declaredSymbol(streamA, VERSION_PIN)!,
  label: 'version_pin',
  alternative: declaredSymbol(streamA, BUMP)!,
});

describe('a submit that still carries the mark stamps the ruling', () => {
  it('carries the line section 8 writes down, in the docstring of the ruling', () => {
    expect(isRefusal(target)).toBe(false);
    const text = overlayFor(answerDraft({ drafted: MODEL }));
    expect(text).toContain(`Drafted by ${MODEL}, accepted by gianni.`);
    expect(text).toContain(`"""2026-09-16, owner: take iroh 1.2.0 now.

    Drafted by ${MODEL}, accepted by gianni."""`);
    expect(draftedStamp(answerDraft({ drafted: MODEL })))
      .toBe(`Drafted by ${MODEL}, accepted by gianni.`);
  });

  it('changes not one byte of a ruling the reader wrote themselves', () => {
    const own = answerDraft();
    expect(rulingProse(own)).toBe(own.text);
    expect(overlayFor(own)).not.toContain('Drafted by');
    expect(overlayFor(own)).toContain(`    """${own.text}"""`);
  });

  it('is the SAME composition the export box holds: one text, two readers', () => {
    // `composeAnswer` and the export button run this very function, so the
    // stamp is as readable before a submit as it is in the ruling after one.
    expect(rulingProse(answerDraft({ drafted: MODEL })))
      .toContain(`\n\n    Drafted by ${MODEL}`);
  });
});

describe('Submit`s refusals are exactly the refusals it had', () => {
  it('still demands a principal and a stamp from a taken draft', () => {
    const taken = takenInto(ANSWER_EMPTY, TAKE);
    expect(taken.drafted).toBe(MODEL);
    expect(answerShapeFaults(taken)).toEqual([
      'name the principal this ruling is recorded for',
      'stamp the ruling',
    ]);
    // nothing about the mark is a fault, and nothing about it clears one
    expect(answerShapeFaults({ ...taken, principal: 'gianni', stamp: 'now' })).toEqual([]);
    expect(answerShapeFaults({ ...ANSWER_EMPTY, drafted: MODEL }))
      .toEqual(answerShapeFaults(ANSWER_EMPTY));
  });

  it('still refuses what the window refused, and no longer what it does not', () => {
    // A notebook that already declares records is the ordinary case now: a
    // submit sends a fragment and a Gyld host folds it in beside them. A draft
    // changes neither that nor the projection the window needs to compose at all.
    expect(overwriteRefusal(streamA, target)).toBe('');
    expect(composeRefusal(RECORDS_UNSET as unknown as GyldRecords))
      .toContain('has not been read yet');
  });

  it('draws no refusal of its own with a draft taken', async () => {
    const on = wiredDesk('take-refusal', 'stream-a');
    await settled(
      () => on.decide.read(GYLD_RECORDS).get() as GyldRecords,
      (value) => value?.status === 'ok',
    );
    on.taken().set(TAKE);
    await expect.poll(() => on.draft()?.drafted).toBe(MODEL);
    const markup = on.render();
    // The mark is drawn and nothing about it makes the submit unreachable;
    // what stands in the way is the shape check alone.
    expect(markup).toContain('gyld-answer-drafted');
    expect(markup).not.toContain('gyld-decide-unsendable');
    expect(markup).not.toContain('already declares');
  });
});

// ---------------------------------------------------------------------------
// The offer, in the ask window.
// ---------------------------------------------------------------------------

describe('the ask window offers the draft, and says when it cannot be taken', () => {
  const image = new FakeBundle();

  async function askWindow(name: string, stream: GyldAskRecord[]) {
    const desk = mountDesk(STATIC_SET, image);
    const home = desk.ctx.getGripHomeContext();
    home.registerTap(createAtomValueTap(GYLD_OPS_STATUS, { initial: 'live' }));
    home.registerTap(createAtomValueTap(GYLD_ASK_STREAM, { initial: stream as never }));
    const tab = desk.tab(name, askTabTaps(name, {
      stream: 'base', perspective: 'decisions', ref: KEY_CUSTODY, conversation: CONVERSATION,
    }));
    await settled(
      () => tab.read(GYLD_LENS).get() as GyldLensState,
      (state) => state?.status === 'ok',
    );
    await settled(
      () => tab.read(GYLD_DECIDE_NOW).get() as GyldValue<GyldDecideNow> | undefined,
      (value) => value !== undefined && value.status !== 'unset' && value.status !== 'loading',
    );
    expect(tab.read(GYLD_OPS).get()).toBeUndefined();
    return tab.render(<AskWindow />);
  }

  it('names the model, the alternative and the text, with the act on it', async () => {
    const markup = await askWindow('offer', [draftRecord(drafted())]);
    expect(markup).toContain('gyld-ask-draft');
    expect(markup).toContain('data-resolved="yes"');
    expect(markup).toContain(`drafted by ${MODEL}`);
    expect(markup).toContain('recovery_keys');
    expect(markup).toContain('hold recovery keys');
    expect(markup).toContain('leaning on Q11, AZ-7');
    expect(markup).toContain('Take this draft');
    // this window is wired to no browser, so the act is offered and refused
    // with the reason rather than hidden
    expect(/<button[^>]*class="gyld-ask-take"[^>]*disabled/.test(markup)).toBe(true);
    expect(markup).toContain('not wired to a graph window');
  });

  it('shows an unresolved draft AS unresolved, and cannot take it', async () => {
    const markup = await askWindow('unresolved', [draftRecord(drafted({
      alternative: 'a fourth way',
      alternative_slot: undefined,
      resolved: false,
      reason: 'this record offers three alternatives, and not this one',
    }))]);
    expect(markup).toContain('data-resolved="no"');
    expect(markup).toContain('a fourth way');
    expect(markup).toContain('unresolved: this record offers three alternatives');
    expect(/<button[^>]*class="gyld-ask-take"[^>]*disabled/.test(markup)).toBe(true);
  });
});
