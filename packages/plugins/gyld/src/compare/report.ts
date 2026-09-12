import type { GyldEvaluatorRun, RunProposal } from '../contract';

// Where one proposal's inspector report is, as a PURE function over what the
// run index said.
//
// Owner ruling O7: `gyld.compare` iframes the existing evaluator `report.html`
// first. Which document that is, is the run's own answer. A run that emitted
// the report names the file per proposal; a run that did not says so in
// `reports.emitted` and names the run that holds it in `reports.run`, because
// the report is the same document for the same evaluation inputs.
//
// Nothing is guessed except one thing, and it is named here: the run that
// HOLDS the report is an earlier run with no `run.json` of its own, so the
// file inside it is addressed by the layout specification section 7.8 writes
// down, `<run>/<proposal>/report.html`. The window prints the URL it resolved
// beside the frame, so what was composed is on screen rather than implied.

/** Spec section 7.8: `runs/<run>/<proposal>/{..., report.html}`. */
export const REPORT_FILE = 'report.html';

export interface ReportSource {
  /** The URL to iframe. */
  url: string;
  /** Where it came from, in words, for the line beside the frame. */
  from: string;
  /** The host's own note about why the report is elsewhere, when it said one. */
  note?: string;
}

function trimSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/** The last path segment of `artifacts/iroh-integration-v1`. */
function lastSegment(path: string): string {
  const trimmed = trimSlashes(path);
  const cut = trimmed.lastIndexOf('/');
  return cut === -1 ? trimmed : trimmed.slice(cut + 1);
}

/** `name` in place of the last segment of `runUrl`: the run directory beside
 *  this one, which is how the emitted runs sit under one holding directory. */
function siblingOf(runUrl: string, name: string): string {
  const trimmed = trimSlashes(runUrl);
  const cut = trimmed.lastIndexOf('/');
  return cut === -1 ? name : `${trimmed.slice(0, cut)}/${name}`;
}

export function reportSource(
  runUrl: string,
  run: GyldEvaluatorRun,
  proposal: RunProposal,
): ReportSource | undefined {
  if (runUrl === '') {
    return undefined;
  }
  const emitted = proposal.files.report_html;
  if (emitted !== undefined) {
    return { url: `${trimSlashes(runUrl)}/${emitted}`, from: 'emitted with this run' };
  }
  const elsewhere = run.reports.run;
  if (elsewhere === undefined) {
    return undefined;
  }
  const source: ReportSource = {
    url: `${siblingOf(runUrl, lastSegment(elsewhere))}/${proposal.id}/${REPORT_FILE}`,
    from: `the run ${elsewhere}, which this run names in reports.run`,
  };
  if (run.reports.note !== undefined) {
    source.note = run.reports.note;
  }
  return source;
}
