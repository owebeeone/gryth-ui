import { describe, it, expect } from 'vitest';
import { readStreamsIndex } from '../contract';
import { GYLD_DECIDE_NOW, GYLD_RECORDS, GYLD_STREAMS, GYLD_VALIDATION } from '../grips';
import type { GyldStreamsCensus } from '../store/state';
import { RECORDS_UNSET, type GyldRecords } from '../records/records';
import { rebuildCommand } from '../streams/operations';
import { DecideWindow } from './DecideWindow';
import { decideTabTaps } from './decideTabTaps';
import {
  ANSWER_EMPTY, ASK_EMPTY, answerShapeFaults, askShapeFaults, filledAlternatives,
  preferredAlternative, sourceLines,
} from './drafts';
import {
  REGISTRATION_MARKER, answerOverlay, askOverlay, isRefusal, overlayTarget,
  registrationBlock, rulingNames, type OverlayTarget,
} from './overlay';
import { declaredSymbol, declaredSymbols } from './symbols';
import { composeRefusal } from './compose';
import { mountDesk } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';
import streamsFixture from '../../test/fixtures/bundle/streams.json';

// Step 2.4: gyld.decide. The window composes text and exports it; it submits
// nothing, validates nothing and folds nothing. Every name in the composed
// overlay that belongs to the GRAPH is read out of the emitted records; the
// vocabulary is the one specification section 4.2 writes down.

const index = readStreamsIndex(streamsFixture);
const census: GyldStreamsCensus = {
  status: 'ready',
  streams: index.streams.map((record) => ({ id: record.id, rootIndex: 0, record })),
  collisions: [],
  loadedAt: 'now',
};

const VERSION_PIN = 'glade_decisions:GladeDecisions.version_pin';
const BUMP = 'glade_decisions:GladeDecisions.bump_to_current';
const IROH_TRANSPORT = 'glade_decisions:GladeDecisions.iroh_transport';

const settled = async <T,>(read: () => T, done: (value: T) => boolean): Promise<T> => {
  await expect.poll(() => done(read())).toBe(true);
  return read();
};

function mount(tabId: string, params?: Record<string, unknown>, bundle = new FakeBundle()) {
  const desk = mountDesk(undefined, bundle);
  const tab = desk.tab(tabId, decideTabTaps(tabId, params));
  return {
    tab,
    census: () => tab.read(GYLD_STREAMS).get() as GyldStreamsCensus,
    records: () => tab.read(GYLD_RECORDS).get() as GyldRecords,
    decideNow: () => tab.read(GYLD_DECIDE_NOW).get(),
    // Read as a DRIP, not by re-rendering until the text appears: the read
    // subscribes, which is what makes the store tap load the file, and waiting
    // on the value is one comparison rather than a whole window redrawn every
    // twenty milliseconds.
    validation: () => tab.read(GYLD_VALIDATION).get(),
    render: () => tab.render(<DecideWindow />),
  };
}

/** Stream A's records, as the store and the index tap actually build them. */
async function streamARecords(): Promise<GyldRecords> {
  const window = mount('dc-records', { stream: 'stream-a' });
  return settled(window.records, (records) => records?.status === 'ok');
}

const target = overlayTarget(census, 'stream-a') as OverlayTarget;

