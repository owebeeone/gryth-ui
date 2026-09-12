import type { GyldDirectoryHandle } from '../store/stores';

// File System Access detection for the set picker's directory mode, in the
// shape wyred's `views/fsAccess.ts` uses. Structural types, not lib.dom's, so
// the picked handle is typed as exactly what the store tap consumes: a real
// FileSystemDirectoryHandle satisfies GyldDirectoryHandle as it is.

export type PickedDirectoryHandle = GyldDirectoryHandle;

interface DirectoryPickerHost {
  showDirectoryPicker?: (opts?: { mode?: 'read' }) => Promise<PickedDirectoryHandle>;
}

/**
 * The directory picker, or null when this browser has no such API (it is
 * Chromium only). Feature detection ONLY: the returned function must be called
 * inside the click handler itself, because the API requires a live user
 * activation and an await before the call loses it.
 */
export function directoryPicker(): (() => Promise<PickedDirectoryHandle>) | null {
  const host = globalThis as unknown as DirectoryPickerHost;
  const picker = host.showDirectoryPicker;
  if (typeof picker !== 'function') {
    return null;
  }
  return () => picker.call(globalThis, { mode: 'read' });
}

/** True when the user closed the picker. Not an error state, so not reported
 *  as one. */
export function isPickerCancel(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}
