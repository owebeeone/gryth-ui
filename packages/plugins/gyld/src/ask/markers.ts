import type { GyldAskCitation } from './reply';

// WHERE THE ANSWER NAMES A SOURCE (GyldAskAgent.md section 4, "The reply").
//
// The supplier sends every citation BEFORE the prose — `question → citation… →
// answer… → end` (`glade-gyld/src/supplier.rs`) — and the prompt tells the
// model to "name the tag it came from" (`glade-gyld/src/prompt.rs`). So the
// answer already says where each claim rests; what was missing was the way
// BACK from the sentence to the passage, and a full list under every reply was
// not it — it pushed the answer off the screen and made the reader match tags
// by eye.
//
// This module is the match and nothing else, so every rule of it is asserted
// over plain strings:
//
//  - ONLY THIS REPLY'S OWN TAGS. A tag the model wrote that the supplier did
//    not cite is left as plain text: marking it would be the window inventing
//    a source (6.7, MDV-7). The citations are the whole vocabulary.
//  - LONGEST FIRST. `WD-1` and `WD-10` are two tags, and at a position both
//    could start, the longer one is the match — otherwise `WD-10` would read
//    as `WD-1` with a stray `0` after it.
//  - THE MODEL'S TEXT IS KEPT. The mention is left exactly as it was written,
//    backticks and all, and the marker FOLLOWS it. Nothing is rewritten, so
//    the prose a reader sees is still the prose the model streamed.
//  - ONE NUMBER PER TAG. Citations are numbered in ARRIVAL order, and every
//    mention of a tag draws that tag's number — a tag named three times is
//    `[2]` three times, not `[2] [3] [4]`.

/** One citation of the reply, as a marker names it. */
export interface CitationMark {
  tag: string;
  /** 1-based, in the order the supplier sent the citations. */
  number: number;
}

/**
 * One piece of a paragraph.
 *
 * Plain prose where `mark` is absent; where it is present, the very text the
 * model wrote — `WD-1`, or `` `WD-1` `` with its backticks — and the citation
 * that text names, which the window draws a marker for after it.
 */
export interface ProsePart {
  text: string;
  mark?: CitationMark;
}

/** One paragraph of the answer, and the boxes that may open under IT. */
export interface MarkedParagraph {
  parts: ProsePart[];
  /** The citation numbers this paragraph marks, first mention first and each
   *  listed once however often the prose names the tag. */
  marks: number[];
}

/** The answer's prose, marked. */
export interface MarkedProse {
  paragraphs: MarkedParagraph[];
  /** The numbers of the citations NO paragraph marks, so the footer can list
   *  them and nothing the supplier sent is lost. */
  unmarked: number[];
}

export const NO_PROSE: MarkedProse = Object.freeze({
  paragraphs: Object.freeze([]) as readonly MarkedParagraph[] as MarkedParagraph[],
  unmarked: Object.freeze([]) as readonly number[] as number[],
});

/**
 * Whether this character continues a tag.
 *
 * The boundary, and the reason it is not a word boundary from a regular
 * expression: a tag is `WD-1`, `Q11` or `IrohReview §11`, so the run it must
 * not be found INSIDE is the alphanumeric one. `Q11` in `Q110` is not `Q11`,
 * and `WD-1` in `WD-10` is not `WD-1`; `AZ-7's` and `WD-1.` are.
 */
function continues(char: string | undefined): boolean {
  return char !== undefined && /[0-9A-Za-z]/.test(char);
}

/**
 * This reply's tags, numbered in arrival order.
 *
 * A tag cited TWICE keeps the first citation's number, because the number is
 * what the prose's mention of that tag means and one tag cannot mean two. The
 * second citation is then marked by nothing, which is exactly what puts it in
 * the footer's list.
 */
