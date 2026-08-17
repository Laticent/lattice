/**
 * Leading-`:is()` distribution — the one rule that keeps a slide-targeting
 * selector scopable by a Marpit-style packer.
 *
 * Marpit (and marp-core, and our own port in lib/engine/css.js) scopes a theme
 * rule by looking at the selector's LEFTMOST compound: a literal leading
 * `section` IS the slide and gets root-replaced (`… > section.foo`); anything
 * else is treated as a slide DESCENDANT and gets prefixed (`… > section <sel>`).
 *
 * Lattice's chart and Form CSS is written dual-surface, so the same rule styles
 * a slide and the docs-site's re-hosted `<figure>`:
 *
 *     :is(section.map, figure.chart-frame) .map-region { … }
 *
 * That head is not a literal `section`, so the packer prefixes the WHOLE thing
 * and produces `… > section :is(section.map, …) .map-region` — "a slide section
 * nested inside a slide section", which cannot exist. The rule silently matches
 * nothing. (This is how `--map-base` went undefined and every map/quadrant/radar
 * fill fell back to SVG's black initial value.)
 *
 * Distributing the arms first fixes it: each arm then scopes by its own leftmost
 * compound — `section.map` as the slide, `figure.chart-frame` as a descendant.
 * It is specificity-safe for this shape because `:is()` already takes the
 * specificity of its most specific arm, and these arms are equal (0,1,1).
 *
 * Three consumers (HARD RULE #1):
 *   1. lib/engine/css.js `packSelector` — distributes per selector while packing,
 *      which is why the OWNED render path was never affected.
 *   2. tools/build-css.js — pipes the assembled bundle through this, so EVERY
 *      stylesheet dist/ ships is already scopable. This is the one that fixes the
 *      manual marp-vscode recipe (themes pointed straight at dist/lattice.css).
 *   3. lib/core/marp-bundle.js — rewrites the stylesheet the Export-to-Marp
 *      bundle ships; now redundant for a current dist, kept for older ones.
 *      Without this pass ~835 rules across the whole chart bucket and the shared
 *      `:is(section, figure)` Form layer are dead in every Marp render (#1256).
 *
 * Only a LEADING `:is()` needs this — a mid-selector `:is()` is already in
 * descendant position and scopes correctly. `:where()` heads are deliberately
 * NOT touched: distributing them would not help (a `:where(section…)` arm is
 * still not a literal leading `section`), and unwrapping them would change the
 * zero specificity they are chosen for.
 */

/** Split a selector LIST on top-level commas only (commas inside ()/[] are kept). */
function splitSelectorList(list) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

/**
 * Split a selector that STARTS with `:is(…)` into its arms plus the remainder.
 * @returns {{arms: string[], rest: string}|null} null when the selector has no
 *   leading `:is()` or its parens are unbalanced (left untouched, never guessed).
 */
function leadingIsArms(sel) {
  if (!sel.startsWith(':is(')) return null;
  let depth = 0;
  let i = 3; // the '(' of ':is('
  for (; i < sel.length; i++) {
    if (sel[i] === '(') depth++;
    else if (sel[i] === ')' && --depth === 0) break;
  }
  if (depth !== 0) return null; // unbalanced — leave untouched
  return { arms: splitSelectorList(sel.slice(4, i)), rest: sel.slice(i + 1) };
}

/** One selector → its distributed form (recursive: an arm may itself lead with `:is()`). */
function distributeSelector(rawSelector) {
  const sel = rawSelector.trim();
  const li = leadingIsArms(sel);
  if (!li) return sel;
  return li.arms.map((arm) => distributeSelector(arm.trim() + li.rest)).join(', ');
}