describe('what an overlay may be composed for', () => {
  it('reads the module and root of the stream and of the one it follows', () => {
    expect(isRefusal(target)).toBe(false);
    expect(target).toEqual({
      stream: 'stream-a',
      module: 'glade_decisions_stream_a',
      root: 'GladeDecisionsStreamA',
      kind: 'link',
      revision: 'stream-a@1',
      note: 'version pin and lifecycle ruled, the bulk gate met, one question added',
      parent: 'base',
      follows: 'base',
      followsModule: 'glade_decisions',
      followsRoot: 'GladeDecisions',
    });
  });

  it('follows the base for a fork, whose parent is provenance and not an import', () => {
    // fork-a's parent is stream-a and its chain is [base, fork-a]: a fork
    // restates what still stands over the BASE, so the module it imports and
    // the root it subclasses are the base's, not stream A's. Composing the
    // parent's would be `STREAM_REGISTRATION_MISMATCH` on the Gyld side.
    const fork = overlayTarget(census, 'fork-a') as OverlayTarget;
    expect(fork.parent).toBe('stream-a');
    expect(fork.follows).toBe('base');
    expect(fork.followsModule).toBe('glade_decisions');
    expect(fork.followsRoot).toBe('GladeDecisions');
    expect(fork.kind).toBe('fork');
  });

  it('refuses a stream with no parent rather than writing into the base module', () => {
    const refusal = overlayTarget(census, 'base');
    expect(isRefusal(refusal)).toBe(true);
    expect((refusal as { reason: string }).reason).toContain('has no parent');
    expect((refusal as { reason: string }).reason).toContain('fork or link it');
  });

  it('refuses a stream the census does not carry, and a census that has not landed', () => {
    expect((overlayTarget(census, 'nope') as { reason: string }).reason)
      .toContain('carries no stream nope');
    expect((overlayTarget({ status: 'loading' }, 'stream-a') as { reason: string }).reason)
      .toContain('census has not landed');
  });
});

describe('the declared class of a record comes out of the projection', () => {
  it('reads the class and its module, and never spells one out of the slot', async () => {
    const records = await streamARecords();
    expect(declaredSymbol(records, VERSION_PIN))
      .toEqual({ symbol: 'VersionPin', module: 'glade_decisions' });
    expect(declaredSymbol(records, BUMP))
      .toEqual({ symbol: 'BumpToCurrent', module: 'glade_decisions' });
    // a record stream A added is declared in stream A's own module
    expect(declaredSymbol(records, 'glade_decisions_stream_a:GladeDecisionsStreamA.pin_audit'))
      .toEqual({ symbol: 'PinAudit', module: 'glade_decisions_stream_a' });
    // a slot this bundle does not carry has no class, and none is invented
    expect(declaredSymbol(records, 'nope:Nope.nope')).toBeUndefined();
    const many = declaredSymbols(records, [VERSION_PIN, 'nope:Nope.nope']);
    expect(many.found.map((s) => s.symbol)).toEqual(['VersionPin']);
    expect(many.missing).toEqual(['nope:Nope.nope']);
  });

  it('has no classes at all for a stream whose projection was not emitted', async () => {
    const window = mount('dc-noproj', { stream: 'stream-b' });
    const records = await settled(window.records, (value) => value?.status !== 'unset');
    // stream B's projection is not in the fixture bundle, which is a state the
    // store renders: the window can then say the overlay cannot be composed
    expect(records.status).not.toBe('ok');
    expect(declaredSymbol(records, VERSION_PIN)).toBeUndefined();
    // and it does say so, on both forms, rather than offering an Export that
    // writes an empty box and a Submit that sends nothing. This is the state a
    // GLADE root is always in: the supplier publishes no projection.
    expect(composeRefusal(records)).toContain('carries no projection here');
    const markup = window.render();
    expect(markup).toContain('gyld-decide-uncomposable');
    expect(markup).toContain('the supplier publishes no projection');
    expect(/<button[^>]*class="gyld-answer-export"[^>]*disabled/.test(markup)).toBe(true);
    expect(/<button[^>]*class="gyld-ask-export"[^>]*disabled/.test(markup)).toBe(true);
  });
});

describe('an overlay composes only where the projection is', () => {
  it('refuses on records that READ but carry no definitions', () => {
    // The state a glade root is in: the stream record landed on its share, so
    // the bundle reads `ok`, and the projection is not on any share, so there
    // is not one definition to name a class from. A status test alone would
    // call that composable and hand the reader an empty box (found live).
    const empty = { ...RECORDS_UNSET, status: 'ok' as const, stream: 'demo-keys' };
    expect(empty.definitions.size).toBe(0);
    expect(composeRefusal(empty)).toContain('carries no projection here');
    expect(composeRefusal(empty)).toContain('the bundle reads as ok');
    expect(composeRefusal(undefined)).toContain('has not been read yet');
    expect(composeRefusal({ ...RECORDS_UNSET, status: 'unset' as const }))
      .toContain('has not been read yet');
  });
});

