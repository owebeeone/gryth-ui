import { GripProvider, createAtomValueTap, useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import { grok } from '@grythjs/plugin-api';
import type { GyldValidation } from '../contract';
import {
  GYLD_DEST_STREAM, GYLD_SET, GYLD_STORE_RELOAD, GYLD_STORE_STATUS, GYLD_STREAMS,
  GYLD_STREAM_DRAFT, GYLD_STREAM_DRAFT_TAP, GYLD_STREAM_EXPORT, GYLD_STREAM_EXPORT_TAP,
  GYLD_VALIDATION,
} from '../grips';
import { SetPicker } from '../browser/SetPicker';
import { useKeyedContext } from '../contexts';
import type { GyldValue } from '../store/state';
import {
  DRAFT_EMPTY, STREAM_OPERATIONS, draftCommand, draftShapeFaults, operationNamed,
  type StreamDraft,
} from './operations';
import { parentChoices, streamRows, type StreamRow } from './tree';
import { useStreamTarget, type StreamTarget } from './useStreamTarget';

// The gyld.streams window (step 2.3): the stream tree of the set, what each
// stream's validation says about it, which streams were built against a parent
// that has since moved, and the two forms that compose a fork or a link.
//
// Everything drawn is emitted. The tree is the `parent` each record carries;
// the revision, the digest and the parent digest are the record's own; the
// status is that stream's `validation.json`, read through a child context per
// row; and "parent moved since build" is the one comparison section 4.3
// defines, between the digest a stream pins and the digest its parent carries
// now. Nothing is rebuilt, repaired or ranked here.
//
// The forms end in EXPORT. Section 4.6 is explicit that in the read-only stage
// the window writes the command and the owner runs it; no stream is created
// from this desk, and the window says so rather than implying otherwise.

/** One stream's validation, read in that stream's own child context. Split out
 *  so the store tap's per-destination resolution does the work, and the row
 *  itself stays a pure read of the census record. */
function StreamValidation() {
  const value = useGrip(GYLD_VALIDATION) as GyldValue<GyldValidation> | undefined;
  const status = value?.status ?? 'unset';
  if (status !== 'ok' || value?.value === undefined) {
    const said: Record<string, string> = {
      unset: 'validation not read',
      loading: 'validation loading',
      absent: 'no validation file',
      invalid: 'the validation file did not read',
    };
    return (
      <span className="gyld-note gyld-stream-validation" data-validation={status}>
        {said[status] ?? status}
      </span>
    );
  }
  const validation = value.value;
  const findings = validation.findings ?? [];
  const codes = [...new Set(findings.map((finding) => finding.code))];
  return (
    <span
      className={`gyld-stream-validation${validation.ok ? '' : ' gyld-fault'}`}
      data-validation={validation.ok ? 'ok' : 'invalid'}
    >
      {validation.ok ? 'ok' : `invalid: ${validation.code ?? 'no code'}`}
      {findings.length > 0 && (
        <span className="gyld-note">
          {` · ${findings.length} finding${findings.length === 1 ? '' : 's'}`}
          {` (${codes.join(', ')})`}
        </span>
      )}
    </span>
  );
}

function StreamRowView({ row, target }: { row: StreamRow; target: StreamTarget }) {
  const record = row.entry.record;
  // One child context per stream, seeded with that stream's id, so the store
  // tap resolves this row's validation file and no other. The window itself
  // stays on no destination at all.
  const context = useKeyedContext(
    `gyld-stream:${row.id}`,
    () => [createAtomValueTap(GYLD_DEST_STREAM, { initial: row.id })],
  );
  return (
    <li
      className="gyld-stream-row"
      data-stream={row.id}
      data-depth={row.depth}
      style={{ marginInlineStart: `${row.depth * 16}px` }}
    >
      <div className="gyld-stream-head">
        <button
          type="button"
          className="gyld-stream-open"
          disabled={!target.ready}
          title={target.wiredTo === ''
            ? 'open a browser on this stream'
            : `show this stream in browser ${target.wiredTo}`}
          onClick={() => target.show(row.id)}
        >
          {row.id}
        </button>
        <span className="gyld-chip">{record.kind}</span>
        {target.showing === row.id && (
          <span className="gyld-chip gyld-chip-wired">shown</span>
        )}
        {row.parentMoved && (
          <span className="gyld-chip gyld-stream-moved" title={row.parentMovedFromRecord
            ? 'the rebuild that wrote this record said so; Gyld rebuilds it again, '
              + 'this window does not'
            : 'this stream was built against a parent snapshot that is not the '
              + 'one the parent carries now; Gyld rebuilds it, this window does not'}>
            {row.parentMovedFromRecord
              ? 'parent moved since build (the record says so)'
              : 'parent moved since build'}
          </span>
        )}
        {row.parentMissing && (
          <span className="gyld-chip gyld-fault">
            {`parent ${record.parent} is not in this set`}
          </span>
        )}
        <GripProvider grok={grok} context={context}>
          <StreamValidation />
        </GripProvider>
      </div>
      <dl className="gyld-detail-facts">
        <dt>lineage</dt>
        <dd>{record.lineage}</dd>
        <dt>revision</dt>
        <dd>{record.revision}</dd>
        <dt>snapshot</dt>
        <dd><code>{record.snapshot.digest.slice(0, 12)}</code></dd>
        <dt>parent</dt>
        <dd>{record.parent ?? 'none'}</dd>
        <dt>built against</dt>
        <dd>
          {record.parent_snapshot === undefined
            ? 'nothing pinned'
            : <code>{record.parent_snapshot.digest.slice(0, 12)}</code>}
        </dd>
        <dt>chain</dt>
        <dd>{record.chain.join(' → ')}</dd>
        <dt>follows</dt>
        <dd>{record.follows ?? 'not emitted'}</dd>
        <dt>built</dt>
        <dd>{record.built}</dd>
        <dt>overlay</dt>
        <dd>
          {record.overlay === undefined
            ? 'none'
            : `${record.overlay.module}.${record.overlay.root}`}
        </dd>
        <dt>questions</dt>
        <dd>
          {record.questions === undefined
            ? 'not emitted'
            : `${record.questions.length} emitted, ${(record.roots ?? []).length} root`}
        </dd>
      </dl>
      {record.note !== undefined && <p className="gyld-note">{record.note}</p>}
    </li>
  );
}

/** The fork and link form: a kind, a parent and a name, and the command that
 *  composes. The submit button EXPORTS; it creates nothing. */
function NewStreamForm({ parents }: { parents: string[] }) {
  const draft = useGrip(GYLD_STREAM_DRAFT) ?? DRAFT_EMPTY;
  const draftTap = useGrip(GYLD_STREAM_DRAFT_TAP) as AtomTapHandle<StreamDraft> | undefined;
  const exported = useGrip(GYLD_STREAM_EXPORT) ?? '';
  const exportTap = useGrip(GYLD_STREAM_EXPORT_TAP) as AtomTapHandle<string> | undefined;
  const faults = draftShapeFaults(draft);

  // Read through the handle, never the render closure: a submit fired straight
  // after the last keystroke would otherwise export the value before it
  // (CodingRules.md, "Gesture handlers read via tap handles").
  const exportCommand = () => {
    const held = draftTap?.get() ?? draft;
    exportTap?.set(draftCommand(held));
  };

  return (
    <section className="gyld-stream-new">
      <h4>New stream</h4>
      <form
        className="gyld-stream-form"
        onSubmit={(event) => {
          event.preventDefault();
          exportCommand();
        }}
      >
        <label className="gyld-chrome-field">
          kind
          <select
            className="gyld-pick-kind"
            value={draft.operation.verb}
            onChange={(event) => {
              const operation = operationNamed(event.target.value);
              if (operation !== undefined) {
                draftTap?.update((held) => ({ ...held, operation }));
              }
            }}
          >
            {STREAM_OPERATIONS.map((operation) => (
              <option key={operation.verb} value={operation.verb} title={operation.explains}>
                {operation.title}
              </option>
            ))}
          </select>
        </label>
        <label className="gyld-chrome-field">
          parent
          <select
            className="gyld-pick-parent"
            value={draft.parent}
            onChange={(event) => draftTap?.update((held) => ({
              ...held, parent: event.target.value,
            }))}
          >
            <option value="">choose a parent</option>
            {parents.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </label>
        <label className="gyld-chrome-field">
          name
          <input
            type="text"
            className="gyld-stream-name"
            placeholder="keys-2026-09-13"
            value={draft.name}
            onChange={(event) => draftTap?.update((held) => ({
              ...held, name: event.target.value,
            }))}
          />
        </label>
        <button type="submit" className="gyld-stream-export" disabled={faults.length > 0}>
          Export command
        </button>
      </form>
      <p className="gyld-note">{draft.operation.explains}</p>
      <ul className="gyld-omissions">
        {faults.map((fault) => (
          <li key={fault}>{fault}</li>
        ))}
      </ul>
      <p className="gyld-note">
        This stage submits nothing. The command below is what makes the stream;
        run it from the Gyld repository into a new output directory, and the
        window picks the bundle up on its next read.
      </p>
      <textarea
        className="gyld-stream-command"
        readOnly
        rows={3}
        value={exported}
        placeholder="the exported command appears here"
      />
    </section>
  );
}

/** No census, and why. A diagnosis, never an empty tree that would read as a
 *  set with no streams in it. */
function NoStreams() {
  const census = useGrip(GYLD_STREAMS);
  const roots = useGrip(GYLD_STORE_STATUS) ?? [];
  const said: Record<string, string> = {
    empty: 'no bundle root on this desk',
    loading: 'reading the census',
  };
  const status = census?.status ?? 'empty';
  return (
    <div className="gyld-streams gyld-streams-empty">
      <p className="gyld-note">{said[status] ?? status}</p>
      {roots.map((root) => (
        <p key={root.describe} className="gyld-note">
          {`${root.describe}: ${root.status}`}
          {root.error === undefined ? '' : ` (${root.error})`}
        </p>
      ))}
    </div>
  );
}

export function StreamManager() {
  const set = useGrip(GYLD_SET);
  const census = useGrip(GYLD_STREAMS);
  const roots = useGrip(GYLD_STORE_STATUS) ?? [];
  const reload = useGrip(GYLD_STORE_RELOAD);
  const target = useStreamTarget();

  // A desk with no root gets the picker, exactly as the browser does: this
  // plugin never invents a place to read Gyld output from.
  if ((set?.roots.length ?? 0) === 0) {
    return <SetPicker />;
  }
  const rows = streamRows(census);
  if (rows.length === 0) {
    return <NoStreams />;
  }
  const collisions = census?.status === 'ready' ? census.collisions : [];
  return (
    <div className="gyld-streams">
      <header className="gyld-decidenow-head">
        <span className="gyld-detail-label">{`${rows.length} streams`}</span>
        {target.wiredTo !== '' && (
          <span className="gyld-chip gyld-chip-wired">{`wired to ${target.wiredTo}`}</span>
        )}
        <button type="button" disabled={reload === undefined} onClick={() => reload?.()}>
          Reload
        </button>
      </header>
      <div className="gyld-status">
        {roots.map((root) => (
          <span key={root.describe}>
            {`${root.describe}: ${root.status}`}
            {root.error === undefined ? '' : ` (${root.error})`}
            {root.watchLive ? ' · watching' : ''}
          </span>
        ))}
      </div>
      {collisions.map((collision) => (
        <p key={collision.id} className="gyld-fault">
          {`${collision.id} is in ${collision.rootIndexes.length} roots of this set; `
            + 'the first one wins and the others are not read'}
        </p>
      ))}
      <ul className="gyld-stream-tree">
        {rows.map((row) => (
          <StreamRowView key={row.id} row={row} target={target} />
        ))}
      </ul>
      <NewStreamForm parents={parentChoices(census)} />
    </div>
  );
}
