import { describe, it, expect } from 'vitest';
import { createAtomValueTap, type AtomTapHandle } from '@owebeeone/grip-react';
import {
  GYLD_ASK_STREAM, GYLD_DECIDE_NOW, GYLD_LENS, GYLD_OPS, GYLD_OPS_STATUS,
  GYLD_TAB_ASK_ANSWER_TAP, GYLD_TAB_ASK_CITES, GYLD_TAB_ASK_CITES_TAP,
} from '../grips';
import type { GyldDecideNow } from '../contract';
import type { GyldOps, GyldOpsResponse } from '../ops/ops';
import type { GyldLensState, GyldValue } from '../store/state';
import { AskWindow } from './AskWindow';
import { askTabTaps } from './askTabTaps';
import { acceptShown } from './busy';
import {
  COPIED_MS, CopiedSweep, NOTHING_OPEN, boxCopied, boxKey, boxOpen, boxSaid,
  chipOpen, citationLine, citationWhere, closeBox, collapseAll, collapsesOnKey,
  copyCitation, copyText, toggleBox, toggleChip, type AskCitationsOpen,
  type CopyClipboard,
} from './citations';
import { markProse, numberTags, paragraphsOf } from './markers';
import {
  endLine, foldAskReply, latestNote, spoken, type GyldAskCitation,
  type GyldAskRecord,
} from './reply';
import { mountDesk, STATIC_SET } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';

// THE RULING: a citation is a MARKER in the prose that expands inline, and the
// metadata shrinks.
//
// Everything is asserted the way this package asserts everything — the match
// over plain strings, the open/copied state by CALLING the acts a press calls,
// and the window by rendering it to static markup. No DOM event, no clipboard,
// no clock: the clipboard is a double that records what it was handed, and the
// sweep that clears the "copied" stamp takes its schedule as an argument and
// is fired by hand.

const KEY_CUSTODY = 'glade_decisions:GladeDecisions.key_custody';
const CONVERSATION = 'conv-browser-1-key_custody-1789247615547';

const WD1: GyldAskCitation = {
  tag: 'WD-1',
  cites: 'record',
  resolved: true,
  document: 'GladeWorkspaceDirectory',
  path: 'dev-docs/glade/GladeWorkspaceDirectory.md',
  heading: '8. Open questions',
  lines: [267, 267],
  passage: 'Recovery of a lost workspace is an open question.',
};

const Q11: GyldAskCitation = {
  tag: 'Q11',
  cites: 'record',
  resolved: true,
  document: 'GladeBuyBuildMatrix',
  path: 'gyld-wz/dev-docs/GladeBuyBuildMatrix.md',
  heading: 'The matrix',
  lines: [211, 213],
  passage: '| Q11 | key custody | owner-held keys are the default |',
};

const AZ7: GyldAskCitation = {
  tag: 'AZ-7',
  cites: 'ruling',
  resolved: false,
  reason: "this build's index does not list this tag",
};

/** Two paragraphs: the first names `WD-1` backticked and Q11 bare, the second
 *  names Q11 again and a tag NOTHING cited. */
const PROSE = 'Recovery is covered by `WD-1`, and by Q11.\n\n'
  + 'Nothing covers WD-10 yet, and Q11 says why.';

