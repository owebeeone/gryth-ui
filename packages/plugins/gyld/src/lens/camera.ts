import type { Box } from './geometry';

// The camera: scale and translation over a FIXED picture. Every operation
// below moves the eye, never a record (MDV-4), so the emitted geometry is
// identical before and after any pan, zoom or fit.
//
// The value lives in a class 1 atom (Gyld.Tab.Camera, instance scope, one per
// window). These are the pure operations a gesture applies to it; the gesture
// reads the current value through the atom's handle and writes the result
// back, so a move and a release inside one notification cycle cannot lose the
// gesture's final state (CodingRules.md, "Gesture handlers read via handles").

export interface GyldCamera {
  /** Scale. */
  k: number;
  /** Translation in viewport pixels, applied before the scale. */
  tx: number;
  ty: number;
  /** The lens this camera was fitted to, so a window that opens on a new
   *  perspective fits once and never again. Empty means "not fitted yet". */
  fittedTo: string;
}

export const CAMERA_UNFITTED: GyldCamera = Object.freeze({
  k: 1, tx: 0, ty: 0, fittedTo: '',
});

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;

/**
 * A press is held on the picture while this is set.
 *
 * It has two states, and the difference is the whole reason it is not just a
 * point. A press ARMS the gesture; only a press that has MOVED is a pan, and
 * only a pan mounts the full-window overlay that captures the movement as
 * React events.
 *
 * The overlay cannot be mounted by the press itself. It is a sibling of the
 * figure, so it would take the release, and a browser that saw the press on a
 * node and the release on the overlay dispatches no `click` at all: the pick
 * would never reach the figure, and the picture could not be selected with a
 * real mouse. That is what it did until this flag existed.
 */
export interface GyldCameraDrag {
  /** Viewport coordinates of the last point seen. */
  x: number;
  y: number;
  /** Whether the pointer has moved since the press, which is what makes this
   *  gesture a pan rather than a pick about to happen. */
  panning: boolean;
}

/** The armed press a mouse down leaves behind. Not a pan yet. */
export function pressAt(x: number, y: number): GyldCameraDrag {
  return { x, y, panning: false };
}

/** The press after the pointer reached this point. A moved press is a pan. */
export function panningAt(x: number, y: number): GyldCameraDrag {
  return { x, y, panning: true };
}

/** Whether the pan overlay is mounted, said in one place. */
export function isPanning(drag: GyldCameraDrag | undefined): boolean {
  return drag?.panning === true;
}

export function clampScale(k: number): number {
  if (!Number.isFinite(k)) {
    return 1;
  }
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));
}

/**
 * Whether a measured viewport is one a fit can be computed from at all.
 *
 * A window in a tab that is not on top, a panel whose docked geometry has not
 * been applied yet, and an element that is not in the document all measure
 * zero. Fitting to one is not a small error: `fitCamera` below divides by the
 * extent, the clamp floors the ratio at MIN_SCALE, and the whole picture lands
 * in the top-left corner at 5%. That is what the reader sees, so the callers
 * ask this first and do nothing at all rather than write such a camera.
 */
export function isMeasurableViewport(viewport: { width: number; height: number }): boolean {
  return Number.isFinite(viewport.width) && Number.isFinite(viewport.height)
    && viewport.width > 0 && viewport.height > 0;
}

/**
 * Whether this lens still wants the one automatic fit `fittedTo` records.
 *
 * A camera "fitted" while the viewport measured zero is NOT fitted, and the
 * record of that is that nothing was written: a caller that finds an
 * unmeasurable viewport never reaches `fitCamera`, so `fittedTo` still names
 * another lens (or nothing at all) and the next measurement that IS measurable
 * — a later mount's ref callback, or the Fit button — fits for real.
 */
export function needsFit(camera: GyldCamera, key: string): boolean {
  return camera.fittedTo !== key;
}

/** The camera that puts the whole lens inside a viewport, with a margin.
 *  Only ever called with a viewport `isMeasurableViewport` accepted. */
