import { useGrip } from '@owebeeone/grip-react';
import { GLADE_STATUS, principal } from '@grythjs/glade';
import { GWZ_RESULT, GWZ_STREAM, GWZ_VERB, GWZ_VERB_TAP, GWZ_VERBS } from './grips';
import { runGwz, streamGwz } from './live';

// Gwz panel (GLP-0006 P1.S4) — a thin projection over grips, no React state
// hook. The verb is a grip atom (picker-limited to the allow-list); the last
// answer is GWZ_RESULT; the streamed run is GWZ_STREAM (a live glial mount on
// gwz.output). The args box is uncontrolled (read on run). Failure is data:
// a disallowed verb comes back {ok:false,error}, surfaced, never a hang.

/** Split the args box into an argv (whitespace-separated, empties dropped). */
function readArgs(form: HTMLFormElement): string[] {
  const input = form.elements.namedItem('args') as HTMLInputElement | null;
  return (input?.value ?? '').trim().split(/\s+/).filter(Boolean);
}

export function Gwz() {
  const verb = useGrip(GWZ_VERB) ?? GWZ_VERBS[0];
  const verbTap = useGrip(GWZ_VERB_TAP);
  const result = useGrip(GWZ_RESULT);
  const stream = useGrip(GWZ_STREAM) ?? [];
  const status = useGrip(GLADE_STATUS);

  return (
    <div className="gwz-view">
      <div className="gwz-head">
        <div className="gwz-verbs">
          {GWZ_VERBS.map((v) => (
            <button
              key={v}
              className={v === verb ? 'gwz-verb active' : 'gwz-verb'}
              onClick={() => verbTap?.set(v)}
              disabled={v === verb}
            >
              {v}
            </button>
          ))}
        </div>
        <span className="gwz-who" title={`connection: ${status ?? 'connecting'}`}>
          {principal} · {status ?? 'connecting'}
        </span>
      </div>

      <form
        className="gwz-run"
        onSubmit={(e) => {
          e.preventDefault();
          void runGwz(verb, readArgs(e.currentTarget));
        }}
      >
        <input name="args" placeholder={`args for ${verb} (optional)…`} autoComplete="off" />
        <button type="submit">run</button>
        <button type="button" onClick={(e) => void streamGwz(verb, readArgs(e.currentTarget.form!))}>
          stream
        </button>
        <button
          type="button"
          title="send a disallowed (mutating) verb — proves failure-as-data"
          onClick={() => void runGwz('commit', ['-m', 'demo'])}
        >
          deny demo
        </button>
      </form>

      {result && (
        <div className={`gwz-result ${result.ok ? 'ok' : 'err'}`}>
          {result.error ? (
            <>error: <b>{result.error}</b></>
          ) : (
            <>
              ok=<b>{String(result.ok)}</b>
              {result.exit != null && <> · exit=<b>{result.exit}</b></>}
              {result.run_id && <> · run <b>{result.run_id}</b></>}
              {result.attributed_to && <> · by <b>{result.attributed_to}</b></>}
            </>
          )}
        </div>
      )}
      {result?.stdout && <pre className="gwz-out">{result.stdout}</pre>}
      {result?.stderr && <pre className="gwz-out err">{result.stderr}</pre>}

      <div className="gwz-stream">
        {stream.length === 0 && (
          <div className="gwz-empty">no streamed run yet — press “stream” to watch gwz.output converge live</div>
        )}
        {stream.map((r, i) =>
          r.stream === 'end' ? (
            <div key={i} className="gwz-line"><b>— done</b> · exit {r.exit}</div>
          ) : (
            <div key={i} className="gwz-line">
              <span className="gwz-seq">{r.seq}</span> <b>{r.stream}</b> {r.line}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
