/**
 * lib/core/tag-scan.js — every open and close tag in a string, read in one pass.
 *
 * The depth-counting walks in lib/core/below-note.js, lib/core/coda.js and lib/core/split-envelope.js all tokenized with
 * `/<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>|<\/([a-zA-Z][a-zA-Z0-9-]*)>/g`. Its open-tag arm reads on to the next `>`, so
 * from every `<a` with no `>` after it the scan ran to the end of the text: quadratic on a line of `<a <a <a`
 * (HARD RULE #32, followups.d/3045-p2-regex-recheck-gate.md). `scanTags` answers what that regex answered: an open tag
 * ends at the first `>` after its name, which the scan then moves past, and once no `>` is left nothing else can match.
 * test/unit/core/tag-scan.test.js holds it to the regex by a seeded fuzz.
 *
 * Pure string work: both render paths call it.
 */

/** A character a regex `\b` counts as a word character. */
const isWord = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const isLetter = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
/** A character `[a-zA-Z0-9-]` admits. */
const isNameChar = (c) => isLetter(c) || (c >= 48 && c <= 57) || c === 45;

/**
 * Every tag the global regex above matches, from `from` on, as the array `exec` returned:
 * [full, openName, selfClose, closeName] with `index`. `selfClose` is '/' when a `/` stands right before the `>` of an
 * open tag; `openName` and `closeName` are undefined on the other kind, as the regex left them.
 * @param {string} html
 * @param {number} [from]
 * @returns {Array<[string, string|undefined, string|undefined, string|undefined] & { index: number }>}
 */
function scanTags(html, from = 0) {
  const src = String(html);
  const out = [];
  let pos = Math.max(0, from);
  for (;;) {
    const lt = src.indexOf('<', pos);
    if (lt < 0) break;
    pos = lt + 1;
    const first = src.charCodeAt(lt + 1);
    if (isLetter(first)) {
      // The name: the longest run of `[a-zA-Z0-9-]` that a word boundary follows (the regex gives some back to reach one).
      let runEnd = lt + 2;
      while (runEnd < src.length && isNameChar(src.charCodeAt(runEnd))) runEnd++;
      let nameEnd = runEnd;
      const boundaryAt = (k) => isWord(src.charCodeAt(k - 1)) !== (k < src.length && isWord(src.charCodeAt(k)));
      while (nameEnd > lt + 1 && !boundaryAt(nameEnd)) nameEnd--;
      if (nameEnd > lt + 1) {
        // Every `>` found here ends a match and the scan moves past it, and a miss ends the scan, so no two searches
        // cover the same characters.
        const gt = src.indexOf('>', nameEnd);
        if (gt < 0) break; // no `>` left: neither arm can match anywhere after this
        const selfClose = gt > nameEnd && src.charCodeAt(gt - 1) === 47 ? '/' : undefined;
        const m = [src.slice(lt, gt + 1), src.slice(lt + 1, nameEnd), selfClose, undefined];
        m.index = lt;
        out.push(m);
        pos = gt + 1;
      }
      continue;
    }
    if (first === 47 && isLetter(src.charCodeAt(lt + 2))) {
      let k = lt + 3;
      while (k < src.length && isNameChar(src.charCodeAt(k))) k++;
      if (src.charCodeAt(k) === 62) {
        const m = [src.slice(lt, k + 1), undefined, undefined, src.slice(lt + 2, k)];
        m.index = lt;
        out.push(m);
        pos = k + 1;
      }
    }
  }
  return out;
}

/**
 * Every match of `/<open>([\s\S]*?)<close>/g` with `open` and `close` taken literally, as the arrays `matchAll` returned:
 * [full, inner] with `index`. The lazy regex rescanned to the end of the text from every `open` with no `close` after it
 * (quadratic on a cell of `<code><code><code>`, regex PR 3); here each `close` is searched for once from the end of its
 * `open`, and once none is left no later `open` can match either.
 * @param {string} html
 * @param {string} open
 * @param {string} close
 * @returns {Array<[string, string] & { index: number }>}
 */
function literalSpans(html, open, close) {
  const src = String(html);
  const out = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf(open, from);
    if (at < 0) return out;
    const end = src.indexOf(close, at + open.length);
    if (end < 0) return out;
    const m = [src.slice(at, end + close.length), src.slice(at + open.length, end)];
    m.index = at;
    out.push(m);
    from = end + close.length;
  }
}