describe('the marker matcher marks this reply\'s own tags and nothing else', () => {
  it('numbers the citations in arrival order, one number per tag', () => {
    expect([...numberTags([WD1, Q11, AZ7]).entries()])
      .toEqual([['WD-1', 1], ['Q11', 2], ['AZ-7', 3]]);
    // a tag cited TWICE keeps the first citation's number: the number is what
    // a mention of that tag means, and one tag cannot mean two
    expect([...numberTags([WD1, Q11, { ...WD1, lines: [9, 9] }]).entries()])
      .toEqual([['WD-1', 1], ['Q11', 2]]);
  });

  it('marks a cited tag backticked or bare, and keeps the model\'s own text', () => {
    const marked = markProse(PROSE, [WD1, Q11, AZ7]);
    const first = marked.paragraphs[0].parts;
    expect(first.map((part) => part.text)).toEqual([
      'Recovery is covered by ', '`WD-1`', ', and by ', 'Q11', '.',
    ]);
    expect(first[1].mark).toEqual({ tag: 'WD-1', number: 1 });
    expect(first[3].mark).toEqual({ tag: 'Q11', number: 2 });
    expect(first[0].mark).toBeUndefined();
  });

  it('gives a tag named twice the same number, and lists it once per paragraph', () => {
    const marked = markProse('Q11 opens it. Q11 closes it.', [WD1, Q11]);
    const marks = marked.paragraphs[0].parts
      .filter((part) => part.mark !== undefined)
      .map((part) => part.mark?.number);
    expect(marks).toEqual([2, 2]);
    expect(marked.paragraphs[0].marks).toEqual([2]);
  });

  it('leaves a tag this reply did not cite as plain text', () => {
    // WD-10 is not cited, and it is not `WD-1` with a stray 0 after it either
    const marked = markProse(PROSE, [WD1, Q11, AZ7]);
    const second = marked.paragraphs[1];
    expect(second.parts.map((part) => part.text))
      .toEqual(['Nothing covers WD-10 yet, and ', 'Q11', ' says why.']);
    expect(second.marks).toEqual([2]);
    // and a tag nothing cited at all is never marked, however it is written
    expect(markProse('`AZ-7` and MDV-7 say so.', [Q11]).paragraphs[0].parts)
      .toEqual([{ text: '`AZ-7` and MDV-7 say so.' }]);
  });

  it('matches the longest tag first', () => {
    const wd10: GyldAskCitation = { ...WD1, tag: 'WD-10' };
    const marked = markProse('WD-10 supersedes WD-1.', [WD1, wd10]);
    expect(marked.paragraphs[0].parts.map((part) => part.mark?.number))
      .toEqual([2, undefined, 1, undefined]);
    expect(marked.paragraphs[0].parts[0].text).toBe('WD-10');
  });

  it('marks a tag that carries a section sign and a space', () => {
    const iroh: GyldAskCitation = { ...WD1, tag: 'IrohReview §11' };
    const marked = markProse('As IrohReview §11 puts it.', [iroh]);
    expect(marked.paragraphs[0].parts[1].mark).toEqual({ tag: 'IrohReview §11', number: 1 });
  });

  it('splits the prose on blank lines, and says which citations nothing marks', () => {
    expect(paragraphsOf(PROSE)).toHaveLength(2);
    expect(paragraphsOf('')).toEqual([]);
    expect(paragraphsOf('one line only')).toEqual(['one line only']);
    // AZ-7 is cited and never named: it is the footer's to list, not lost
    expect(markProse(PROSE, [WD1, Q11, AZ7]).unmarked).toEqual([3]);
    expect(markProse('', [WD1]).unmarked).toEqual([1]);
    // a tag cited twice is marked once, so the second citation is the
    // footer's too
    expect(markProse('Q11 says so.', [Q11, { ...Q11, lines: [9, 9] }]).unmarked).toEqual([2]);
  });
});

