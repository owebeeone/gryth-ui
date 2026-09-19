import { describe, it, expect } from 'vitest';
import { createAtomValueTap, type AtomTapHandle } from '@owebeeone/grip-react';
import {
  DESKTOP_OPEN_TOOL, DESKTOP_OPEN_WIRED, DESKTOP_RETARGET_TAB,
} from '@grythjs/plugin-api';
import { readLens, type GyldDecideNow } from '../contract';
import {
  GYLD_DECIDE_NOW, GYLD_LENS, GYLD_TAB_HOVER, GYLD_TAB_HOVER_TAP,
} from '../grips';
import { GyldBrowser } from '../GyldBrowser';
import { browserTabTaps } from '../browser/browserTabTaps';
import type { GyldLensState, GyldValue } from '../store/state';
import { mountDesk } from '../../test/mount';
import {
  HOW_TO_READ, HOW_TO_READ_TITLE, KIND_NOTES, RELATION_NOTES, STATUS_NOTES,
  kindSays, relationSays, statusSays,
} from './graphHelp';
import decisionsFixture from '../../test/fixtures/bundle/streams/base/lenses/decisions.lens.json';

// The in-app help (owner's ask 2). Two halves, and the split is the point:
//
//  - the EMITTED half is the host's `doc`, read off the legend entry and shown
//    as it stands. A bundle emitted before `doc` existed carries none, and the
//    surface then shows only the app's own line.
//  - the AUTHORED half is `graphHelp.ts`, which says what a status or relation
//    means for the owner. It is offered for the names this app has a sentence
//    for and for no others; nothing is invented for a name it does not know.

const lens = readLens(decisionsFixture);
const KEY_CUSTODY = 'glade_decisions:GladeDecisions.key_custody';

describe('the app says what each drawn class means for the owner', () => {
  it('has a sentence for every status this picture actually draws', () => {
    const statuses = [...new Set(
      lens.legend.nodes.map((entry) => entry.status).filter((status) => status !== undefined),
    )];
    expect(statuses.sort()).toEqual(['Decided', 'Directed', 'Lean', 'Open']);
    for (const status of statuses) {
      expect(statusSays(status), status).not.toBe('');
    }
    expect(statusSays('Open')).toContain('waiting on you');
    expect(statusSays('Lean')).toContain('not a decision until you ratify it');
    expect(statusSays('Directed')).toContain('provisional');
    expect(statusSays('Decided')).toContain('anchor');
  });

  it('has a sentence for the one drawn kind that carries no status', () => {
    const bare = lens.legend.nodes.filter((entry) => entry.status === undefined);
    expect(bare.map((entry) => entry.kind)).toEqual(['Trigger']);
    expect(kindSays('Trigger')).toContain('Not a question');
    // A Question is explained by its status, which is the colour on the box.
    expect(kindSays('Question')).toBe('');
  });

  it('has a sentence for every relation this picture draws', () => {
    expect(lens.legend.edges.map((entry) => entry.relation))
      .toEqual(['Requires', 'Implies', 'GatedBy']);
    for (const entry of lens.legend.edges) {
      expect(relationSays(entry.relation), entry.relation).not.toBe('');
    }
    expect(relationSays('Requires')).toContain('before the one at the head');
    expect(relationSays('Implies')).toContain('makes the question at the head live');
    expect(relationSays('GatedBy')).toContain('holds this question back');
  });

  it('invents nothing for a name it has no sentence for', () => {
    // An architecture lens draws relations this decision vocabulary says
    // nothing about. Absence is absence (spec 6.7).
    expect(relationSays('allocation')).toBe('');
    expect(statusSays('Retired')).toBe('');
    expect(statusSays(undefined)).toBe('');
    expect(statusSays('')).toBe('');
    expect(kindSays(undefined)).toBe('');
  });

  it('keeps one note per emitted name, with no duplicates', () => {
    for (const notes of [STATUS_NOTES, KIND_NOTES, RELATION_NOTES]) {
      const names = notes.map((note) => note.name);
      expect(new Set(names).size).toBe(names.length);
      for (const note of notes) {
        expect(note.says.trim()).not.toBe('');
      }
    }
  });
});

