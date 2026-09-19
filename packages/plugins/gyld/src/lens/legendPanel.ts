// The legend OVERLAY's own state: shrunk to a tab, expanded to the list of
// entries, or showing the help (owner's asks 3 and 2).
//
// Three states and two gestures, as an OBJECT with three named instances
// rather than a pair of booleans or a string branched on at the press site
// (AGENTS.md, "no magic strings when the concept has semantics"). Each
// instance owns what it looks like to the panel — open, showing help — and
// what a press turns it into, so the panel never reasons about the
// combinations and an impossible one (shrunk while showing help) cannot be
// constructed.
//
// It is per-WINDOW view state, like the camera and the dim set, and it is
// folded into the window's tab record the way the destination is
// (`browser/destination.ts`), so a reload reopens the legend the way the
// reader left it.

export class LegendPanel {
  private constructor(
    /** What the tab record carries, and what a reopened window is seeded
     *  from. A plain word, because params ride the desk document as JSON. */
    readonly param: string,
    /** Whether the panel is expanded at all. */
    readonly open: boolean,
    /** Whether the expanded panel is showing the help instead of the rows. */
    readonly help: boolean,
  ) {}

  /** The slim tab down the edge of the picture: the word "Legend" and the
   *  samples, and none of the vertical space the old strip took. */
  static readonly SHRUNK = new LegendPanel('shrunk', false, false);

  /** Expanded: every entry, with its count, its eye and its description. */
  static readonly OPEN = new LegendPanel('open', true, false);

  /** Expanded, showing "How to read this graph" instead of the rows. */
  static readonly HELP = new LegendPanel('help', true, true);

  static readonly ALL: readonly LegendPanel[] = Object.freeze([
    LegendPanel.SHRUNK, LegendPanel.OPEN, LegendPanel.HELP,
  ]);

  /**
   * The state a param names, or SHRUNK for anything else.
   *
   * A link that carries no legend param, and a desk written before the panel
   * existed, both open shrunk — which is the state that takes no room, and so
   * is the right thing to fall back to rather than covering a picture the
   * reader did not ask to have covered.
   */
  static of(value: unknown): LegendPanel {
    return LegendPanel.ALL.find((panel) => panel.param === value) ?? LegendPanel.SHRUNK;
  }

  /** The expand/shrink toggle. Shrinking from the help goes all the way to
   *  the tab: one button, one meaning, whatever is being shown. */
  toggled(): LegendPanel {
    return this.open ? LegendPanel.SHRUNK : LegendPanel.OPEN;
  }

  /** The help row: open the help, or go back to the rows from it. */
  withHelp(): LegendPanel {
    return this.help ? LegendPanel.OPEN : LegendPanel.HELP;
  }

  /** Whether the expanded panel is showing its rows (as against the help). */
  get showsRows(): boolean {
    return this.open && !this.help;
  }
}