export function fitCamera(
  extent: Box,
  viewport: { width: number; height: number },
  fittedTo: string,
  margin = 16,
): GyldCamera {
  const width = Math.max(1, viewport.width - margin * 2);
  const height = Math.max(1, viewport.height - margin * 2);
  if (extent.width <= 0 || extent.height <= 0) {
    return { k: 1, tx: margin, ty: margin, fittedTo };
  }
  const k = clampScale(Math.min(width / extent.width, height / extent.height));
  return {
    k,
    tx: (viewport.width - extent.width * k) / 2,
    ty: (viewport.height - extent.height * k) / 2,
    fittedTo,
  };
}

/** Zoom about a point in viewport coordinates, so what is under the pointer
 *  stays under the pointer. */
export function zoomAt(camera: GyldCamera, at: { x: number; y: number }, factor: number): GyldCamera {
  const k = clampScale(camera.k * factor);
  if (k === camera.k) {
    return camera;
  }
  const ratio = k / camera.k;
  return {
    k,
    tx: at.x - (at.x - camera.tx) * ratio,
    ty: at.y - (at.y - camera.ty) * ratio,
    fittedTo: camera.fittedTo,
  };
}

export function panBy(camera: GyldCamera, dx: number, dy: number): GyldCamera {
  return { ...camera, tx: camera.tx + dx, ty: camera.ty + dy };
}

/** The wheel's zoom factor. A trackpad reports many small deltas and a mouse
 *  a few large ones, so the factor is exponential in the delta. */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-deltaY / 400);
}

export function cameraTransform(camera: GyldCamera): string {
  return `translate(${camera.tx} ${camera.ty}) scale(${camera.k})`;
}

// ---------------------------------------------------------------------------
// The other per-window view state, all of it instance scope.
// ---------------------------------------------------------------------------

export interface GyldSelection {
  /** Lens ids: `occ:` for a node, `asn:` for an edge. */
  ids: string[];
}

export const NO_SELECTION: GyldSelection = Object.freeze({ ids: [] });

/**
 * What is turned off in this window, and whether it is dimmed or hidden.
 * Toggling one never re-lays out the picture (MDV-4): the geometry is the
 * emitted geometry either way, and the omission strip grows to say what the
 * reader is no longer seeing.
 *
 * `relations` are the legend's edge entries; the other three lists are the
 * node dimensions of MDV-2, read and written through the NodeFacet objects in
 * `facets.ts` rather than by naming a field here.
 *
 * `nextUpOnly` is the odd one out and deliberately so. It is not a dimension
 * of the picture at all: it dims every box the stream's emitted decide-now
 * list does not call answerable now, and it DIMS — never hides, whatever
 * `hide` says (owner ruling U1, 2026-09-16). It lives here because it rides
 * the same dim path as the rest and is the same kind of per-window choice.
 */
export interface GyldDimmed {
  relations: string[];
  kinds: string[];
  statuses: string[];
  classifications: string[];
  hide: boolean;
  nextUpOnly: boolean;
}

export const NOTHING_DIMMED: GyldDimmed = Object.freeze({
  relations: [], kinds: [], statuses: [], classifications: [], hide: false, nextUpOnly: false,
});

export function toggleRelation(dimmed: GyldDimmed, relation: string): GyldDimmed {
  const held = dimmed.relations.includes(relation);
  return {
    ...dimmed,
    relations: held
      ? dimmed.relations.filter((name) => name !== relation)
      : [...dimmed.relations, relation],
  };
}

/** Turn the next-up filter on or off. A separate verb from `toggleRelation`
 *  because it turns nothing of the PICTURE off: it reads the emitted
 *  decide-now list and dims what that list does not call answerable now. */
export function toggleNextUpOnly(dimmed: GyldDimmed): GyldDimmed {
  return { ...dimmed, nextUpOnly: !dimmed.nextUpOnly };
}

export function toggleSelected(selection: GyldSelection, id: string, additive: boolean): GyldSelection {
  if (!additive) {
    return selection.ids.length === 1 && selection.ids[0] === id ? NO_SELECTION : { ids: [id] };
  }
  return selection.ids.includes(id)
    ? { ids: selection.ids.filter((held) => held !== id) }
    : { ids: [...selection.ids, id] };
}