export function numberTags(citations: readonly GyldAskCitation[]): Map<string, number> {
  const numbered = new Map<string, number>();
  citations.forEach((citation, index) => {
    const tag = citation.tag ?? '';
    if (tag === '' || numbered.has(tag)) {
      return;
    }
    numbered.set(tag, index + 1);
  });
  return numbered;
}

/** The tags to try at a position, longest first so `WD-10` wins over `WD-1`.
 *  Ties are ordered as text, so the match is the same on every render. */
function byLength(tags: Iterable<string>): string[] {
  return [...tags].sort(
    (left, right) => right.length - left.length
      || (left < right ? -1 : left > right ? 1 : 0),
  );
}

/** The mention starting at `at`, or nothing. A backticked tag is matched WITH
 *  its backticks, so the marker lands after the closing one. */
function mentionAt(
  text: string, at: number, tags: readonly string[],
): string | undefined {
  const quoted = text[at] === '`';
  const from = quoted ? at + 1 : at;
  for (const tag of tags) {
    if (!text.startsWith(tag, from)) {
      continue;
    }
    const to = from + tag.length;
    if (quoted) {
      if (text[to] === '`') {
        return text.slice(at, to + 1);
      }
      continue;
    }
    if (!continues(text[at - 1]) && !continues(text[to])) {
      return tag;
    }
  }
  return undefined;
}

/** The tag a mention names, out of the text the match kept. */
function tagOf(mention: string): string {
  return mention.startsWith('`') && mention.endsWith('`')
    ? mention.slice(1, -1)
    : mention;
}

/** One paragraph, scanned left to right. Plain characters are coalesced into
 *  one run, so a paragraph with no mention in it is one part. */
function markParagraph(
  text: string, tags: readonly string[], numbered: Map<string, number>,
): MarkedParagraph {
  const parts: ProsePart[] = [];
  const marks: number[] = [];
  let plain = '';
  let at = 0;
  while (at < text.length) {
    const mention = mentionAt(text, at, tags);
    if (mention === undefined) {
      plain += text[at];
      at += 1;
      continue;
    }
    const tag = tagOf(mention);
    const number = numbered.get(tag);
    if (number === undefined) {
      // Unreachable: the tags scanned for are this map's own keys. Left as a
      // read of the map rather than a cast, so the match can never quietly
      // mark a tag the reply did not cite.
      plain += text[at];
      at += 1;
      continue;
    }
    if (plain !== '') {
      parts.push({ text: plain });
      plain = '';
    }
    parts.push({ text: mention, mark: { tag, number } });
    if (!marks.includes(number)) {
      marks.push(number);
    }
    at += mention.length;
  }
  if (plain !== '') {
    parts.push({ text: plain });
  }
  return { parts, marks };
}

/**
 * The paragraphs of an answer.
 *
 * A blank line is what every writer and every model means by a paragraph
 * break, and it is the only break read here: the box a marker opens belongs
 * under the paragraph the mention is IN, so the paragraph has to be a real
 * unit of the prose and not a wrapped line. The text of each is kept verbatim;
 * only the blank lines between them are the split.
 */
export function paragraphsOf(prose: string): string[] {
  return prose.split(/\n[ \t]*\n\s*/).filter((text) => text.trim() !== '');
}

/**
 * The reply's prose with its own citations marked.
 *
 * Pure over two arguments and nothing else: no grip, no DOM, no clock — so
 * every rule above is asserted by calling it with a string and a list.
 */
export function markProse(
  prose: string, citations: readonly GyldAskCitation[],
): MarkedProse {
  const numbered = numberTags(citations);
  const tags = byLength(numbered.keys());
  const paragraphs = paragraphsOf(prose)
    .map((text) => markParagraph(text, tags, numbered));
  const marked = new Set(paragraphs.flatMap((paragraph) => paragraph.marks));
  const unmarked = citations
    .map((_citation, index) => index + 1)
    .filter((number) => !marked.has(number));
  return { paragraphs, unmarked };
}
