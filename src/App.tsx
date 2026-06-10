import { useGrip } from '@owebeeone/grip-react';
import { CURRENT_PAGE, CURRENT_PAGE_TAP, WORKSPACE_NAME, type Page } from './grips';

const PAGES: Page[] = ['workspace', 'terminal', 'debugger'];

export default function App() {
  const page = useGrip(CURRENT_PAGE);
  const pageTap = useGrip(CURRENT_PAGE_TAP);
  const workspace = useGrip(WORKSPACE_NAME);
  return (
    <div className="app">
      <header className="app-header">
        <h1>gryth</h1>
        <span className="workspace-name">{workspace}</span>
        <nav>
          {PAGES.map((p) => (
            <button key={p} onClick={() => pageTap?.set(p)} disabled={page === p}>
              {p}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">
        {page === 'workspace' && <p>Workspace view — tree, files, peers.</p>}
        {page === 'terminal' && <p>Terminal view — shared sessions.</p>}
        {page === 'debugger' && <p>Debugger view — the page an agent can open for you.</p>}
      </main>
    </div>
  );
}
