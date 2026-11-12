/**
 * lib/core/data-uri-mask.mjs
 *
 * A reader that cannot learn anything from a pasted image's bytes should not walk them. A phone photo pasted
 * into a deck is a `data:image/jpeg;base64,…` address of about 4.5 MB, and the linter walks every line many
 * times over (its inline-code scan, the markdown-it parse, the comment scan): one pass over a deck with three
 * such photos took 4 s, on every keystroke, on the Studio's main thread.
 *
 * `maskDataUris(text)` swaps the MIDDLE of each long base64 data address's payload for a short stand-in written in
 * the same alphabet, keeping KEEP_ENDS characters of each end verbatim, so every rule still reads a data address of
 * the same type, in the same place, on the same line, and a quote cut near either end reads the same. Lines keep their numbers (a base64 payload holds no newline). `restore(findings)` puts the original
 * bytes back into every string a finding carries, and moves a `col` that sat after a stand-in on its line, so a
 * finding reads exactly as it would have from the unmasked text.
 *
 * WHAT IS MASKED, and why nothing else is:
 *   - only a payload of MIN_PAYLOAD base64 characters or more. A short one costs nothing to read.
 *   - only on a PHOTO LINE: an image, an `<img>`, a link definition or a `backgroundImage: url()` directive that is
 *     the whole line, at no indent, with a blank line (or the text's edge) above and below. That is the shape a pasted
 *     photo takes. A data address anywhere else (prose, a card's tag, a chart label, a list item, a table cell) is
 *     characters some rule counts, so it is left whole.
 *   - never on a line `keepLines(text)` marks. A code block's line length is what its column check judges. The
 *     default is `fencedLines`; the linter passes the union of both fence readers its rules use
 *     (lint-core.js `maybeCodeLines`), since the two disagree on a fence inside a comment and across a slide break.
 *     The caller normalizes line ends first: a lone `\r` must already be a `\n`, or the lines here are not the rules'.
 * The payload's bytes are never read by a rule: a data image is local whatever it holds (lib/core/remote-ref.js
 * reads the MIME type only), and no rule decodes one.
 *
 * Pure, fs-free (HARD RULE #7).
 */

import shapeGlyphs from './shape-glyphs.js';

const { fencedLines } = shapeGlyphs;

/** The shortest payload worth masking, in base64 characters (about 3 KB of image). */
export const MIN_PAYLOAD = 4096;
/**
 * How much of each end of a payload the stand-in keeps verbatim. Some rules quote a cut of a line (`line.slice(0, 80)`,
 * the widest cut in lint-core and the plugins' rules is 80), so a cut that ends inside a kept end reads the same masked
 * as unmasked, and no cut can end inside the stand-in's own tag.
 */
export const KEEP_ENDS = 1024;

// THE LINE A PASTED PHOTO MAKES, with its payload read as `P`: an image, an `<img>`, a link definition or a
// `backgroundImage: url()` directive that is the WHOLE line, at no indent. Only such a line is masked. A data address
// inside other text (a card's tag, a chart label, a list item) is characters a rule counts: masking one there changed
// `tag-budget`'s count and a chart's label rows (found by the seeded gallery fuzz in the test). Tested on the line with
// its payload cut out, never across the text: an unanchored scan of 14 MB tried an alternation at every character
// (110 ms a pass, measured). The MIME parameters stop at anything that ends a destination.
const ADDRESS = String.raw`data:[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;[^;,()\s"'<>]*)*;base64,P`;
const PHOTO_LINE = new RegExp(
  String.raw`^(?:!\[[^\]\n]*\]\(\s*<?${ADDRESS}>?(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)` +
    String.raw`|<img\s[^>\n]*?\bsrc\s*=\s*(["'])${ADDRESS}\1[^>\n]*>` +
    String.raw`|\[[^\]\n]+\]:[ \t]*<?${ADDRESS}>?` +
    String.raw`|(?:<!--\s*)?_?backgroundImage\s*:\s*["']?url\(\s*["']?${ADDRESS}["']?\s*\)["']?\s*(?:-->)?)\s*$`,
  'i',
);
// The longest line around a payload worth testing: a photo line's prefix and suffix are short.
const WINDOW = 512;
const PAYLOAD = /[A-Za-z0-9+/]*/y;
const MARK = ';base64,';

