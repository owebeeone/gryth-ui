import { useGrip } from '@owebeeone/grip-react';
import type { ToolViewProps } from '@grythjs/plugin-api';
import {
  GYLD_BUNDLE, GYLD_DEST_PERSPECTIVE, GYLD_DEST_PREVIEW, GYLD_DEST_STREAM, GYLD_LENS,
  GYLD_PREVIEW, GYLD_RECORDS, GYLD_SET, GYLD_TAB_SEARCH,
} from './grips';
import { BrowserChrome } from './browser/BrowserChrome';
import { SetPicker } from './browser/SetPicker';
import { NO_SEARCH, searchLens } from './browser/search';
import { LensView } from './lens/LensView';
import type { GyldLensState } from './store/state';

// The gyld.browser window (step 1.4): one lens of one stream, with the pickers
// that change the destination, the search that highlights records, the dim
// toggles that turn dimensions off over a FIXED layout, and the links to a
// wired detail window and to a drill-in window.
//
// There is no local state and no derived Gyld fact here. The window reads its
// destination, what the store tap made of it, and the index over it; the one
// thing it computes is which records a search matched, which is a projection
// over emitted labels and qualified slots (spec section 3.5).

/** Why there is no picture, said in one place: the window's destination, what
 *  the store tap made of it, every root's status and the perspectives the
 *  stream actually emitted. A diagnosis, never a substitute for a lens. */
const LENS_STATE: Record<string, string> = {
  unset: 'no stream and perspective on this window yet',
  loading: 'reading the lens file',
  absent: 'no lens file for that stream and perspective',
  invalid: 'the lens file did not read',
};

function Value({ text }: { text: string }) {
  if (text === '') {
    return <dd className="gyld-unset">not set by the opening link</dd>;
  }
  return <dd>{text}</dd>;
}

function NoLens({ lens }: { lens: GyldLensState | undefined }) {
  const stream = useGrip(GYLD_DEST_STREAM) ?? '';
  const perspective = useGrip(GYLD_DEST_PERSPECTIVE) ?? '';
  const bundle = useGrip(GYLD_BUNDLE);
  return (
    <div className="gyld-placeholder">
      <dl>
        <dt>stream</dt>
        <Value text={stream} />
        <dt>perspective</dt>
        <Value text={perspective} />
        <dt>bundle</dt>
        <dd>{bundle?.status ?? 'unset'}</dd>
        <dt>lens</dt>
        <dd>{LENS_STATE[lens?.status ?? 'unset'] ?? (lens?.status ?? 'unset')}</dd>
      </dl>
      {lens?.fault !== undefined && (
        <p className="gyld-fault">{lens.fault.path}: {lens.fault.message}</p>
      )}
      {(bundle?.faults ?? []).map((fault) => (
        <p key={fault.path} className="gyld-fault">{fault.path}: {fault.message}</p>
      ))}
      {bundle?.perspectives !== undefined && bundle.perspectives.length > 0 && (
        <p className="gyld-note">
          emitted perspectives: {bundle.perspectives.join(', ')}
        </p>
      )}
      {(bundle?.notEmitted ?? []).map((entry) => (
        <p key={entry.perspective} className="gyld-note">
          {entry.perspective}: not emitted
          {entry.reason === undefined ? '' : ` (${entry.reason})`}
        </p>
      ))}
    </div>
  );
}

export function GyldBrowser({ tabId }: ToolViewProps) {
  // The SET, not the store's statuses: a desk that has a root the store has
  // not reached yet is a desk with a root, and must not flash the picker at
  // the reader while the first census is in flight.
  const set = useGrip(GYLD_SET);
  const emitted = useGrip(GYLD_LENS);
  const preview = useGrip(GYLD_PREVIEW);
  const question = useGrip(GYLD_DEST_PREVIEW) ?? '';
  const records = useGrip(GYLD_RECORDS);
  const query = useGrip(GYLD_TAB_SEARCH) ?? '';
  // A window that asked for a preview draws the preview; every other window
  // draws the emitted lens its perspective names. The window keeps resolving
  // the emitted lens either way, because the preview is a restriction OF it
  // and the layout tap reads it from the same destination.
  const state = question === '' ? emitted : preview;

  // A desk with no root gets the picker, not an empty picture: this plugin
  // never invents a place to read Gyld output from.
  if ((set?.roots.length ?? 0) === 0) {
    return <SetPicker />;
  }
  const lens = state?.status === 'ok' ? state.value : undefined;
  const search = lens === undefined ? NO_SEARCH : searchLens(lens, records, query);
  return (
    <div className="gyld-browser">
      <BrowserChrome tabId={tabId} lens={lens} search={search} />
      {lens === undefined
        ? <NoLens lens={state} />
        : (
          <LensView
            scope={`${tabId}-${lens.perspective}`}
            search={search}
            state={state}
          />
        )}
    </div>
  );
}
