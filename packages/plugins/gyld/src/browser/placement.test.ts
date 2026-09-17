import { describe, it, expect } from 'vitest';
import type { Box } from '../lens/geometry';
import {
  CardEdge, CardPanel, NOT_MEASURED, PANEL_UNMEASURED, panelSize, placeCard, stageBox,
  type CardPlacement, type PanelSize,
} from './placement';

// WHERE the hover card and the node menu go (owner report of 2026-09-17).
//
// The card was drawn at one place — under the box, always — so a box near the
// bottom of the stage put its card half outside it, the stage clips, and the
// buttons on the card could be seen and not pressed. The rule is the owner's:
// bottom first, then top, then left, then right, whichever leaves the least of
// the panel outside the stage, and then a slide back inside so a panel that
// fits in the stage is wholly in it.
//
// Every case here is the pure rule over boxes. No desk, no DOM, no camera: the
// view measures and this decides.

const STAGE: Box = { x: 0, y: 0, width: 800, height: 600 };
const CARD: PanelSize = { width: 300, height: 200 };

/** The four corners of a placement, for the one question that matters: can the
 *  reader reach all of it? */
const inside = (place: CardPlacement, card: PanelSize, viewport: Box): boolean =>
  place.left >= viewport.x
  && place.top >= viewport.y
  && place.left + card.width <= viewport.x + viewport.width
  && place.top + card.height <= viewport.y + viewport.height;

describe('the panel goes where the least of it is clipped', () => {
  it('prefers BOTTOM, the owner\'s first edge, when the card fits below', () => {
    const place = placeCard({ x: 100, y: 40, width: 120, height: 40 }, CARD, STAGE, 0);
    expect(place.edge).toBe(CardEdge.BOTTOM);
    expect(place).toMatchObject({ left: 100, top: 80, clipped: 0 });
  });

  it('FLIPS TO TOP for a box near the bottom, where bottom would be clipped', () => {
    const place = placeCard({ x: 100, y: 500, width: 120, height: 60 }, CARD, STAGE, 0);
    expect(place.edge).toBe(CardEdge.TOP);
    expect(place).toMatchObject({ left: 100, top: 300, clipped: 0 });
    expect(inside(place, CARD, STAGE)).toBe(true);
  });

  it('takes the SIDE with the least clipping at the bottom-right corner', () => {
    // Below is 10px of stage and to the right is 20px: both clip most of the
    // card. Left clips least, and the slide then lifts it wholly into view.
    const place = placeCard({ x: 700, y: 500, width: 80, height: 90 }, CARD, STAGE, 0);
    expect(place.edge).toBe(CardEdge.LEFT);
    expect(place).toMatchObject({ left: 400, top: 400, clipped: 0 });
    expect(inside(place, CARD, STAGE)).toBe(true);
  });

  it('CLAMPS a card taller than the stage to the top and says what is clipped', () => {
    const tall: PanelSize = { width: 300, height: 700 };
    const place = placeCard({ x: 250, y: 200, width: 120, height: 40 }, tall, STAGE, 0);
    // No edge can fit it, so the slide pins it to the stage's top and the
    // placement REPORTS the 100px of card still below the stage rather than
    // pretending it fits.
    expect(place.top).toBe(0);
    expect(place.left).toBe(370);
    expect(place.clipped).toBe(300 * 100);
  });

  it('honours the GAP on the preferred edge and on the flipped one', () => {
    const near = placeCard({ x: 100, y: 40, width: 120, height: 40 }, CARD, STAGE, 12);
    expect(near.edge).toBe(CardEdge.BOTTOM);
    expect(near.top).toBe(40 + 40 + 12);
    const far = placeCard({ x: 100, y: 500, width: 120, height: 60 }, CARD, STAGE, 12);
    expect(far.edge).toBe(CardEdge.TOP);
    expect(far.top).toBe(500 - 12 - 200);
  });

  it('places a box that is itself partly off the stage', () => {
    const place = placeCard({ x: -60, y: -30, width: 120, height: 40 }, CARD, STAGE, 0);
    expect(place.clipped).toBe(0);
    expect(inside(place, CARD, STAGE)).toBe(true);
  });

  it('draws an UNMEASURED panel where it was always drawn: under the box', () => {
    const anchor: Box = { x: 100, y: 500, width: 120, height: 60 };
    // Before the ref callback lands there is nothing to place: no size of its
    // own, or no stage to place it in. Both are the rendered state the card
    // had before this rule existed — under the box, unflipped and unslid —
    // and the measurement a moment later places it for real.
    expect(placeCard(anchor, NOT_MEASURED, STAGE, 0))
      .toMatchObject({ edge: CardEdge.BOTTOM, left: 100, top: 560, clipped: 0 });
    expect(placeCard(anchor, CARD, { x: 0, y: 0, width: 0, height: 0 }, 0))
      .toMatchObject({ edge: CardEdge.BOTTOM, left: 100, top: 560, clipped: 0 });
  });
});

describe('one measurement atom, read by the panel that wrote it', () => {
  const measured = {
    of: CardPanel.CARD.name, width: 300, height: 200, viewWidth: 800, viewHeight: 600,
  };

  it('gives a panel its own measurement and never another panel\'s', () => {
    expect(panelSize(measured, CardPanel.CARD)).toEqual({ width: 300, height: 200 });
    expect(panelSize(measured, CardPanel.MENU)).toBe(NOT_MEASURED);
    expect(panelSize(PANEL_UNMEASURED, CardPanel.CARD)).toBe(NOT_MEASURED);
  });

  it('reads the stage as the box the panels are positioned against', () => {
    expect(stageBox(measured)).toEqual(STAGE);
    expect(stageBox(PANEL_UNMEASURED)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('keeps the card tight to the box, because a gap there closes the hover', () => {
    expect(CardPanel.CARD.gap).toBe(0);
    expect(CardPanel.MENU.gap).toBeGreaterThan(0);
  });
});
