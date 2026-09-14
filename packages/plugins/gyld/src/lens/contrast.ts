// Contrast, as WCAG 2 defines it, over the colours a lens file carries.
//
// A lens is emitted for a LIGHT canvas: pastel node fills chosen to sit on
// white, and dark saturated edge colours. The desk is not always light, so
// before the view draws it has to answer two questions that are pure
// arithmetic on colours and nothing else:
//
//   - which of the desk's own inks reads on THIS node's emitted fill, and
//   - how far a line colour has to move before it is visible on THIS canvas.
//
// Both live here so the view stays a redraw of the emitted geometry.
// `adaptToCanvas` keeps the hue and the saturation it was handed and moves
// only the lightness, so an adapted `Implies` is still the same amber the
// legend names it by — the emitted colour is respected, not replaced.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Luminance at which white and black tie: sqrt(1.05 * 0.05) - 0.05. */
export const CROSSOVER_LUMINANCE = Math.sqrt(1.05 * 0.05) - 0.05;

/** WCAG 2 AA: 4.5:1 for body text, 3:1 for a graphical object. */
export const MIN_TEXT_RATIO = 4.5;
export const MIN_GRAPHIC_RATIO = 3;

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/**
 * The bytes of a `#rgb` or `#rrggbb` colour, or null for anything else. A
 * keyword, a `var(...)` and `currentColor` all read as null on purpose: this
 * module answers about colours it can MEASURE, and a caller that gets null
 * leaves the colour exactly as it was given rather than guessing at it.
 */
export function parseHex(color: string): Rgb | null {
  const text = color.trim();
  const short = HEX3.exec(text);
  if (short !== null) {
    return {
      r: Number.parseInt(`${short[1]}${short[1]}`, 16),
      g: Number.parseInt(`${short[2]}${short[2]}`, 16),
      b: Number.parseInt(`${short[3]}${short[3]}`, 16),
    };
  }
  const long = HEX6.exec(text);
  if (long === null) {
    return null;
  }
  return {
    r: Number.parseInt(long[1], 16),
    g: Number.parseInt(long[2], 16),
    b: Number.parseInt(long[3], 16),
  };
}

function channelByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value * 255)));
}

function byte(value: number): string {
  const clamped = Math.round(Math.min(255, Math.max(0, value)));
  return clamped.toString(16).padStart(2, '0');
}

export function toHex(rgb: Rgb): string {
  return `#${byte(rgb.r)}${byte(rgb.g)}${byte(rgb.b)}`;
}

function linear(value: number): number {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an sRGB colour, in [0, 1]. */
export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
}

function ratioOf(a: Rgb, b: Rgb): number {
  const one = relativeLuminance(a);
  const two = relativeLuminance(b);
  const lighter = Math.max(one, two);
  const darker = Math.min(one, two);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The WCAG contrast ratio between two colours, in [1, 21]. A colour this
 * module cannot measure reads as 1 — no contrast is CLAIMED for something
 * that was not measured, so a caller keeping a minimum never passes on the
 * strength of a colour it could not see.
 */
export function contrastRatio(a: string, b: string): number {
  const one = parseHex(a);
  const two = parseHex(b);
  if (one === null || two === null) {
    return 1;
  }
  return ratioOf(one, two);
}

/**
 * The candidate that reads best ON `fill`. Ties keep the earlier candidate,
 * so the desk's own text colour wins wherever it is good enough.
 */
export function textOn(fill: string, candidates: readonly string[]): string {
  let best = fill;
  let bestRatio = -1;
  for (const candidate of candidates) {
    const ratio = contrastRatio(candidate, fill);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return best;
}

export function rgbToHsl(rgb: Rgb): Hsl {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  const l = (max + min) / 2;
  if (span === 0) {
    return { h: 0, s: 0, l };
  }
  const s = span / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) {
    h = ((g - b) / span) % 6;
  } else if (max === g) {
    h = (b - r) / span + 2;
  } else {
    h = (r - g) / span + 4;
  }
  h *= 60;
  return { h: h < 0 ? h + 360 : h, s, l };
}

export function hslToRgb(hsl: Hsl): Rgb {
  const c = (1 - Math.abs(2 * hsl.l - 1)) * hsl.s;
  const h = ((hsl.h % 360) + 360) % 360;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = hsl.l - c / 2;
  let parts: [number, number, number] = [0, 0, 0];
  if (h < 60) {
    parts = [c, x, 0];
  } else if (h < 120) {
    parts = [x, c, 0];
  } else if (h < 180) {
    parts = [0, c, x];
  } else if (h < 240) {
    parts = [0, x, c];
  } else if (h < 300) {
    parts = [x, 0, c];
  } else {
    parts = [c, 0, x];
  }
  // Rounded to 8 bits here, not on the way out to hex. An `Rgb` in this
  // module is an sRGB byte triple — that is what `parseHex` yields and what a
  // screen can show — so a caller that MEASURES the answer measures the
  // colour it will actually get. Rounding later instead let `adaptToCanvas`
  // return a colour a hair under the minimum it had just cleared.
  return {
    r: channelByte(parts[0] + m),
    g: channelByte(parts[1] + m),
    b: channelByte(parts[2] + m),
  };
}

/** How many lightness steps are tried between the emitted colour and the end
 *  of its road. 100 puts every step under half a percent of lightness, which
 *  is below what a screen can show. */
const STEPS = 100;

// Memoized by (colour, canvas, minimum). Pure, so the answer never goes
// stale, and the figure re-renders on every pan — recomputing a hundred
// powers per edge per frame would be waste, not caution.
const ADAPTED = new Map<string, string>();

/**
 * `color`, moved just far enough to reach `minRatio` against `canvas`.
 *
 * The hue and the saturation are kept and only the lightness moves, away
 * from the canvas: a dark canvas is escaped upwards and a light one
 * downwards, and the end of that road is white or black, which is the most
 * any hue can give. A colour that ALREADY meets the minimum is returned
 * untouched, so nothing changes on the canvas the lens was emitted for; a
 * colour this module cannot measure is returned untouched as well.
 */
export function adaptToCanvas(color: string, canvas: string, minRatio: number): string {
  const key = `${color}|${canvas}|${minRatio}`;
  const cached = ADAPTED.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const answer = adapt(color, canvas, minRatio);
  ADAPTED.set(key, answer);
  return answer;
}

function adapt(color: string, canvas: string, minRatio: number): string {
  const rgb = parseHex(color);
  const ground = parseHex(canvas);
  if (rgb === null || ground === null) {
    return color;
  }
  if (ratioOf(rgb, ground) >= minRatio) {
    return color;
  }
  const hsl = rgbToHsl(rgb);
  const target = relativeLuminance(ground) > CROSSOVER_LUMINANCE ? 0 : 1;
  for (let step = 1; step <= STEPS; step += 1) {
    const moved = hslToRgb({ ...hsl, l: hsl.l + (target - hsl.l) * (step / STEPS) });
    if (ratioOf(moved, ground) >= minRatio) {
      return toHex(moved);
    }
  }
  return toHex(hslToRgb({ ...hsl, l: target }));
}
