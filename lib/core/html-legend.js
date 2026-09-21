/**
 * html-legend.js — the shared key for components that draw in HTML, not SVG.
 *
 * THE FORK THIS CLOSES. `_chart-family/svg-legend.js` builds a key INSIDE the
 * diagram's viewBox, because an SVG chart's diagram, spine and key have to scale
 * as one unit. That is the right answer for the eight charts that call it and the
 * wrong one for a component whose figure is a real `<table>`: `roadmap`,
 * `matrix-grid` and `obligation-matrix` have no viewBox to live in, so `roadmap`
 * grew its own `<ul>` builder and the other two never grew one at all. Every
 * label-set adopter outside the Cartesian charts is on this side of the fork, so
 * the HTML shape lives here once instead of three times.
 *
 * WHY `lib/core` AND NOT THE CHART FAMILY. `obligation-matrix` is in the `legal`
 * bucket and `matrix-grid` in `chart`, but neither is a chart-FAMILY member in the
 * `_chart-family` sense. A core module is the only place all of them can import
 * from (HARD RULE #1).
 *
 * THE MARKUP IS `roadmap`'s, GENERALIZED. That shape shipped and is tuned — a
 * flex row of chips, each a masked disc plus a label, centered under a wide
 * figure. Per-state color and the glyph mask come from CSS keyed on the row's
 * own class, exactly as `svg-legend`'s `swatchClass` does and for the same
 * reason (HARD RULE #3): the kernel must not resolve a color, or the key drifts
 * from the cells it keys the moment a theme retunes. `buildHtmlLegend` therefore
 * emits STRUCTURE and CLASSES and never a color.
 *
 * CLASSES ARE PASSED IN FULL, NEVER COMPOSED FROM A PREFIX, and that is not
 * stylistic. `checkChartMarks` (tools/check-ownership.js, via build:check) proves
 * a declared `kernel.marks` class is actually written by doing a whole-token
 * search of string literals under `lib/`. A builder that assembled
 * `${prefix}-legend-mark` would make every caller's class vanish from that search:
 * the first cut of this module did exactly that, and the gate went red on
 * `roadmap-legend-mark` within the hour. Spelling each class out costs four lines
 * per caller and keeps both the gate and a human `grep` able to find it — which is
 * the property the gate exists to protect.
 *
 * Passing roadmap's four class names yields output byte-identical to what
 * `buildStatusLegend` emitted before it was ported, which is what makes that port
 * a no-op a reviewer can check against a committed PDF.
 *
 * ESCAPING IS NOT OPTIONAL HERE, and it is new. Every caller's labels used to be
 * hard-coded constants (`STATE_LABEL`, `STATE_LABELS`), so nothing escaped them.
 * A label set makes them AUTHOR TEXT, and this builder returns an HTML string
 * that goes straight into the section — so a deck authoring
 * `` `[{[x], <img src=x onerror=…>}]` `` would otherwise inject live markup on the
 * markdown-it path. Labels and classes both go through `esc`. (Same class of sink
 * HARD RULE #22 exists for; here the fix is structural — nothing in a key is ever
 * supposed to carry markup.)
 *
 * Pure string-in/string-out — no DOM, no fs — so both render paths bundle it.
 */

/** The five characters that would let a label or a class leave its slot. */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build the key.
 *
 * Returns `''` for an empty row set — the "no marker present, no key" behavior
 * `roadmap.buildStatusLegend` already had and `label-set.js` names as one of the
 * three properties worth keeping. A caller never has to test for it.
 *
 * @param {object}   opts
 * @param {string}   opts.listClass   the list's own class, spelled out
 * @param {string}   opts.itemClass   each row's base class, spelled out
 * @param {string}   opts.markClass   the swatch's class, spelled out
 * @param {string}   opts.labelClass  the label span's class, spelled out
 * @param {Array}    opts.rows        `[{ stateClass, label, detail? }]`, in render order
 * @param {string}   [opts.ariaLabel] the list's accessible name
 * @param {string}   [opts.tag]       `'ul'` (default) or `'ol'` when order is meaningful
 * @returns {string} the key's HTML, or `''` when there are no rows
 */
function buildHtmlLegend({
  listClass, itemClass, markClass, labelClass,
  rows, ariaLabel = 'Key', tag = 'ul',
}) {
  const list = Array.isArray(rows) ? rows.filter((r) => r?.label) : [];
  if (!list.length) return '';
  const t = tag === 'ol' ? 'ol' : 'ul';
  const items = list.map((r) => {
    // The detail rides as a `title`, not a second visible span: these keys sit
    // under a figure that is already the tallest thing on the slide, and a
    // second line per chip is what pushes a wide key onto two rows. A detail is
    // supplementary by definition — the label is what the reader must get.
    const titleAttr = r.detail ? ` title="${esc(r.detail)}"` : '';
    const stateClass = r.stateClass ? ` ${esc(r.stateClass)}` : '';
    return `<li class="${esc(itemClass)}${stateClass}"${titleAttr}>` +
      `<span class="${esc(markClass)}" aria-hidden="true"></span>` +
      `<span class="${esc(labelClass)}">${esc(r.label)}</span>` +
    `</li>`;
  }).join('');
  return `<${t} class="${esc(listClass)}" aria-label="${esc(ariaLabel)}">${items}</${t}>`;
}

module.exports = { buildHtmlLegend };
