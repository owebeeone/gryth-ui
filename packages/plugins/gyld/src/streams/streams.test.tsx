import { describe, it, expect } from 'vitest';
import { createAtomValueTap, type AtomTapHandle } from '@owebeeone/grip-react';
import {
  DESKTOP_OPEN_TOOL, DESKTOP_RETARGET_TAB, type ToolLink,
} from '@grythjs/plugin-api';
import { readStreamsIndex } from '../contract';
import { browserLink } from '../browser/links';
import { keptPerspective } from '../browser/firstPick';
import { browserTabTaps } from '../browser/browserTabTaps';
import { GYLD_BROWSER_TOOL } from '../tools';
import {
  GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP, GYLD_DEST_STREAM,
  GYLD_DEST_STREAM_TAP, GYLD_OPS_RUN_ID, GYLD_STORE_STATUS, GYLD_STREAMS,
  GYLD_TAB_ID, GYLD_VALIDATION,
} from '../grips';
import type { GyldRootStatus, GyldStreamsCensus } from '../store/state';
import { ROOT_WAITING, WAITING_REASON } from '../store/waiting';
import { StreamManager } from './StreamManager';
import { streamsTabTaps } from './streamsTabTaps';
import {
  DRAFT_EMPTY, HOST_COMMAND, StreamOperation, diffCommand, draftCommand,
  draftShapeFaults, operationNamed, rebuildCommand,
} from './operations';
import { parentChoices, streamRows } from './tree';
import { showStream, type StreamTargetHandles } from './useStreamTarget';
import { mountDesk, wireSink } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';
import streamsFixture from '../../test/fixtures/bundle/streams.json';
import architectureRecord from '../../test/fixtures/bundle/streams/architecture/stream.json';

// Step 2.3: gyld.streams. The tree is the census, the parent-moved indicator
// is the one comparison section 4.3 defines, and the exported command is the
// documented invocation of the Gyld host. Nothing here is submitted, and no
// stream fact is folded (spec section 6.7).

const index = readStreamsIndex(streamsFixture);

const settled = async <T,>(read: () => T, done: (value: T) => boolean): Promise<T> => {
  await expect.poll(() => done(read())).toBe(true);
  return read();
};

function mount(tabId: string, bundle = new FakeBundle()) {
  const desk = mountDesk(undefined, bundle);
  const tab = desk.tab(tabId, streamsTabTaps());
  return {
    desk,
    tab,
    census: () => tab.read(GYLD_STREAMS).get() as GyldStreamsCensus,
    render: () => tab.render(<StreamManager tabId="sm" />),
    /**
     * One row's validation, read as a DRIP in that row's own child context.
     *
     * The context must already exist, so this is only called AFTER a render:
     * the window creates each row's context and seeds it, and looking one up
     * before that would create an unseeded context the window would then find
     * and leave unseeded for ever. Waiting on the value rather than on the
     * rendered text keeps the wait one comparison instead of a whole window
     * redrawn every twenty milliseconds.
     */
    validation: (stream: string) => {
      const row = tab.ctx.getGripConsumerContext()
        .getOrCreateMatchingContext(`gyld-stream:${stream}`);
      const drip = row.getGripConsumerContext().getOrCreateConsumer(GYLD_VALIDATION);
      drip.subscribe(() => {});
      return drip;
    },
  };
}

