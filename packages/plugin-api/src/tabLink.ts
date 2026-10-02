import { createAtomValueTap, type AtomTapHandle, type Grip, type Tap } from '@owebeeone/grip-react';

/** A serializable tab destination. Implementations MUST decode absent/invalid
 *  params, encode a JSON-safe patch, and bind only an atom they own. Instance
 *  fields MUST NOT be listed. Inherited fields stay on a wired source. */
export interface TabLinkField {
  readonly grip: Grip<unknown>;
  readonly inherited: boolean;
  owns(params?: Record<string, unknown>): boolean;
  read(params?: Record<string, unknown>): unknown;
  write(value: unknown): Record<string, unknown>;
  create(value: unknown): Tap;
  get(tap: Tap): unknown;
  set(tap: Tap, value: unknown): void;
}

/** Typed atom/codec witness behind the erased heterogeneous field list. */
export function tabLinkField<T>(
  grip: Grip<T>,
  handle: Grip<AtomTapHandle<T>>,
  read: (params?: Record<string, unknown>) => T,
  write: (value: T) => Record<string, unknown>,
  options: { inherited?: boolean; owns?: (params?: Record<string, unknown>) => boolean } = {},
): TabLinkField {
  type Atom = Tap & { get(): T; set(value: T): void };
  return {
    grip: grip as Grip<unknown>, inherited: options.inherited ?? false,
    owns: options.owns ?? (() => true), read,
    write: (value) => write(value as T),
    create: (value) => createAtomValueTap(grip, { initial: value as T, handleGrip: handle }),
    get: (tap) => (tap as Atom).get(),
    set: (tap, value) => (tap as Atom).set(value as T),
  };
}
