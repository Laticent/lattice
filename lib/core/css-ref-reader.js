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
 * NOT YET WIRED INTO remote-ref.js, and the reason is a number: the generated parser adds about 2.6 KB
 * gzip to the Studio's eager JS, which the route-budget ledger caps (docs/scripts/check-route-budget.mjs;
 * the studio ceiling was 546.3 KB and this takes it to 548.5 KB). Raising a ceiling is the owner's call.
 * The decision note's "R2: the wiring" says what the switch is and what it costs.
 */
const isCssSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
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
function readCss(cssParser, CSS_KIND, { cssEscape, cssString }, css) {
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
    for (let k = 0; k < top; k = buf[k + 3]) {
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
        open(c === 123 && pendingFace ? 'face' : s[from]);
        if (c === 123) pendingFace = false;
      } else if (kind === CSS_KIND.close) {
        // A closer ends the innermost block only when it matches it; any other is a token inside.
        const owner = stack[stack.length - 1];
        if (owner && CSS_CLOSER[owner === 'face' ? '{' : owner] === s[from]) {
          stack.pop();
          if (owner === 'face') faces--;
          else if (owner === '[') brackets--;
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
      push(from, end, 'url', decode(afterName, closer ? closer[1] : end).trim());
      pos = end;
    }
  }
  // The tape and the input string are module state of the generated parser. A big tape is let go on the
  // next parse; parsing nothing now lets it go at once instead of holding megabytes between calls.
  cssParser.parse('');
  return out;
}

/**
 * A `cssRefSpans` over `parser`, a parser generated from css-ref-grammar.js, with remote-ref.js's escape
 * and string readers handed in (this file cannot require remote-ref.js, which will require it). Throws at once when the
 * parser lacks a node kind the reader needs: a kind renamed in the grammar would be `undefined` here
 * and its tokens would be dropped without a sound (a `url(` the browser fetches, unseen).
 */
function makeCssRefSpans(parser, { cssEscape, cssString }) {
  const kinds = Object.fromEntries(parser.parse('').tree.kinds.map((k, i) => [k, i]));
  for (const k of NEEDED) if (!Number.isInteger(kinds[k])) throw new Error(`css-ref-grammar.js has no node kind "${k}", which the CSS reference reader needs`);
  const helpers = { cssEscape, cssString };
  return (css) => readCss(parser, kinds, helpers, css);
}

module.exports = { makeCssRefSpans, NEEDED };