/** Every `data-stream` of the rendered tree, in render order, with its depth. */
function treeOf(markup: string): { id: string; depth: string }[] {
  const rows: { id: string; depth: string }[] = [];
  const row = /data-stream="([^"]*)" data-depth="([^"]*)"/g;
  for (let m = row.exec(markup); m !== null; m = row.exec(markup)) {
    rows.push({ id: m[1], depth: m[2] });
  }
  return rows;
}

describe('the stream tree is the census, and the census is the whole of it', () => {
  it('draws every censused stream exactly once, parents before children', async () => {
    const manager = mount('sm-tree');
    await settled(manager.census, (value) => value?.status === 'ready');
    const rows = treeOf(manager.render());
    expect(rows.map((row) => row.id).sort()).toEqual(index.streams.map((s) => s.id).sort());
    // the chain of the fixture: base, then its link, then the link over that,
    // and the architecture lineage as a root of its own
    // stream A links the base, stream B links A, and fork-a was taken FROM
    // stream A: the tree is provenance, so the fork hangs off its parent even
    // though its declaration chain follows the base.
    expect(rows).toEqual([
      { id: 'base', depth: '0' },
      { id: 'stream-a', depth: '1' },
      { id: 'stream-b', depth: '2' },
      { id: 'fork-a', depth: '2' },
      { id: 'architecture', depth: '0' },
    ]);
  });

  it('is a pure read of the census, with no store and no window', () => {
    const census: GyldStreamsCensus = {
      status: 'ready',
      streams: index.streams.map((record) => ({ id: record.id, rootIndex: 0, record })),
      collisions: [],
      loadedAt: 'now',
    };
    const rows = streamRows(census);
    expect(rows.map((row) => row.id))
      .toEqual(['base', 'stream-a', 'stream-b', 'fork-a', 'architecture']);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 2, 0]);
    expect(parentChoices(census)).toEqual(index.streams.map((s) => s.id));
    // a census that is not ready is not a tree of nothing; it is no tree
    expect(streamRows({ status: 'loading' })).toEqual([]);
    expect(streamRows(undefined)).toEqual([]);
  });

  it('shows each record\'s revision, digest and the digest it was built against', async () => {
    const manager = mount('sm-facts');
    await settled(manager.census, (value) => value?.status === 'ready');
    const markup = manager.render();
    for (const record of index.streams) {
      expect(markup).toContain(record.revision);
      expect(markup).toContain(record.snapshot.digest.slice(0, 12));
      expect(markup).toContain(record.chain.join(' → '));
    }
    const a = index.streams[1];
    expect(markup).toContain(a.parent_snapshot!.digest.slice(0, 12));
    // the base pins nothing, and the window says so rather than printing a
    // digest it does not have
    expect(markup).toContain('nothing pinned');
  });
});

describe('parent moved since build', () => {
  it('is off while every pinned digest is the digest the parent carries', async () => {
    const manager = mount('sm-still');
    await settled(manager.census, (value) => value?.status === 'ready');
    expect(manager.render()).not.toContain('parent moved since build');
    const rows = streamRows(manager.census());
    expect(rows.every((row) => !row.parentMoved)).toBe(true);
  });

  it('is on for exactly the stream whose pinned digest differs', async () => {
    const image = new FakeBundle();
    // the parent rebuilt: `base` now carries a digest stream A was not built
    // against. Nothing else changes, so only A's indicator may turn on.
    const moved = structuredClone(streamsFixture) as typeof streamsFixture;
    moved.streams[0].snapshot.digest = `${'0'.repeat(63)}1`;
    image.write('streams.json', moved);
    const manager = mount('sm-moved', image);
    await settled(manager.census, (value) => value?.status === 'ready');
    const rows = streamRows(manager.census());
    expect(rows.filter((row) => row.parentMoved).map((row) => row.id)).toEqual(['stream-a']);
    const markup = manager.render();
    expect(markup).toContain('parent moved since build');
    expect(markup.match(/parent moved since build/g)).toHaveLength(1);
  });

  it('takes the record\'s own answer when a rebuild wrote one', () => {
    // A record a rebuild wrote carries `rebuilt_from`, with the host's own
    // comparison in it. That answer wins over this window's: the host compared
    // what it had in front of it, and the digests in the census can say
    // otherwise without either being wrong.
    const rebuilt = structuredClone(streamsFixture) as typeof streamsFixture;
    const record = rebuilt.streams.find((entry) => entry.id === 'stream-b')!;
    (record as Record<string, unknown>).rebuilt_from = {
      bundle: 'decision-streams-v5',
      built: '2026-09-13T05:00:00Z',
      snapshot: record.snapshot,
      parent_snapshot: record.parent_snapshot,
      changed: false,
      parent_moved: true,
    };
    const rows = streamRows({
      status: 'ready',
      streams: readStreamsIndex(rebuilt).streams
        .map((entry) => ({ id: entry.id, rootIndex: 0, record: entry })),
      collisions: [],
      loadedAt: 'now',
    });
    const b = rows.find((row) => row.id === 'stream-b')!;
    expect(b.parentMoved).toBe(true);
    expect(b.parentMovedFromRecord).toBe(true);
    // every digest still agrees, so the comparison alone would have said no
    expect(rows.filter((row) => row.parentMoved).map((row) => row.id)).toEqual(['stream-b']);
    expect(rows.every((row) => row.id === 'stream-b' || !row.parentMovedFromRecord)).toBe(true);
  });

  it('claims no comparison when the parent is not in this set', () => {
    // one root of a set holding the child of a stream another root holds: the
    // child is drawn at the top with its parent named as missing, and the
    // pinned digest is compared against nothing rather than against itself
    const rows = streamRows({
      status: 'ready',
      streams: index.streams
        .filter((record) => record.id !== 'base')
        .map((record) => ({ id: record.id, rootIndex: 0, record })),
      collisions: [],
      loadedAt: 'now',
    });
    const a = rows.find((row) => row.id === 'stream-a')!;
    expect(a.parentMissing).toBe(true);
    expect(a.parentMoved).toBe(false);
    expect(a.depth).toBe(0);
    // its own child still hangs off it, because that parent IS here
    expect(rows.find((row) => row.id === 'stream-b')?.depth).toBe(1);
  });
});

