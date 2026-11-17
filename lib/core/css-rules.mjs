/**
 * lib/core/css-rules.mjs — the stylesheet readers on the CSS tokenizer (Segno P5): what reads a sheet's structure or
 * rewrites it, rather than a value's tokens.
 *
 *   cssRules        a sheet's blocks and their declarations: the conformance contract's physical-property count
 *                   (lib/conformance/kinds/component.contract.js), the rail-paint selector read (lib/components/
 *                   surfaces.js) and the slide camera's @font-face reads (lib/core/slide-camera.mjs)
 *   cssImports      each `@import` and its target: the `--css` flattener (lib/theme/chain.mjs)
 *   rewriteCssUrls  a sheet with its url() addresses replaced: the Studio's theme and snapshot loaders
 *   cssCommaParts   a value split at its top-level commas: the PDF writer (lib/core/pdf-compose/read-slide.mjs)
 *
 * They live apart from lib/core/css-tokens.mjs on purpose. The engine and the preview runtime `require()` the
 * tokenizer for `cssUrls` and `eachCssToken`, and a required ES module comes whole, so every reader in that file ships
 * in both self-contained bundles whether they call it or not: these four cost each about 0.8KB gzipped they never used
 * (measured 2026-11-17). Vite tree-shakes the docs site's imports either way. This file may import, because nothing a
 * Playwright spec loads requires it.
 */

import { cssStringValue, cssTokens, cssUnescape, cssUrls, eachCssToken, isTrivia } from './css-tokens.mjs';

/**
 * Every block of a sheet with its prelude and its declarations, read as CSS Syntax 3 §5 reads them (simplified to what
 * the readers ask). A block is `prelude { … }`: a style rule (`a, b { … }`) or an at-rule's (`@media x { … }`), at any
 * depth, in source order (an outer block before the blocks inside it). A `{` inside a string, a comment, a `(…)` or a
 * `[…]` opens nothing.
 *
 *   at          the at-keyword's decoded name, lowercased (`font-face`, `media`), or '' for a style rule
 *   from, to    the prelude: from just past the previous `{`, `}` or `;` at this depth to the `{`, with its leading and
 *               trailing whitespace and comments left out
 *   open        the `{`
 *   close       the `}` that ends the block, or the end of the text when none does (CSS closes it there)
 *   depth       0 for a top-level block
 *   decls       the declarations directly in the block (not in a block inside it): `name: value;`. `name` is decoded,
 *               and lowercased unless it is a custom property (`--Q` stays `--Q`); `valueFrom`/`valueTo` span the value
 *               without the whitespace and comments around it and without `!important`, which sets `important`
 * @param {string} css
 * @returns {Array<{ at: string, from: number, to: number, open: number, close: number, depth: number,
 *   decls: Array<{ name: string, from: number, valueFrom: number, valueTo: number, to: number, important: boolean }> }>}
 */
export function cssRules(css) {
  const s = String(css ?? '');
  const toks = cssTokens(s);
  const rules = [];
  // The open blocks, innermost last, and the `(` / `[` blocks open inside the innermost one, as the closers they wait for.
  const stack = [];
  const nest = [];
  // Where the current item (a prelude or a declaration) starts, as a token index.
  let item = 0;
  const significant = (a, b) => {
    while (a < b && isTrivia(toks[a].type)) a++;
    while (b > a && isTrivia(toks[b - 1].type)) b--;
    return [a, b];
  };
  const declOf = (a, b) => {
    [a, b] = significant(a, b);
    if (a >= b || toks[a].type !== 'ident') return null;
    let c = a + 1;
    while (c < b && isTrivia(toks[c].type)) c++;
    if (c >= b || toks[c].type !== ':') return null;
    const raw = cssUnescape(s.slice(toks[a].from, toks[a].to));
    let [v0, v1] = significant(c + 1, b);
    let valueTo = v0 < v1 ? toks[v1 - 1].to : toks[c].to;
    let important = false;
    // `!important` at the end: the ident `important` (any case), after an `other` run that ends in `!`.
    if (v1 - v0 >= 2 && toks[v1 - 1].type === 'ident' && cssUnescape(s.slice(toks[v1 - 1].from, toks[v1 - 1].to)).toLowerCase() === 'important') {
      let k = v1 - 2;
      while (k > v0 && isTrivia(toks[k].type)) k--;
      if (toks[k].type === 'other' && s.charCodeAt(toks[k].to - 1) === 33) {
        important = true;
        // The `!` may end a longer run (`50%!`): the value keeps the run's head, or ends at the last token before it.
        const bang = toks[k].to - 1;
        if (bang > toks[k].from) valueTo = bang;
        else {
          [v0, v1] = significant(v0, k);
          valueTo = v0 < v1 ? toks[v1 - 1].to : toks[c].to;
        }
      }
    }
    const valueFrom = v0 < v1 ? toks[v0].from : toks[c].to;
    return { name: raw.startsWith('--') ? raw : raw.toLowerCase(), from: toks[a].from, valueFrom, valueTo: Math.max(valueFrom, valueTo), to: toks[b - 1].to, important };
  };
  const endItem = (k) => {
    const block = stack[stack.length - 1];
    if (block) {
      const d = declOf(item, k);
      if (d) block.decls.push(d);
    }
    item = k + 1;
  };
  for (let k = 0; k < toks.length; k++) {
    const { type } = toks[k];
    // A `(` or `[` block closes only at its own closer, and any other closer inside it is a token; a `{` inside one opens a
    // nested block of its own, which is not a rule (CSS Syntax 3 §5.4.8).
    if (type === '(' || type === 'function') nest.push(')');
    else if (type === '[') nest.push(']');
    else if (type === '{' && nest.length) nest.push('}');
    else if (nest.length && type === nest[nest.length - 1]) nest.pop();
    else if (nest.length) continue;
    if (nest.length || type === ')' || type === ']') continue;
    if (type === '{') {
      const [a, b] = significant(item, k);
      const at = a < b && toks[a].type === 'at' ? cssUnescape(s.slice(toks[a].from + 1, toks[a].to)).toLowerCase() : '';
      const rule = { at, from: a < b ? toks[a].from : toks[k].from, to: a < b ? toks[b - 1].to : toks[k].from, open: toks[k].from, close: s.length, depth: stack.length, decls: [] };
      rules.push(rule);
      stack.push({ rule, decls: rule.decls });
      item = k + 1;
    } else if (type === '}') {
      if (!stack.length) {
        item = k + 1;
        continue;
      }
      endItem(k);
      stack.pop().rule.close = toks[k].from;
    } else if (type === ';') endItem(k);
  }
  if (stack.length) endItem(toks.length);
  return rules;
}

