import { useGrip, type AtomTapHandle } from '@owebeeone/grip-react';
import {
  DESKTOP_OPEN_TOOL, DESKTOP_OPEN_WIRED, DESKTOP_RETARGET_TAB,
} from '@grythjs/plugin-api';
import type { GyldLens } from '../contract';
import {
  GYLD_BUNDLE, GYLD_DEST_PERSPECTIVE, GYLD_DEST_PERSPECTIVE_TAP, GYLD_DEST_PREVIEW,
  GYLD_DEST_PREVIEW_TAP, GYLD_DEST_REF, GYLD_DEST_STREAM, GYLD_DEST_STREAM_TAP,
  GYLD_FOCUS, GYLD_STORE_RELOAD, GYLD_STORE_STATUS, GYLD_STREAMS, GYLD_TAB_DIMMED,
  GYLD_TAB_DIMMED_TAP, GYLD_TAB_SEARCH, GYLD_TAB_SEARCH_TAP,
} from '../grips';
import { NOTHING_DIMMED, type GyldDimmed } from '../lens/camera';
import { rootLine } from '../store/waiting';
import { NODE_FACETS } from '../lens/facets';
import { GYLD_DECIDE_NOW_TOOL, GYLD_DECIDE_TOOL, GYLD_DETAIL_TOOL } from '../tools';
import { PreviewPerspective } from '../preview/neighbourhood';
import { RebuildButton } from '../ops/RebuildButton';
import { neighbourhoodLink } from './links';
import { pickPerspective, pickStream, type DestinationHandles } from './destination';
import { labelFor, perspectiveOptions } from './perspectives';
import type { GyldSearchMatch } from './search';

// The browser's chrome: the stream switcher, the perspective picker, the
// search box, the node dim toggles and the four links a browser writes.
//
// Nothing here is derived. The stream list is the census, the perspective list
// is the stream's own lens manifest read by ./perspectives (or, for a stream
// that emits no manifest, what the store could list), and the facet values are
// the values the drawn nodes carry.