describe('each row says what that stream\'s validation says', () => {
  it('reads every stream\'s own validation file, through its own context', async () => {
    const manager = mount('sm-valid');
    await settled(manager.census, (value) => value?.status === 'ready');
    // the first render creates the per-row contexts; the files land after it
    manager.render();
    for (const record of index.streams) {
      await settled(
        () => manager.validation(record.id).get(),
        (value) => value?.status === 'ok',
      );
    }
    expect(manager.render().match(/data-validation="ok"/g))
      .toHaveLength(index.streams.length);
  });

  it('says invalid with the code and the finding count, and folds nothing', async () => {
    const image = new FakeBundle();
    image.write('streams/stream-a/validation.json', {
      format: 'gyld.validation.v1',
      stream: 'stream-a',
      built: '2026-09-13T01:00:00Z',
      ok: false,
      code: 'PREREQUISITE_OPEN',
      message: 'a ruling decides a question whose prerequisites are open',
      details: { question: 'glade_decisions:GladeDecisions.version_pin' },
      findings: [
        {
          code: 'PREREQUISITE_OPEN',
          message: 'a ruling decides a question whose prerequisites are open',
          details: { question: 'glade_decisions:GladeDecisions.version_pin' },
        },
        { code: 'GATE_NOT_OCCURRED', message: 'a gated question was answered early' },
      ],
    });
    const manager = mount('sm-invalid', image);
    await settled(manager.census, (value) => value?.status === 'ready');
    manager.render();
    for (const record of index.streams) {
      await settled(
        () => manager.validation(record.id).get(),
        (value) => value?.status === 'ok',
      );
    }
    const markup = manager.render();
    expect(markup).toContain('invalid: PREREQUISITE_OPEN');
    expect(markup).toContain('2 findings');
    expect(markup).toContain('PREREQUISITE_OPEN, GATE_NOT_OCCURRED');
    // the other three streams are untouched: a finding belongs to its stream
    expect(markup.match(/data-validation="ok"/g)).toHaveLength(index.streams.length - 1);
  });

  it('says a stream has no validation file rather than passing it for valid', async () => {
    const image = new FakeBundle();
    image.remove('streams/stream-b/validation.json');
    const manager = mount('sm-absent', image);
    await settled(manager.census, (value) => value?.status === 'ready');
    manager.render();
    await settled(
      () => manager.validation('stream-b').get(),
      (value) => value?.status === 'absent',
    );
    expect(manager.render()).toContain('no validation file');
    expect(manager.render()).not.toContain('data-validation="unset"');
  });
});

