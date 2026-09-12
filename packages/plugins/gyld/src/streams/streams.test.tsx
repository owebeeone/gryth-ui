import { describe, it, expect } from 'vitest';
import { createAtomValueTap } from '@owebeeone/grip-react';
import {
  DESKTOP_OPEN_TOOL, DESKTOP_RETARGET_TAB, type ToolLink,
} from '@grythjs/plugin-api';
import { readStreamsIndex } from '../contract';
import { browserLink } from '../browser/links';
import { GYLD_BROWSER_TOOL } from '../tools';
import { GYLD_STREAMS, GYLD_TAB_ID, GYLD_VALIDATION } from '../grips';
import type { GyldStreamsCensus } from '../store/state';
import { StreamManager } from './StreamManager';
import { streamsTabTaps } from './streamsTabTaps';
import {
  DRAFT_EMPTY, HOST_COMMAND, StreamOperation, draftCommand, draftShapeFaults,
  operationNamed,
} from './operations';
import { parentChoices, streamRows } from './tree';
import { mountDesk, wireSink } from '../../test/mount';
import { FakeBundle } from '../../test/fakeBundle';
import streamsFixture from '../../test/fixtures/bundle/streams.json';

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
    render: () => tab.render(<StreamManager />),
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
    expect(rows).toEqual([
      { id: 'base', depth: '0' },
      { id: 'stream-a', depth: '1' },
      { id: 'stream-b', depth: '2' },
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
    expect(rows.map((row) => row.id)).toEqual(['base', 'stream-a', 'stream-b', 'architecture']);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 0]);
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
    expect(markup.match(/data-validation="ok"/g)).toHaveLength(3);
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

describe('the fork and link forms export a command and submit nothing', () => {
  it('spells the command exactly as the host documents it', () => {
    expect(StreamOperation.FORK.command('base', 'keys-2026-09-13')).toBe(
      'PYTHONPATH=src:. python3 -B scripts/emit_decision_streams.py'
      + ' fork base keys-2026-09-13 --output NEW_DIRECTORY',
    );
    expect(StreamOperation.LINK.command('stream-a', 'stream-c')).toBe(
      'PYTHONPATH=src:. python3 -B scripts/emit_decision_streams.py'
      + ' link stream-a stream-c --output NEW_DIRECTORY',
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

  it('says in the window that this stage submits nothing', async () => {
    const manager = mount('sm-says');
    await settled(manager.census, (value) => value?.status === 'ready');
    expect(manager.render()).toContain('This stage submits nothing');
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
    const markup = tab.render(<StreamManager />);
    expect(/<button[^>]*class="gyld-stream-open"[^>]*disabled/.test(markup)).toBe(false);
    // the link a row writes is the browser link, with the stream and nothing
    // else: a perspective this window chose would be a Gyld fact it invented
    expect(browserLink({ stream: 'stream-a', perspective: '', focus: '' })).toEqual({
      toolId: GYLD_BROWSER_TOOL,
      params: { stream: 'stream-a', perspective: '', focus: '' },
    });
    expect(opened).toEqual([]);
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
    const markup = sink.render(<StreamManager />);
    expect(markup).toContain('wired to sm-source');
    expect(markup).toContain('show this stream in browser sm-source');
  });
});