describe('a box opens, collapses and stamps a copy, all in one atom', () => {
  /** The atom a window seeds, and the handle every press writes through. */
  function held() {
    const tap = createAtomValueTap(GYLD_TAB_ASK_CITES, {
      initial: NOTHING_OPEN, handleGrip: GYLD_TAB_ASK_CITES_TAP,
    });
    return tap as unknown as AtomTapHandle<AskCitationsOpen>;
  }

  it('opens on the first press and collapses on the second', () => {
    const handle = held();
    expect(boxOpen(handle.get(), 'run-7', 'WD-1')).toBe(false);
    toggleBox(handle, 'run-7', 'WD-1');
    expect(boxOpen(handle.get(), 'run-7', 'WD-1')).toBe(true);
    toggleBox(handle, 'run-7', 'WD-1');
    expect(boxOpen(handle.get(), 'run-7', 'WD-1')).toBe(false);
  });

  it('holds several open at once, keyed by the turn as well as the tag', () => {
    const handle = held();
    toggleBox(handle, 'run-7', 'WD-1');
    toggleBox(handle, 'run-7', 'Q11');
    toggleBox(handle, 'run-8', 'WD-1');
    expect(handle.get().boxes).toHaveLength(3);
    // the same tag on another turn is another box, and closing one leaves it
    closeBox(handle, 'run-7', 'WD-1');
    expect(boxOpen(handle.get(), 'run-7', 'WD-1')).toBe(false);
    expect(boxOpen(handle.get(), 'run-8', 'WD-1')).toBe(true);
    expect(boxOpen(handle.get(), 'run-7', 'Q11')).toBe(true);
    expect(boxKey('run-7', 'WD-1')).not.toBe(boxKey('run-8', 'WD-1'));
  });

  it('collapses on Escape and on nothing else', () => {
    expect(collapsesOnKey({ key: 'Escape' })).toBe(true);
    expect(collapsesOnKey({ key: 'Enter' })).toBe(false);
    expect(collapsesOnKey({ key: 'e' })).toBe(false);
    const handle = held();
    toggleBox(handle, 'run-7', 'WD-1');
    closeBox(handle, 'run-7', 'WD-1');
    // and closing one that was never open is not an error
    closeBox(handle, 'run-7', 'WD-1');
    expect(handle.get().boxes).toEqual([]);
  });

  it('expands every citation of a turn behind the chip, turn by turn', () => {
    const handle = held();
    expect(chipOpen(handle.get(), 'run-7')).toBe(false);
    toggleChip(handle, 'run-7');
    expect(chipOpen(handle.get(), 'run-7')).toBe(true);
    expect(chipOpen(handle.get(), 'run-8')).toBe(false);
    toggleChip(handle, 'run-7');
    expect(chipOpen(handle.get(), 'run-7')).toBe(false);
  });

  it('drops every box when the conversation is started over', () => {
    const handle = held();
    toggleBox(handle, 'run-7', 'WD-1');
    toggleChip(handle, 'run-7');
    collapseAll(handle);
    expect(handle.get()).toEqual(NOTHING_OPEN);
  });

  it('writes the citation line and then the passage, and stamps the button', async () => {
    const wrote: string[] = [];
    const clipboard: CopyClipboard = {
      writeText: async (text: string) => { wrote.push(text); },
    };
    expect(citationWhere(WD1))
      .toBe('dev-docs/glade/GladeWorkspaceDirectory.md · 8. Open questions · lines 267-267');
    expect(citationLine(WD1)).toBe(
      'WD-1 — dev-docs/glade/GladeWorkspaceDirectory.md · 8. Open questions · lines 267-267',
    );
    expect(copyText(WD1)).toBe(`${citationLine(WD1)}\n\n${WD1.passage}`);

    const handle = held();
    let fire: (() => void) | undefined;
    const sweep = new CopiedSweep((fn) => { fire = fn; return () => { fire = undefined; }; });
    await copyCitation({ handle, clipboard, sweep }, 'run-7', WD1);
    expect(wrote).toEqual([copyText(WD1)]);
    expect(boxCopied(handle.get(), 'run-7', 'WD-1')).toBe(true);
    expect(boxCopied(handle.get(), 'run-7', 'Q11')).toBe(false);
    // and the stamp goes by itself a moment later, through the same handle
    fire?.();
    expect(boxCopied(handle.get(), 'run-7', 'WD-1')).toBe(false);
    expect(COPIED_MS).toBeGreaterThan(0);
  });

  it('says so when the browser offers no clipboard, and stamps nothing', async () => {
    const handle = held();
    const sweep = new CopiedSweep(() => () => {});
    await copyCitation({ handle, clipboard: undefined, sweep }, 'run-7', WD1);
    expect(boxCopied(handle.get(), 'run-7', 'WD-1')).toBe(false);
    expect(boxSaid(handle.get(), 'run-7', 'WD-1')).toContain('no clipboard');
    // a refusal from the clipboard is said the same way
    const refused: CopyClipboard = { writeText: async () => { throw new Error('denied'); } };
    await copyCitation({ handle, clipboard: refused, sweep }, 'run-7', Q11);
    expect(boxSaid(handle.get(), 'run-7', 'Q11')).toContain('denied');
    expect(boxCopied(handle.get(), 'run-7', 'Q11')).toBe(false);
  });

  it('copies an unresolved citation as the tag and the reason', () => {
    expect(copyText(AZ7)).toBe("AZ-7 — unresolved: this build's index does not list this tag");
  });
});