describe('the fork and link forms export a command, and submit the same one', () => {
  it('spells the command exactly as the host documents it', () => {
    expect(StreamOperation.FORK.command('stream-a', 'fork-b')).toBe(
      'PYTHONPATH=src:. python3 -B scripts/manage_decision_streams.py'
      + ' fork stream-a fork-b',
    );
    expect(StreamOperation.LINK.command('stream-b', 'link-b')).toBe(
      'PYTHONPATH=src:. python3 -B scripts/manage_decision_streams.py'
      + ' link stream-b link-b',
    );
    // the other two verbs of the same host, which the decide and diff windows
    // offer: a rebuild takes a bundle and an output, a diff takes a pair
    expect(rebuildCommand()).toBe(
      'PYTHONPATH=src:. python3 -B scripts/manage_decision_streams.py'
      + ' rebuild --bundle BUNDLE_DIRECTORY --output NEW_DIRECTORY',
    );
    expect(diffCommand('base', 'stream-a')).toBe(
      'PYTHONPATH=src:. python3 -B scripts/manage_decision_streams.py'
      + ' diff base stream-a --bundle BUNDLE_DIRECTORY',
    );
    expect(StreamOperation.FORK.command('base', 'x').startsWith(HOST_COMMAND)).toBe(true);
    expect(operationNamed('fork')).toBe(StreamOperation.FORK);
    expect(operationNamed('link')).toBe(StreamOperation.LINK);
    // an unknown verb selects nothing rather than defaulting to one
    expect(operationNamed('rebuild')).toBeUndefined();
  });

  it('checks shape only: a parent chosen and a name typed', () => {
    expect(draftShapeFaults(DRAFT_EMPTY)).toEqual([
      'choose the parent this stream is taken from', 'name the new stream',
    ]);
    expect(draftShapeFaults({ ...DRAFT_EMPTY, parent: 'base' })).toEqual([
      'name the new stream',
    ]);
    expect(draftShapeFaults({ ...DRAFT_EMPTY, parent: 'base', name: '  ' })).toEqual([
      'name the new stream',
    ]);
    expect(draftShapeFaults({ ...DRAFT_EMPTY, parent: 'base', name: 'x' })).toEqual([]);
    // and nothing beyond shape: a name that Gyld would refuse still passes the
    // FORM, because whether it is a legal identifier is Gyld's answer
    expect(draftShapeFaults({ ...DRAFT_EMPTY, parent: 'base', name: '9 not an id' }))
      .toEqual([]);
    expect(draftCommand(DRAFT_EMPTY)).toBe('');
    expect(draftCommand({ operation: StreamOperation.LINK, parent: 'base', name: ' a ' }))
      .toBe(StreamOperation.LINK.command('base', 'a'));
  });

  it('offers every censused stream as a parent, and nothing else', async () => {
    const manager = mount('sm-form');
    await settled(manager.census, (value) => value?.status === 'ready');
    const markup = manager.render();
    const select = /<select[^>]*class="gyld-pick-parent"[\s\S]*?<\/select>/.exec(markup)![0];
    const values: string[] = [];
    const option = /value="([^"]*)"/g;
    for (let m = option.exec(select); m !== null; m = option.exec(select)) {
      values.push(m[1]);
    }
    expect(values).toEqual(['', ...index.streams.map((s) => s.id)]);
    // the export box starts empty and the button is refused until the shape is
    // there; nothing half-composed is exported
    expect(markup).toContain('the exported command appears here');
    expect(markup).toContain('choose the parent this stream is taken from');
    expect(/<button[^>]*class="gyld-stream-export"[^>]*disabled/.test(markup)).toBe(true);
  });

  it('keeps the export path and says what each of the two buttons does', async () => {
    const manager = mount('sm-says');
    await settled(manager.census, (value) => value?.status === 'ready');
    const markup = manager.render();
    expect(markup).toContain('Export writes the same operation as the command');
    expect(markup).toContain('run it from the Gyld repository');
    // a desk with no glade node has no submit to press, and says why
    expect(/<button[^>]*class="gyld-stream-submit"[^>]*disabled/.test(markup)).toBe(true);
    expect(markup).toContain('no glade node in this desktop');
  });
});

