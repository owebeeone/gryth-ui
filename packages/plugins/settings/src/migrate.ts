import {
  layoutKey, readLegacyAppearance, readStoredLayout, type LayoutStore,
} from '@grythjs/desktop';
import { APPEARANCE_VERSION, AppearanceDocument, type Appearance } from './appearance';

// A browser's appearance, carried into the user's zone once (Glial appearance
// plan, Step 2.4). Pure: the browser's storage and the zone are handed in.
//
// Before Step 2.3 each browser kept the appearance in its stored desk. A desk
// whose appearance now lives in the user's zone no longer seeds it from there,
// and its stored desk is rewritten without it soon after boot. So, at
// registration, before that rewrite, the stored desk's appearance is copied to
// a record of this user's own in this browser, unless the user has one. The
// record then follows every value the zone takes, and it is what the desk
// shows until the zone holds one. Once the zone's replay is in, an empty zone
// gets the record's value, once: two browsers migrating at once both write,
// and the last write wins.

/** The part of the user's zone the seed needs, as the page holds it once the
 *  replay is in. */
export interface AppearanceZone {
  empty(): boolean;
  write(value: unknown): void;
}

/** Where this browser keeps its record of `principal`'s appearance on the
 *  `entry` desk. */
export function lastAppearanceKey(entry: string, principal: string): string {
  return `gryth.appearance.last.v1.${entry}.${principal}`;
}

/** What the record holds: the last value, and whether this browser has seeded
 *  the zone with it. */
interface AppearanceRecord {
  readonly value: unknown;
  readonly seeded: boolean;
}

/** This browser's record of one user's appearance on one desk. Every read and
 *  write is inside a try/catch: storage that is blocked or full costs the desk
 *  its first paint and its migration, never the desk. */
export class AppearanceMemory {
  private readonly key: string;

  constructor(
    private readonly store: LayoutStore,
    private readonly entry: string,
    principal: string,
  ) {
    this.key = lastAppearanceKey(entry, principal);
  }

  /** Copy the stored desk's appearance into the record, unless the user has
   *  one: at registration, before the desk rewrites its stored desk. */
  adoptLegacy(): void {
    if (this.read() !== undefined) {
      return;
    }
    const legacy = readLegacyAppearance(readStoredLayout(this.store, layoutKey(this.entry)), this.entry);
    if (legacy !== undefined) {
      this.save({ value: { v: APPEARANCE_VERSION, ...legacy }, seeded: false });
    }
  }

  /** What the desk shows until the zone holds a value: the last value this
   *  browser saw for the user, else the defaults. */
  placeholder(): Appearance {
    return AppearanceDocument.read(this.read()?.value).settings;
  }

  /** The zone took `value`: keep it for the next first paint. */
  remember(value: unknown): void {
    this.save({ value, seeded: this.read()?.seeded ?? false });
  }

  /** Once the zone's replay is in: give an empty zone the record's value, the
   *  first time only. Returns whether it wrote. */
  seedOnce(zone: AppearanceZone): boolean {
    const record = this.read();
    if (record === undefined || record.seeded || !zone.empty()) {
      return false;
    }
    zone.write(AppearanceDocument.read(record.value).write());
    this.save({ ...record, seeded: true });
    return true;
  }

  private read(): AppearanceRecord | undefined {
    try {
      const text = this.store.getItem(this.key);
      const record: unknown = text === null ? undefined : JSON.parse(text);
      if (typeof record === 'object' && record !== null && 'value' in record) {
        return { value: record.value, seeded: 'seeded' in record && record.seeded === true };
      }
    } catch {
      // unreadable or blocked: as good as no record
    }
    return undefined;
  }

  private save(record: AppearanceRecord): void {
    try {
      this.store.setItem(this.key, JSON.stringify(record));
    } catch {
      // full or blocked: the next first paint shows the defaults
    }
  }
}
