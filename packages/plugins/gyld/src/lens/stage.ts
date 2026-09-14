// Where the picture is, measured. Two one-line reaches into the DOM, kept out
// of the view so the view stays a render and so both can be tested.

/** What a `getBoundingClientRect` says, in the shape the camera wants. */
export interface StageViewport {
  width: number;
  height: number;
  left: number;
  top: number;
}

/** The measured box of an element. */
export function viewportOf(element: Element): StageViewport {
  const rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
}

/** The class of the one element that shows the picture: it clips the figure,
 *  the SVG is sized to 100% of it, and it is therefore the box every fit and
 *  every wheel zoom measures. */
export const STAGE_CLASS = 'gyld-lens-stage';

/**
 * The stage of the lens some element inside it belongs to — the box that shows
 * the picture, which is the only box worth fitting to.
 *
 * It asks for the stage BY NAME. The obvious `querySelector('svg')` from the
 * lens root is wrong and was the Fit button's bug: the LEGEND draws every
 * relation as a 26x10 `<svg>` line sample and those come first in document
 * order, so Fit measured a 26x10 box, and a whole lens fitted into 26x10 is
 * MIN_SCALE in the top-left corner — every press, at every window size.
 */
export function stageOf(from: Element | null | undefined): Element | null {
  return from?.closest('.gyld-lens')?.querySelector(`.${STAGE_CLASS}`) ?? null;
}