describe('a row moves a browser rather than deciding for itself', () => {
  it('refuses the row button when no desktop can open a window at all', async () => {
    const manager = mount('sm-nodesk');
    await settled(manager.census, (value) => value?.status === 'ready');
    const markup = manager.render();
    expect(markup).toContain('open a browser on this stream');
    expect(markup).not.toContain('wired to');
    // a button that cannot land its write says so rather than doing nothing
    expect(/<button[^>]*class="gyld-stream-open"[^>]*disabled/.test(markup)).toBe(true);
  });

  it('opens a browser on the stream when this window is standalone', async () => {
    const opened: ToolLink[] = [];
    const desk = mountDesk();
    desk.ctx.getGripHomeContext().registerTap(createAtomValueTap(DESKTOP_OPEN_TOOL, {
      initial: (link: ToolLink) => { opened.push(link); },
    }));
    const tab = desk.tab('sm-open', streamsTabTaps());
    await settled(
      () => tab.read(GYLD_STREAMS).get() as GyldStreamsCensus,
      (value) => value?.status === 'ready',
    );
    const markup = tab.render(<StreamManager tabId="sm" />);
    expect(/<button[^>]*class="gyld-stream-open"[^>]*disabled/.test(markup)).toBe(false);
    // A desk with no browser to move opens ONE, on that stream and no
    // perspective: a perspective this window chose would be a Gyld fact it
    // invented, and the new window's own first pick fills it from the manifest.
    showStream(
      {
        wiredTo: '', tabId: 'sm-open', onDesk: '',
        openTool: (link: ToolLink) => { opened.push(link); },
      },
      'stream-a',
    );
    expect(opened).toEqual([browserLink({ stream: 'stream-a', perspective: '', focus: '' })]);
    expect(opened[0]).toEqual({
      toolId: GYLD_BROWSER_TOOL,
      params: { stream: 'stream-a', perspective: '', focus: '', preview: '' },
    });
  });

  it('retargets the browser it is wired to, and says which one', async () => {
    const desk = mountDesk();
    const source = desk.tab('sm-source', [
      createAtomValueTap(GYLD_TAB_ID, { initial: 'sm-source' }),
    ]);
    const retargets: { tab: string; params: Record<string, unknown> }[] = [];
    desk.ctx.getGripHomeContext().registerTap(createAtomValueTap(DESKTOP_RETARGET_TAB, {
      initial: (tab: string, params: Record<string, unknown>) => {
        retargets.push({ tab, params });
      },
    }));
    const sink = wireSink(source, 'tab:sm-sink', streamsTabTaps());
    await settled(
      () => sink.read(GYLD_STREAMS).get() as GyldStreamsCensus,
      (value) => value?.status === 'ready',
    );
    const markup = sink.render(<StreamManager tabId="sm" />);
    expect(markup).toContain('wired to sm-source');
    expect(markup).toContain('show this stream in browser sm-source');
  });

  /**
   * The tree over a REAL browser: the desk's own wire (entries/gyld/desk.ts
   * opens the tree wired to the browser), so what a pick does is what a pick
   * does on the desk.
   *
   * The handles are resolved from the SINK's context exactly as the hook
   * resolves them, and the act is called directly: this package renders to
   * static markup and dispatches no click.
   */
  const overBrowser = async (name: string, params: Record<string, unknown>) => {
    const desk = mountDesk();
    const opened: ToolLink[] = [];
    const retargets: { tab: string; params: Record<string, unknown> }[] = [];
    const home = desk.ctx.getGripHomeContext();
    home.registerTap(createAtomValueTap(DESKTOP_OPEN_TOOL, {
      initial: (link: ToolLink) => { opened.push(link); },
    }));
    home.registerTap(createAtomValueTap(DESKTOP_RETARGET_TAB, {
      initial: (tab: string, next: Record<string, unknown>) => {
        retargets.push({ tab, params: next });
      },
    }));
    const browser = desk.tab(name, browserTabTaps(name, params));
    const tree = wireSink(browser, `tab:${name}-tree`, streamsTabTaps());
    await settled(
      () => tree.read(GYLD_STREAMS).get() as GyldStreamsCensus,
      (value) => value?.status === 'ready',
    );
    const handles: StreamTargetHandles = {
      wiredTo: tree.read(GYLD_TAB_ID).get() ?? '',
      tabId: `${name}-tree`,
      onDesk: name,
      census: tree.read(GYLD_STREAMS).get(),
      stream: tree.read(GYLD_DEST_STREAM_TAP).get() as AtomTapHandle<string>,
      perspective: tree.read(GYLD_DEST_PERSPECTIVE_TAP).get() as AtomTapHandle<string>,
      retarget: tree.read(DESKTOP_RETARGET_TAB).get(),
      openTool: tree.read(DESKTOP_OPEN_TOOL).get(),
    };
    return { browser, tree, handles, opened, retargets };
  };

  it('moves the wired browser and opens NOTHING, however many picks', async () => {
    const on = await overBrowser('sm-wired', { stream: 'base', perspective: 'decisions' });
    expect(on.handles.wiredTo).toBe('sm-wired');
    showStream(on.handles, 'stream-a');
    // the browser itself moved — the live window, through its own handle
    expect(on.browser.read(GYLD_DEST_STREAM).get()).toBe('stream-a');
    // and its tab RECORD carries the same, so a reload comes back on it
    expect(on.retargets).toEqual([{
      tab: 'sm-wired',
      params: { stream: 'stream-a', perspective: 'decisions', focus: '' },
    }]);
    showStream(on.handles, 'stream-b');
    expect(on.browser.read(GYLD_DEST_STREAM).get()).toBe('stream-b');
    // two picks, two moves, no window: the launcher is what opens a second
    // browser, and this tree never does it behind a pick
    expect(on.opened).toEqual([]);
  });

  it('keeps the perspective where the stream emitted it, first-picks where it did not', async () => {
    const on = await overBrowser('sm-persp', { stream: 'base', perspective: 'tiers' });
    showStream(on.handles, 'stream-a');
    // stream-a emits `tiers`, so the reader stays on the picture they chose
    expect(on.browser.read(GYLD_DEST_PERSPECTIVE).get()).toBe('tiers');
    showStream(on.handles, 'architecture');
    // architecture emits no `tiers` at all, so the first-pick rule answers off
    // that stream's OWN manifest rather than leaving a perspective it has not
    const landed = on.browser.read(GYLD_DEST_PERSPECTIVE).get() ?? '';
    expect(landed).not.toBe('tiers');
    expect(architectureRecord.lenses.map((entry) => entry.perspective)).toContain(landed);
    expect(on.opened).toEqual([]);
  });
});

