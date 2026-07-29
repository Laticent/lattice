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
 * Two consumers (HARD RULE #1):
 *   1. lib/engine/css.js `packSelector` — distributes per selector while packing,
 *      which is why the OWNED render path was never affected.
 *   2. lib/core/marp-bundle.js — rewrites the stylesheet the Export-to-Marp
 *      bundle ships, because marp-core has no such step and we cannot patch it.
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

// A style rule's selector prelude: everything up to the `{` that opens the
// block, excluding at-rules (`@media`, `@supports`, … keep their prelude) and
// anything containing a `;` or `}` (a declaration run, not a prelude).
const RULE_PRELUDE = /(^|[{};])([^{}@;]+)\{/g;

/**
 * Rewrite every leading-`:is()` selector in a stylesheet to its distributed
 * form. Text-level on purpose: it must run over the MINIFIED bundle the export
 * ships without pulling a CSS parser into a browser-side producer, and a
 * selector prelude is unambiguous at this level. Declarations, at-rule preludes,
 * and `@keyframes` frame selectors are left alone (none can start with `:is(`).
 *
 * Idempotent: a distributed selector has no leading `:is()` left to expand.
 */
function distributeLeadingIs(css) {
  return String(css || '').replace(RULE_PRELUDE, (whole, lead, prelude) => {
    if (!prelude.includes(':is(')) return whole;
    // `, ` (not `,`) matches how distributeSelector joins its own arms, which is
    // what makes a second pass a byte-for-byte no-op rather than whitespace churn.
    const out = splitSelectorList(prelude)
      .map((s) => distributeSelector(s))
      .join(', ');
    return `${lead}${out}{`;
  });
}

module.exports = { splitSelectorList, leadingIsArms, distributeSelector, distributeLeadingIs };
