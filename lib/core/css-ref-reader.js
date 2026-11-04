/**
 * css-ref-reader — `cssRefSpans` over a parser generated from lib/core/css-ref-grammar.js.
 *
 * The reader half of Segno R2 (engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md
 * §"R2 landed"). The generated parser (css-ref.generated.js) tokenizes; this walks its tape and keeps
 * the block stack (`@font-face` only where a rule can start, `[…]` never fetching, a closer that does
 * not match the innermost block being an ordinary token), which is state, not syntax. It returns the
 * spans `cssRefSpans` in remote-ref.js returns, field for field: test/unit/core/css-ref-spans-
 * differential.test.js holds it to the frozen tokenizer in tools/segno-legacy/css-ref-spans.js.
 *
 * remote-ref.js builds `cssRefSpans` from this reader, the generated parser and css-token-readers.js (the owner raised
 * the Studio's route-budget ceiling for the 2.7 KB it costs: D1 A on #2980), and the narrator
 * (lib/transformers/prose-projection.mjs) builds its own from the same three, so it reads CSS without the HTML scanner.
 * This file REQUIRES NOTHING, and must not: the docs dev server loads a CommonJS lib/ file only when every require in
 * it names a require-free sibling (docs/src/plugins/vite-cjs-lib-dev.mjs), so the parser and the escape readers are
 * handed in.
 */
const isCssSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
/** `v` without CSS whitespace at either end, in one pass (a regex `\s+$` backtracks on a long inner run). */
const cssTrim = (v) => {
  let a = 0;
  let b = v.length;
  while (a < b && isCssSpace(v[a])) a++;
  while (b > a && isCssSpace(v[b - 1])) b--;
  return a === 0 && b === v.length ? v : v.slice(a, b);
};
const CSS_CLOSER = { '(': ')', '[': ']', '{': '}' };
/** The node kinds the reader tests by number. */
const NEEDED = ['url', 'str', 'at', 'open', 'close', 'body', 'rparen', 'unq'];

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
function readCss(cssParser, CSS_KIND, { cssEscape, cssString }, imageSet, css) {
  const s = String(css ?? '');
  const n = s.length;
  const out = [];
  // The open blocks, innermost last; a `{` an `@font-face` rule opens is pushed as 'face'.
  const stack = [];
  let faces = 0;
  let brackets = 0;
  let isets = 0; // open `image-set(` blocks, at any depth (with the `imageSet` option)
  let pendingFace = false;
  const open = (b) => {
    stack.push(b);
    if (b === 'face') faces++;
    else if (b === '[') brackets++;
    else if (b === 'iset') isets++;
  };
  const push = imageSet
    ? (from, to, kind, value) => out.push({ from, to, kind, value, fontFace: faces > 0, selector: brackets > 0, imageSet: isets > 0 && stack[stack.length - 1] !== 'type' })
    : (from, to, kind, value) => out.push({ from, to, kind, value, fontFace: faces > 0, selector: brackets > 0 });
  /** `s[a, b)` with its escapes decoded. */
  const decode = (a, b) => {
    let v = '';
    for (let k = a; k < b; ) {
      if (s.charCodeAt(k) === 92) {
        const [d, next] = cssEscape(s, k);
        v += d;
        k = next;
      } else v += s[k++];
    }
    return v;
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
  const read = (rule, from) => {
    const r = cssParser.parse(s, rule, from);
    // The grammar matches every string, so a refusal is a defect in the generated parser.
    if (!r.ok) throw new Error(`CSS reference parser refused the input at ${r.error.at}: expected ${r.error.expected}`);
    return r.tree;
  };
  // `top` reads tokens until a `url(` stops it; `urlBody` reads the one token after it; then `top`
  // goes on. A tree is valid until the next parse, so each is read out before the next call.
  for (let pos = 0; ; ) {
    const { buf, top } = read('top', pos);
    let url = -1;
    let gap = pos; // where the stretch the tape skipped before this node starts
    for (let k = 0; k < top; gap = buf[k + 2], k = buf[k + 3]) {
      const kind = buf[k];
      const from = buf[k + 1];
      const to = buf[k + 2];
      if (kind === CSS_KIND.str) push(from, to, 'string', cssString(s, from)[0]);
      else if (kind === CSS_KIND.at) {
        // An `@font-face` rule only where a rule can start (the top level, or a block's body) and
        // only with its block right after the name: any prelude makes the browser drop the rule.
        // `:is(@font-face, p){…}` is a selector, and its block is not a font block.
        const owner = stack[stack.length - 1];
        if (decode(from + 1, to).toLowerCase() === 'font-face' && (owner === undefined || owner === '{' || owner === 'face') && nextSignificant(to) === '{') pendingFace = true;
      } else if (kind === CSS_KIND.open) {
        const c = s.charCodeAt(from);
        open(c === 123 && pendingFace ? 'face' : c === 40 && imageSet ? imageSet(s, gap, from, cssEscape) : s[from]);
        if (c === 123) pendingFace = false;
      } else if (kind === CSS_KIND.close) {
        // A closer ends the innermost block only when it matches it; any other is a token inside.
        const owner = stack[stack.length - 1];
        if (owner && CSS_CLOSER[owner === 'face' ? '{' : owner === 'iset' || owner === 'type' ? '(' : owner] === s[from]) {
          stack.pop();
          if (owner === 'face') faces--;
          else if (owner === '[') brackets--;
          else if (owner === 'iset') isets--;
        }
        if (s.charCodeAt(from) === 125) pendingFace = false;
      } else if (kind === CSS_KIND.url) url = k;
    }
    if (url < 0) break;
    const from = buf[url + 1];
    const afterName = buf[url + 2];
    // Copy before the next parse overwrites the tape.
    const body = read('urlBody', afterName);
    // The body node comes first on the tape and its children after it, in order.
    const parts = [];
    for (let k = 0; k < body.top; k += 4) parts.push([body.buf[k], body.buf[k + 1], body.buf[k + 2]]);
    const [, , bodyEnd] = parts[0];
    const str = parts.find(([kind]) => kind === CSS_KIND.str);
    const closer = parts.find(([kind]) => kind === CSS_KIND.rparen);
    if (str) {
      // `url("…")`: one span for the whole function when it closes right after the string, so
      // the rewrite swaps `url("…")` for the hatch; otherwise the string alone, and the `(`
      // stays open as the browser keeps it.
      const v = cssString(s, str[1])[0];
      if (closer) {
        push(from, closer[2], 'url', v);
        pos = closer[2];
      } else {
        open('(');
        push(str[1], str[2], 'string', v);
        pos = str[2];
      }
    } else {
      // An unquoted url token: everything to the `)`, escapes decoded.
      const unq = parts.find(([kind]) => kind === CSS_KIND.unq);
      const end = closer ? closer[2] : unq ? unq[2] : bodyEnd;
      // Trimmed of CSS whitespace only: a no-break space is part of the address (JavaScript's `trim` would drop it).
      push(from, end, 'url', cssTrim(decode(afterName, closer ? closer[1] : end)));
      pos = end;
    }
  }
  // The tape and the input string are module state of the generated parser. A big tape is let go on the
  // next parse; parsing nothing now lets it go at once instead of holding megabytes between calls.
  cssParser.parse('');
  return out;
}

/**
 * A `cssRefSpans` over `parser`, a parser generated from css-ref-grammar.js, with the escape and string readers
 * handed in (css-token-readers.js's, or a test's mutant). Throws at once when the
 * parser lacks a node kind the reader needs: a kind renamed in the grammar would be `undefined` here
 * and its tokens would be dropped without a sound (a `url(` the browser fetches, unseen).
 *
 * With `{ imageSet: blockOf }` each span also carries `imageSet`: it sits inside an `image-set()` or
 * `-webkit-image-set()` at any depth (a `var()` fallback there is substituted and fetched), and not directly in a
 * `type()`, whose string is a MIME type. There a bare string is an address the browser fetches. `blockOf` is
 * css-image-set-block.js's `imageSetBlock`, which names the function each `(` opens; it lives in its own file so the
 * Studio, which never asks for the fact, does not ship it (the docs site's route budget). The CLI's
 * HTML export asks for it (lib/export/html-player.js); every other caller gets the spans without it, so the
 * frozen tokenizer's differential still compares them field for field.
 */
function makeCssRefSpans(parser, { cssEscape, cssString }, { imageSet = null } = {}) {
  const kinds = Object.fromEntries(parser.parse('').tree.kinds.map((k, i) => [k, i]));
  for (const k of NEEDED) if (!Number.isInteger(kinds[k])) throw new Error(`css-ref-grammar.js has no node kind "${k}", which the CSS reference reader needs`);
  const helpers = { cssEscape, cssString };
  return (css) => readCss(parser, kinds, helpers, imageSet, css);
}

// A `url(…)` token as the CSS tokenizer reads a VALID one: a quoted string, or a bare address with no
// quote, paren, CSS whitespace (not JavaScript's `\s`: a no-break space is an ordinary character there) inside it or nonprintable character (an escape is fine, and a hex escape takes one
// whitespace after its digits, so `url(k\29 .png)` is valid). The digits are matched ATOMICALLY (a lookahead
// takes the longest run, a backreference consumes exactly it): as `[0-9a-fA-F]{1,6}`, a run of escapes could
// split six ways each against the plain-character branch, and a 10-escape bad url took seconds to refuse. Anything else is a
// bad-url token, which the browser never fetches; `cssRefSpans` reports it anyway, since a refusal
// errs that way, and embedding it would show a picture the preview never did.
// biome-ignore lint/suspicious/noControlCharactersInRegex: the CSS tokenizer's nonprintable code points are what makes a bare url() bad
const VALID_URL = /^[^(]*\([\t\n\f\r ]*(?:"(?:[^"\\\n\r\f]|\\[\s\S])*"|'(?:[^'\\\n\r\f]|\\[\s\S])*'|(?:[^"'()\\\t\n\f\r \x00-\x08\x0b\x0e-\x1f\x7f]|\\(?=([0-9a-fA-F]{1,6}))\1(?:\r\n|[\t\n\f\r ])?|\\[^\n\r\f0-9a-fA-F])*)[\t\n\f\r ]*\)?$/;
/** Is `text`, a span `cssRefSpans` reported as `kind: 'url'`, a valid url token (see `VALID_URL`)? */
const isValidUrlToken = (text) => VALID_URL.test(text);

module.exports = { makeCssRefSpans, isValidUrlToken, NEEDED };
