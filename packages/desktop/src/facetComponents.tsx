import { useGrip } from '@owebeeone/grip-react';
import { WORKSPACE_NAME } from '@grythjs/plugin-api';

// The desktop's own shell facets. Tool-bearing facets (settings, explorer,
// diff, chat) now live in their plugin packages; what remains here is shell:
// the first-run welcome window, the foundation grid placeholder, and the
// missing-tool fallback. They render content and know nothing about windows
// — all desktop behaviour (drag, resize, z-order, focus) lives in the chrome.

export function WelcomeFacet() {
  const workspace = useGrip(WORKSPACE_NAME);
  return (
    <div className="facet-pad">
      <h2>gryth</h2>
      <p>
        Workspace <strong>{workspace}</strong>. Every window here is a row in
        the <code>Desktop.Windows</code> grip — environ state. Move one, and
        you are editing a document an agent could edit too.
      </p>
    </div>
  );
}

// Foundations render through FoundationWindow chrome; this component exists
// only to satisfy the registry contract.
export function GridFacet() {
  return <div className="facet-pad">Foundation grid.</div>;
}

// Rendered when no registered plugin provides the tab's tool id — partial
// clients are a defined state, not a crash (see GrythPluginContract.md).
export function MissingToolFacet({ toolId }: { toolId: string }) {
  return (
    <div className="facet-pad">
      <h2>Missing tool</h2>
      <p>No registered plugin provides <code>{toolId}</code>.</p>
    </div>
  );
}
