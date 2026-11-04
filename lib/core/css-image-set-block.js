/**
 * css-image-set-block — names the function a `(` opens, for css-ref-reader.js's `imageSet` fact.
 *
 * The CLI's HTML export (lib/export/html-player.js), the Reading view's prune and the theme, layout and package gates
 * (lib/core/css-scan.js) ask `cssRefSpans` which strings sit inside `image-set()`, where a bare string is an address. The
 * reader keeps the block stack; this file answers, for each `(`, whether it opens `image-set(` or `type(`. It is its own
 * file so the Studio's startup, which never asks, does not load it. (Moved from lib/export/ in the security spine's P2.) It requires
 * nothing (the docs dev server rule css-ref-reader.js states), and `cssEscape` is handed in.
 */
const isCssSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

/**
 * Which function does the `(` at `at` open, of the two the `imageSet` fact of css-ref-reader.js needs: 'iset' for `image-set(` or
 * `-webkit-image-set(`, 'type' for `type(` (whose string is a MIME type, not an address), else '('. The name is the identifier that ends
 * at the `(`, and it lies in the stretch the tape skipped, `s[gap, at)`: names, plain characters and comments,
 * never a kept token. That stretch is read forward once, escapes decoded (`image-s\65t(` is the function), and
 * each stretch is read at most once, so the whole text is read in linear time.
 */
function imageSetBlock(s, gap, at, cssEscape) {
  const prev = s.charCodeAt(at - 1);
  // `image-set` ends in `t` and `type` in `e` (a hex digit), or the name ends in an escape (a hex digit, or the one
  // whitespace a hex escape eats).
  if (!(prev === 116 || prev === 84 || isCssSpace(s[at - 1]) || /[0-9a-fA-F]/.test(s[at - 1] ?? ''))) return '(';
  let name = '';
  for (let k = gap; k < at; ) {
    const c = s.charCodeAt(k);
    if (c === 47 && s.charCodeAt(k + 1) === 42) {
      const end = s.indexOf('*/', k + 2);
      k = end < 0 || end + 2 > at ? at : end + 2;
      name = '';
    } else if (c === 92 && k + 1 < at && !/[\n\r\f]/.test(s[k + 1])) {
      const [d, next] = cssEscape(s, k);
      name = name.length < 18 ? name + d : '\u0000'.repeat(19);
      k = next;
    } else if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 45 || c === 95 || c >= 128 || (c === 46 && /[0-9]/.test(s[k - 1] ?? '') && /[0-9]/.test(s[k + 1] ?? ''))) {
      // A name character, or the `.` of a number (`1.5image-set(` is a dimension and a `(`, not the function).
      name = name.length < 18 ? name + s[k] : '\u0000'.repeat(19);
      k++;
    } else {
      name = '';
      k++;
    }
  }
  name = name.toLowerCase();
  return name === 'image-set' || name === '-webkit-image-set' ? 'iset' : name === 'type' ? 'type' : '(';
}

module.exports = { imageSetBlock };