// ---------------------------------------------------------------------------
// The metadata: what a finished reply still says about its run.
// ---------------------------------------------------------------------------

const answerLine = (run: string, seq: number, line: string): GyldAskRecord => ({
  run_id: run, seq, principal: 'gianni', conversation: CONVERSATION, stream: 'answer', line,
});

const citation = (run: string, seq: number, record: GyldAskCitation): GyldAskRecord => ({
  run_id: run, seq, principal: 'gianni', conversation: CONVERSATION, stream: 'citation', record,
});

const note = (run: string, seq: number, line: string): GyldAskRecord => ({
  run_id: run, seq, principal: 'gianni', conversation: CONVERSATION, stream: 'note', line,
});

const end = (run: string, seq: number, exit: number): GyldAskRecord => ({
  run_id: run, seq, principal: 'gianni', conversation: CONVERSATION, stream: 'end',
  done: true, exit,
});

const BUDGET = 'the output budget is 32768 tokens on this endpoint';

/** One turn: three citations sent before the prose, a note, a clean close. */
const TURN: GyldAskRecord[] = [
  { ...answerLine('run-13', 0, 'which sources cover recovery?'), stream: 'question' },
  note('run-13', 1, BUDGET),
  citation('run-13', 2, WD1),
  citation('run-13', 3, Q11),
  citation('run-13', 4, AZ7),
  answerLine('run-13', 5, PROSE),
  end('run-13', 6, 0),
];

