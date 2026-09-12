import { GripProvider, useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import { DESKTOP_OPEN_TOOL, grok, type ToolViewProps } from '@grythjs/plugin-api';
import type {
  AssertionDiffEntry, GyldStreamDiff, LensEdgeRef, RulingDiffEntry,
} from '../contract';
import {
  GYLD_DEST_LEFT, GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP, GYLD_DEST_RIGHT,
  GYLD_DIFF, GYLD_DIFF_SLOT, GYLD_DIFF_SLOT_TAP, GYLD_LENS, GYLD_SET, GYLD_STREAMS,
} from '../grips';
import { SetPicker } from '../browser/SetPicker';
import { recordParams } from '../browser/links';
import { useKeyedContext } from '../contexts';
import { LensView } from '../lens/LensView';
import { diffCommand } from '../streams/operations';
import { GYLD_DETAIL_TOOL } from '../tools';
import type { GyldValue } from '../store/state';
import { paneTabTaps } from './diffTabTaps';
import { DIFF_PANES, correspondenceHighlight, drawsSlot, type DiffPane } from './panes';

// The gyld.diff window (step 2.5): one perspective of two streams side by
// side, with the emitted comparison beneath them.
//
// The two pictures are two LENS VIEWS in two child contexts, each with its own
// camera, selection and dim set, each resolving its own stream through the one
// destination grip every other window uses. Nothing is shared but the
// perspective and the record in hand.
//
// The correspondence is one rule and only one: the QUALIFIED SLOT (spec R1,
// and the document's own `correspondence` field). Record ids are minted per
// stream, so picking a box on the left and lighting up "the same" box on the
// right can only mean the slot; nothing here matches by label, by position or
// by neighbourhood.
//
// The lists are the emitted diff, read out. This window never compares two
// bundles: a pair Gyld has not diffed reads as absent, and what the window
// offers then is the command that would write it (spec section 6.7).

function Pane({ pane, tabId }: { pane: DiffPane; tabId: string }) {
  // One child context per pane, seeded once: the lens view's whole state, plus
  // this pane's stream relayed off the pair the window holds.
  const context = useKeyedContext(pane.contextKey(tabId), () => paneTabTaps(pane));
  return (
    <section className="gyld-diff-pane" data-pane={pane.name}>
      <GripProvider grok={grok} context={context}>
        <PaneFigure pane={pane} tabId={tabId} />
      </GripProvider>
    </section>
  );
}

/**
 * The record in hand, opened on THIS side's stream, in a window of its own.
 *
 * Standalone rather than wired, and the reason is the desktop's: it holds one
 * sink per (source tab, tool), so a diff window cannot have two live detail
 * windows following it, one per side. A snapshot per side is what is available
 * and it is also what a comparison wants: two windows that stay on the record
 * they were opened on while the hand moves on. A side whose picture does not
 * draw the record still offers the button: the record can be in the other
 * stream only, and the detail window says that itself.
 */
function PaneDetail({ pane, stream, slot }: {
  pane: DiffPane;
  stream: string;
  slot: string;
}) {
  const openTool = useGrip(DESKTOP_OPEN_TOOL);
  const why = slot === ''
    ? 'no record in hand: pick one in either picture'
    : `${slot} as ${pane.title.toLowerCase()} stream ${stream === '' ? 'none' : stream} `
      + 'has it, in a window of its own';
  return (
    <button
      type="button"
      className="gyld-open-detail"
      data-stream={stream}
      data-slot={slot}
      disabled={openTool === undefined || slot === '' || stream === ''}
      title={why}
      onClick={() => openTool?.({
        toolId: GYLD_DETAIL_TOOL, params: recordParams(stream, slot),
      })}
    >
      Detail
    </button>
  );
}

/** Inside the pane's own context: its lens, and the shared slot it lights up.
 *  The slot atom is the WINDOW's, resolved through the graph because the pane
 *  seeds none of its own, so both panes read and write the one value. */
function PaneFigure({ pane, tabId }: { pane: DiffPane; tabId: string }) {
  const state = useGrip(GYLD_LENS);
  const stream = useGrip(pane.dest) ?? '';
  const slot = useGrip(GYLD_DIFF_SLOT) ?? '';
  const slotTap = useGrip(GYLD_DIFF_SLOT_TAP) as AtomTapHandle<string> | undefined;
  const lens = state?.status === 'ok' ? state.value : undefined;
  const highlight = correspondenceHighlight(lens, slot);
  return (
    <>
      <header className="gyld-diff-pane-head">
        <span className="gyld-detail-label">{`${pane.title}: ${stream === '' ? 'no stream' : stream}`}</span>
        {slot !== '' && (
          <span className={drawsSlot(lens, slot) ? 'gyld-chip' : 'gyld-chip gyld-unresolved'}>
            {drawsSlot(lens, slot) ? 'draws the record in hand' : 'does not draw it'}
          </span>
        )}
        <PaneDetail pane={pane} stream={stream} slot={slot} />
      </header>
      <LensView
        scope={`${tabId}-${pane.name}`}
        search={highlight}
        onSlot={(picked) => slotTap?.set(picked)}
      />
    </>
  );
}

function Slots({ title, slots }: { title: string; slots: readonly string[] }) {
  return (
    <div className="gyld-diff-list" data-list={title}>
      <h5>{`${title} (${slots.length})`}</h5>
      <ul>
        {slots.map((slot) => (
          <li key={slot} data-slot={slot}>{slot}</li>
        ))}
      </ul>
    </div>
  );
}

function Assertions({ title, entries }: { title: string; entries: readonly AssertionDiffEntry[] }) {
  return (
    <div className="gyld-diff-list" data-list={title}>
      <h5>{`${title} (${entries.length})`}</h5>
      <ul>
        {entries.map((entry) => (
          <li key={entry.slot} data-slot={entry.slot}>
            {`${entry.relation} · ${entry.owner} → ${entry.refs.join(', ')}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Rulings({ title, entries }: { title: string; entries: readonly RulingDiffEntry[] }) {
  return (
    <div className="gyld-diff-list" data-list={title}>
      <h5>{`${title} (${entries.length})`}</h5>
      <ul>
        {entries.map((entry) => (
          <li key={entry.slot} data-slot={entry.slot}>
            {entry.slot}
            <span className="gyld-note">
              {entry.decides === undefined ? ' records no decision' : ` decides ${entry.decides}`}
              {entry.selects === undefined ? '' : ` · selects ${entry.selects}`}
              {entry.reopens === undefined ? '' : ` · reopens ${entry.reopens}`}
              {entry.occurred.length === 0 ? '' : ` · occurred ${entry.occurred.join(', ')}`}
              {entry.live ? ' · live' : ' · not live'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Edges({ title, edges }: { title: string; edges: readonly LensEdgeRef[] }) {
  return (
    <div className="gyld-diff-list" data-list={title}>
      <h5>{`${title} (${edges.length})`}</h5>
      <ul>
        {edges.map((edge) => (
          <li key={edge.slot} data-slot={edge.slot}>
            {`${edge.relation} · ${edge.tail} → ${edge.head}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every section the document carries, read out. A section it does not carry
 *  is said to be absent rather than drawn as an empty one. */
function DiffLists({ diff, perspective }: { diff: GyldStreamDiff; perspective: string }) {
  const lens = diff.lenses?.[perspective];
  return (
    <div className="gyld-diff-lists">
      <p className="gyld-note">
        {`${diff.left.stream} → ${diff.right.stream}, corresponding by ${diff.correspondence}`}
      </p>
      <section className="gyld-diff-section" data-section="occurrences">
        <h4>{`Records (${diff.occurrences.unchanged} unchanged)`}</h4>
        <Slots title="added" slots={diff.occurrences.added} />
        <Slots title="removed" slots={diff.occurrences.removed} />
        <Slots title="changed definition" slots={diff.occurrences.changed_definition} />
      </section>
      {diff.questions !== undefined && (
        <section className="gyld-diff-section" data-section="questions">
          <h4>{`Questions (${diff.questions.unchanged} unchanged)`}</h4>
          <Slots title="questions added" slots={diff.questions.added} />
          <Slots title="questions removed" slots={diff.questions.removed} />
        </section>
      )}
      <section className="gyld-diff-section" data-section="effective_status">
        <h4>{`Effective status (${diff.effective_status.length})`}</h4>
        <ul className="gyld-diff-list" data-list="effective status">
          {diff.effective_status.map((change) => (
            <li key={change.slot} data-slot={change.slot}>
              {`${change.slot}: ${change.left} → ${change.right}`}
              {change.ruling === undefined ? '' : ` (ruled by ${change.ruling})`}
            </li>
          ))}
        </ul>
      </section>
      {diff.selections !== undefined && (
        <section className="gyld-diff-section" data-section="selections">
          <h4>{`Selections (${diff.selections.length})`}</h4>
          <ul className="gyld-diff-list" data-list="selections">
            {diff.selections.map((change) => (
              <li key={change.slot} data-slot={change.slot}>
                {`${change.slot}: ${change.left ?? 'none'} → ${change.right ?? 'none'}`}
              </li>
            ))}
          </ul>
        </section>
      )}
      {diff.rulings !== undefined && (
        <section className="gyld-diff-section" data-section="rulings">
          <h4>Rulings</h4>
          <Rulings title="rulings added" entries={diff.rulings.added} />
          <Rulings title="rulings removed" entries={diff.rulings.removed} />
          <Slots title="retired" slots={diff.rulings.retired} />
          <Slots title="restored" slots={diff.rulings.restored} />
        </section>
      )}
      {diff.occurred !== undefined && (
        <section className="gyld-diff-section" data-section="occurred">
          <h4>Triggers recorded as occurred</h4>
          <Slots title="occurred added" slots={diff.occurred.added} />
          <Slots title="occurred removed" slots={diff.occurred.removed} />
        </section>
      )}
      <section className="gyld-diff-section" data-section="assertions">
        <h4>{`Assertions (${diff.assertions.unchanged} unchanged)`}</h4>
        <Assertions title="assertions added" entries={diff.assertions.added} />
        <Assertions title="assertions removed" entries={diff.assertions.removed} />
      </section>
      {lens !== undefined && (
        <section className="gyld-diff-section" data-section="lens">
          <h4>{`This picture (${perspective})`}</h4>
          <Slots title="nodes added" slots={lens.nodes.added} />
          <Slots title="nodes removed" slots={lens.nodes.removed} />
          <Edges title="edges added" edges={lens.edges.added} />
          <Edges title="edges removed" edges={lens.edges.removed} />
        </section>
      )}
      {diff.lenses !== undefined && lens === undefined && (
        <p className="gyld-note">
          {`the diff compares ${Object.keys(diff.lenses).join(', ')}, and not `
            + `${perspective === '' ? 'the perspective this window is on' : perspective}`}
        </p>
      )}
      <ul className="gyld-omissions">
        {diff.omissions.map((omission) => (
          <li key={omission}>{omission}</li>
        ))}
      </ul>
    </div>
  );
}

/** No diff, and why. A pair Gyld has not compared is not a pair with no
 *  differences, and the window says which one it is looking at. */
function NoDiff({ value, left, right }: {
  value: GyldValue<GyldStreamDiff> | undefined;
  left: string;
  right: string;
}) {
  const status = value?.status ?? 'unset';
  const said: Record<string, string> = {
    unset: 'this window has no pair of streams yet',
    loading: 'reading the diff file',
    absent: 'this bundle carries no diff for that pair',
    invalid: 'the diff file did not read',
  };
  return (
    <div className="gyld-diff-lists gyld-diff-empty">
      <p className="gyld-note">{said[status] ?? status}</p>
      {value?.fault !== undefined && (
        <p className="gyld-fault">{`${value.fault.path}: ${value.fault.message}`}</p>
      )}
      {status === 'absent' && left !== '' && right !== '' && (
        <p className="gyld-note">
          This window never compares two bundles itself. Gyld writes the
          comparison, and this is the command that writes this one:
          {' '}
          <code className="gyld-diff-command">{diffCommand(left, right)}</code>
        </p>
      )}
    </div>
  );
}

export function DiffWindow({ tabId }: ToolViewProps) {
  const set = useGrip(GYLD_SET);
  const census = useGrip(GYLD_STREAMS);
  const left = useGrip(GYLD_DEST_LEFT) ?? '';
  const right = useGrip(GYLD_DEST_RIGHT) ?? '';
  const perspective = useGrip(GYLD_DEST_PERSPECTIVE) ?? '';
  const perspectiveTap = useGrip(GYLD_DEST_PERSPECTIVE_TAP) as AtomTapHandle<string> | undefined;
  const slot = useGrip(GYLD_DIFF_SLOT) ?? '';
  const slotTap = useGrip(GYLD_DIFF_SLOT_TAP) as AtomTapHandle<string> | undefined;
  const value = useGrip(GYLD_DIFF) as GyldValue<GyldStreamDiff> | undefined;

  if ((set?.roots.length ?? 0) === 0) {
    return <SetPicker />;
  }
  const streams = census?.status === 'ready' ? census.streams : [];
  // The perspectives OFFERED are the ones both streams emitted: a picture only
  // one side has is not two pictures to compare. Nothing is invented, and a
  // stream the census has not reached yet offers none.
  const emitted = (id: string) => streams.find((entry) => entry.id === id)?.perspectives ?? [];
  const shared = emitted(left).filter((name) => emitted(right).includes(name));
  const diff = value?.status === 'ok' ? value.value : undefined;

  return (
    <div className="gyld-diff">
      <header className="gyld-chrome-row">
        {DIFF_PANES.map((pane) => (
          <PanePicker key={pane.name} pane={pane} ids={streams.map((entry) => entry.id)} />
        ))}
        <label className="gyld-chrome-field">
          perspective
          <select
            className="gyld-pick-perspective"
            value={perspective}
            onChange={(event) => perspectiveTap?.set(event.target.value)}
          >
            {(perspective === '' || !shared.includes(perspective)) && (
              <option value={perspective}>
                {perspective === '' ? 'choose a perspective' : `${perspective} (not in both)`}
              </option>
            )}
            {shared.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <span className="gyld-note gyld-diff-slot">
          {slot === '' ? 'no record in hand' : `in hand: ${slot}`}
        </span>
        <button
          type="button"
          className="gyld-diff-clear"
          disabled={slot === '' || slotTap === undefined}
          onClick={() => slotTap?.set('')}
        >
          Clear
        </button>
      </header>
      <div className="gyld-diff-panes">
        {DIFF_PANES.map((pane) => (
          <Pane key={pane.name} pane={pane} tabId={tabId} />
        ))}
      </div>
      {diff === undefined
        ? <NoDiff value={value} left={left} right={right} />
        : <DiffLists diff={diff} perspective={perspective} />}
    </div>
  );
}

function PanePicker({ pane, ids }: { pane: DiffPane; ids: readonly string[] }) {
  const chosen = useGrip(pane.dest) ?? '';
  const tap = useGrip(pane.destTap) as AtomTapHandle<string> | undefined;
  return (
    <label className="gyld-chrome-field">
      {pane.title}
      <select
        className={`gyld-pick-${pane.name}`}
        value={chosen}
        onChange={(event) => tap?.set(event.target.value)}
      >
        {chosen === '' && <option value="">choose a stream</option>}
        {ids.map((id) => (
          <option key={id} value={id}>{id}</option>
        ))}
      </select>
    </label>
  );
}
