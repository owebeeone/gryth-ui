import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  GripProvider, createAtomValueTap,
  type Drip, type Grip, type MatchingContext, type Tap,
} from '@owebeeone/grip-react';
import { grok } from '@grythjs/plugin-api';
import { GYLD_FOCUS, GYLD_FOCUS_TAP, GYLD_SET, GYLD_SET_TAP } from '../src/grips';
import { NO_FOCUS } from '../src/focus';
import { GyldIndexTap, GyldRecordTap } from '../src/records/taps';
import { GyldStoreTap } from '../src/store/GyldStoreTap';
import type { GyldSet } from '../src/store/state';
import { FakeBundle, fakeFetch } from './fakeBundle';

// The desk a window test mounts in: one plugin-root context carrying the set,
// the focus atom and the three taps the plugin registers at its root, and a
// chrome-held child context per tab carrying that tool's tabTaps.
//
// This is the shape packages/desktop builds at runtime (tabContexts.ts,
// tabContextFor and wireTabSource), with no desktop and no DOM: rendering is
// renderToStaticMarkup, and every byte comes from the FakeBundle image.

export const BASE_URL = 'https://example.test/out';

export const STATIC_SET: GyldSet = { roots: [{ kind: 'static', baseUrl: BASE_URL }] };

export const EMPTY_ROOTS: GyldSet = { roots: [] };

export interface MountedContext {
  ctx: MatchingContext;
  /** A subscribed drip on one grip, resolved from this context. */
  read<T>(grip: Grip<T>): Drip<T>;
  render(node: ReactElement): string;
}

export interface MountedDesk extends MountedContext {
  bundle: FakeBundle;
  store: GyldStoreTap;
  /** A tab context of this desk, seeded with one tool's tabTaps. */
  tab(tabId: string, taps: Tap[]): MountedContext;
}

let desks = 0;

function wrap(ctx: MatchingContext): MountedContext {
  return {
    ctx,
    read<T>(grip: Grip<T>): Drip<T> {
      const drip = ctx.getGripConsumerContext().getOrCreateConsumer(grip);
      drip.subscribe(() => {});
      return drip;
    },
    render(node: ReactElement): string {
      return renderToStaticMarkup(
        <GripProvider grok={grok} context={ctx}>{node}</GripProvider>,
      );
    },
  };
}

export function mountDesk(
  roots: GyldSet = STATIC_SET,
  bundle: FakeBundle = new FakeBundle(),
): MountedDesk {
  const ctx = grok.mainPresentationContext.getOrCreateMatchingContext(`gyld-desk-${desks++}`);
  const home = ctx.getGripHomeContext();
  home.registerTap(createAtomValueTap(GYLD_SET, { initial: roots, handleGrip: GYLD_SET_TAP }));
  home.registerTap(createAtomValueTap(GYLD_FOCUS, { initial: NO_FOCUS, handleGrip: GYLD_FOCUS_TAP }));
  const store = new GyldStoreTap({ watch: false, fetch: fakeFetch(bundle) });
  home.registerTap(store);
  home.registerTap(new GyldIndexTap());
  home.registerTap(new GyldRecordTap());
  return {
    ...wrap(ctx),
    bundle,
    store,
    tab(tabId: string, taps: Tap[]): MountedContext {
      const tab = ctx.getGripConsumerContext().getOrCreateMatchingContext(`tab:${tabId}`);
      const tabHome = tab.getGripHomeContext();
      for (const tap of taps) {
        tabHome.registerTap(tap);
      }
      return wrap(tab);
    },
  };
}

/**
 * A SINK wired to a source tab, as `wireTabSource` makes one: the sink's
 * context resolves whatever the source publishes, through the graph, with no
 * param copied. A sink seeds only the taps its own opening link asked for,
 * which for a wired one is none, so the source's seeds are what it reads.
 */
export function wireSink(source: MountedContext, name: string, taps: Tap[] = []): MountedContext {
  const sink = source.ctx.getGripConsumerContext().getOrCreateMatchingContext(name);
  const home = sink.getGripHomeContext();
  for (const tap of taps) {
    home.registerTap(tap);
  }
  return wrap(sink);
}

/** Every `value="..."` of one `<select class="...">` in rendered markup, with
 *  the disabled ones marked, so a test can compare a picker to a manifest. */
export function optionsOf(markup: string, className: string): string[] {
  const select = new RegExp(`<select[^>]*class="${className}"[\\s\\S]*?</select>`).exec(markup);
  if (select === null) {
    return [];
  }
  const options: string[] = [];
  const option = /<option([^>]*)>/g;
  for (let m = option.exec(select[0]); m !== null; m = option.exec(select[0])) {
    const value = /value="([^"]*)"/.exec(m[1])?.[1] ?? '';
    options.push(m[1].includes('disabled') ? `${value} (disabled)` : value);
  }
  return options;
}