describe('the exported overlay is the section 4.2 shape, to the byte', () => {
  it('composes an answer against the emitted classes', async () => {
    const records = await streamARecords();
    const text = answerOverlay({
      target,
      draft: {
        question: VERSION_PIN,
        alternative: BUMP,
        principal: 'gianni',
        stamp: '2026-09-13T01:00:00Z',
        sources: 'IrohReview §1\n\nIrohReview §11\n',
        text: '2026-09-13, owner: take iroh 1.2.0 now; the 1.1.0 fixes cover untrusted input.',
      },
      question: declaredSymbol(records, VERSION_PIN)!,
      label: 'version_pin',
      alternative: declaredSymbol(records, BUMP)!,
    });
    expect(text).toBe(`"""Stream stream-a: rulings and questions added over base.

gyld-stream-record:
{
  "id": "stream-a",
  "kind": "link",
  "parent": "base",
  "follows": "base",
  "imports": "glade_decisions",
  "revision": "stream-a@1",
  "root": "GladeDecisionsStreamA",
  "note": "version pin and lifecycle ruled, the bulk gate met, one question added"
}
"""

from decision_stream_concepts import Decides, Ruling, Selects
from glade_decisions import BumpToCurrent, GladeDecisions, VersionPin

from gyld import model, use


class VersionPinRuling(Ruling):
    """2026-09-13, owner: take iroh 1.2.0 now; the 1.1.0 fixes cover untrusted input."""
    principal = "gianni"
    stamp = "2026-09-13T01:00:00Z"
    sources = ("IrohReview §1", "IrohReview §11")
    decides = Decides[VersionPin]
    selects = Selects[BumpToCurrent]


@model
class GladeDecisionsStreamA(GladeDecisions):
    """Stream stream-a root: every member of base, plus this stream's records."""
    version_pin_ruling = use(VersionPinRuling)
`);
  });

  it('composes an ask, Open with no lean and Lean with one', async () => {
    const records = await streamARecords();
    const draft = {
      symbol: 'PinAudit',
      label: 'pin_audit',
      docstring: 'How the bumped iroh pin is audited before the first real-route slice.',
      requires: [VERSION_PIN],
      gates: [],
      alternatives: [
        {
          symbol: 'AuditOnBump',
          label: 'audit_on_bump',
          description: 'Audit the whole dependency set at the bump, once.',
          preferred: false,
        },
        {
          symbol: 'AuditAtSlice',
          label: 'audit_at_slice',
          description: 'Audit at the first real-route slice.',
          preferred: false,
        },
      ],
    };
    const open = askOverlay({
      target,
      draft,
      requires: declaredSymbols(records, draft.requires).found,
      gates: [],
    });
    expect(open).toBe(`"""Stream stream-a: rulings and questions added over base.

gyld-stream-record:
{
  "id": "stream-a",
  "kind": "link",
  "parent": "base",
  "follows": "base",
  "imports": "glade_decisions",
  "revision": "stream-a@1",
  "root": "GladeDecisionsStreamA",
  "note": "version pin and lifecycle ruled, the bulk gate met, one question added"
}
"""

from glade_decision_concepts import Alternative, Offers, Open, Question, Requires
from glade_decisions import GladeDecisions, VersionPin

from gyld import model, use


class PinAudit(Question):
    """How the bumped iroh pin is audited before the first real-route slice."""
    status = Open
    requires = Requires[VersionPin]
    offers = Offers[AuditOnBump, AuditAtSlice]


class AuditOnBump(Alternative):
    """Audit the whole dependency set at the bump, once."""


class AuditAtSlice(Alternative):
    """Audit at the first real-route slice."""


@model
class GladeDecisionsStreamA(GladeDecisions):
    """Stream stream-a root: every member of base, plus this stream's records."""
    pin_audit = use(PinAudit)
    audit_on_bump = use(AuditOnBump)
    audit_at_slice = use(AuditAtSlice)
`);
    const leaning = askOverlay({
      target,
      draft: {
        ...draft,
        alternatives: draft.alternatives.map(
          (alternative, at) => ({ ...alternative, preferred: at === 1 }),
        ),
      },
      requires: declaredSymbols(records, draft.requires).found,
      gates: [],
    });
    // one alternative marked preferred makes the question a Lean and marks
    // that alternative, which is how the base declaration writes a lean
    expect(leaning).toContain('    status = Lean');
    expect(leaning).toContain('from glade_decision_concepts import Alternative, Lean, Offers, Preferred, Question, Requires');
    expect(leaning).toContain(`class AuditAtSlice(Alternative):
    """Audit at the first real-route slice."""
    preference = Preferred`);
    expect(leaning).not.toContain('status = Open');
  });

  it('carries a gate as GatedBy over the trigger\'s own emitted class', async () => {
    const records = await streamARecords();
    const gates = declaredSymbols(
      records, ['glade_decisions:GladeDecisions.first_bulk_supplier'],
    );
    expect(gates.found).toEqual([{ symbol: 'FirstBulkSupplier', module: 'glade_decisions' }]);
    const text = askOverlay({
      target,
      draft: {
        ...ASK_EMPTY,
        symbol: 'Q',
        label: 'q',
        docstring: 'a question',
        alternatives: [
          { symbol: 'A', label: 'a', description: 'one', preferred: false },
          { symbol: 'B', label: 'b', description: 'two', preferred: false },
        ],
      },
      requires: [],
      gates: gates.found,
    });
    expect(text).toContain('    gated_by = GatedBy[FirstBulkSupplier]');
    expect(text).toContain('from glade_decision_concepts import Alternative, GatedBy, Offers, Open, Question');
    // nothing is imported for a relation the draft does not use
    expect(text).not.toContain('Requires');
  });

  it('names the ruling class and member from the question\'s own names', () => {
    expect(rulingNames({ symbol: 'VersionPin', module: 'm' }, 'version_pin'))
      .toEqual({ symbol: 'VersionPinRuling', member: 'version_pin_ruling' });
  });

  it('writes a one-source tuple with the comma Python needs', async () => {
    const records = await streamARecords();
    const text = answerOverlay({
      target,
      draft: { ...ANSWER_EMPTY, principal: 'p', stamp: 's', text: 't', sources: 'GQ-9' },
      question: declaredSymbol(records, VERSION_PIN)!,
      label: 'version_pin',
      alternative: declaredSymbol(records, BUMP)!,
    });
    expect(text).toContain('    sources = ("GQ-9",)');
    // and no sources line at all when none was given
    const none = answerOverlay({
      target,
      draft: { ...ANSWER_EMPTY, principal: 'p', stamp: 's', text: 't' },
      question: declaredSymbol(records, VERSION_PIN)!,
      label: 'version_pin',
      alternative: declaredSymbol(records, BUMP)!,
    });
    expect(none).not.toContain('sources =');
  });
});

