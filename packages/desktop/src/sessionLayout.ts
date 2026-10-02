import { foldDocument, seedFrom, type DeskDocument } from './layoutDocument';
import { layoutKey, readStoredLayout, writeStoredLayout, type DeskPorts, type LayoutPersistence, type LayoutStore } from './layoutStorageTap';
import { timeoutSchedule, type Schedule } from './attention';

/** A mounted value zone; reads are synchronous and watch returns its release. */
export interface DeskZone {
  get(): unknown;
  write(value: unknown): void;
  watch(changed: () => void): () => void;
}

/** Serializable plugin session state; runtime-only handles never enter this port. */
export interface SessionFields {
  read(): Record<string, unknown>;
  seed(value: Record<string, unknown>): void;
  watch(changed: () => void): void;
}

export interface SessionLayoutOptions {
  entry: string;
  principal: string;
  session: string;
  zone: DeskZone;
  replayed: Promise<boolean>;
  store: LayoutStore | null;
  resetDefaults(): void;
  fields?: SessionFields;
  schedule?: Schedule;
}

export function sessionLayoutKey(entry: string, principal: string, session: string): string {
  return `gryth.desk.session.v1.${JSON.stringify([entry, principal, session])}`;
}

export interface SessionLayout extends LayoutPersistence {
  initialize(): void;
  dispose(): void;
}

/** One whole-document LWW desk. Remote projection never becomes a local write.
 *  Migration waits for successful replay; explicit unsynced edits are cached
 *  separately and retried after the next successful replay. */
export function startSessionLayout(ports: DeskPorts, options: SessionLayoutOptions): SessionLayout {
  const { entry, zone, store, fields } = options;
  const key = sessionLayoutKey(entry, options.principal, options.session);
  let closed = false;
  let ready = false;
  let applying = false;
  let initialized = false;
  let cancel: (() => void) | undefined;
  const schedule = options.schedule ?? timeoutSchedule;
  let held: Record<string, unknown> = {};
  const cached = store === null ? null : readStoredLayout(store, key);
  const legacy = store === null ? null : readStoredLayout(store, layoutKey(entry));
  const initial = seedFrom(cached, entry) !== null ? cached : legacy;
  let baseline = '';
  let lastWritten: string | undefined;
  let pending: DeskDocument | undefined;

  function marked(suffix: string): boolean {
    try {
      return store?.getItem(key + suffix) === 'true';
    } catch {
      return false;
    }
  }
  function mark(suffix: string, value: boolean): void {
    try {
      store?.setItem(key + suffix, String(value));
    } catch {
      // Cache failure does not prevent a mounted zone write.
    }
  }
  function snapshot(): DeskDocument {
    const doc = { ...held, ...foldDocument(entry, ports.read()) };
    delete doc.appearance;
    if (fields !== undefined) {
      Object.assign(doc, { sessionState: fields.read() });
    }
    return doc;
  }
  function remember(doc: DeskDocument): void {
    if (store !== null) {
      writeStoredLayout(store, key, doc);
    }
  }
  function apply(raw: unknown): boolean {
    const state = seedFrom(raw, entry);
    if (state === null) {
      return false;
    }
    held = raw as Record<string, unknown>;
    const layout = { ...state };
    delete layout.theme; delete layout.wallpaper; delete layout.wallpaperThemed;
    delete layout.zoom; delete layout.fontScale;
    applying = true;
    try {
      ports.seed(layout);
      const extra = held.sessionState;
      if (typeof extra === 'object' && extra !== null && !Array.isArray(extra)) {
        fields?.seed(extra as Record<string, unknown>);
      }
      baseline = JSON.stringify(snapshot());
    } finally {
      applying = false;
    }
    return true;
  }
  const cachedEdit = marked('.pending') && seedFrom(cached, entry) !== null;
  const restored = cachedEdit ? apply(cached) : apply(zone.get()) || apply(initial);
  if (cachedEdit) {
    pending = snapshot();
  }

  function write(doc: DeskDocument): void {
    lastWritten = JSON.stringify(doc);
    zone.write(doc);
  }
  const release = zone.watch(() => {
    if (JSON.stringify(zone.get()) === lastWritten) { return; }
    // Replay may deliver an older document before its promise settles. An
    // explicit unsynced gesture is kept until replay succeeds and it can write.
    if (!ready && pending !== undefined) { return; }
    if (closed || !apply(zone.get())) {
      return;
    }
    cancel?.();
    cancel = undefined;
    pending = undefined;
    remember(snapshot());
    mark('.pending', false);
    mark('.seeded', true);
  });
  function changed(): void {
    if (closed || applying || !initialized) {
      return;
    }
    const doc = snapshot();
    const next = JSON.stringify(doc);
    if (next === baseline) {
      return;
    }
    baseline = next;
    pending = doc;
    remember(doc);
    mark('.pending', true);
    cancel?.();
    cancel = schedule(() => {
      cancel = undefined;
      if (ready && pending !== undefined && !closed) {
        const value = pending;
        pending = undefined;
        write(value);
        mark('.pending', false);
        mark('.seeded', true);
      }
    }, 300);
  }
  ports.watch(changed);
  fields?.watch(changed);
  void options.replayed.then((ok) => {
    if (closed || !ok) {
      return;
    }
    ready = true;
    const edit = pending;
    const remote = apply(zone.get());
    if (edit !== undefined) {
      apply(edit);
      write(edit);
      mark('.pending', false);
    } else if (!remote && !marked('.seeded')) {
      write(snapshot());
    }
    cancel?.();
    cancel = undefined;
    pending = undefined;
    mark('.seeded', true);
    remember(snapshot());
  });
  return {
    restored,
    initialize() {
      baseline = JSON.stringify(snapshot());
      initialized = true;
    },
    reset() {
      if (closed) {
        return;
      }
      options.resetDefaults();
      changed();
    },
    dispose() {
      closed = true;
      cancel?.();
      release();
    },
  };
}
