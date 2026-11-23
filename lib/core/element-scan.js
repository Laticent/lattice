/**
 * lib/core/element-scan.js — first-element readers for rendered HTML, each in one pass (regex PR 3): the first
 * `<h2>…</h2>`-style element and the section open tag with its classes. Split from tag-scan.js so the lint core, which
 * loads tag-scan.js for `scanTags` only, does not carry them. Pure string work: both render paths call it.
 */

/** A character a regex `\b` counts as a word character. */
const isWord = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

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

/** ECMAScript `\s`, one character at a time (linear). */
const isSpace = (c) => /\s/.test(String.fromCharCode(c));

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
  // One forward pointer over the `class="` occurrences: each is found once in all, never re-searched from every tag.
  let cls = src.indexOf('class="');
  for (const at of wholeWordOpeners(src, 'section')) {
    if (at < from) continue;
    const gt = src.indexOf('>', at);
    const tagEnd = gt < 0 ? src.length : gt;
    // Candidates: a blank at j, then `class="` at j + 1, with j inside the tag (`[^>]*` cannot pass the `>`).
    while (cls >= 0 && cls < at + 9) cls = src.indexOf('class="', cls + 1);
    const starts = [];
    for (; cls >= 0 && cls - 1 < tagEnd; cls = src.indexOf('class="', cls + 1)) {
      if (isSpace(src.charCodeAt(cls - 1))) starts.push(cls - 1);
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

module.exports = { firstElementMatch, firstSectionOpen, sectionClassMatch };