/**
 * A pick made with NO browser wired — the desk the reader left when they
 * closed the stage browser. The tree used to open a fresh UNWIRED browser on
 * every pick from then on, one per click, until the page was reloaded.
 *
 * The intents are stubs because what is asserted is what the tree ASKS the
 * desk for; `packages/desktop/src/ops.test.ts` asserts what the desk does with
 * it. The census is left out: which perspective a retarget lands on is the
 * `keptPerspective` rule below, not this one.
 */
describe('a pick made with no browser wired', () => {
  const desk = () => {
    const opened: ToolLink[] = [];
    const retargets: { tab: string; params: Record<string, unknown> }[] = [];
    const wired: { tab: string; source: string }[] = [];
    const on = (wiredTo: string, onDesk: string): StreamTargetHandles => ({
      wiredTo,
      tabId: 'tree',
      onDesk,
      openTool: (link: ToolLink) => { opened.push(link); },
      retarget: (tab: string, params: Record<string, unknown>) => {
        retargets.push({ tab, params });
      },
      setTabSource: (tab: string, source: string) => { wired.push({ tab, source }); },
    });
    return { opened, retargets, wired, on };
  };

  it('adopts the browser already on the desk instead of opening another', () => {
    const it0 = desk();
    showStream(it0.on('', 'b1'), 'stream-a');
    // the one on the desk MOVES, and this window wires itself to it
    expect(it0.retargets).toEqual([
      { tab: 'b1', params: { stream: 'stream-a', perspective: '', focus: '' } },
    ]);
    expect(it0.wired).toEqual([{ tab: 'tree', source: GYLD_BROWSER_TOOL }]);
    expect(it0.opened).toEqual([]);
  });

  it('opens one WIRED when the desk has none, and the next pick moves it', () => {
    const it0 = desk();
    showStream(it0.on('', ''), 'stream-a');
    expect(it0.opened).toEqual([browserLink({ stream: 'stream-a', perspective: '', focus: '' })]);
    // opened WIRED: the desk resolves the tab it just made for this window
    expect(it0.wired).toEqual([{ tab: 'tree', source: GYLD_BROWSER_TOOL }]);
    // and with the wire made, the next pick RETARGETS it — no second browser,
    // which is the whole of the hole this closes
    showStream(it0.on('b1', 'b1'), 'stream-b');
    expect(it0.retargets).toEqual([
      { tab: 'b1', params: { stream: 'stream-b', perspective: '', focus: '' } },
    ]);
    expect(it0.opened).toHaveLength(1);
  });

  it('leaves the wiring alone when the launcher opens a second browser', () => {
    const it0 = desk();
    // the desk now carries two; b2 is the newest, this tree is wired to b1
    showStream(it0.on('b1', 'b2'), 'stream-a');
    expect(it0.retargets.map((entry) => entry.tab)).toEqual(['b1']);
    expect(it0.wired).toEqual([]);
    expect(it0.opened).toEqual([]);
  });
});

