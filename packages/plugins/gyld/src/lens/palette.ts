import { THEMES, type ThemeId } from '@grythjs/desktop';
import {
  MIN_GRAPHIC_RATIO, MIN_TEXT_RATIO, adaptToCanvas, textOn,
} from './contrast';

// The colours the picture is DRAWN with, as a function of the desk's theme.
//
// A lens file carries the colours Gyld emitted: pastel fills that stand for a
// status, and a colour per relation. Those are legend data and the view does
// not get to replace them. What the view does get to decide is the ink it
// writes a node's text in and how visible a line has to be on the surface it
// is drawn on, and neither can be decided without knowing the theme — which
// is why this is a palette per theme rather than a constant.
//
// The canvas is `--win`: the lens stage sits directly on the window surface.

export interface GyldLensPalette {
  /** The surface the picture is drawn on — the window's own `--win`. */
  canvas: string;
  /**
   * The two inks a node's text may be written in: the desk's text colour and
   * the desk's surface colour. A readable theme puts those two at opposite
   * ends of the scale, so whatever an emitted fill turns out to be, one of
   * them reads on it.
   */
  ink: readonly [string, string];
  /** What a line with no emitted colour of its own is drawn in, already
   *  adapted to the canvas. */
  stroke: string;
  /** The minima this palette holds lines and text to. */
  minGraphic: number;
  minText: number;
}

const PALETTES = new Map<ThemeId, GyldLensPalette>();

/** The palette for one theme. Memoized by theme, so a consumer that re-reads
 *  an unchanged theme is handed the same object and does not re-render. */
export function paletteOf(theme: ThemeId): GyldLensPalette {
  const held = PALETTES.get(theme);
  if (held !== undefined) {
    return held;
  }
  const vars = (THEMES[theme] ?? THEMES.light).vars;
  const canvas = vars['--win'];
  const palette: GyldLensPalette = {
    canvas,
    ink: [vars['--text'], canvas],
    stroke: adaptToCanvas(vars['--text'], canvas, MIN_GRAPHIC_RATIO),
    minGraphic: MIN_GRAPHIC_RATIO,
    minText: MIN_TEXT_RATIO,
  };
  PALETTES.set(theme, palette);
  return palette;
}

/** The grip's default and the pure components' fallback: the light desk the
 *  lens files were emitted for, so a render with no theme in reach draws
 *  exactly the emitted colours. */
export const LENS_PALETTE_LIGHT = paletteOf('light');

/**
 * The ink a node's text is written in: whichever of the desk's two inks reads
 * better on the fill that node was emitted with, moved onto that fill if even
 * the better one falls short. A node with no emitted fill is drawn on the
 * canvas itself, and there the desk's own text colour always wins.
 *
 * The second step is not belt and braces. `Solarized Light` writes in
 * `#586e75`, which manages only 4.37:1 on the pale blue a Directed question
 * is filled with — neither of that desk's inks clears 4.5:1 there, so picking
 * the better of the two is not on its own an answer. Darkening the winner by
 * a few percent is, and it keeps the desk's hue.
 */
export function inkOn(palette: GyldLensPalette, fill?: string): string {
  const ground = fill ?? palette.canvas;
  return adaptToCanvas(textOn(ground, palette.ink), ground, palette.minText);
}

/** An emitted line colour, moved onto the canvas at the graphical minimum.
 *  Edges, arrow markers, node strokes and the legend's own line samples all
 *  go through here, which is what keeps the legend matching the picture. */
export function lineOn(palette: GyldLensPalette, color?: string): string {
  if (color === undefined) {
    return palette.stroke;
  }
  return adaptToCanvas(color, palette.canvas, palette.minGraphic);
}

/** The same, at the text minimum: an edge label is read, not just seen. */
export function labelOn(palette: GyldLensPalette, color?: string): string {
  return adaptToCanvas(color ?? palette.stroke, palette.canvas, palette.minText);
}
