import { createAtomValueTap, type Grip } from '@owebeeone/grip-react';
import { GlialBinder, utf8 } from '@owebeeone/glial-runtime';
import { glialTap } from '@owebeeone/glial-runtime/grip';
import { defineManifest } from '@owebeeone/glial-runtime/manifest';
import { defineGrip, grok } from '@grythjs/plugin-api';
import { addGladeSubscription, gladeDest } from '@grythjs/glade';
import { deskIdentity } from '@grythjs/glade/identity';
import { startSessionLayout, type DesktopSetup, type LayoutStore, type SessionFields } from '@grythjs/desktop';
import type { Schedule } from './appearance';
import { appearanceStore } from './store';
import { resolveDeskSession } from './session';
import { DESK_SESSION } from './grips';

export interface SessionDeskSources {
  search: string;
  href: string;
  store: LayoutStore | null;
  schedule?: Schedule;
  fields?: SessionFields;
}

function pageSources(): SessionDeskSources {
  let store: LayoutStore | null = null;
  try {
    store = globalThis.localStorage ?? null;
  } catch {
    // Opaque origins still get an explicit session link.
  }
  return { search: location.search, href: location.href, store };
}

/** The composition selects its session before boot. Its persistence adapter
 *  mounts one desk value; the desktop imports neither Glial nor any plugin. */
export function sessionDesk(setup: DesktopSetup, sources: SessionDeskSources = pageSources(), fields: SessionFields | undefined = sources.fields): DesktopSetup {
  const identity = deskIdentity();
  const entry = setup.entry ?? 'desktop';
  const session = resolveDeskSession(identity, entry, sources.search, sources.store);
  if (!session.shared) {
    return setup;
  }
  grok.registerTap(createAtomValueTap(DESK_SESSION, {
    initial: { name: session.name, href: session.link(sources.href) },
  }));
  const value = defineGrip<unknown>(`Session.${entry}.Desk`);
  const surface = defineManifest({ desk: {
    id: `${entry}.desk`, shape: 'value', share: 'ws-razel',
    domain: 'document', zone: 'private', retention: { policy: 'latest', ttl_ms: null },
  } }).desk;
  const route = { share: 'ws-razel', gladeId: surface.glade_id.id, shape: 'value', key: utf8(session.key) };
  const zone = glialTap<unknown>({
    binder: new GlialBinder(appearanceStore(), identity.origin), decl: surface, grip: value,
    fill: { domain: entry, zone: 'private', key: session.key }, gladeFor: gladeDest(route),
  });
  grok.registerTap(zone);
  const replayed = addGladeSubscription({ share: route.share, gladeId: route.gladeId, key: route.key });
  return {
    ...setup, persistAppearance: false,
    persistence: (ports, resetDefaults) => {
      const drip = grok.mainPresentationContext.getOrCreateConsumer(value as Grip<unknown>);
      return startSessionLayout(ports, {
        entry, principal: identity.principal, session: session.name, store: sources.store,
        replayed, resetDefaults, fields, schedule: sources.schedule,
        zone: {
          get: () => zone.get(), write: (doc) => zone.set(doc),
          watch: (changed) => drip.subscribe(() => changed()),
        },
      });
    },
  };
}