export function BrowserChrome({ tabId, lens, search }: {
  tabId: string;
  /** The lens actually drawn, when one is. The facet toggles are offered for
   *  the values THIS picture carries, so a window with no picture offers none. */
  lens?: GyldLens;
  search: GyldSearchMatch;
}) {
  const census = useGrip(GYLD_STREAMS);
  const bundle = useGrip(GYLD_BUNDLE);
  const stream = useGrip(GYLD_DEST_STREAM) ?? '';
  const streamTap = useGrip(GYLD_DEST_STREAM_TAP) as AtomTapHandle<string> | undefined;
  const perspective = useGrip(GYLD_DEST_PERSPECTIVE) ?? '';
  const perspectiveTap = useGrip(GYLD_DEST_PERSPECTIVE_TAP) as AtomTapHandle<string> | undefined;
  const preview = useGrip(GYLD_DEST_PREVIEW) ?? '';
  const previewTap = useGrip(GYLD_DEST_PREVIEW_TAP) as AtomTapHandle<string> | undefined;
  const ref = useGrip(GYLD_DEST_REF) ?? '';
  const focus = useGrip(GYLD_FOCUS);
  const query = useGrip(GYLD_TAB_SEARCH) ?? '';
  const searchTap = useGrip(GYLD_TAB_SEARCH_TAP) as AtomTapHandle<string> | undefined;
  const dimmed = useGrip(GYLD_TAB_DIMMED) ?? NOTHING_DIMMED;
  const dimmedTap = useGrip(GYLD_TAB_DIMMED_TAP) as AtomTapHandle<GyldDimmed> | undefined;
  const roots = useGrip(GYLD_STORE_STATUS) ?? [];
  const reload = useGrip(GYLD_STORE_RELOAD);
  const openTool = useGrip(DESKTOP_OPEN_TOOL);
  const openWired = useGrip(DESKTOP_OPEN_WIRED);
  // where a pick lands: this window's own destination atoms, and its tab
  // RECORD, so a restored desk reopens the window on the last pick (./destination)
  const destination: DestinationHandles = {
    tabId,
    stream: streamTap,
    perspective: perspectiveTap,
    preview: previewTap,
    retarget: useGrip(DESKTOP_RETARGET_TAB),
  };

  const streams = census?.status === 'ready' ? census.streams : [];
  const options = perspectiveOptions(bundle, perspective, preview);
  // What the picker is ON. A window showing a preview is on the preview, not
  // on the emitted lens the preview was restricted out of, even though that
  // lens is the one `Gyld.Lens` resolves underneath.
  const picked = PreviewPerspective.of(preview)?.optionValue ?? perspective;

  return (
    <div className="gyld-chrome">
      <div className="gyld-chrome-row">
        <label className="gyld-chrome-field">
          stream
          <select
            className="gyld-pick-stream"
            value={stream}
            onChange={(event) => pickStream(destination, event.target.value)}
          >
            {stream === '' && <option value="">choose a stream</option>}
            {streams.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.id}</option>
            ))}
          </select>
        </label>
        <label className="gyld-chrome-field">
          perspective
          <select
            className="gyld-pick-perspective"
            value={picked}
            onChange={(event) => pickPerspective(destination, options, event.target.value)}
          >
            {perspective === '' && <option value="">choose a perspective</option>}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={!option.emitted}
                title={option.reason}
              >
                {labelFor(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="gyld-chrome-field gyld-chrome-search">
          search
          <input
            type="text"
            className="gyld-search"
            placeholder="label or qualified slot"
            value={query}
            onChange={(event) => searchTap?.set(event.target.value)}
          />
        </label>
        {search.active && (
          <span className="gyld-note">
            {`${search.nodes} of ${search.drawn} drawn records match`}
          </span>
        )}
      </div>
      <div className="gyld-chrome-row">
        <button
          type="button"
          className="gyld-open-detail"
          disabled={openWired === undefined}
          title="a detail window wired to this browser, following this window's selection"
          onClick={() => openWired?.(tabId, { toolId: GYLD_DETAIL_TOOL })}
        >
          Details
        </button>
        <button
          type="button"
          className="gyld-open-hood"
          disabled={openTool === undefined || ref === ''}
          title="a new window on the focused record, leaving this one as it is"
          onClick={() => openTool?.(neighbourhoodLink({
            stream, perspective, focus: ref, options,
          }))}
        >
          Neighbourhood
        </button>
        <button
          type="button"
          className="gyld-open-decidenow"
          disabled={openWired === undefined}
          title="the stream's decide-now list, wired to this browser"
          onClick={() => openWired?.(tabId, { toolId: GYLD_DECIDE_NOW_TOOL })}
        >
          Decide now
        </button>
        <button
          type="button"
          className="gyld-open-decide"
          disabled={openWired === undefined}
          title="answer a question of this stream, or ask a new one, wired to this browser"
          onClick={() => openWired?.(tabId, { toolId: GYLD_DECIDE_TOOL })}
        >
          Decide
        </button>
        <button type="button" disabled={reload === undefined} onClick={() => reload?.()}>
          Reload
        </button>
        <RebuildButton />
        <span className="gyld-note gyld-focus-line">
          {focus === undefined || focus.ref === ''
            ? 'no record focused'
            : `focus ${focus.stream}/${focus.ref}`}
        </span>
      </div>
      {lens !== undefined && (
        <div className="gyld-chrome-row gyld-facets">
          {NODE_FACETS.flatMap((facet) => facet.values(lens).map((value) => {
            const off = facet.isOff(dimmed, value);
            return (
              <button
                key={`${facet.name}/${value}`}
                type="button"
                className={`gyld-facet${off ? ' gyld-facet-off' : ''}`}
                data-facet={facet.name}
                data-value={value}
                title={`${facet.name} ${value}: ${off ? 'off' : 'on'} in this window`}
                onClick={() => dimmedTap?.set(facet.toggle(dimmedTap.get() ?? NOTHING_DIMMED, value))}
              >
                {`${facet.name} ${value}`}
              </button>
            );
          }))}
        </div>
      )}
      <div className="gyld-status">
        {roots.map((root) => (
          <span key={root.describe}>{rootLine(root)}</span>
        ))}
      </div>
    </div>
  );
}
