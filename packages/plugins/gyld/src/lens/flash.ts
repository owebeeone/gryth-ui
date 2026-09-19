import type { AtomTapHandle } from '@owebeeone/grip-react';

// The FLASH: "show me which ones these are".
//
// A click on a legend row lights every box or arrow of that class for about a
// second and a half and then lets go of them again. Nothing moves: the mark is
// a class on the drawn shapes and the geometry is the emitted geometry either
// way (MDV-4).
//
// It is a STAMP plus a CLOCK, the desktop's attention pattern
// (packages/desktop/src/attention.ts): the stamp is a per-window atom that a
// press writes, and a sweep with an INJECTABLE clock clears it again, so a
// suite asserts the interval instead of waiting for it. A React effect is
// banned here (dev-docs/CodingRules.md) and would be the wrong owner anyway —
// the mark is window state like every other, so it is written and cleared
// through the same handle every other view transform is.
//
// One difference from the desk's sweep, and it is the reason this is not that
// class: the desk has ONE attention mark, and this has one per window. A
// single pending timer would be cancelled by whichever window flashed last and
// the other window's mark would never be swept, so the pending cancel is held
// per HANDLE — weakly, so a closed tab's atom is not kept alive by it.

/**
 * Which legend entry this window is flashing, and which flash it is.
 *
 * `seq` is why this is not just the key. A second click on a row that is still
 * lit must flash AGAIN, and a class that is already on an element starts no
 * new animation; bumping the count gives the view a new identity to draw the
 * marked shapes under, so the animation restarts. It counts flashes for the
 * life of the window and is never reset — the clear keeps it.
 */
export interface GyldFlash {
  /** The legend entry's key, or '' while nothing is flashing. */
  entry: string;
  seq: number;
}

/** Nothing lit. Every window starts here and returns here a moment after each
 *  flash; the count carries on rising. */
export const NOT_FLASHING: GyldFlash = Object.freeze({ entry: '', seq: 0 });

/** Light this entry. A second call for the same entry is a DIFFERENT stamp. */
export function flashOn(held: GyldFlash, entry: string): GyldFlash {
  if (entry === '') {
    return cleared(held);
  }
  return { entry, seq: held.seq + 1 };
}

/** Let go of whatever is lit, keeping the count so the next flash is new. */
export function cleared(held: GyldFlash): GyldFlash {
  return held.entry === '' ? held : { entry: '', seq: held.seq };
}

export function isFlashing(flash: GyldFlash | undefined, entry: string): boolean {
  return flash !== undefined && flash.entry !== '' && flash.entry === entry;
}

/** How long a flash lasts. `gyld.css`'s `gyld-flash` animation runs for the
 *  same time — keep the two in sync. A reader who asked for reduced motion
 *  gets a STATIC highlight for exactly this long instead, which is the same
 *  stamp and the same sweep with a different rule in the sheet. */
export const FLASH_MS = 1500;

/** Run `fn` after `ms`, and return the cancel. The one injectable clock:
 *  tests hand in their own and fire it by hand. */
export type Schedule = (fn: () => void, ms: number) => () => void;

/** The real clock. */
export function timeoutSchedule(fn: () => void, ms: number): () => void {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}

/** The slice of the window's flash atom the sweep writes back through. */
export type FlashHandle = Pick<AtomTapHandle<GyldFlash>, 'get' | 'set'>;

export class FlashSweep {
  /** The pending clear per window, held WEAKLY: a tab that closes takes its
   *  atom with it, and a stale entry here would hold it alive. */
  private readonly pending = new WeakMap<FlashHandle, () => void>();

  constructor(
    private readonly schedule: Schedule = timeoutSchedule,
    private readonly ms: number = FLASH_MS,
  ) {}

  /**
   * A row was just pressed in this window: clear its mark again in `ms`.
   *
   * A second press RESTARTS that window's interval rather than queueing a
   * second one, so the flash the reader is actually looking at — the last one
   * — always gets its full run, and a burst of presses leaves exactly one
   * pending sweep per window.
   */
  arm(handle: FlashHandle | undefined): void {
    if (handle === undefined) {
      return;
    }
    this.pending.get(handle)?.();
    const cancel = this.schedule(() => {
      this.pending.delete(handle);
      handle.set(cleared(handle.get() ?? NOT_FLASHING));
    }, this.ms);
    this.pending.set(handle, cancel);
  }
}

/** The one sweep every lens view arms. It holds no window state of its own:
 *  the mark lives in each window's atom and this only owns the timers. */
export const flashSweep = new FlashSweep();
