/**
 * lib/core/css-url.js — the target of the first `url()` in a CSS text, quote-aware.
 *
 * The runtime's readers used `/url\(\s*['"]?([^'")]+)/`, which ends a URL at its first `)` or `'`.
 * A `data:` URI of an SVG (percent-encoded UTF-8, the encoding every export writes: lib/core/
 * data-uri.js) carries both — `fill="url(%23glow)"` — so the reader handed back a truncated URL and
 * the picture never loaded: an `image` slide lost its size bucket in the CLI's `--html` and `--fluid`
 * exports and in the Studio's Webpage bake (decisions/2026-10-16-player-as-library-audit.md §11.9).
 * A quoted URL now runs to its closing quote, a bare one to the first `)` or space.
 *
 * Pure, dependency-free; the browser runtime bundles it.
 */
// NO PATTERN RUNS OVER THE URL ITSELF. The old reader was one regex, `url\(\s*(?:"((?:[^"\\]|\\.)*)"|…)`,
// whose alternation group repeats once per character. WebKit's regex engine (JSC) gives up on that
// shape past about a megabyte and returns no match, so on an iPhone a phone photo pasted as a `data:`
// URL had no address, its size was never read, and the `image` slide kept the wrong layout
// (engineering/decisions/2026-11-03-pictures-at-drawn-size.md). V8 matches it, so no Chromium test
// saw it. This scan returns exactly what that regex returned, in one linear pass at any length.
const URL_OPEN = /url\(/gi;
const LINE_END = /[\n\r\u2028\u2029]/;
const SPACE = /\s/;

/** Where `\s*\)` ends from `i`, or -1. */
function closeAt(text, i) {
  let j = i;
  while (j < text.length && SPACE.test(text[j])) j++;
  return text[j] === ')' ? j + 1 : -1;
}

/** The raw body of a quoted URL opening at `i` (on the quote), or null when it never closes the old regex's way. */
function quotedBody(text, i) {
  const q = text[i];
  let j = i + 1;
  let nq = -1;
  for (;;) {
    // The next quote is searched again only once the scan has passed it: a run of escapes must not rescan to a far quote each time.
    if (nq < j) nq = text.indexOf(q, j);
    const bs = text.indexOf('\\', j);
    if (nq < 0) return null;
    if (bs < 0 || nq < bs) return closeAt(text, nq + 1) >= 0 ? text.slice(i + 1, nq) : null;
    // A backslash escapes the next character, but not a line end (the regex's `.`).
    if (bs + 1 >= text.length || LINE_END.test(text[bs + 1])) return null;
    j = bs + 2;
  }
}

/** The raw body of a bare URL starting at `i`: up to the first `)` or space, then `\s*\)`. */
function bareBody(text, i) {
  let j = i;
  while (j < text.length && text[j] !== ')' && !SPACE.test(text[j])) j++;
  return closeAt(text, j) >= 0 ? text.slice(i, j) : null;
}

/** @returns {string|null} the first `url()` target in `text`, unescaped, or null */
function firstCssUrl(text) {
  const src = String(text ?? '');
  URL_OPEN.lastIndex = 0;
  for (let m = URL_OPEN.exec(src); m; m = URL_OPEN.exec(src)) {
    let i = m.index + m[0].length;
    while (i < src.length && SPACE.test(src[i])) i++;
    let raw = null;
    if (src[i] === '"' || src[i] === "'") raw = quotedBody(src, i);
    if (raw === null) raw = bareBody(src, i);
    if (raw !== null) return raw ? raw.replace(/\\(.)/g, '$1') : null;
    URL_OPEN.lastIndex = m.index + 1;
  }
  return null;
}

module.exports = { firstCssUrl };
