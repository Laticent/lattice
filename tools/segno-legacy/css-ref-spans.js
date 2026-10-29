/**
 * css-ref-spans.js — `cssRefSpans` as it was before Segno R2 replaced its tokenizer with a generated
 * grammar (lib/core/css-ref-grammar.js).
 *
 * Frozen verbatim from lib/core/remote-ref.js at 242de4a (the helpers it reads are copied beside it).
 * It is the ORACLE for test/unit/core/css-ref-spans-differential.test.js and for the corpus check
 * (tools/check-css-ref-spans.mjs): the grammar-driven `cssRefSpans` must return these spans, field
 * for field, on every input. Nothing in lib/ may read it. Do not fix bugs here: a fix would change
 * what the differential measures. Delete it when nobody reads it.
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
    if (s[j] !== '\\') v += s[j++];
    else if (j + 1 >= s.length) j++; // a backslash at the end of the input adds nothing to a string
    else if (isCssNewline(s[j + 1])) j += 1 + newlineLength(s, j + 1);
    else {
      const [d, n] = cssEscape(s, j);
      v += d;
      j = n;
    }
  }
  return [v, s[j] === q ? j + 1 : j];
}

// The characters a CSS name is read from, by code: a letter, a digit, `_`, `-`, or a backslash
// that starts an escape. (Non-ASCII also continues a name in CSS; reading it as a boundary only
// splits a name, which can make the scanner see a `url(` the browser does not: the safe side.)
const isNameCode = (c) => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95 || c === 45 || c === 92;
const isNameStartCode = (c) => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c === 45 || c === 92;
const CSS_CLOSER = { '(': ')', '[': ']', '{': '}' };

/**
 * Every place a piece of CSS names a target, as spans of the source: each string token, and
 * each `url(…)`, unquoted or holding one string (then the span is the whole function). Read
 * with a tokenizer that follows CSS Syntax 3 where a fetch depends on it: newlines (above),
 * escapes (`u\72l(` is `url(`), comments, strings, and the stack of `(` `[` `{` blocks, so a
 * `}` inside a string or a `(` block does not end a rule.
 *   `kind`      'url' for a `url(…)`, 'string' for a bare string token
 *   `value`     the target, escapes decoded (a `url(…)` target trimmed)
 *   `fontFace`  inside an `@font-face` block (a font source, not a picture)
 *   `selector`  inside a `[…]` block: an attribute selector, which never fetches
 * @param {string} css
 * @returns {Array<{ from: number, to: number, kind: 'url'|'string', value: string, fontFace: boolean, selector: boolean }>}
 */
function cssRefSpans(css) {
  const s = String(css ?? '');
  const n = s.length;
  const out = [];
  // The open blocks, innermost last; a `{` an `@font-face` rule opens is pushed as 'face'.
  const stack = [];
  let faces = 0;
  let brackets = 0;
  let pendingFace = false;
  const open = (b) => {
    stack.push(b);
    if (b === 'face') faces++;
    else if (b === '[') brackets++;
  };
  const push = (from, to, kind, value) => out.push({ from, to, kind, value, fontFace: faces > 0, selector: brackets > 0 });
  const readName = (at) => {
    let j = at;
    let escaped = false;
    while (j < n && isNameCode(s.charCodeAt(j))) {
      if (s.charCodeAt(j) === 92) {
        escaped = true;
        j = cssEscape(s, j)[1];
      } else j++;
    }
    if (!escaped) return [s.slice(at, j), j];
    let name = '';
    for (let k = at; k < j; ) {
      if (s.charCodeAt(k) === 92) {
        const [d, next] = cssEscape(s, k);
        name += d;
        k = next;
      } else name += s[k++];
    }
    return [name, j];
  };
  /** The next character that is not whitespace or inside a comment, from `at`. */
  const nextSignificant = (at) => {
    let k = at;
    for (;;) {
      while (k < n && isCssSpace(s[k])) k++;
      if (s[k] !== '/' || s[k + 1] !== '*') return s[k];
      const end = s.indexOf('*/', k + 2);
      if (end < 0) return undefined;
      k = end + 2;
    }
  };
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 47 && s.charCodeAt(i + 1) === 42) {
      const end = s.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
    } else if (c === 34 || c === 39) {
      const [v, j] = cssString(s, i);
      push(i, j, 'string', v);
      i = j;
    } else if (c === 64) {
      const [name, j] = readName(i + 1);
      // An `@font-face` rule only where a rule can start (the top level, or a block's body) and
      // only with its block right after the name: any prelude makes the browser drop the rule.
      // `:is(@font-face, p){…}` is a selector, and its block is not a font block.
      const top = stack[stack.length - 1];
      if (name.toLowerCase() === 'font-face' && (top === undefined || top === '{' || top === 'face') && nextSignificant(j) === '{') pendingFace = true;
      i = Math.max(j, i + 1);
    } else if (isNameStartCode(c)) {
      const from = i;
      const [name, j] = readName(i);
      i = j;
      if (s.charCodeAt(i) !== 40) continue;
      if (name.length !== 3 || name.toLowerCase() !== 'url') {
        open('(');
        i++;
        continue;
      }
      let k = i + 1;
      while (k < n && isCssSpace(s[k])) k++;
      if (s[k] === '"' || s[k] === "'") {
        // `url("…")`: one span for the whole function when it closes right after the string,
        // so the rewrite swaps `url("…")` for the hatch; otherwise the string alone, and the
        // `(` stays open as the browser keeps it.
        const [v, end] = cssString(s, k);
        let e = end;
        while (e < n && isCssSpace(s[e])) e++;
        if (s[e] === ')') {
          push(from, e + 1, 'url', v);
          i = e + 1;
        } else {
          open('(');
          push(k, end, 'string', v);
          i = end;
        }
        continue;
      }
      // An unquoted url token: everything to the `)`, escapes decoded.
      let v = '';
      i++;
      while (i < n && s.charCodeAt(i) !== 41) {
        if (s.charCodeAt(i) === 92) {
          const [d, next] = cssEscape(s, i);
          v += d;
          i = next;
        } else v += s[i++];
      }
      i = Math.min(i + 1, n);
      push(from, i, 'url', v.trim());
    } else if (c === 40 || c === 91 || c === 123) {
      open(c === 123 && pendingFace ? 'face' : s[i]);
      if (c === 123) pendingFace = false;
      i++;
    } else if (c === 41 || c === 93 || c === 125) {
      // A closer ends the innermost block only when it matches it; any other is a token inside.
      const top = stack[stack.length - 1];
      if (top && CSS_CLOSER[top === 'face' ? '{' : top] === s[i]) {
        stack.pop();
        if (top === 'face') faces--;
        else if (top === '[') brackets--;
      }
      if (c === 125) pendingFace = false;
      i++;
    } else {
      if (c === 59) pendingFace = false;
      i++;
    }
  }
  return out;
}

module.exports = { cssRefSpans, cssEscape, cssString };
