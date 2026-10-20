/**
 * legend-mark.js — the MARK slot of a legend label: the small drawn shape that ties a label to the
 * encoding it decodes (a swatch for a fill, a stroke for a line).
 *
 * Design: engineering/decisions/2026-10-19-universal-legend.md § 4, rule 3. A label has three
 * optional slots — mark, text, plate — and this module owns the first. Wave 0 lands the kernel and
 * its first caller (the free-standing key in lib/core/legend.js); the three copies of the swatch
 * vocabulary it is meant to absorb (`keySwatch` in graph-key.js, `swatchClass` in svg-legend.js, the
 * `--mark-*` lookups) move onto it one adopter per commit in Waves 2 and 3.
 *
 * SHAPE FROM US, COLOR FROM THE ELEMENT (HARD RULES #3 and #29). The kernel writes geometry and a
 * `data-c` slot and never a color: lib/plugins/legend/legend.styles.css paints `data-c` from the
 * theme's categorical tokens. A mark is drawn, never typed, so no glyph reaches the slide.
 *
 * CLASSES ARE SPELLED OUT IN FULL, one string literal per mark, never composed from a prefix:
 * `checkChartMarks` (tools/check-ownership.js) finds a class by a whole-token search of string
 * literals, and a composed class is invisible to it and to a human grep.
 *
 * Pure string-in/string-out — no DOM, no fs — so both render paths bundle it (HARD RULE #1).
 */

const { colorAttr } = require('./legend-key.js');

/** Mark name → its class, spelled out. `swatch` and `outline` are areas; the rest are strokes. */
const MARK_CLASS = Object.freeze({
  swatch: 'legend-mark legend-mark--swatch',
  outline: 'legend-mark legend-mark--outline',
  line: 'legend-mark legend-mark--line',
  heavy: 'legend-mark legend-mark--heavy',
  dashed: 'legend-mark legend-mark--dashed',
  dotted: 'legend-mark legend-mark--dotted',
});

const MARKS = Object.freeze(Object.keys(MARK_CLASS));
const STROKES = new Set(['line', 'heavy', 'dashed', 'dotted']);

const round = (n) => Math.round(n * 100) / 100;

/**
 * The mark as HTML: an empty, `aria-hidden` span the stylesheet draws. Its size is the text's
 * (`em`), so a key scales with the slide like the words beside it.
 * @param {string} mark   one of MARKS
 * @param {{color?: number|string}} [o]
 * @returns {string} the span, or '' for no mark or an unknown one
 */
function markHtml(mark, o = {}) {
  const cls = MARK_CLASS[mark];
  if (!cls) return '';
  return `<span class="${cls}"${colorAttr(o.color)} aria-hidden="true"></span>`;
}

/**
 * The mark as SVG, centered on `(cx, cy)`, sized from the label's font size so it reads as part of
 * the label at any chart scale. Everything is viewBox units.
 * @param {string} mark
 * @param {{cx: number, cy: number, fontSize: number, color?: number|string}} o
 * @returns {{svg: string, width: number}} the element and the width it takes; '' and 0 for no mark
 */
function markSvg(mark, { cx, cy, fontSize, color }) {
  const cls = MARK_CLASS[mark];
  if (!cls) return { svg: '', width: 0 };
  const c = colorAttr(color);
  if (STROKES.has(mark)) {
    // A stroke sample is wider than a swatch: a dash pattern needs room to show it is one.
    const w = fontSize * 1.6;
    return {
      svg: `<line class="${cls}"${c} x1="${round(cx - w / 2)}" y1="${round(cy)}" x2="${round(cx + w / 2)}" y2="${round(cy)}"/>`,
      width: w,
    };
  }
  const s = fontSize * 0.8;
  return {
    svg: `<rect class="${cls}"${c} x="${round(cx - s / 2)}" y="${round(cy - s / 2)}" width="${round(s)}" height="${round(s)}" rx="${round(s * 0.18)}"/>`,
    width: s,
  };
}

module.exports = { MARKS, MARK_CLASS, markHtml, markSvg };
