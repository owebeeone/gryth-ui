import { useGrip } from '@owebeeone/grip-react';
import {
  GYLD_PICKER_ERROR, GYLD_PICKER_ERROR_TAP, GYLD_PICKER_URL, GYLD_PICKER_URL_TAP,
  GYLD_SET, GYLD_SET_TAP, GYLD_STORE_STATUS,
} from '../grips';
import { gyldStoreTap } from '../rootTaps';
import { directoryPicker, isPickerCancel, type PickedDirectoryHandle } from './fsAccess';
import { addDirectoryRoot, addShareRoot, addStaticRoot, describeRoot } from './setOps';

// The set picker: the browser window's EMPTY STATE and its "add a root"
// affordance. A desk with no root gets this instead of a picture, because the
// plugin never invents a place to read Gyld output from.
//
// Every write goes through a tap handle, and every set write goes through
// `update()` rather than a render-closure read followed by a set: the
// directory dialog is open for seconds, so a second window's picker writing in
// the meantime is a real race, not a theoretical one (CodingRules.md).

export function SetPicker() {
  const setTap = useGrip(GYLD_SET_TAP);
  const set = useGrip(GYLD_SET);
  const url = useGrip(GYLD_PICKER_URL) ?? '';
  const urlTap = useGrip(GYLD_PICKER_URL_TAP);
  const error = useGrip(GYLD_PICKER_ERROR) ?? '';
  const errorTap = useGrip(GYLD_PICKER_ERROR_TAP);
  const roots = useGrip(GYLD_STORE_STATUS) ?? [];
  const picker = directoryPicker();

  const addUrl = () => {
    if (!setTap) {
      return;
    }
    // The draft is read through its handle, not the render closure: drips are
    // queued, so a submit fired right after the last keystroke would otherwise
    // see the value before that keystroke.
    const typed = urlTap?.get() ?? url;
    let failure: string | undefined;
    setTap.update((held) => {
      const out = addStaticRoot(held, typed);
      failure = out.error;
      return out.set;
    });
    errorTap?.set(failure ?? '');
    if (failure === undefined) {
      urlTap?.set('');
    }
  };

  // The picker is called INSIDE the click handler, because the File System
  // Access API requires a live user activation and an await before the call
  // would have spent it.
  const addDirectory = () => {
    if (!picker || !setTap) {
      return;
    }
    void (async () => {
      let handle: PickedDirectoryHandle;
      try {
        handle = await picker();
      } catch (err) {
        if (!isPickerCancel(err)) {
          errorTap?.set(`directory pick failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }
      setTap.update((held) => {
        const out = addDirectoryRoot(held, handle.name);
        // Registered BEFORE the root ref is published, so the root never
        // flashes the "no directory handle" error on its way in.
        gyldStoreTap.setDirectoryHandle(out.name, handle);
        return out.set;
      });
      errorTap?.set('');
    })();
  };

  const drop = (index: number) => {
    setTap?.update((held) => ({ roots: held.roots.filter((_, at) => at !== index) }));
  };

  // The third kind of root: the bundle the glade-gyld supplier publishes onto
  // the gyld value shares after each build. It takes no address, because the
  // desktop has exactly one glade session and this root reads that session's
  // mounts. A composition with no glade shows the root as an error rather than
  // as a bundle with nothing in it.
  const addShare = () => {
    if (!setTap) {
      return;
    }
    let failure: string | undefined;
    setTap.update((held) => {
      const out = addShareRoot(held);
      failure = out.error;
      return out.set;
    });
    errorTap?.set(failure ?? '');
  };

  return (
    <div className="gyld-picker">
      <h3>Gyld browser</h3>
      <p className="gyld-note">
        This desk has no bundle root. Point it at an emitted Gyld bundle: a
        served output directory (for example <code>python3 -m http.server</code>
        {' '}over it) or a local directory.
      </p>
      <form
        className="gyld-picker-row"
        onSubmit={(event) => {
          event.preventDefault();
          addUrl();
        }}
      >
        <input
          type="text"
          className="gyld-picker-url"
          placeholder="http://localhost:8000"
          value={url}
          onChange={(event) => urlTap?.set(event.target.value)}
        />
        <button type="submit" disabled={setTap === undefined}>Add static root</button>
      </form>
      <div className="gyld-picker-row">
        <button type="button" onClick={addDirectory} disabled={picker === null || !setTap}>
          Open directory…
        </button>
        <span className="gyld-badge-local" title="a directory handle never serializes, so this root lives on this client only">
          local only
        </span>
        {picker === null && (
          <span className="gyld-note">
            this browser has no File System Access API (Chromium only), so use a
            static root instead
          </span>
        )}
      </div>
      <div className="gyld-picker-row">
        <button
          type="button"
          className="gyld-add-share"
          onClick={addShare}
          disabled={!setTap}
        >
          Add glade node
        </button>
        <span className="gyld-note">
          the bundle the glade-gyld supplier publishes onto the gyld shares
          after each build; the same windows read it, and submitting from them
          needs it
        </span>
      </div>
      {error !== '' && <p className="gyld-fault">{error}</p>}
      <ul className="gyld-picker-roots">
        {(set?.roots ?? []).map((root, index) => {
          const status = roots[index];
          return (
            <li key={`${root.kind}:${describeRoot(root)}`}>
              <code>{describeRoot(root)}</code>
              <span className="gyld-note">
                {status === undefined ? 'idle' : status.status}
                {status?.error === undefined ? '' : ` (${status.error})`}
              </span>
              <button type="button" onClick={() => drop(index)}>Remove</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
