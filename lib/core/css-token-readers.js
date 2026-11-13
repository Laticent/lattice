/**
 * css-token-readers — CSS Syntax 3's escape and string readers, shared by the CSS reference reader.
 *
 * `cssEscape` decodes one escape (`\75 ` is `u`) and `cssString` one string token, to the letter of the spec:
 * any whitespace after a hex escape, CRLF as one newline, a bad string at a newline. css-ref-reader.js and
 * remote-ref.js read with them. They moved here from remote-ref.js at Segno R4 (the narrator), so the narrator
 * reads CSS references without loading the HTML scanner.
 *
 * Not to be confused with css-escapes.js, which the ENGINE imports: its `decodeCssEscapes` normalizes a whole
 * text for the safety scanner's keyword match and keeps a map back to the source. These two stay out of it so
 * the engine's bundles do not carry them.
 */

// CSS reads a carriage return, a form feed and CRLF as a newline (CSS Syntax 3 §3.3, input
// preprocessing). A scanner that ends a string only at `\n` reads `"x<FF>}p{background:url(…)}"`
// as one harmless string, where the browser ends the string at the form feed and fetches the url.
const isCssNewline = (c) => c === '\n' || c === '\r' || c === '\f';
const isCssSpace = (c) => c === ' ' || c === '\t' || isCssNewline(c);
/** The length of the newline at `s[i]`: CRLF is one newline of two characters. */
const newlineLength = (s, i) => (s[i] === '\r' && s[i + 1] === '\n' ? 2 : 1);

/** One CSS escape at `s[i]` (a backslash): `[decoded, nextIndex]`. `\75 ` is `u`, `\:` is `:`. */
function cssEscape(s, i) {
  const hex = /^[0-9a-fA-F]{1,6}/.exec(s.slice(i + 1, i + 7));
  if (hex) {
    let next = i + 1 + hex[0].length;
    // One whitespace after the digits belongs to the escape, and CRLF counts as one.
    if (isCssSpace(s[next] ?? '')) next += isCssNewline(s[next]) ? newlineLength(s, next) : 1;
    const cp = Number.parseInt(hex[0], 16);
    return [cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff ? '�' : String.fromCodePoint(cp), next];
  }
  if (i + 1 >= s.length) return ['�', i + 1];
  return [s[i + 1], i + 2];
}

/**
 * The CSS string token whose quote is at `s[at]`: `[value, nextIndex]`, escapes decoded. A
 * newline (any of the three, above) ends a BAD string and is read again, as whitespace: the
 * browser goes on tokenizing what follows it, so a scanner must too. A backslash before a
 * newline continues the line.
 * @param {string} s
 * @param {number} at
 * @returns {[string, number]}
 */
function cssString(s, at) {
  const q = s[at];
  let v = '';
  let j = at + 1;
  while (j < s.length && s[j] !== q && !isCssNewline(s[j])) {
    if (s[j] !== '\\') {
      // The run up to the next quote, backslash or newline, copied whole: a `data:` URI in a string is megabytes, and a
      // character at a time cost about 0.15 s a read (PR #3153).
      const from = j;
      while (j < s.length && s[j] !== q && s[j] !== '\\' && !isCssNewline(s[j])) j++;
      v += s.slice(from, j);
    } else if (j + 1 >= s.length) j++; // a backslash at the end of the input adds nothing to a string
    else if (isCssNewline(s[j + 1])) j += 1 + newlineLength(s, j + 1);
    else {
      const [d, n] = cssEscape(s, j);
      v += d;
      j = n;
    }
  }
  return [v, s[j] === q ? j + 1 : j];
}

module.exports = { cssEscape, cssString, isCssNewline, isCssSpace, newlineLength };