/** Is the line [lineStart, lineEnd) its own paragraph: the line above and the line below blank, or the text's edge? */
function blankAround(text, lineStart, lineEnd) {
  if (lineStart > 0) {
    const above = text.slice(text.lastIndexOf('\n', lineStart - 2) + 1, lineStart - 1);
    if (above.trim()) return false;
  }
  if (lineEnd < text.length) {
    let next = text.indexOf('\n', lineEnd + 1);
    if (next < 0) next = text.length;
    if (text.slice(lineEnd + 1, next).trim()) return false;
  }
  return true;
}

/**
 * @param {string} text
 * @returns {null | {text: string, restore: <T>(findings: T[]) => T[]}}
 *   null when nothing is masked (the common deck: no long base64 address), so a caller pays one `indexOf`.
 */
export function maskDataUris(text, { keepLines = fencedLines } = {}) {
  if (typeof text !== 'string' || text.length < MIN_PAYLOAD) return null;
  let at = text.indexOf(MARK);
  if (at < 0) return null;
  // A stand-in prefix the text does not already hold, so a restore never touches an author's own characters.
  let salt = 0;
  while (text.includes(`Ltcmask${salt}n`)) salt++;
  const tag = `Ltcmask${salt}n`;
  const payloads = [];
  const pieces = [];
  let fenced = null;
  let lineNo = 0;
  let counted = 0; // newlines are counted up to here
  let copied = 0; // the text is copied into `pieces` up to here
  for (; at >= 0; at = text.indexOf(MARK, at + 1)) {
    const from = at + MARK.length;
    PAYLOAD.lastIndex = from;
    const end = from + PAYLOAD.exec(text)[0].length;
    if (end - from < MIN_PAYLOAD) continue;
    // The whole line, and its own paragraph: blank (or the text's edge) above and below, so it joins no list item,
    // table, card or label whose characters a rule counts.
    const lineStart = text.lastIndexOf('\n', at) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd < 0) lineEnd = text.length;
    if (at - lineStart > WINDOW || lineEnd - end > WINDOW) continue;
    if (!PHOTO_LINE.test(`${text.slice(lineStart, from)}P${text.slice(end, lineEnd)}`)) continue;
    if (!blankAround(text, lineStart, lineEnd)) continue;
    fenced ??= keepLines(text);
    for (let i = text.indexOf('\n', counted); i >= 0 && i < from; i = text.indexOf('\n', i + 1)) lineNo++;
    counted = from;
    if (fenced[lineNo]) continue;
    // The payload's two ends stay; only its middle becomes the stand-in.
    pieces.push(text.slice(copied, from + KEEP_ENDS), `${tag}${payloads.length}e`);
    payloads.push(text.slice(from + KEEP_ENDS, end - KEEP_ENDS));
    copied = end - KEEP_ENDS;
    at = end - 1;
  }
  if (!payloads.length) return null;
  pieces.push(text.slice(copied));
  const out = pieces.join('');
  const token = new RegExp(`${tag}(\\d+)e`, 'g');
  const unmask = (s) => s.replace(token, (_, i) => payloads[Number(i)]);
  // How far a column moves: the growth of every stand-in that ends at or before it on the masked line.
  const shift = (line, col) => {
    let by = 0;
    for (const m of line.matchAll(token)) if (m.index + m[0].length <= col) by += payloads[Number(m[1])].length - m[0].length;
    return by;
  };
  const deep = (v) => {
    if (typeof v === 'string') return v.includes(tag) ? unmask(v) : v;
    if (Array.isArray(v)) {
      const mapped = v.map(deep);
      return mapped.every((x, i) => x === v[i]) ? v : mapped;
    }
    if (v && typeof v === 'object') {
      let copy = null;
      for (const k of Object.keys(v)) {
        const nv = deep(v[k]);
        if (nv !== v[k]) (copy ??= { ...v })[k] = nv;
      }
      return copy ?? v;
    }
    return v;
  };
  const restore = (findings) =>
    findings.map((f) => {
      const r = deep(f);
      if (r !== f && Number.isInteger(f.col) && typeof f.line === 'string' && f.line.includes(tag)) return { ...r, col: f.col + shift(f.line, f.col) };
      return r;
    });
  return { text: out, restore };
}
