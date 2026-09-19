import type { GyldDimmed } from './camera';
import { HOW_TO_READ, HOW_TO_READ_TITLE } from '../help/graphHelp';
import { LegendPanel } from './legendPanel';
import type { LegendEntry, LegendSample } from './legend';
import { lineOn, LENS_PALETTE_LIGHT, type GyldLensPalette } from './palette';
import type { LegendRow, LensScene } from './scene';

// The legend, as a PANEL OVER the picture rather than a strip above it
// (owner's ask 3: it was taking vertical space the picture wanted).
//
// It is anchored inside the stage, so it covers part of the picture and
// changes none of it: the stage is the box the camera is fitted to, an
// absolutely positioned child takes no room from it, and Fit therefore still
// fits the whole lens whether this is shrunk or expanded (MDV-4).
//
// Shrunk it is a slim tab: the word Legend and the samples, nothing else.
// Expanded it is the rows — sample, name, how many of them this picture draws,
// an eye — each with what the emitting declaration says about it and what it
// means for the reader, plus the `hide instead of dim` switch that governs
// what the eyes do (owner's ask 4: that switch used to sit in the bar saying
// nothing, and does nothing at all until something is switched off).
//
// It is a RENDER. Every press is handed out; nothing here reads or writes a
// grip, so the panel is asserted with no desk at all.

/** The sample beside a row: the emitted fill, or the emitted line. */
function Sample({ sample, palette }: { sample: LegendSample; palette: GyldLensPalette }) {
  if (sample.isLine) {
    return (
      <svg className="gyld-legend-line" width="26" height="10" aria-hidden="true">
        <line
          x1="1"
          y1="5"
          x2="25"
          y2="5"
          // The colour the picture is actually drawn in on THIS desk, not the
          // colour the file was emitted with (./palette.ts).
          stroke={lineOn(palette, sample.color)}
          strokeWidth="2"
          strokeDasharray={
            sample.style === 'dashed' ? '6 4' : (sample.style === 'dotted' ? '2 3' : undefined)
          }
        />
      </svg>
    );
  }
  return (
    <span
      className="gyld-swatch"
      aria-hidden="true"
      style={{ background: sample.fill, borderColor: palette.stroke }}
    />
  );
}

/** The eye: open while the class is drawn, struck through while it is off. */
function EyeGlyph({ open }: { open: boolean }) {
  return (
    <svg className="gyld-eye" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1 8 C 4 3.5, 12 3.5, 15 8 C 12 12.5, 4 12.5, 1 8 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="8" cy="8" r="2.2" fill="currentColor" />
      {!open && <path d="M2 14 L 14 2" stroke="currentColor" strokeWidth="1.6" />}
    </svg>
  );
}

/** What the count says, in words, so the row's own title reads as a sentence. */
function countSays(row: LegendRow): string {
  const one = row.entry.sample.isLine ? 'arrow' : 'box';
  const many = row.entry.sample.isLine ? 'arrows' : 'boxes';
  return `${row.count} ${row.count === 1 ? one : many}`;
}

function Row({ row, palette, onFlash, onEye }: {
  row: LegendRow;
  palette: GyldLensPalette;
  onFlash: (entry: LegendEntry) => void;
  onEye: (entry: LegendEntry) => void;
}) {
  const { entry } = row;
  return (
    <li
      className={`gyld-legend-row${row.off ? ' gyld-legend-off' : ''}`}
      data-entry={entry.key}
      data-off={row.off ? 'yes' : undefined}
    >
      {/* The ROW is the flash: press it and every box or arrow of this class
          lights up for a moment. A second press flashes them again. */}
      <button
        type="button"
        className="gyld-legend-flash"
        title={`flash the ${countSays(row)} of ${entry.label} in this picture`}
        onClick={() => onFlash(entry)}
      >
        <Sample sample={entry.sample} palette={palette} />
        <span className="gyld-legend-name">{entry.label}</span>
        <span className="gyld-legend-count">{row.count}</span>
      </button>
      {/* The EYE switches the class off: dimmed, or hidden per the switch in
          the footer. It replaces the relation buttons this legend used to
          carry and the per-value facet buttons that were in the chrome. */}
      <button
        type="button"
        className="gyld-legend-eye"
        aria-pressed={!row.off}
        aria-label={`${entry.label}: ${row.off ? 'switched off' : 'shown'}`}
        title={row.off
          ? `${entry.label} is switched off in this window; show it again`
          : `switch ${entry.label} off in this window`}
        onClick={() => onEye(entry)}
      >
        <EyeGlyph open={!row.off} />
      </button>
      {/* What the declaration itself says, where the host emitted it. Absent
          on a bundle emitted before `doc`, and then only the line below
          shows. */}
      {entry.doc !== undefined && (
        <p className="gyld-legend-doc">{entry.doc}</p>
      )}
      {entry.says !== '' && (
        <p className="gyld-legend-says">{entry.says}</p>
      )}
    </li>
  );
}