describe('a rewritten overlay keeps the stream registration block', () => {
  it('declares exactly the eight fields, in the order the host writes them', () => {
    const block = registrationBlock(target);
    const [marker, ...rest] = block.split('\n');
    expect(marker).toBe(REGISTRATION_MARKER);
    const declared = JSON.parse(rest.join('\n')) as Record<string, string>;
    expect(Object.keys(declared)).toEqual([
      'id', 'kind', 'parent', 'follows', 'imports', 'revision', 'root', 'note',
    ]);
    // every one of them off the emitted record, and none of them empty but
    // the note, which the host allows to be
    expect(declared).toEqual({
      id: 'stream-a',
      kind: 'link',
      parent: 'base',
      follows: 'base',
      imports: 'glade_decisions',
      revision: 'stream-a@1',
      root: 'GladeDecisionsStreamA',
      note: 'version pin and lifecycle ruled, the bulk gate met, one question added',
    });
  });

  it('declares the base as what a fork follows, and imports the base module', () => {
    const declared = JSON.parse(
      registrationBlock(overlayTarget(census, 'fork-a') as OverlayTarget)
        .split('\n').slice(1).join('\n'),
    ) as Record<string, string>;
    expect(declared.kind).toBe('fork');
    expect(declared.parent).toBe('stream-a');
    expect(declared.follows).toBe('base');
    expect(declared.imports).toBe('glade_decisions');
  });

  it('ends the module docstring, with the marker on a line of its own', async () => {
    const records = await streamARecords();
    for (const text of [
      answerOverlay({
        target,
        draft: { ...ANSWER_EMPTY, principal: 'p', stamp: 's', text: 't' },
        question: declaredSymbol(records, VERSION_PIN)!,
        label: 'version_pin',
        alternative: declaredSymbol(records, BUMP)!,
      }),
      askOverlay({
        target,
        draft: {
          symbol: 'PinAudit',
          label: 'pin_audit',
          docstring: 'How the bumped pin is audited.',
          requires: [],
          gates: [],
          alternatives: [
            {
              symbol: 'AuditOnBump',
              label: 'audit_on_bump',
              description: 'At the bump.',
              preferred: false,
            },
          ],
        },
        requires: [],
        gates: [],
      }),
    ]) {
      const docstring = text.slice(3, text.indexOf('"""', 3));
      const lines = docstring.split('\n');
      const at = lines.indexOf(REGISTRATION_MARKER);
      expect(at).toBeGreaterThan(0);
      // the host reads everything AFTER the marker line as the object, so the
      // block is the last thing in the docstring or it is not the object
      expect(JSON.parse(lines.slice(at + 1).join('\n'))).toHaveProperty('id', 'stream-a');
      expect(lines[at - 1]).toBe('');
    }
  });

  it('imports and subclasses what the block says a fork follows', async () => {
    const records = await streamARecords();
    const text = answerOverlay({
      target: overlayTarget(census, 'fork-a') as OverlayTarget,
      draft: { ...ANSWER_EMPTY, principal: 'p', stamp: 's', text: 't' },
      question: declaredSymbol(records, VERSION_PIN)!,
      label: 'version_pin',
      alternative: declaredSymbol(records, BUMP)!,
    });
    // `_registered` refuses a root that subclasses a name the declared
    // `imports` module does not carry, so the two have to agree
    expect(text).toContain('from glade_decisions import BumpToCurrent, GladeDecisions, VersionPin');
    expect(text).toContain('class GladeDecisionsForkA(GladeDecisions):');
    expect(text).not.toContain('GladeDecisionsStreamA');
  });
});

