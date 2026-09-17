import { isMeasurableViewport } from '../lens/camera';
import type { Box, Point } from '../lens/geometry';

// WHERE the hover card and the node menu go.
//
// Both were drawn at one place: under the box, always. A box near the bottom
// of the stage therefore put its card half outside the stage — which clips,
// `.gyld-lens-stage` being `overflow: hidden` — so the reader could read the
// question and not press Answer, because the button was not on the picture
// any more (owner report of 2026-09-17).
//
// The rule is the owner's, in the owner's order: try BOTTOM, then TOP, then
// LEFT, then RIGHT, and take the edge that leaves the least of the panel
// outside the stage, the earlier edge winning a tie. Then slide the chosen
// placement back inside, so a panel that fits in the stage at all is wholly
// in it and every button on it can be reached.
//
// Everything here is PURE — boxes in, a placement out. The measuring is the
// view's (one ref callback per panel, the sanctioned reach into the DOM) and
// the drawing is CSS; this file only decides where.

/** What a panel measured of itself. */
export interface PanelSize {
  width: number;
  height: number;
}

/** A panel that has not measured itself yet, which is a RENDERED STATE and not
 *  a default: it is what every panel reads for the one frame between its mount
 *  and its own ref callback, and `placeCard` draws it where the panel was
 *  always drawn rather than guessing a size for it. */
export const NOT_MEASURED: PanelSize = Object.freeze({ width: 0, height: 0 });

/**
 * One edge of the anchor box a panel can sit on.
 *
 * An edge is an OBJECT, not a label branched on at the placement site
 * (AGENTS.md, "no magic strings when the concept has semantics"): each one
 * owns where the panel's corner lands when it sits there. Adding a fifth is
 * one more instance here and no change anywhere else.
 */
export class CardEdge {
  private constructor(
    /** The stable name, used as the `data-edge` attribute the view draws. */
    readonly name: string,
    private readonly originAt: (anchor: Box, card: PanelSize, gap: number) => Point,
  ) {}

  /** Where the panel's top-left corner goes on this edge of the anchor, before
   *  anything is clipped or slid. */
  origin(anchor: Box, card: PanelSize, gap: number): Point {
    return this.originAt(anchor, card, gap);
  }

  /** Under the box, its left edges aligned. The preferred one. */
  static readonly BOTTOM = new CardEdge('bottom', (anchor, _card, gap) => ({
    x: anchor.x,
    y: anchor.y + anchor.height + gap,
  }));

  /** Over the box: the flip a box near the bottom of the stage takes. */
  static readonly TOP = new CardEdge('top', (anchor, card, gap) => ({
    x: anchor.x,
    y: anchor.y - gap - card.height,
  }));

  static readonly LEFT = new CardEdge('left', (anchor, card, gap) => ({
    x: anchor.x - gap - card.width,
    y: anchor.y,
  }));

  static readonly RIGHT = new CardEdge('right', (anchor, _card, gap) => ({
    x: anchor.x + anchor.width + gap,
    y: anchor.y,
  }));

  /** The four, in the order the owner named them, which is also the order a
   *  tie is broken in. */
  static readonly TRIED: readonly CardEdge[] = Object.freeze([
    CardEdge.BOTTOM, CardEdge.TOP, CardEdge.LEFT, CardEdge.RIGHT,
  ]);
}

/**
 * A panel that anchors on a box: the hover card and the node menu.
 *
 * They differ in exactly one thing — the inset between the box and the panel —
 * and that difference is a rule rather than a taste, so it is stated here,
 * once, with its reason, rather than being passed in at two call sites.
 */
export class CardPanel {
  private constructor(
    /** The stable name, and the panel that wrote the measurement atom. */
    readonly name: string,
    readonly gap: number,
  ) {}

  /** The hover card. Its gap is ZERO: the card stays open while the pointer is
   *  on the box or on the card, and the figure's own mousemove over bare
   *  canvas between them clears the hover (LensView). An inset here would be
   *  bare canvas, so the card would close exactly when the reader set off to
   *  press one of its buttons — which is the whole point of placing it. */
  static readonly CARD = new CardPanel('card', 0);

  /** The node menu. It is opened by a right-click or a shift-click and closed
   *  by a click, an `Escape` or a pan — never by the pointer leaving the box —
   *  so it can stand off the box and leave the question it is over readable. */
  static readonly MENU = new CardPanel('menu', 4);
}

/**
 * One panel's own size and the stage it was measured in, as the view's ref
 * callback wrote them (`Gyld.Tab.Card.Size`, instance scope, one per window).
 *
 * `of` names the panel that wrote it. The card and the menu are never up at
 * once — the window suppresses the card while the menu is open — so one atom
 * holds whichever is up and the other reads NOT_MEASURED for the one frame
 * before its own callback runs.
 */
