import { useGrip } from '@owebeeone/grip-react';
import {
  GYLD_BUNDLE, GYLD_DEST_PERSPECTIVE, GYLD_DEST_STREAM, GYLD_LENS, GYLD_STORE_STATUS,
} from './grips';
import { LensView } from './lens/LensView';

// The gyld.browser window. Phase 1 step 1.3 mounts the LENS VIEW in it; the
// full browser chrome (the perspective picker, the search box, the set picker
// and the wired detail links) is step 1.4.
//
// There is no local state and no derived Gyld fact here: the window reads its
// destination, the store tap's answer for that destination, and renders it.
// An unset or absent destination is shown as what it is, never substituted.

function Value({ text }: { text: string }) {
  if (text === '') {
    return <dd className="gyld-unset">not set by the opening link</dd>;
  }
  return <dd>{text}</dd>;
}

// Why there is no picture, said in one place: the window's destination, what
// the store tap made of it, every root's status and the perspectives the
// stream actually emitted. Nothing here is a substitute for a lens; it is the
// diagnosis of its absence.
const LENS_STATE: Record<string, string> = {
  unset: 'no stream and perspective on this window yet',
  loading: 'reading the lens file',
  absent: 'no lens file for that stream and perspective',
  invalid: 'the lens file did not read',
};

function NoLens() {
  const stream = useGrip(GYLD_DEST_STREAM) ?? '';
  const perspective = useGrip(GYLD_DEST_PERSPECTIVE) ?? '';
  const bundle = useGrip(GYLD_BUNDLE);
  const lens = useGrip(GYLD_LENS);
  const roots = useGrip(GYLD_STORE_STATUS) ?? [];
  return (
    <div className="gyld-placeholder">
      <h3>Gyld browser</h3>
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
      {roots.length === 0 && (
        <p className="gyld-note">
          No bundle root on this desk yet. The set picker is step 1.4; until
          then a root is added by writing Gyld.Set through its tap handle.
        </p>
      )}
      {roots.map((root) => (
        <p key={root.describe} className="gyld-note">
          {root.describe}: {root.status}
          {root.error === undefined ? '' : ` (${root.error})`}
          {root.watchLive ? ' · watching' : ''}
        </p>
      ))}
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

export function GyldBrowser() {
  const lens = useGrip(GYLD_LENS);
  if (lens?.status === 'ok') {
    return <LensView scope={`${lens.stream}-${lens.perspective}`} />;
  }
  return <NoLens />;
}
