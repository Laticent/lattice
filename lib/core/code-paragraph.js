/**
 * lib/core/code-paragraph.js — find the paragraphs whose whole content is one code span (`<p><code>…</code></p>`).
 *
 * Several engine passes lift such a paragraph out of a section: a chart's eyebrow (lib/transformers/chart-frame.js), a
 * label set or a legend (lib/core/lift-label-set.js), a split page's eyebrow (lib/core/split-envelope.js). Each used a
 * regex of the shape `<p[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/p>`, which is quadratic on markup with many `<p`
 * and no `>`, or many code spans and no closing `</p>`: every start scanned to the end before failing (HARD RULE #32,
 * followups.d/3045-p2-regex-recheck-gate.md). These walkers answer what those regexes answered in one pass: each
 * search position only moves forward, and once a search misses, no later start can match.
 * test/unit/core/code-paragraph.test.js holds each to the regex it replaced by a seeded fuzz.
 *
 * Pure string work: both render paths call it.
 */

/** A character a regex `\b` counts as a word character. */
const isWord = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
/** The characters `\s` matches. */
const isSpace = (c) =>
  c === 32 || (c >= 9 && c <= 13) || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) ||
  c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;

/** `html.indexOf(needle, from)` for a `from` that never decreases between calls: each answer is reused until passed. */
function forwardSearch(html, needle) {
  let lastFrom = -1;
  let lastAt = -1;
  return (from) => {
    if (lastAt === -2) return -1;
    if (lastFrom !== -1 && from >= lastFrom && from <= lastAt) return lastAt;
    const at = html.indexOf(needle, from);
    lastFrom = from;
    lastAt = at < 0 ? -2 : at;
    return at;
  };
}

/** The index past a run of `\s` starting at `i`. */
function skipSpace(html, i) {
  while (i < html.length && isSpace(html.charCodeAt(i))) i++;
  return i;
}

/**
 * Every code-only paragraph, left to right and not overlapping, as one of two global regexes finds them:
 *   loose (default)   `/<p[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/p>/g`: `<p` with no boundary (so `<pre` opens one),
 *                     and a lazy body that runs past a `</code>` to the first one a `</p>` follows;
 *   tight             `/<p\b[^>]*>\s*<code[^>]*>((?:(?!<\/code>)[\s\S])*)<\/code>\s*<\/p>/g`: `<p` closed by a non-word
 *                     character, and a body that stops at the first `</code>`, which a `</p>` must then follow.
 * `limit` stops after that many. Each match: { index, end, inner }.
 */
function codeParagraphs(html, { tight = false, limit = Infinity } = {}) {
  const src = String(html);
  const out = [];
  const pGt = forwardSearch(src, '>');
  const codeGt = forwardSearch(src, '>');
  const codeClose = forwardSearch(src, '</code>');
  // loose: the next `</code>` a `\s*</p>` follows, at or after `from` (also never searched backward).
  let closedFrom = -1;
  let closedAt = -1;
  const nextClosed = (from) => {
    if (closedAt === -2) return -1;
    if (closedFrom !== -1 && from >= closedFrom && from <= closedAt) return closedAt;
    let k = from;
    for (;;) {
      const at = src.indexOf('</code>', k);
      if (at < 0) {
        closedAt = -2;
        return -1;
      }
      if (src.startsWith('</p>', skipSpace(src, at + 7))) {
        closedFrom = from;
        closedAt = at;
        return at;
      }
      k = at + 1;
    }
  };
  let pos = 0;
  while (out.length < limit) {
    const lt = src.indexOf('<p', pos);
    if (lt < 0) break;
    pos = lt + 1;
    if (tight && lt + 2 < src.length && isWord(src.charCodeAt(lt + 2))) continue;
    const gt = pGt(lt + 2);
    if (gt < 0) break;
    const c = skipSpace(src, gt + 1);
    if (!src.startsWith('<code', c)) continue;
    const cgt = codeGt(c + 5);
    if (cgt < 0) break;
    let close;
    if (tight) {
      close = codeClose(cgt + 1);
      if (close < 0) break;
      if (!src.startsWith('</p>', skipSpace(src, close + 7))) continue;
    } else {
      close = nextClosed(cgt + 1);
      if (close < 0) break;
    }
    const end = skipSpace(src, close + 7) + 4;
    out.push({ index: lt, end, inner: src.slice(cgt + 1, close) });
    pos = end;
  }
  return out;
}

/**
 * The code-only paragraph that ends the string, as `/<p[^>]*>\s*<code>([^<]+?)<\/code>\s*<\/p>\s*$/` finds it: a bare
 * `<code>`, a body with no `<` and at least one character, and nothing but blanks after `</p>`. Read from the end, so
 * one backward pass answers it. Returns { index, inner } or null.
 */
function trailingCodeParagraph(html) {
  const src = String(html);
  let i = src.length;
  while (i > 0 && isSpace(src.charCodeAt(i - 1))) i--;
  if (!src.endsWith('</p>', i)) return null;
  i -= 4;
  while (i > 0 && isSpace(src.charCodeAt(i - 1))) i--;
  if (!src.endsWith('</code>', i)) return null;
  const close = i - 7;
  if (close < 6) return null;
  const lt = src.lastIndexOf('<', close - 1);
  if (lt < 0 || close - lt - 6 < 1 || !src.startsWith('<code>', lt) || lt + 6 > close) return null;
  const bodyStart = lt + 6;
  if (src.lastIndexOf('<', close - 1) !== lt) return null;
  let j = lt;
  while (j > 0 && isSpace(src.charCodeAt(j - 1))) j--;
  if (j === 0 || src.charCodeAt(j - 1) !== 62) return null; // the `>` that closes `<p…`
  const gt = j - 1;
  const prevGt = src.lastIndexOf('>', gt - 1);
  // The leftmost `<p` after the previous `>`, whose `[^>]*` then reaches this `>`.
  const p = src.indexOf('<p', prevGt + 1);
  if (p < 0 || p + 2 > gt) return null;
  return { index: p, inner: src.slice(bodyStart, close) };
}

module.exports = { codeParagraphs, trailingCodeParagraph };
