// @grythjs/glade — the glade seam for gryth-ui (GLP-0006 P1.S4).
//
// This is the demo's glial.ts + glade.ts ported into gryth-ui's plugin runtime:
// ONE session + ONE WS client for the whole app, glial's instance registry, the
// participant identity, and the connect/subscribe bootstrap driven by grazel's
// `/bootstrap.json` session-placement seam (GDL-032). Plugins (@grythjs/plugin-
// chat, @grythjs/plugin-gwz) mount their surfaces as glial taps against `glial`
// and register their boot subscriptions here; the app calls startGlade() once.
//
// INTERIM CROSS-WORKSPACE LINKS: @owebeeone/glial-runtime, @owebeeone/glade-chat
// and @glade/client-ts are file: deps into the sibling glade-wz workspace (see
// package.json). Whether these become published packages or gwz members is a
// later call; this is the wire-attached client contract, no node internals.

import { createAtomValueTap, type AtomTapHandle, type Grip } from '@owebeeone/grip-react';
import { defineGrip, grok } from '@grythjs/plugin-api';
import {
  GlialBinder,
  MemoryStoreEngine,
  SessionDestination,
  feedSession,
  type OpBus,
  type Route,
  type SessionLike,
  type WireOp,
} from '@owebeeone/glial-runtime';
import { Session, type Op } from '@glade/client-ts/src/session.ts';
import { GladeClient } from '@glade/client-ts/src/client.ts';
import { loadSchema } from '@glade/client-ts/src/taut/schema.ts';
import { pickNodeWs } from './bootstrap-util';
import { deskBootstrap, deskIdentity, type DeskIdentity } from './identity';
// VENDORED copy of glade-wz/taut/corpus/glade.ir.json (the frozen wire schema).
// INTERIM: refresh if the glade wire protocol ever changes (it is frozen today).
import gladeIr from './glade.ir.json';

const schema = loadSchema(gladeIr as never);

// --- the desk identity -------------------------------------------------------
// Resolved by the entry's loader before the page composed (`./identity`) and
// read as this module loads: every capture site takes the principal from here,
// so this module will not load without it. On a gyld-ui desk the principal is
// the one grazel serves, so all the desk's tabs are ONE participant (owner
// ruling 4 of 2026-09-25 supersedes the participant half of the 2026-07-11
// per-tab ruling there); `?principal=` (alias `?user=`) still names another.
// With no principal served, each tab is its own participant, as before. The
// origin stays per tab either way: two tabs sharing one origin would fork its
// chain, the half of 2026-07-11 that stands. This is the stage-1 stub the
// P0.S7 principal records replace with real identity later.
const identity = deskIdentity();

export const origin = identity.origin;
/** The acting principal — the attribution stamped on chat lines / gwz runs. */
export const principal = identity.principal;

/** Who this page is — its principal, its tab's origin and whether the
 *  principal roams — as a grip. Fixed for the page's life, so its default IS
 *  the value. */
export const GLADE_IDENTITY = defineGrip<DeskIdentity>('Glade.Identity', identity);

// --- the one session + WS carrier + glial binder -----------------------------

export const session = new Session(schema, origin);
export const client = new GladeClient(schema, origin, session);

/** The WS carrier as glial's OpBus: publish ships to the node; inbound node ops
 *  fan to every subscriber (each SessionDestination filters its own route). */