describe('the perspective a retargeted browser lands on', () => {
  const census = (perspectives: string[]): GyldStreamsCensus => ({
    status: 'ready',
    streams: [{ id: 'to', rootIndex: 0, record: index.streams[0], perspectives }],
    collisions: [],
    loadedAt: '',
  });

  it('travels where the stream emitted it', () => {
    expect(keptPerspective(census(['decisions', 'tiers']), 'to', 'tiers')).toBe('tiers');
  });

  it('gives way to the opening perspective where it did not', () => {
    expect(keptPerspective(census(['decisions', 'tiers']), 'to', 'journeys')).toBe('decisions');
    expect(keptPerspective(census(['journeys', 'state']), 'to', 'tiers')).toBe('journeys');
  });

  it('answers nothing for a stream the census does not carry', () => {
    expect(keptPerspective(census(['decisions']), 'absent', 'tiers')).toBe('');
    expect(keptPerspective(undefined, 'to', 'tiers')).toBe('');
  });
});

describe('a bundle root with nothing built into it yet', () => {
  /**
   * The stream manager over a desk whose one root is WAITING.
   *
   * The two home values are seeded on the tab's own context, which shadows the
   * store tap's: this asserts what the window says about a waiting root, and
   * `store/share.test.ts` asserts that an empty share is one.
   */
  const waitingWindow = (name: string, runId: string) => {
    const root: GyldRootStatus = {
      root: { kind: 'share' },
      describe: 'glade node',
      status: ROOT_WAITING,
      watchLive: true,
    };
    const desk = mountDesk();
    const tab = desk.tab(name, [
      ...streamsTabTaps(),
      createAtomValueTap(GYLD_STORE_STATUS, { initial: [root] }),
      createAtomValueTap(GYLD_STREAMS, { initial: { status: 'ready', streams: [], collisions: [], loadedAt: '' } as GyldStreamsCensus }),
      createAtomValueTap(GYLD_OPS_RUN_ID, { initial: runId }),
    ]);
    return tab.render(<StreamManager tabId="sm" />);
  };

  it('says what it is waiting for, and offers the build that would end it', () => {
    const markup = waitingWindow('sm-waiting', '');
    expect(markup).toContain('data-waiting="true"');
    expect(markup).toContain(WAITING_REASON);
    expect(markup).toContain('waiting state, not a failure');
    expect(markup).toContain('press Rebuild');
    expect(markup).toContain('gyld-ops-rebuild');
    // and the status line carries the reason rather than an error it has none of
    expect(markup).toContain(`glade node: waiting (${WAITING_REASON})`);
    expect(markup).not.toContain('nothing has landed on gyld.streams');
  });

  it('names the supplier\'s own first build when one is on the output share', () => {
    const markup = waitingWindow('sm-boot', 'boot-1789247615547');
    expect(markup).toContain('Its first build is running as boot-1789247615547');
    expect(markup).not.toContain('press Rebuild');
  });

  it('leaves a desk with no root at all saying exactly that', async () => {
    const manager = mount('sm-noroot');
    await settled(manager.census, (value) => value?.status === 'ready');
    expect(manager.render()).not.toContain('data-waiting="true"');
  });
});
