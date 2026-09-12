import { useRuntime, type MatchingContext, type Tap } from '@owebeeone/grip-react';

// Keyed CHILD contexts inside one window.
//
// A window is one destination: it resolves one `Gyld.Dest.Stream`, so it sees
// one bundle. Two windows want more than that. The stream manager shows every
// stream's validation at once, and the diff window draws two streams side by
// side, and neither can be done by a window that has a single destination.
//
// The answer is the desktop's own, one level down: the desktop gives each TAB
// a keyed child context and registers that tool's seeds on it
// (packages/desktop/src/tabContexts.ts, `tabContextFor`), so each tab is its
// own destination. A window does the same for each of its parts. The child
// resolves everything its parent does, except the grips its own seeds
// provide, so one row of the stream manager reads that row's stream while the
// window around it keeps reading the census.
//
// This is not React state and it is not a hook of our own: the context is
// looked up by key, created on the first render that asks for it, and the
// seeds are registered by the `init` callback grip-core runs only when it
// actually creates one. A second render with the same key finds the same
// context and registers nothing.

/**
 * The child context named `key` under this component's context, seeded once
 * with `taps`.
 *
 * `taps` is called ONLY when the context is created. A re-render finds the
 * context that is already there and leaves its seeds alone, which is what
 * makes this safe to call from a render: the window keeps its per-part state
 * across every redraw, exactly as a tab keeps its state across an unmount.
 *
 * The context is held by its parent, so it lives as long as the window's tab
 * context does and goes when the desktop retires that.
 */
export function useKeyedContext(key: string, taps: () => Tap[]): MatchingContext {
  const { context } = useRuntime();
  return context.getGripConsumerContext().getOrCreateMatchingContext(key, (child) => {
    const home = child.getGripHomeContext();
    for (const tap of taps()) {
      home.registerTap(tap);
    }
  });
}