class ClientBus implements OpBus {
  private handlers = new Set<(ops: WireOp[]) => void>();
  /** Never throws. A socket still CONNECTING throws from `send` after the
   *  session has minted the op and before the instance could append it. Kept
   *  in the session, the op ships with the session's ops once `startGlade()`
   *  connects, so the write stands and the instance folds it now. */
  publish(ops: WireOp[]): void {
    try {
      client.sendOps(ops as unknown as Op[]);
    } catch (e) {
      console.warn('[glade] ops kept for the connect:', (e as Error).message);
    }
  }
  onOps(handler: (ops: WireOp[]) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  /** Inbound node ops (wired to client.onOps below). */
  deliver(ops: Op[]): void {
    for (const h of [...this.handlers]) h(ops as unknown as WireOp[]);
  }
}
export const bus = new ClientBus();

// glial absorbs every inbound op route-agnostically (truthful heads/resume) and
// each mounted instance filters its route off the same bus.
feedSession(session as unknown as SessionLike, bus);
client.onOps = (ops) => bus.deliver(ops);

/** glial's instance registry. MemoryStoreEngine (interim): convergence-first for
 *  the first live panels; IndexedDB persistence-across-reload is a later upgrade
 *  (the demo's GC-4 seam). */
export const glial = new GlialBinder(new MemoryStoreEngine(), origin);

/** A session-backed glade destination factory for a wire route — what a glial
 *  mount's `gladeFor` returns. */
export function gladeDest(route: Route): () => SessionDestination {
  return () => new SessionDestination(session as unknown as SessionLike, bus, route);
}

// --- connection status (a grip the panels can project) -----------------------

export type GladeStatus = 'connecting' | 'live' | 'offline';
export const GLADE_STATUS = defineGrip<GladeStatus>('Glade.Status', 'connecting');
export const GLADE_STATUS_TAP = defineGrip<AtomTapHandle<GladeStatus>>('Glade.Status.Tap');
const GladeStatusTap = createAtomValueTap(GLADE_STATUS, {
  initial: 'connecting' as GladeStatus,
  handleGrip: GLADE_STATUS_TAP,
});
grok.registerTap(GladeStatusTap);
function setStatus(s: GladeStatus): void {
  GladeStatusTap.set(s);
}

/** The node WS URL this page attaches to, published as soon as the bootstrap
 *  has resolved one and BEFORE the socket is tried — so a panel can name the
 *  node it is waiting for, and name the one that never answered. Empty until
 *  then. */
export const GLADE_NODE = defineGrip<string>('Glade.Node', '');
export const GLADE_NODE_TAP = defineGrip<AtomTapHandle<string>>('Glade.Node.Tap');
const GladeNodeTap = createAtomValueTap(GLADE_NODE, {
  initial: '',
  handleGrip: GLADE_NODE_TAP,
});
grok.registerTap(GladeNodeTap);

// --- boot subscriptions registry ---------------------------------------------
// Plugins contribute the surfaces they want the node to replay on connect (node
// interest + late-join history). startGlade replays them all — the app never
// needs to know any plugin's surfaces (the decoupled bootstrap seam).

export interface GladeSubscription {
  readonly share: string;
  readonly gladeId: string;
  readonly key?: Uint8Array;
}
const subscriptions: GladeSubscription[] = [];
export function addGladeSubscription(sub: GladeSubscription): void {
  subscriptions.push(sub);
}

// --- the bootstrap -----------------------------------------------------------

/** The node from grazel's `/bootstrap.json` session placement, as the loader
 *  fetched it (the page asks once); the dev node when nothing answered (e.g.
 *  `pnpm dev` with no grazel). */
async function resolveNodeWs(): Promise<string> {
  return pickNodeWs(await deskBootstrap());
}

let started = false;
/** Connect the WS carrier, bind the principal (P0.S7 Hello), subscribe every
 *  plugin-contributed surface, and re-ship any ops made before the socket
 *  opened. Idempotent. Best-effort: a failure leaves status 'offline' (glial
 *  keeps local writes; a reconnect would resync). */
export async function startGlade(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const url = await resolveNodeWs();
    GladeNodeTap.set(url);
    await client.connect(url);
    await client.hello?.(principal);
    for (const s of subscriptions) {
      await client.subscribe(s.share, s.gladeId, s.key);
    }
    const ops = session.dump();
    if (ops.length) client.sendOps(ops);
    setStatus('live');
  } catch (e) {
    setStatus('offline');
    console.error('[glade] sync failed:', (e as Error).message);
  }
}

/** Resolve a handle/controller grip once (the demo's postToGroup pattern): query
 *  the handle grip through the main context and flush. Used by plugins to drive
 *  their write path (log append / value set) imperatively from event handlers. */
export function resolveController<C>(tap: Grip<C>): C {
  const drip = grok.query(tap, grok.mainContext) as { get(): C | undefined };
  grok.flush();
  const ctl = drip.get();
  if (ctl == null) throw new Error(`glade: controller not ready (${tap.key} unresolved)`);
  return ctl;
}
