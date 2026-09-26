/**
 * Closed HTML comments, read the way `/<!--[\s\S]*?-->/g` reads them — in linear time.
 *
 * That regex, alone or as the first arm of an alternation, is QUADRATIC on untrusted
 * input: at every `<!--` that never closes it scans to the end of the text before giving
 * up, then the search resumes one character later and does it again. Measured before
 * this module: one 250 KB line of `<!--` took 148 s to render and 89 s to lint, and
 * 280 KB of `a <!--` lines 3.7 s to lint. Both run on the browser's main thread in the
 * Studio (HARD RULE #22 — a pasted deck is untrusted).
 *
 * The fix is one fact: the first `-->` at or after a position answers every later opener
 * up to it, and "none" answers every later opener at all. So the closer is found once and
 * reused while the scan is behind it. Every answer is the one the regex gives — both
 * helpers are fuzzed against it in `test/unit/core/closed-comments.test.js`.
 *
 * Pure and fs-free: `lib/authoring/lint-core.js` ships to the browser and reads it.
 */

/**
 * A cursor over one document's comment closers. `endOf(at)` is one past the `-->` that
 * closes the `<!--` at `at`, or -1 when it never closes.
 *
 * `at` must not decrease between calls — the cursor only moves forward, which is what
 * makes it linear. A regex walk (`re.exec` in a loop) and a left-to-right scan both
 * satisfy that.
 * @param {string} src
 * @returns {(at: number) => number}
 */
function commentCloser(src) {
  let close = -2; // next `-->` at or after the last query; -2 unknown, -1 none left
  return (at) => {
    if (close !== -1 && close < at + 4) close = src.indexOf('-->', at + 4);
    return close < 0 ? -1 : close + 3;
  };
}

/**
 * `String(text).replace(/<!--[\s\S]*?-->/g, fn)`. `fn` gets each comment, delimiters
 * included, and its return value is inserted literally (no `$` patterns).
 * @param {string} text
 * @param {(comment: string) => string} fn
 * @returns {string}
 */
function replaceClosedComments(text, fn) {
  const src = String(text);
  const endOf = commentCloser(src);
  let out = '';
  let at = 0;
  for (let i = src.indexOf('<!--'); i >= 0; i = src.indexOf('<!--', at)) {
    const end = endOf(i);
    if (end < 0) break; // no later opener can close either
    out += src.slice(at, i) + fn(src.slice(i, end));
    at = end;
  }
  return out + src.slice(at);
}

/**
 * The closed comments of `text` in order, as `text.matchAll(/<!--[\s\S]*?-->/g)` yields
 * them: `{ 0: comment, index }`.
 * @param {string} text
 */
function* closedComments(text) {
  const src = String(text);
  const endOf = commentCloser(src);
  for (let i = src.indexOf('<!--'); i >= 0;) {
    const end = endOf(i);
    if (end < 0) return;
    yield { 0: src.slice(i, end), index: i };
    i = src.indexOf('<!--', end);
  }
}

module.exports = { commentCloser, replaceClosedComments, closedComments };
