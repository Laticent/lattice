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
 *   3. lib/export/marp-bundle.js — rewrites the stylesheet the Export-to-Marp
 *      bundle ships; now redundant for a current dist, kept for older ones.
 *      Without this pass ~835 rules across the whole chart bucket and the shared
 *      `:is(section, figure)` Form layer are dead in every Marp render (#1256).
 *
 * Only a LEADING `:is()` needs this — a mid-selector `:is()` is already in
 * descendant position and scopes correctly. `:where()` heads are deliberately
 * NOT touched HERE: distributing them would not help (a `:where(section…)` arm is
 * still not a literal leading `section`), and unwrapping them would change the
 * zero specificity they are chosen for. This kernel is shared with Export-to-Marp,
 * where marp-core cannot be patched. The engine's own pack (`packSelector`,
 * lib/engine/css.js `leadingWhereNamesSlide`) handles a leading `:where(section…)`
 * itself: it writes the container before the `:where()` (keeping its zero weight) and keeps the
 * descendant arm it always packed to, so a raw `<section>` nested in a slide still matches.
 */

/**
 * Split a selector list on its top-level commas. A comma inside `(…)` or `[…]` belongs to the
 * selector, and so does one inside a string or a comment (`[data-x="a,b"]`, `:not(/* , *​/ p)`):
 * the list is read by the CSS tokenizer (lib/core/css-tokens.js, Segno P5). The parts are
 * slices of `list`, as written. A closer with no opener lowers the depth below zero, and a comma
 * there does not split, as the character walk this replaced read it.
 */
function splitSelectorList(list) {
  const parts = [];
  let depth = 0;
  let from = 0;
  eachCssToken(list, (type, a, b) => {
    if (type === ',' && depth === 0) {
      parts.push(list.slice(from, a));
      from = b;
    } else if (type === '(' || type === '[' || type === 'function') depth++;
    else if (type === ')' || type === ']') depth--;
  });
  parts.push(list.slice(from));
  return parts;
}

/**
 * Split a selector that STARTS with `:is(…)` into its arms plus the remainder.
 * @returns {{arms: string[], rest: string}|null} null when the selector has no
 *   leading `:is()` or its parens are unbalanced (left untouched, never guessed).
 */
function leadingIsArms(sel) {
  if (!sel.startsWith(':is(')) return null;
  // The `(` of `:is(` opens the block; it closes at its matching `)`, read by the tokenizer so a
  // `)` in a string or a comment does not close it.
  let depth = 0;
  let close = -1;
  eachCssToken(sel, (type, a) => {
    if (close >= 0) return;
    if (type === '(' || type === 'function') depth++;
    else if (type === ')' && --depth === 0) close = a;
  }, 1);
  if (close < 0) return null; // unbalanced — leave untouched
  return { arms: splitSelectorList(sel.slice(4, close)), rest: sel.slice(close + 1) };
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
const { stripCssComments, maskCssComments } = require('./css-comments.mjs');
// The selector and prelude walks below read CSS through the tokenizer (Segno P5).
const { eachCssToken } = require('./css-tokens.js');

// The longest real prelude in dist/lattice.css is ~4 KB (a long comma list), so
// 64 KB is far above the corpus. The bound is not cosmetic: `distributeSelector`
// copies the selector remainder once per arm, so output is arms × remainder —
// quadratic. A 460 KB crafted head OOMs a 512 MB heap, and the browser-side
// producer runs this over CSS it just fetched. Over the bound, the prelude is
// copied through untouched.
const MAX_PRELUDE = 65536;

/** Is there an `@` in `css[a, b)`? A lone `@` (one no name follows) is an `other` token, and it marks an at-rule prelude
 *  as the character walk this replaced read it. */
function hasAt(css, a, b) {
  for (let k = a; k < b; k++) if (css.charCodeAt(k) === 64) return true;
  return false;
}

/**
 * Rewrite every leading-`:is()` selector in a stylesheet to its distributed form.
 *
 * Token-level on purpose: it runs over the MINIFIED bundle in a browser-side
 * producer, so it reads the sheet with the CSS tokenizer (lib/core/css-tokens.js,
 * Segno P5) rather than a full CSS parser, and copies every byte it does not
 * rewrite. A rule prelude runs from the previous `{`, `}` or `;` to the `{` that
 * opens a block (one inside a string, a comment or an unquoted `url(…)` is text); an
 * at-keyword, or a lone `@`, in it means an at-rule prelude, which is left alone, as
 * are declarations and `@keyframes` frame selectors (none can start with `:is(`). An
 * escaped `@` in a class name (`.a\@b`) is part of the name, not an at-rule.
 *
 * Idempotent: a distributed selector has no leading `:is()` left to expand.
 */
function distributeLeadingIs(css) {
  let out = '';
  // The prelude runs from `start` (just past the last `{`, `}` or `;`) to here; its leading trivia (whitespace and
  // comments) ends at `trivia`, read in the same walk, so a prelude is never tokenized twice. Trivia is not part of any
  // compound, so a rule after a doc comment (most of them, in this codebase) still reads as leading-`:is()`, while
  // `.a /* mid */ :is(…)` does NOT: its first compound is `.a`.
  let start = 0;
  let trivia = 0;
  let inTrivia = true;
  let atRule = false;
  eachCssToken(css, (type, a, b) => {
    if (type === '{') {
      const prelude = css.slice(start, a);
      const lead = (inTrivia ? a : trivia) - start;
      const selectors = prelude.slice(lead);
      if (!atRule && selectors.startsWith(':is(') && prelude.length <= MAX_PRELUDE) {
        // `, ` (not `,`) matches how distributeSelector joins its own arms, which
        // is what makes a second pass a byte-for-byte no-op, not whitespace churn.
        out += prelude.slice(0, lead) + splitSelectorList(selectors).map((sel) => distributeSelector(sel)).join(', ');
      } else {
        out += prelude;
      }
      out += '{';
      start = b;
      inTrivia = true;
      atRule = false;
      return;
    }
    if (type === '}' || type === ';') {
      out += css.slice(start, b);
      start = b;
      inTrivia = true;
      atRule = false;
      return;
    }
    if (inTrivia && type !== 'ws' && type !== 'comment') {
      inTrivia = false;
      trivia = a;
    }
    if (type === 'at' || (type === 'other' && hasAt(css, a, b))) atRule = true;
  });
  return out + css.slice(start);
}

module.exports = {
  splitSelectorList, leadingIsArms, distributeSelector, distributeLeadingIs, stripCssComments, maskCssComments,
};