describe('the run metadata is one muted line, and the note is not in the turn', () => {
  it('names the run and its end state, with the exit and who in the tooltip', () => {
    const turn = foldAskReply(TURN, CONVERSATION).turns[0];
    expect(endLine(turn)).toEqual({
      text: 'run-13 · done', title: 'exit 0 · attributed to gianni',
    });
    expect(endLine({ ...turn, ended: false, exit: undefined }).text).toBe('run-13 · answering…');
    expect(endLine({ ...turn, exit: 1 }).text).toBe('run-13 · failed');
    expect(endLine({ ...turn, exit: undefined }).title).toContain('exit not emitted');
    expect(endLine({ ...turn, principal: '' }).title).toBe('exit 0');
  });

  it('takes the notes out of the turn and keeps the latest one for the composer', () => {
    const reply = foldAskReply(TURN, CONVERSATION);
    expect(reply.turns[0].said.map((said) => said.stream)).toEqual(['note']);
    expect(spoken(reply.turns[0])).toEqual([]);
    expect(latestNote(reply)).toBe(BUDGET);
    // the LATEST, because the answer a reader is looking at is the last turn's
    const later = foldAskReply(
      [...TURN, note('run-14', 1, 'and now 16384'), end('run-14', 2, 0)], CONVERSATION,
    );
    expect(latestNote(later)).toBe('and now 16384');
    expect(latestNote(foldAskReply([answerLine('run-1', 1, 'x')], CONVERSATION))).toBe('');
  });

  it('keeps everything else the supplier said inside the turn', () => {
    const stopped = foldAskReply([
      answerLine('run-13', 1, 'the ruling turns on '),
      { ...note('run-13', 2, BUDGET), stream: 'stderr' },
      end('run-13', 3, 1),
    ], CONVERSATION);
    expect(spoken(stopped.turns[0]).map((said) => said.stream)).toEqual(['stderr']);
  });

  it('draws the accept only while it is the only thing the window knows', () => {
    const reply = foldAskReply(TURN, CONVERSATION);
    const accepted: GyldOpsResponse = { ok: true, run_id: 'run-13', done: false };
    // between the press and the first record of the turn: the one line
    expect(acceptShown(accepted, foldAskReply([], CONVERSATION))).toBe(true);
    // once the reply exists, the reply's own footer names the run
    expect(acceptShown(accepted, reply)).toBe(false);
    // a refusal is not an accept and stays prominent (section 4)
    expect(acceptShown({ ok: false, error: 'no model key' }, reply)).toBe(true);
    expect(acceptShown(null, reply)).toBe(false);
    expect(acceptShown({ ok: true, done: true }, foldAskReply([], CONVERSATION))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The window.
// ---------------------------------------------------------------------------

const image = new FakeBundle();

const fakeOps = {
  principal: 'gianni',
  explain: async () => ({ ok: true, run_id: 'run-13', done: false }),
} as unknown as GyldOps;

/** An ask window on `key_custody`, with the turn above on its log. */
async function askWindow(name: string, stream: GyldAskRecord[] = TURN) {
  const desk = mountDesk(STATIC_SET, image);
  const home = desk.ctx.getGripHomeContext();
  home.registerTap(createAtomValueTap<GyldOps>(GYLD_OPS, { initial: fakeOps }));
  home.registerTap(createAtomValueTap(GYLD_OPS_STATUS, { initial: 'live' }));
  home.registerTap(createAtomValueTap(GYLD_ASK_STREAM, { initial: stream as never }));
  const tab = desk.tab(name, askTabTaps(name, {
    stream: 'base', perspective: 'decisions', ref: KEY_CUSTODY, conversation: CONVERSATION,
  }));
  await expect.poll(
    () => (tab.read(GYLD_LENS).get() as GyldLensState)?.status,
  ).toBe('ok');
  await expect.poll(() => {
    const list = tab.read(GYLD_DECIDE_NOW).get() as GyldValue<GyldDecideNow> | undefined;
    return list !== undefined && list.status !== 'unset' && list.status !== 'loading';
  }).toBe(true);
  const cites = tab.read(GYLD_TAB_ASK_CITES_TAP).get() as AtomTapHandle<AskCitationsOpen>;
  return { desk, tab, cites, markup: () => tab.render(<AskWindow />) };
}

describe('the window marks the prose and expands a passage under its paragraph', () => {
  it('puts a marker after each tag the answer names, and none after one it does not',
    async () => {
      const markup = (await askWindow('cite-marks')).markup();
      expect(markup).toContain('data-cite="1"');
      expect(markup).toContain('data-cite="2"');
      // the mention keeps the model's own text, backticks and all, and the
      // marker follows it
      expect(markup).toContain('`WD-1`');
      expect(markup).toContain('>[1]</button>');
      expect(markup).toContain('>[2]</button>');
      // AZ-7 is cited and never named in the prose: no marker for it
      expect(markup).not.toContain('data-cite="3"');
      expect(markup).not.toContain('>[3]</button>');
      // and the tag is the marker's tooltip
      expect(markup).toContain('title="WD-1"');
      // nothing is expanded until a marker is pressed
      expect(markup).not.toContain('gyld-ask-cite ');
      expect(markup).not.toContain('Recovery of a lost workspace');
    });

  it('opens the box under the paragraph the marker is in, and closes it again',
    async () => {
      const on = await askWindow('cite-open');
      toggleBox(on.cites, 'run-13', 'WD-1');
      await expect.poll(
        () => (on.tab.read(GYLD_TAB_ASK_CITES).get() as AskCitationsOpen).boxes.length,
      ).toBe(1);
      const markup = on.markup();
      // the header line: the tag, the document, the heading and the lines
      expect(markup).toContain('dev-docs/glade/GladeWorkspaceDirectory.md');
      expect(markup).toContain('8. Open questions');
      expect(markup).toContain('lines 267-267');
      expect(markup).toContain('Recovery of a lost workspace is an open question.');
      expect(markup).toContain('gyld-ask-copy');
      expect(markup).toContain('>Collapse</button>');
      // UNDER THE PARAGRAPH THAT NAMES IT, not at the reply's footer: the box
      // falls before the second paragraph and before the sources chip
      const box = markup.indexOf('Recovery of a lost workspace');
      expect(box).toBeGreaterThan(markup.indexOf('Recovery is covered by'));
      expect(box).toBeLessThan(markup.indexOf('Nothing covers WD-10'));
      expect(box).toBeLessThan(markup.indexOf('gyld-ask-chip'));

      closeBox(on.cites, 'run-13', 'WD-1');
      await expect.poll(
        () => (on.tab.read(GYLD_TAB_ASK_CITES).get() as AskCitationsOpen).boxes.length,
      ).toBe(0);
      expect(on.markup()).not.toContain('Recovery of a lost workspace');
    });

  it('opens several at once, and marks the one whose Copy just landed', async () => {
    const on = await askWindow('cite-copied');
    toggleBox(on.cites, 'run-13', 'WD-1');
    toggleBox(on.cites, 'run-13', 'Q11');
    await expect.poll(
      () => (on.tab.read(GYLD_TAB_ASK_CITES).get() as AskCitationsOpen).boxes.length,
    ).toBe(2);
    expect(on.markup()).toContain('Recovery of a lost workspace');
    expect(on.markup()).toContain('owner-held keys are the default');
    expect(on.markup()).not.toContain('>copied</button>');

    const sweep = new CopiedSweep(() => () => {});
    await copyCitation(
      { handle: on.cites, clipboard: { writeText: async () => {} }, sweep }, 'run-13', WD1,
    );
    await expect.poll(
      () => (on.tab.read(GYLD_TAB_ASK_CITES).get() as AskCitationsOpen).copied,
    ).toBe(boxKey('run-13', 'WD-1'));
    const markup = on.markup();
    expect(markup).toContain('>copied</button>');
    expect(markup.match(/>copied<\/button>/g)).toHaveLength(1);
    expect(markup).toContain('data-copied="yes"');
  });

  it('counts every source on a chip, and expands the ones no marker names', async () => {
    const on = await askWindow('cite-chip');
    expect(on.markup()).toContain('>3 sources</button>');
    // collapsed by default: the unmarked citation is one press away, not gone
    expect(on.markup()).not.toContain('data-tag="AZ-7"');
    toggleChip(on.cites, 'run-13');
    await expect.poll(
      () => (on.tab.read(GYLD_TAB_ASK_CITES).get() as AskCitationsOpen).chips.length,
    ).toBe(1);
    const markup = on.markup();
    expect(markup).toContain('data-tag="AZ-7"');
    expect(markup).toContain('data-resolved="no"');
    expect(markup).toContain("this build&#x27;s index does not list this tag");
    // and it expands every citation, not only the unmarked one
    expect(markup).toContain('Recovery of a lost workspace');
    expect(markup).toContain('owner-held keys are the default');
  });

  it('shrinks the metadata: one footer line, no accept, the note under the composer',
    async () => {
      const markup = (await askWindow('cite-meta')).markup();
      // ONE muted line for the run and its close, with the rest on the tooltip
      expect(markup).toContain('run-13 · done');
      expect(markup).toContain('title="exit 0 · attributed to gianni"');
      expect(markup).not.toContain('end, exit');
      expect(markup.match(/gyld-ask-end/g)).toHaveLength(1);
      // the accept line is gone once the reply exists
      expect(markup).not.toContain('explain: accepted');
      // and the endpoint's note is ONE line, under the composer and out of
      // the turn
      expect(markup.match(new RegExp(BUDGET, 'g'))).toHaveLength(1);
      expect(markup.indexOf(BUDGET)).toBeGreaterThan(markup.indexOf('gyld-ask-composer'));
      expect(markup).toContain('gyld-ask-noted');
    });

  it('still draws the accept between the press and the first record', async () => {
    const on = await askWindow('cite-inflight', []);
    (on.tab.read(GYLD_TAB_ASK_ANSWER_TAP).get() as AtomTapHandle<GyldOpsResponse | null>)
      .set({ ok: true, run_id: 'run-13', done: false, attributed_to: 'gianni' });
    await expect.poll(() => on.markup().includes('explain: accepted, run run-13')).toBe(true);
  });
});
