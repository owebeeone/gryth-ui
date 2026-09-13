import { useGrip } from '@owebeeone/grip-react';
import {
  GYLD_DEST_LEFT, GYLD_DEST_RIGHT, GYLD_OPS, GYLD_OPS_STATUS,
} from '../grips';
import { opsGate } from './submit';

// The three one-press requests (step 4.4): read the latest build's listing,
// re-capture the latest bundle, and write the diff of a pair the bundle does
// not carry.
//
// None takes a form, so none has an export beside it: the command a reader
// would run instead is already printed by the window that offers this, and
// these buttons ask the supplier to run it rather than restating it.

/**
 * List: the one allowed verb that runs no host at all. It reads the latest
 * build's `streams.json` and answers with it, which is the only way to ask
 * "is the supplier there, and has it built anything yet" without starting a
 * build. A bundle root that has never been built publishes nothing on the
 * shares, and an empty desk is not the same fact as an absent supplier.
 */
export function ListButton() {
  const ops = useGrip(GYLD_OPS);
  const gate = opsGate(ops, useGrip(GYLD_OPS_STATUS) ?? '');
  return (
    <button
      type="button"
      className="gyld-ops-list"
      disabled={!gate.ready}
      title={gate.ready
        ? 'read the latest build\'s stream listing from the supplier; builds nothing'
        : gate.reason}
      onClick={() => {
        void ops?.list();
      }}
    >
      List
    </button>
  );
}

/**
 * Rebuild: the explicit re-capture of spec section 6.4, for a stream whose
 * parent moved or whose overlay text changed outside the UI. It re-captures
 * every stream the latest bundle lists, into a NEW build directory; nothing is
 * ever built over an existing one.
 */
export function RebuildButton() {
  const ops = useGrip(GYLD_OPS);
  const gate = opsGate(ops, useGrip(GYLD_OPS_STATUS) ?? '');
  return (
    <button
      type="button"
      className="gyld-ops-rebuild"
      disabled={!gate.ready}
      title={gate.ready
        ? 're-capture the latest bundle into a new build directory'
        : gate.reason}
      onClick={() => {
        void ops?.rebuild();
      }}
    >
      Rebuild
    </button>
  );
}

/**
 * Diff: write the ordered pair's comparison into the bundle's own `diffs/`.
 *
 * The window never compares two bundles itself (spec section 6.7), so what it
 * can do about a pair Gyld has not compared is ask Gyld to compare it. The
 * pair is the window's own destination, in its own order.
 */
export function DiffButton() {
  const ops = useGrip(GYLD_OPS);
  const gate = opsGate(ops, useGrip(GYLD_OPS_STATUS) ?? '');
  const left = useGrip(GYLD_DEST_LEFT) ?? '';
  const right = useGrip(GYLD_DEST_RIGHT) ?? '';
  const paired = left !== '' && right !== '';
  return (
    <button
      type="button"
      className="gyld-ops-diff"
      disabled={!gate.ready || !paired}
      title={gate.ready
        ? (paired
          ? `ask Gyld to write the diff of ${left} against ${right}`
          : 'choose both streams first')
        : gate.reason}
      onClick={() => {
        void ops?.diff({ left, right });
      }}
    >
      Request this diff
    </button>
  );
}
