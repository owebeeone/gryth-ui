import type { GyldLens, LensEdge, LensGroup, LensNode } from '../contract';

// Decoding the EMITTED Graphviz geometry into SVG coordinates. Decoding only:
// every number below comes out of the lens file, and no position, size or
// curve is computed, adjusted or laid out here (MDV-4: layout is owned by the
// emitter). The two conversions are a unit change and an axis flip.
//
//  - Graphviz `pos` and `bb` are in POINTS with the origin bottom left (y up);
//    SVG is y down, so `y` becomes `bb[3] - y`.
//  - Graphviz `width` and `height` are in INCHES, at 72 points to the inch.
//  - `spline` is the Graphviz edge `pos` string: an optional `s,x,y` tail
//    endpoint and `e,x,y` head endpoint, then one start point followed by
//    triples of cubic Bezier control points.

export const POINTS_PER_INCH = 72;

/** How far a left justified text block sits inside its box. */
export const LABEL_INSET = 8;

/** Line spacing as a multiple of the point size, which is Graphviz's own
 *  default for a multi-line label. It is the one typographic number the lens
 *  file does not carry: the host emits the size and the justification per
 *  node, and the spacing follows from the size. */
export const LINE_SPACING = 1.2;

/** Edge label and cluster label point sizes. These two the lens file does NOT
 *  emit: `gyld/scripts/lens_geometry.py` writes them into the DOT once, as
 *  `edge [fontsize=9]` and `fontsize=12` inside each cluster, and they never
 *  reach the lens document. They are therefore the view's own constants, set
 *  to what that host asks Graphviz for, and they are the only typography here
 *  the emitter did not hand over. */
export const EDGE_LABEL_FONT_SIZE = 9;
export const GROUP_LABEL_FONT_SIZE = 12;

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The lens bounding box as an SVG viewBox and the size the camera fits to. */
export function lensExtent(lens: GyldLens): Box {
  const [x0, y0, x1, y1] = lens.bb;
  return { x: 0, y: 0, width: x1 - x0, height: y1 - y0 };
}

/** One Graphviz point in the lens's own SVG frame. */
export function toSvg(lens: GyldLens, x: number, y: number): Point {
  return { x: x - lens.bb[0], y: lens.bb[3] - y };
}

/** A node's box: `pos` is its centre in points, `size` its extent in inches. */
export function nodeBox(lens: GyldLens, node: LensNode): Box {
  const centre = toSvg(lens, node.pos[0], node.pos[1]);
  const width = node.size[0] * POINTS_PER_INCH;
  const height = node.size[1] * POINTS_PER_INCH;
  return { x: centre.x - width / 2, y: centre.y - height / 2, width, height };
}

/** A cluster's box, from its emitted bounding box. */
export function groupBox(lens: GyldLens, group: LensGroup): Box {
  const [x0, y0, x1, y1] = group.bb;
  const topLeft = toSvg(lens, x0, y1);
  return { x: topLeft.x, y: topLeft.y, width: x1 - x0, height: y1 - y0 };
}

/** How a node's text block is drawn: the anchor its justification asks for,
 *  the size the host drew it at, and the spacing that follows from the size. */
export interface LabelLayout {
  origin: Point;
  /** The SVG `text-anchor` the emitted justification means. */
  anchor: 'start' | 'middle';
  fontSize: number;
  lineHeight: number;
}

/**
 * Where a node's text block starts, so the lines sit inside the box the same
 * way the host drew them. Both inputs come out of the lens file: `fontsize`
 * and `justify` are per node, because the decision lenses are 11pt left
 * aligned, the architecture lenses 12pt centred, and a single-line node is
 * centred whatever its lens does.
 */
export function labelLayout(box: Box, node: LensNode): LabelLayout {
  const fontSize = node.fontsize;
  const lineHeight = fontSize * LINE_SPACING;
  const block = node.text.length * lineHeight;
  const centred = node.justify !== 'left';
  return {
    origin: {
      x: centred ? box.x + box.width / 2 : box.x + LABEL_INSET,
      // the first baseline sits one line below the top of the centred block
      y: box.y + (box.height - block) / 2 + fontSize,
    },
    anchor: centred ? 'middle' : 'start',
    fontSize,
    lineHeight,
  };
}

export interface Spline {
  /** The curve through the emitted control points. */
  path: string;
  /** The arrowhead end, when the edge emitted one. */
  head?: Point;
  /** The tail end, when the edge emitted one. */
  tail?: Point;
}

function parsePoint(token: string): Point | null {
  const [x, y] = token.split(',');
  const px = Number(x);
  const py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) {
    return null;
  }
  return { x: px, y: py };
}

/**
 * Decode one Graphviz spline string.
 *
 * Returns null when the string is not a spline this decoder understands: a
 * run of control points that is not one start point plus whole triples cannot
 * be drawn, and drawing an approximation of it would be inventing geometry.
 */
export function decodeSpline(lens: GyldLens, spline: string): Spline | null {
  let head: Point | undefined;
  let tail: Point | undefined;
  const points: Point[] = [];
  for (const token of spline.trim().split(/\s+/)) {
    if (token === '') {
      continue;
    }
    if (token.startsWith('e,')) {
      const point = parsePoint(token.slice(2));
      if (point === null) {
        return null;
      }
      head = toSvg(lens, point.x, point.y);
      continue;
    }
    if (token.startsWith('s,')) {
      const point = parsePoint(token.slice(2));
      if (point === null) {
        return null;
      }
      tail = toSvg(lens, point.x, point.y);
      continue;
    }
    const point = parsePoint(token);
    if (point === null) {
      return null;
    }
    points.push(toSvg(lens, point.x, point.y));
  }
  if (points.length < 4 || (points.length - 1) % 3 !== 0) {
    return null;
  }
  const parts: string[] = [];
  if (tail !== undefined) {
    parts.push(`M ${tail.x} ${tail.y} L ${points[0].x} ${points[0].y}`);
  } else {
    parts.push(`M ${points[0].x} ${points[0].y}`);
  }
  for (let i = 1; i < points.length; i += 3) {
    const [a, b, c] = [points[i], points[i + 1], points[i + 2]];
    parts.push(`C ${a.x} ${a.y} ${b.x} ${b.y} ${c.x} ${c.y}`);
  }
  if (head !== undefined) {
    parts.push(`L ${head.x} ${head.y}`);
  }
  const result: Spline = { path: parts.join(' ') };
  if (head !== undefined) {
    result.head = head;
  }
  if (tail !== undefined) {
    result.tail = tail;
  }
  return result;
}

/** The styling one edge is drawn with: its own emitted style when it carries
 *  one, otherwise the legend entry for its relation, which is emitted data
 *  too. Nothing is chosen by the view. */
export function edgeStyle(lens: GyldLens, edge: LensEdge): {
  color?: string;
  dash?: string;
  width?: number;
} {
  const legend = lens.legend.edges.find((entry) => entry.relation === edge.relation);
  const color = edge.style?.color ?? legend?.color;
  const style = edge.style?.style ?? legend?.style;
  const result: { color?: string; dash?: string; width?: number } = {};
  if (color !== undefined) {
    result.color = color;
  }
  if (style === 'dashed') {
    result.dash = '6 4';
  } else if (style === 'dotted') {
    result.dash = '2 3';
  }
  if (edge.style?.penwidth !== undefined) {
    result.width = edge.style.penwidth;
  }
  return result;
}

/** Whether an emitted node style asks for rounded corners. */
export function cornerRadius(node: LensNode): number {
  return (node.style ?? '').split(',').includes('rounded') ? 6 : 0;
}