describe('the local checks are shape, and only shape', () => {
  it('rejects an empty answer field by field, and nothing more', () => {
    expect(answerShapeFaults(ANSWER_EMPTY)).toEqual([
      'choose the question this answers',
      'choose one offered alternative',
      'write the ruling text',
      'name the principal this ruling is recorded for',
      'stamp the ruling',
    ]);
    const full = {
      question: VERSION_PIN, alternative: BUMP, principal: 'gianni',
      stamp: '2026-09-13T01:00:00Z', sources: '', text: 'ruled',
    };
    expect(answerShapeFaults(full)).toEqual([]);
    // whitespace is not text
    expect(answerShapeFaults({ ...full, text: '   ' })).toEqual(['write the ruling text']);
    // and an answer Gyld will refuse still passes the FORM: whether the
    // prerequisites are decided is section 4.5's answer, never this window's
    expect(answerShapeFaults({ ...full, question: IROH_TRANSPORT })).toEqual([]);
    expect(sourceLines({ ...full, sources: ' a \n\n b \n' })).toEqual(['a', 'b']);
  });

  it('rejects an empty ask, and rejects two alternatives marked preferred', () => {
    expect(askShapeFaults(ASK_EMPTY)).toEqual([
      'name the class this question is declared as',
      'name the member that places it in the root',
      'write the question itself as the docstring',
      'offer at least two alternatives, each with a class and a member',
    ]);
    const full = {
      symbol: 'PinAudit',
      label: 'pin_audit',
      docstring: 'how the pin is audited',
      requires: [],
      gates: [],
      alternatives: [
        { symbol: 'A', label: 'a', description: 'one', preferred: false },
        { symbol: 'B', label: 'b', description: 'two', preferred: false },
      ],
    };
    expect(askShapeFaults(full)).toEqual([]);
    expect(preferredAlternative(full)).toBeUndefined();
    const two = {
      ...full,
      alternatives: full.alternatives.map((alternative) => ({ ...alternative, preferred: true })),
    };
    expect(askShapeFaults(two)).toEqual([
      'mark at most one alternative preferred; a lean names one',
    ]);
    const one = {
      ...full,
      alternatives: [full.alternatives[0], { ...full.alternatives[1], preferred: true }],
    };
    expect(askShapeFaults(one)).toEqual([]);
    expect(preferredAlternative(one)?.symbol).toBe('B');
    // a half-named alternative is a half-filled row, said as one
    const half = {
      ...full,
      alternatives: [full.alternatives[0], { ...full.alternatives[1], label: '' }],
    };
    expect(askShapeFaults(half)).toEqual([
      'offer at least two alternatives, each with a class and a member',
      'give every alternative both a class and a member, or neither',
    ]);
    expect(filledAlternatives(half)).toHaveLength(1);
  });
});