/**
 * The comment/string walk and its two projections now live in `./css-comments.mjs`, and
 * this file is one of their consumers rather than their owner.
 *
 * WHY THEY MOVED. `lib/theme/chain.mjs` needed the same answer to "what is a comment"
 * and could not have it: it is ESM *and* browser-bundled, so it can reach neither a CJS
 * file's exports nor `createRequire` without breaking the bundle. It therefore kept the
 * naive `replace(/\/\*[\s\S]*?\*\//g, '')` — the exact strip whose failure mode the walk
 * was written to eliminate. Promoting the walk to ESM is what lets both sides share it
 * (HARD RULE #15); the alternative was a second implementation, which is how this repo
 * got two same-named `stripCssComments` esbuild had to rename apart in the first place.
 *
 * `require()` of an `.mjs` is native on the engines this repo pins (>=22.12) and is what
 * keeps the five CJS callers below — check-css-values, build-css, engine/themes,
 * engine/css, marp-bundle — importing from here unchanged.
 */
const { eachCssRun, stripCssComments, maskCssComments } = require('./css-comments.mjs');

/**
 * Split a rule prelude into [leading trivia, selector list]. Trivia is whitespace
 * and COMMENTS, which are not part of any compound — so a rule that follows a doc
 * comment (most of them, in this codebase) still reads as leading-`:is()`, while
 * `.a /* mid *​/ :is(…)` correctly does NOT: its first compound is `.a`.
 */
function splitLeadingTrivia(prelude) {
  let i = 0;
  for (;;) {
    const before = i;
    while (i < prelude.length && /\s/.test(prelude[i])) i += 1;
    if (prelude.startsWith('/*', i)) {
      const close = prelude.indexOf('*/', i + 2);
      i = close < 0 ? prelude.length : close + 2;
    }
    if (i === before) break;
  }
  return [prelude.slice(0, i), prelude.slice(i)];
}

// The longest real prelude in dist/lattice.css is ~4 KB (a long comma list), so
// 64 KB is far above the corpus. The bound is not cosmetic: `distributeSelector`
// copies the selector remainder once per arm, so output is arms × remainder —
// quadratic. A 460 KB crafted head OOMs a 512 MB heap, and the browser-side
// producer runs this over CSS it just fetched. Over the bound, the prelude is
// copied through untouched.
const MAX_PRELUDE = 65536;

/**
 * Rewrite every leading-`:is()` selector in a stylesheet to its distributed form.
 *
 * Text-level on purpose: it must run over the MINIFIED bundle without pulling a
 * CSS parser into a browser-side producer. A rule prelude runs from the previous
 * top-level `{`, `}` or `;` to the `{` that opens a block; an `@` in it means an
 * at-rule prelude, which is left alone, as are declarations and `@keyframes` frame
 * selectors (none can start with `:is(`).
 *
 * Idempotent: a distributed selector has no leading `:is()` left to expand.
 */
function distributeLeadingIs(css) {
  let out = '';
  let prelude = '';
  let atRule = false;
  const flush = () => { out += prelude; prelude = ''; atRule = false; };
  eachCssRun(css, (type, text) => {
    if (type !== 'code') { prelude += text; return; }
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '{') {
        prelude += text.slice(start, i);
        const [trivia, selectors] = splitLeadingTrivia(prelude);
        if (!atRule && selectors.startsWith(':is(') && prelude.length <= MAX_PRELUDE) {
          // `, ` (not `,`) matches how distributeSelector joins its own arms, which
          // is what makes a second pass a byte-for-byte no-op, not whitespace churn.
          out += trivia + splitSelectorList(selectors).map((sel) => distributeSelector(sel)).join(', ');
        } else {
          out += prelude;
        }
        out += '{';
        prelude = '';
        atRule = false;
        start = i + 1;
        continue;
      }
      if (ch === '}' || ch === ';') {
        prelude += text.slice(start, i + 1);
        flush();
        start = i + 1;
        continue;
      }
      if (ch === '@') atRule = true;
    }
    prelude += text.slice(start);
  });
  flush();
  return out;
}

module.exports = {
  splitSelectorList, leadingIsArms, distributeSelector, distributeLeadingIs, stripCssComments, maskCssComments,
};