export interface GyldPanelFit {
  of: string;
  width: number;
  height: number;
  /** The stage the panel is inside and is clipped by, measured at the same
   *  moment: a card placed against another window's stage would be placed
   *  against nothing this reader can see. */
  viewWidth: number;
  viewHeight: number;
}

/** Nothing measured yet. Every window starts here and returns here at no
 *  point: the last panel's measurement stays, and is the estimate the next
 *  card of the same kind is first drawn with. */
export const PANEL_UNMEASURED: GyldPanelFit = Object.freeze({
  of: '', width: 0, height: 0, viewWidth: 0, viewHeight: 0,
});

/** Whether a fresh measurement says anything new. The view asks before it
 *  writes, so a panel that mounts at the size the last one had writes nothing
 *  and the atom does not notify. */
export function sameFit(held: GyldPanelFit, taken: GyldPanelFit): boolean {
  return held.of === taken.of
    && held.width === taken.width && held.height === taken.height
    && held.viewWidth === taken.viewWidth && held.viewHeight === taken.viewHeight;
}

/** What this panel measured of itself, and never what the other one measured:
 *  a menu placed with the card's height would be placed wrong. */
export function panelSize(fit: GyldPanelFit, panel: CardPanel): PanelSize {
  return fit.of === panel.name ? { width: fit.width, height: fit.height } : NOT_MEASURED;
}

/** The stage as the box a placement is clipped against. Its origin is 0,0
 *  because the panels are absolutely positioned against the stage itself. */
export function stageBox(fit: GyldPanelFit): Box {
  return { x: 0, y: 0, width: fit.viewWidth, height: fit.viewHeight };
}

/** Where one panel goes, and how much of it is still outside the stage. */
export interface CardPlacement {
  edge: CardEdge;
  /** Stage coordinates, ready for the anchor's `left` and `top`. */
  left: number;
  top: number;
  /** The area of the panel STILL outside the viewport after the slide, in
   *  square pixels. Zero is the normal case and the one the rule is for; a
   *  panel larger than the stage cannot be placed wholly inside it, and this
   *  says so rather than the placement pretending it fits. */
  clipped: number;
}

/** How much of a panel at this corner falls outside the viewport. */
function clippedArea(at: Point, card: PanelSize, viewport: Box): number {
  const wide = Math.max(0, Math.min(at.x + card.width, viewport.x + viewport.width)
    - Math.max(at.x, viewport.x));
  const tall = Math.max(0, Math.min(at.y + card.height, viewport.y + viewport.height)
    - Math.max(at.y, viewport.y));
  return card.width * card.height - wide * tall;
}

/** One axis of the final slide. A panel that fits lands wholly inside; one
 *  that does not fit on this axis lands against the near side, so its head and
 *  the first of its acts are on screen rather than its middle. */
function slidIn(at: number, size: number, min: number, extent: number): number {
  return Math.max(min, Math.min(at, min + extent - size));
}

/**
 * The owner's rule, whole: bottom, top, left, right, least clipped wins, ties
 * to the earlier edge, and then the slide back inside.
 *
 * The edge is chosen on the UNSLID placement, because the slide would make
 * every edge look equally good and the bottom would always win — including on
 * the box at the bottom of the stage this whole rule is for, where "bottom,
 * slid up" is the card sitting over the box rather than under it.
 */
export function placeCard(
  anchor: Box,
  card: PanelSize,
  viewport: Box,
  gap: number,
): CardPlacement {
  const preferred = CardEdge.BOTTOM.origin(anchor, card, gap);
  if (!isMeasurableViewport(viewport) || !isMeasurableViewport(card)) {
    // Nothing to place, or nowhere to place it in: the panel is drawn where it
    // was always drawn and the measurement that lands a moment later places it
    // for real. Writing a clamped placement from a stage of no size would put
    // every card in the top-left corner of a window that is not showing yet.
    return { edge: CardEdge.BOTTOM, left: preferred.x, top: preferred.y, clipped: 0 };
  }
  const tried = CardEdge.TRIED.map((edge) => {
    const at = edge.origin(anchor, card, gap);
    return { edge, at, clipped: clippedArea(at, card, viewport) };
  });
  const chosen = tried.reduce(
    (best, candidate) => (candidate.clipped < best.clipped ? candidate : best),
  );
  const left = slidIn(chosen.at.x, card.width, viewport.x, viewport.width);
  const top = slidIn(chosen.at.y, card.height, viewport.y, viewport.height);
  return {
    edge: chosen.edge,
    left,
    top,
    clipped: clippedArea({ x: left, y: top }, card, viewport),
  };
}
