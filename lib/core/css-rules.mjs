/**
 * lib/core/css-rules.mjs — a stylesheet's blocks and their declarations, read on the CSS tokenizer (Segno P5).
 *
 * `cssRules(css)` is the one rules reader for code that needs a sheet's structure rather than its tokens: the
 * conformance contract's physical-property count (lib/conformance/kinds/component.contract.js) and the rail-paint
 * selector read (lib/components/surfaces.js). It lives apart from lib/core/css-tokens.js on purpose: the tokenizer
 * ships in the browser's first load (the preview sanitizer reads CSS through it), and this reader is build and audit
 * tooling, so it costs no page a byte. It may import, because nothing a Playwright spec loads requires it.
 */

import { cssTokens, cssUnescape, isTrivia } from './css-tokens.js';

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
