import { GripProvider, type GripContextLike, type Grok } from '@owebeeone/grip-react';
import type { ToolDef, ToolView } from '@grythjs/plugin-api';

// The chrome-free tool mount (G-2): a tool's window body is a GripProvider on
// a READY context around its `windowComponent`, and nothing else. `Window.tsx`
// mounts its tabs through this; a replay, a preview, a documentation page or a
// test mounts a tool the same way, in its own `grok` and context, without
// copying chrome internals. ToolBody creates no tab context and seeds no
// `tabTaps` — the caller hands it the context the tool should resolve against
// (the desktop's `tabContextFor`, or a frozen replay context).

export interface ToolBodyProps {
  grok: Grok;
  context: GripContextLike;
  /** The tool, or its view directly: one of the two. `def` wins when both are given. */
  def?: ToolDef;
  windowComponent?: ToolView;
  tabId: string;
  params?: Record<string, unknown>;
}

export function ToolBody({ grok, context, def, windowComponent, tabId, params }: ToolBodyProps) {
  const Facet = def?.windowComponent ?? windowComponent;
  if (Facet === undefined) {
    throw new Error('ToolBody needs a `def` or a `windowComponent`');
  }
  return (
    <GripProvider grok={grok} context={context}>
      <Facet tabId={tabId} params={params} />
    </GripProvider>
  );
}