describe('the how-to-read help covers what the reader has to know', () => {
  it('names a section for the box, the lit ring, answering and the agent', () => {
    expect(HOW_TO_READ_TITLE).toBe('How to read this graph');
    const titles = HOW_TO_READ.map((section) => section.title);
    expect(titles).toEqual([
      'What a box is',
      'What "answerable now" means',
      'How to answer one',
      'How to ask the agent',
      'What this legend does',
    ]);
    for (const section of HOW_TO_READ) {
      expect(section.lines.length, section.title).toBeGreaterThan(0);
    }
  });

  it('says what a box shows, in the order the host draws it', () => {
    const says = HOW_TO_READ[0].lines.join(' ');
    expect(says).toContain('identifier');
    expect(says).toContain('matrix row');
    expect(says).toContain('class name');
    expect(says).toContain('alternatives');
    expect(says).toContain('star');
    // and the same order the emitted box text is in: id [Q..], class, offers
    const box = lens.nodes.find((node) => node.slot === KEY_CUSTODY)!;
    expect(box.text[0]).toMatch(/^key_custody \[Q\d+\]$/);
    expect(box.text[1]).toBe('KeyCustody');
    expect(box.text.slice(2).every((line) => line.startsWith('  - '))).toBe(true);
    // and the star is on the alternative a recorded lean prefers
    const leaning = lens.nodes.find((node) => node.status === 'Lean')!;
    expect(leaning.text.some((line) => line.endsWith(' *'))).toBe(true);
  });

  it('says what answerable now means and how to answer and ask', () => {
    const lit = HOW_TO_READ[1].lines.join(' ');
    expect(lit).toContain('answerable now');
    expect(lit).toContain('qualified slot');
    expect(lit).toContain('Next up only');
    const answering = HOW_TO_READ[2].lines.join(' ');
    expect(answering).toContain('Answer');
    expect(answering).toContain('right-click');
    expect(answering).toContain('one ruling per link');
    expect(HOW_TO_READ[3].lines.join(' ')).toContain('Ask about this');
  });
});

describe('the emitted docstring is read, and its absence is absence', () => {
  it('reads `doc` off a legend entry that carries one', () => {
    const withDoc = readLens({
      ...decisionsFixture,
      legend: {
        edges: decisionsFixture.legend.edges.map((entry) => ({
          ...entry,
          doc: `${entry.relation} as the declaration puts it.`,
        })),
        nodes: decisionsFixture.legend.nodes.map((entry) => ({
          ...entry,
          doc: `${entry.status ?? entry.kind} as the declaration puts it.`,
        })),
      },
    });
    expect(withDoc.legend.edges.map((entry) => entry.doc)).toEqual([
      'Requires as the declaration puts it.',
      'Implies as the declaration puts it.',
      'GatedBy as the declaration puts it.',
    ]);
    expect(withDoc.legend.nodes.find((entry) => entry.status === 'Open')?.doc)
      .toBe('Open as the declaration puts it.');
    expect(withDoc.legend.nodes.find((entry) => entry.kind === 'Trigger')?.doc)
      .toBe('Trigger as the declaration puts it.');
  });

  it('carries none for a bundle emitted before `doc` existed', () => {
    for (const entry of lens.legend.edges) {
      expect(entry.doc).toBeUndefined();
    }
    for (const entry of lens.legend.nodes) {
      expect(entry.doc).toBeUndefined();
    }
  });

  it('treats a null and an empty docstring as absent, not as an empty line', () => {
    const blank = readLens({
      ...decisionsFixture,
      legend: {
        edges: decisionsFixture.legend.edges.map((entry, index) => ({
          ...entry, doc: index === 0 ? '' : null,
        })),
        nodes: decisionsFixture.legend.nodes,
      },
    });
    expect(blank.legend.edges.every((entry) => entry.doc === undefined)).toBe(true);
  });
});

describe('the hover card says what the status means', () => {
  it('draws the sentence under the status chip of the box in hand', async () => {
    const desk = mountDesk();
    const home = desk.ctx.getGripHomeContext();
    home.registerTap(createAtomValueTap(DESKTOP_OPEN_WIRED, { initial: () => {} }));
    home.registerTap(createAtomValueTap(DESKTOP_RETARGET_TAB, { initial: () => {} }));
    home.registerTap(createAtomValueTap(DESKTOP_OPEN_TOOL, { initial: () => {} }));
    const tab = desk.tab('help-card', browserTabTaps('help-card', {
      stream: 'base', perspective: 'decisions',
    }));
    await expect.poll(
      () => (tab.read(GYLD_LENS).get() as GyldLensState)?.status,
    ).toBe('ok');
    // The status on the card is the decide-now ROW's own `effective_status`,
    // so a render before that file lands would be asserting the "no row" card.
    await expect.poll(() => {
      const value = tab.read(GYLD_DECIDE_NOW).get() as GyldValue<GyldDecideNow> | undefined;
      return value !== undefined && value.status !== 'unset' && value.status !== 'loading';
    }).toBe(true);
    const state = tab.read(GYLD_LENS).get() as GyldLensState;
    const node = state.value!.nodes.find((entry) => entry.slot === KEY_CUSTODY)!;
    (tab.read(GYLD_TAB_HOVER_TAP).get() as AtomTapHandle<string>).set(node.id);
    await expect.poll(() => tab.read(GYLD_TAB_HOVER).get()).toBe(node.id);
    const markup = tab.render(<GyldBrowser tabId="help-card" />);
    expect(markup).toContain('gyld-node-card-says');
    expect(markup).toContain('waiting on you');
  });
});