/**
 * Each `@import` of a sheet, with the token after it. An `@import` inside a string or a comment is not one; the
 * at-keyword's name is decoded and matched case-insensitively (`@IMPORT`, `@imp\6frt `), as CSS reads it. What a caller
 * accepts as a theme name stays with the caller: the engine's ThemeStore and the `--css` flattener resolve into
 * different domains and read different widths (lib/theme/chain.mjs says why they are not unified).
 *
 *   target   the first token after the whitespace and comments: `{ type, value, closed }`. `value` is a string's
 *            decoded value (`closed` false for a bad string), an ident's decoded name, or the raw text of any other
 *            token; null when the sheet ends first
 *   from     the `@`
 *   to       past the target, the whitespace and comments after it, and one `;` if it follows: the span ThemeStore
 *            splices a resolved theme into
 * @param {string} css
 * @returns {Array<{ from: number, to: number, target: null | { type: string, value: string, closed: boolean } }>}
 */
export function cssImports(css) {
  const s = String(css ?? '');
  if (!s.includes('@')) return [];
  const toks = cssTokens(s);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type !== 'at' || cssUnescape(s.slice(t.from + 1, t.to)).toLowerCase() !== 'import') continue;
    let j = i + 1;
    while (j < toks.length && isTrivia(toks[j].type)) j++;
    const tok = toks[j];
    if (!tok) {
      out.push({ from: t.from, to: toks[toks.length - 1].to, target: null });
      break;
    }
    let target;
    if (tok.type === 'string') target = { type: 'string', ...cssStringValue(s, tok.from, tok.to) };
    else if (tok.type === 'ident') target = { type: 'ident', value: cssUnescape(s.slice(tok.from, tok.to)), closed: true };
    else target = { type: tok.type, value: s.slice(tok.from, tok.to), closed: true };
    let k = j + 1;
    while (k < toks.length && isTrivia(toks[k].type)) k++;
    const to = toks[k]?.type === ';' ? toks[k].to : toks[k - 1].to;
    out.push({ from: t.from, to, target });
    i = j;
  }
  return out;
}

/**
 * `css` with the address of each `url(…)` replaced where `fn(raw, url)` returns a string: `raw` is the address as written
 * (`url.rawFrom` to `url.rawTo`), `url` is the `cssUrls` record. Everything else, the quotes and whitespace around an
 * address included, comes back byte for byte; a `url(` inside a comment or a string is left alone.
 * @param {string} css
 * @param {(raw: string, url: { value: string, quoted: boolean }) => (string | undefined)} fn
 * @returns {string}
 */
export function rewriteCssUrls(css, fn) {
  const s = String(css ?? '');
  let out = '';
  let at = 0;
  for (const u of cssUrls(s)) {
    const next = fn(s.slice(u.rawFrom, u.rawTo), u);
    if (typeof next !== 'string') continue;
    out += s.slice(at, u.rawFrom) + next;
    at = u.rawTo;
  }
  return at ? out + s.slice(at) : s;
}

/**
 * `css[from, to)` split at its top-level commas (a comma inside `(…)`, `[…]`, a string or a comment does not split): the
 * layers of a `background-image`, the arguments of a call, the selectors of a list. Each part is `[from, to)` in the host
 * text, untrimmed.
 * @param {string} css
 * @param {number} [from]
 * @param {number} [to]
 * @returns {Array<[number, number]>}
 */
export function cssCommaParts(css, from = 0, to) {
  const s = String(css ?? '');
  const end = to === undefined ? s.length : to;
  const parts = [];
  let depth = 0;
  let at = from;
  eachCssToken(s, (type, a, b) => {
    if (type === '(' || type === '[' || type === 'function') depth++;
    else if ((type === ')' || type === ']') && depth > 0) depth--;
    else if (type === ',' && depth === 0) {
      parts.push([at, a]);
      at = b;
    }
  }, from, end);
  parts.push([at, end]);
  return parts;
}
