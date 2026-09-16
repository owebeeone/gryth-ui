// The status glyph a question's box carries, inside the box the host emitted.
//
// The node FILL is the emitted status and stays exactly as emitted; the glyph
// pairs that hue with a SHAPE, which is the colour-blindness gap
// MultiDimensionalGraphViewing.md section 7 names against the decision lens.
// It is drawn from `node.box` and changes no position, so MDV-4 holds.
//
// A glyph is an OBJECT, not a status string branched on at the draw site
// (AGENTS.md, "no magic strings when the concept has semantics"): each one
// owns its own outline and its own one-line reading. Adding a third is one
// more instance here and no change at the call site.

export class StatusGlyph {
  private constructor(
    /** The emitted `effective_status` this glyph stands for. */
    readonly status: string,
    /** What the mark means, for the box's own title. */
    readonly says: string,
    /** The FILLED part, as a path about the origin at this radius. The ring
     *  around it is drawn by the view and is the same for every glyph. */
    private readonly filled: (radius: number) => string,
  ) {}

  path(radius: number): string {
    return this.filled(radius);
  }

  /** Open: a full dot. Nothing is recorded, so the mark is solid. */
  static readonly OPEN = new StatusGlyph(
    'Open',
    'open: no alternative is preferred yet',
    (r) => `M ${-r} 0 A ${r} ${r} 0 1 0 ${r} 0 A ${r} ${r} 0 1 0 ${-r} 0 Z`,
  );

  /** Lean: half a dot, the quieter mark of a recorded preference. */
  static readonly LEAN = new StatusGlyph(
    'Lean',
    'lean: an alternative is preferred but nothing is ruled',
    (r) => `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} Z`,
  );

  /**
   * The statuses that get a glyph: Open and Lean only, the two that ask
   * something of the reader (owner ruling U2, 2026-09-16). Decided and
   * Directed are answers, and the emitted fill already says so.
   */
  static readonly ALL: readonly StatusGlyph[] = Object.freeze([
    StatusGlyph.OPEN, StatusGlyph.LEAN,
  ]);

  /** The glyph for one emitted status, or none. A box whose row this stream
   *  never listed passes `undefined` and is marked with nothing. */
  static of(status: string | undefined): StatusGlyph | undefined {
    return StatusGlyph.ALL.find((glyph) => glyph.status === status);
  }
}

/** How far the glyph's centre sits inside the emitted box's top right corner,
 *  and how big it is. Both are view constants, in the lens's own user units:
 *  the smallest emitted box of the decision lenses is 89 by 36 points, so a
 *  4pt mark 8pt in clears the left justified label block. */
export const GLYPH_INSET = 8;
export const GLYPH_RADIUS = 4;
