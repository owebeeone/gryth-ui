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

/** A camera is dragging while this is set; the view then renders the
 *  full-window overlay that captures the movement as React events. */
export interface GyldCameraDrag {
  /** Viewport coordinates of the last point seen. */
  x: number;
  y: number;
}

export function clampScale(k: number): number {
  if (!Number.isFinite(k)) {
    return 1;
  }
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));
}

/** The camera that puts the whole lens inside a viewport, with a margin. */
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
 * Which relations are turned off in this window, and whether they are dimmed
 * or hidden. Toggling one never re-lays out the picture (MDV-4): the geometry
 * is the emitted geometry either way, and the omission strip grows to say what
 * the reader is no longer seeing.
 */
export interface GyldDimmed {
  relations: string[];
  hide: boolean;
}

export const NOTHING_DIMMED: GyldDimmed = Object.freeze({ relations: [], hide: false });

export function toggleRelation(dimmed: GyldDimmed, relation: string): GyldDimmed {
  const held = dimmed.relations.includes(relation);
  return {
    relations: held
      ? dimmed.relations.filter((name) => name !== relation)
      : [...dimmed.relations, relation],
    hide: dimmed.hide,
  };
}

export function toggleSelected(selection: GyldSelection, id: string, additive: boolean): GyldSelection {
  if (!additive) {
    return selection.ids.length === 1 && selection.ids[0] === id ? NO_SELECTION : { ids: [id] };
  }
  return selection.ids.includes(id)
    ? { ids: selection.ids.filter((held) => held !== id) }
    : { ids: [...selection.ids, id] };
}
