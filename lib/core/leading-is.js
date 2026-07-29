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
 * Rewrite every leading-`:is()` selector in one COMMENT-FREE span of stylesheet.
 *
 * A character walk rather than a regex, because the thing being recognized — "a
 * selector prelude" — is defined by unquoted delimiters, and a regex can't see
 * quoting. `{`, `}` and `;` OUTSIDE a string are rule boundaries; a candidate
 * prelude runs from the previous boundary (or the span's start, which is what
 * makes the comment-skipping caller below correct) to the `{` that opens a block.
 * An `@` in that run means an at-rule prelude, which is left alone.
 *
 * The quote tracking is the load-bearing part: `content: "{"` inside a
 * declaration would otherwise READ AS a rule opening, so everything up to it
 * became a candidate prelude and a `:is(` in that window got "distributed" —
 * rewriting the inside of a string literal. Nothing in the corpus does that
 * today; the walk means nothing has to.
 */
function rewriteSpan(span) {
  let out = '';
  let start = 0; // start of the candidate prelude
  let quote = ''; // the open string delimiter, while inside one
  let atRule = false;
  for (let i = 0; i < span.length; i++) {
    const ch = span[i];
    if (quote) {
      if (ch === '\\') i++; // an escaped char can't close the string
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{') {
      const prelude = span.slice(start, i);
      if (!atRule && prelude.includes(':is(')) {
        // The prelude's LEADING whitespace is re-emitted as authored (each
        // selector is trimmed when distributed, which would otherwise pull a rule
        // up onto the previous line), so the pass only ever touches selectors.
        // `, ` (not `,`) matches how distributeSelector joins its own arms, which
        // is what makes a second pass a byte-for-byte no-op, not whitespace churn.
        const indent = prelude.slice(0, prelude.length - prelude.replace(/^\s+/, '').length);
        out += indent + splitSelectorList(prelude.slice(indent.length))
          .map((s) => distributeSelector(s)).join(', ');
      } else {
        out += prelude;
      }
      out += '{';
      start = i + 1;
      atRule = false;
      continue;
    }
    if (ch === '}' || ch === ';') {
      out += span.slice(start, i + 1);
      start = i + 1;
      atRule = false;
      continue;
    }
    if (ch === '@') atRule = true;
  }
  return out + span.slice(start);
}

/**
 * Walk a stylesheet as alternating CODE and COMMENT spans, handing each to its
 * callback in source order. The single place this file knows where comments
 * begin and end; both public entry points below are built on it.
 */
function eachCssSpan(css, onCode, onComment) {
  const text = String(css || '');
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('/*', i);
    if (open < 0) { onCode(text.slice(i)); return; }
    onCode(text.slice(i, open));
    const close = text.indexOf('*/', open + 2);
    if (close < 0) { onComment(text.slice(open)); return; } // unterminated — to EOF
    onComment(text.slice(open, close + 2));
    i = close + 2;
  }
}

/**
 * A stylesheet with its `/* … *​/` comments removed.
 *
 * Exported because scanning CSS for what it REFERENCES has the same
 * comment-blindness trap the distribution below has for what it MATCHES:
 * `fontAssetsFor` (lib/core/marp-bundle.js) derives the bundle's font supply
 * from the `url(fonts/…)` refs in the stylesheet, and a ref sitting in a comment
 * — an example, a retired face — is not a ref. Reusing the walk keeps the two
 * consumers agreeing on what "in a comment" means, and keeps this file the only
 * place in the browser-safe producers that answers that question.
 */
function stripCssComments(css) {
  let out = '';
  eachCssSpan(css, (code) => { out += code; }, () => {});
  return out;
}

/**
 * Rewrite every leading-`:is()` selector in a stylesheet to its distributed form.
 *
 * Text-level on purpose: it must run over the MINIFIED bundle without pulling a
 * CSS parser into a browser-side producer, and a selector prelude is unambiguous
 * at this level once quoting is tracked (see `rewriteSpan`). Declarations, at-rule
 * preludes, and `@keyframes` frame selectors are left alone (none can start with
 * `:is(`).
 *
 * COMMENTS ARE SKIPPED WHOLESALE, and that is load-bearing in both directions:
 *   - A rule can only be recognized at a boundary (start, `{`, `}`, `;`), and
 *     `*​/` is none of those — so a rule sitting directly after a doc comment,
 *     which in this codebase is most of them, was silently missed (151 of the
 *     dead chart rules survived the first attempt at this).
 *   - Engine CSS comments freely DISCUSS `:is(…)`. Scanning them as selectors
 *     would reflow prose on a top-level comma.
 * Splitting on comment spans fixes both at once: prose is copied verbatim, and
 * each run of real CSS starts at `^`.
 *
 * Idempotent: a distributed selector has no leading `:is()` left to expand.
 */
function distributeLeadingIs(css) {
  let out = '';
  eachCssSpan(css, (code) => { out += rewriteSpan(code); }, (comment) => { out += comment; });
  return out;
}

module.exports = {
  splitSelectorList, leadingIsArms, distributeSelector, distributeLeadingIs, stripCssComments,
};