describe('the window', () => {
  it('offers every emitted decide-now row and that row\'s own alternatives', async () => {
    const window = mount('dc-rows', { stream: 'stream-a' });
    await settled(window.decideNow, (value) => (value as { status: string })?.status === 'ok');
    const markup = window.render();
    expect(markup).toContain('overlay glade_decisions_stream_a.GladeDecisionsStreamA over base');
    expect(markup).toContain(`value="${VERSION_PIN}"`);
    expect(markup).toContain('answerable now');
    expect(markup).toContain(rebuildCommand());
    expect(markup).toContain('Export puts the same text in the box');
    // no question chosen yet, so the export is refused and nothing is composed
    expect(/<button[^>]*class="gyld-answer-export"[^>]*disabled/.test(markup)).toBe(true);
    expect(markup).toContain('choose the question this answers');
  });

  it('opens on the question the link named, without writing anything', async () => {
    const window = mount('dc-seeded', { stream: 'stream-a', question: VERSION_PIN });
    await settled(window.decideNow, (value) => (value as { status: string })?.status === 'ok');
    const markup = window.render();
    // the seeded question is the chosen one, so its offers are drawn and the
    // shape check no longer asks for a question
    expect(markup).not.toContain('choose the question this answers');
    expect(markup).toContain('bump_to_current');
    expect(markup).toContain('the recorded lean');
    expect(markup).toContain('choose one offered alternative');
  });

  it('refuses to compose for the base stream, and says why', async () => {
    const window = mount('dc-base', { stream: 'base' });
    await settled(window.census, (value) => value?.status === 'ready');
    const markup = window.render();
    expect(markup).toContain('has no parent');
    expect(markup).toContain('fork or link it in the stream manager');
    expect(/<button[^>]*class="gyld-answer-export"[^>]*disabled/.test(markup)).toBe(true);
    expect(/<button[^>]*class="gyld-ask-export"[^>]*disabled/.test(markup)).toBe(true);
  });

  it('renders every emitted finding by code, with the details Gyld wrote', async () => {
    const image = new FakeBundle();
    image.write('streams/stream-a/validation.json', {
      format: 'gyld.validation.v1',
      stream: 'stream-a',
      built: '2026-09-13T01:00:00Z',
      ok: false,
      code: 'PREREQUISITE_OPEN',
      message: 'version_pin is decided while iroh_transport is open',
      details: { question: VERSION_PIN, open: [IROH_TRANSPORT] },
      findings: [
        {
          code: 'PREREQUISITE_OPEN',
          message: 'version_pin is decided while iroh_transport is open',
          details: { question: VERSION_PIN, open: [IROH_TRANSPORT] },
        },
        {
          code: 'GATE_NOT_OCCURRED',
          message: 'bulk_transfer is decided while its gate has not occurred',
          details: { question: 'glade_decisions:GladeDecisions.bulk_transfer' },
        },
      ],
    });
    const window = mount('dc-findings', { stream: 'stream-a' }, image);
    await settled(window.validation, (value) => value?.status === 'ok');
    const markup = window.render();
    expect(markup).toContain('data-code="PREREQUISITE_OPEN"');
    expect(markup).toContain('data-code="GATE_NOT_OCCURRED"');
    expect(markup).toContain('version_pin is decided while iroh_transport is open');
    // the details are rendered as emitted, key by key, and not summarised
    expect(markup).toContain('<dt>question</dt>');
    expect(markup).toContain(JSON.stringify(IROH_TRANSPORT).replace(/"/g, '&quot;'));
    expect(markup).toContain('data-validation="invalid"');
  });

  it('renders a refused registration by its code, like any other finding', async () => {
    // The five codes the stream-registration reader raises
    // (`capture_decision_stream.py`) travel into `validation.json` verbatim,
    // the way a rejected capture does. This window knows no code list, so
    // each one renders as itself with the details Gyld wrote; the day Gyld
    // adds a sixth it renders too.
    const image = new FakeBundle();
    image.write('streams/stream-a/validation.json', {
      format: 'gyld.validation.v1',
      stream: 'stream-a',
      built: '2026-09-13T01:00:00Z',
      ok: false,
      code: 'STREAM_REGISTRATION_MISMATCH',
      message: 'glade-decisions-stream-a.gyld.py declares the root Wrong; '
        + 'stream-a names GladeDecisionsStreamA',
      details: { file: 'glade-decisions-stream-a.gyld.py', stream: 'stream-a' },
      findings: [
        {
          code: 'STREAM_REGISTRATION_INVALID',
          message: 'glade-decisions-stream-a.gyld.py declares an empty field',
          details: { file: 'glade-decisions-stream-a.gyld.py' },
        },
        {
          code: 'STREAM_REGISTRATION_MISMATCH',
          message: 'link stream-a follows base and calls other its parent',
          details: { file: 'glade-decisions-stream-a.gyld.py', stream: 'stream-a' },
        },
        {
          code: 'STREAM_ID_COLLISION',
          message: 'two overlays declare stream-a',
          details: { stream: 'stream-a' },
        },
        {
          code: 'STREAM_PARENT_UNKNOWN',
          message: 'stream-a names the parent nowhere, which is not declared',
          details: { stream: 'stream-a', parent: 'nowhere' },
        },
        {
          code: 'STREAM_CHAIN_CYCLE',
          message: 'the chain of stream-a revisits stream-a',
          details: { stream: 'stream-a' },
        },
      ],
    });
    const window = mount('dc-registration', { stream: 'stream-a' }, image);
    await settled(window.validation, (value) => value?.status === 'ok');
    const markup = window.render();
    for (const code of [
      'STREAM_REGISTRATION_INVALID', 'STREAM_REGISTRATION_MISMATCH',
      'STREAM_ID_COLLISION', 'STREAM_PARENT_UNKNOWN', 'STREAM_CHAIN_CYCLE',
    ]) {
      expect(markup).toContain(`data-code="${code}"`);
    }
    expect(markup).toContain('the chain of stream-a revisits stream-a');
    expect(markup).toContain('<dt>file</dt>');
    expect(markup).toContain('data-validation="invalid"');
  });

  it('says a stream emitted no validation rather than passing it for valid', async () => {
    const image = new FakeBundle();
    image.remove('streams/stream-a/validation.json');
    const window = mount('dc-noval', { stream: 'stream-a' }, image);
    await settled(window.validation, (value) => value?.status === 'absent');
    expect(window.render()).toContain('this stream emitted no validation file');
  });
});