/** The trimmed inner text of the first `literalSpans` match, or null: `html.match(/<open>([\s\S]*?)<close>/)?.[1].trim()`. */
function firstSpanText(html, open, close) {
  const src = String(html);
  const at = src.indexOf(open);
  if (at < 0) return null;
  const end = src.indexOf(close, at + open.length);
  return end < 0 ? null : src.slice(at + open.length, end).trim();
}

/**
 * The first match of `/<open>[^>]*>[\s\S]*?<close>/` (`open` like `<h2`, `close` like `</h2>`, both literal), shaped like
 * the array `exec` returned: [full] with `index`, or null. `[^>]*` can only end at the first `>` after `open`, and the lazy
 * body at the first `close` after that, so the first `open` decides: if it has no `>` or no `close` after it, no later one
 * does either. The regex re-read to the end of the text from every `open` with no `>` (regex PR 3).
 * @param {string} html
 * @param {string} open
 * @param {string} close
 * @returns {([string] & { index: number }) | null}
 */
function firstElementMatch(html, open, close) {
  const src = String(html);
  const at = src.indexOf(open);
  if (at < 0) return null;
  const gt = src.indexOf('>', at + open.length);
  if (gt < 0) return null;
  const end = src.indexOf(close, gt + 1);
  if (end < 0) return null;
  const m = [src.slice(at, end + close.length)];
  m.index = at;
  return m;
}

/** ECMAScript `\s`. */
const isSpace = (c) =>
  c === 0x20 || (c >= 0x09 && c <= 0x0d) || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) ||
  c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;

/** Every `<name` followed by a `\b` (a non-word character or the end), in order. */
function* wholeWordOpeners(src, name) {
  const open = `<${name}`;
  for (let at = src.indexOf(open); at >= 0; at = src.indexOf(open, at + 1)) {
    const after = at + open.length;
    if (after >= src.length || !isWord(src.charCodeAt(after))) yield at;
  }
}

/**
 * `html.match(/<section\b[^>]*>/)`, the first section open tag: [full] with `index`, or null. The first whole-word
 * `<section` decides: if no `>` follows it, none follows a later one either.
 */
function firstSectionOpen(html) {
  const src = String(html);
  for (const at of wholeWordOpeners(src, 'section')) {
    const gt = src.indexOf('>', at);
    if (gt < 0) return null;
    const m = [src.slice(at, gt + 1)];
    m.index = at;
    return m;
  }
  return null;
}

/**
 * `/<section\b[^>]*\sclass="([^"]*)"/.exec(html)`: [full, classes] with `index`, or null. Within one open tag (up to its
 * first `>`), the greedy `[^>]*` takes the RIGHTMOST blank + `class="` whose value has a closing `"` somewhere after it;
 * the value may run past the `>`, as the regex's `[^"]*` does. When the rightmost one has no closing quote, the one before
 * it closes at the rightmost one's opening quote. A tag with no candidate passes to the next `<section` after its `>`. Each
 * tag is read once, where the regex re-read to the end from every `<section` with no `>` (regex PR 3).
 */
function sectionClassMatch(html) {
  const src = String(html);
  let from = 0;
  for (const at of wholeWordOpeners(src, 'section')) {
    if (at < from) continue;
    const gt = src.indexOf('>', at);
    const tagEnd = gt < 0 ? src.length : gt;
    // Candidates: a blank at j, then `class="` at j + 1, with j inside the tag (`[^>]*` cannot pass the `>`).
    const starts = [];
    for (let k = src.indexOf('class="', at + 8); k >= 0 && k - 1 < tagEnd; k = src.indexOf('class="', k + 1)) {
      if (k - 1 >= at + 8 && isSpace(src.charCodeAt(k - 1))) starts.push(k - 1);
    }
    for (let n = starts.length - 1; n >= 0; n--) {
      const valueAt = starts[n] + 8;
      const q = src.indexOf('"', valueAt);
      if (q < 0) continue;
      const m = [src.slice(at, q + 1), src.slice(valueAt, q)];
      m.index = at;
      return m;
    }
    if (gt < 0) return null;
    from = gt + 1;
  }
  return null;
}

module.exports = { scanTags, literalSpans, firstSpanText, firstElementMatch, firstSectionOpen, sectionClassMatch };