function HowToRead({ onBack }: { onBack: () => void }) {
  return (
    <div className="gyld-legend-help">
      {HOW_TO_READ.map((section) => (
        <section key={section.title}>
          <h5>{section.title}</h5>
          {section.lines.map((line, index) => (
            <p key={`${section.title}-${index}`}>{line}</p>
          ))}
        </section>
      ))}
      <button type="button" className="gyld-legend-back" onClick={onBack}>
        Back to the legend
      </button>
    </div>
  );
}

/**
 * The legend over the picture.
 *
 * @param onPanel told the state the reader just asked for: expanded, shrunk or
 * showing the help. The window writes it, because the window is what knows
 * whether it is also remembered in a tab record.
 * @param onFlash told the entry whose row was pressed.
 * @param onEye told the entry whose eye was pressed.
 * @param onHide told that `hide instead of dim` was flipped.
 */
export function LegendOverlay({
  scene, panel, dimmed, palette = LENS_PALETTE_LIGHT, onPanel, onFlash, onEye, onHide,
}: {
  scene: LensScene;
  panel: LegendPanel;
  dimmed: GyldDimmed;
  /** The same palette the figure is drawn with, so the samples name the
   *  colours that are actually ON the picture. */
  palette?: GyldLensPalette;
  onPanel: (next: LegendPanel) => void;
  onFlash: (entry: LegendEntry) => void;
  onEye: (entry: LegendEntry) => void;
  onHide: () => void;
}) {
  // What `hide instead of dim` governs: the classes the eyes switched off. It
  // governs nothing while none are, which is exactly why it looked broken in
  // the bar — so it says so, and is unusable until it has something to do.
  const switchedOff = scene.legend.filter((row) => row.off).length;
  const hideSays = switchedOff === 0
    ? 'nothing is switched off yet, so this has nothing to hide; switch a class '
      + 'off with an eye above first'
    : 'applies to the classes you switched off with the eye; Next up only always dims';
  return (
    <aside
      className={`gyld-legend-panel${panel.open ? ' gyld-legend-open' : ' gyld-legend-tab'}`}
      // A press on the panel is a press on the panel, not the start of a pan
      // of the picture underneath it; a wheel over it scrolls it rather than
      // zooming the picture.
      onMouseDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="gyld-legend-toggle"
        aria-expanded={panel.open}
        title={panel.open
          ? 'shrink the legend back to its tab'
          : 'expand the legend: every class this picture draws, with what it means'}
        onClick={() => onPanel(panel.toggled())}
      >
        <span className="gyld-legend-word">Legend</span>
        {/* Shrunk, the samples ARE the legend: the colours and the lines, with
            no room taken from the picture. */}
        {!panel.open && scene.legend.map((row) => (
          <Sample key={row.entry.key} sample={row.entry.sample} palette={palette} />
        ))}
      </button>
      {panel.open && (
        <div className="gyld-legend-body">
          <button
            type="button"
            className="gyld-legend-how"
            aria-pressed={panel.help}
            title="what a box shows, what answerable now means, and how to answer one"
            onClick={() => onPanel(panel.withHelp())}
          >
            {HOW_TO_READ_TITLE}
          </button>
          {panel.help
            ? <HowToRead onBack={() => onPanel(panel.withHelp())} />
            : (
              <ul className="gyld-legend-rows">
                {scene.legend.map((row) => (
                  <Row
                    key={row.entry.key}
                    row={row}
                    palette={palette}
                    onFlash={onFlash}
                    onEye={onEye}
                  />
                ))}
              </ul>
            )}
          <footer className="gyld-legend-foot">
            <label className="gyld-hide-toggle" title={hideSays}>
              <input
                type="checkbox"
                className="gyld-hide-off"
                checked={dimmed.hide}
                disabled={switchedOff === 0}
                onChange={() => onHide()}
              />
              hide instead of dim
            </label>
            <span className="gyld-note gyld-hide-says">{hideSays}</span>
          </footer>
        </div>
      )}
    </aside>
  );
}
