/**
 * svg-label.js — the shared wrapping `<text>` emitter for IN-DIAGRAM chart
 * labels (funnel stages, radar rim axes, quadrant dots/corners, gantt lanes,
 * state-chart nodes + edges).
 *
 * WHY THIS EXISTS. Native SVG `<text>` does not wrap. Every diagram label used
 * to be a single-line `<text x y>`, so a long label ran straight off the
 * viewBox (the funnel clipped "…Procurement Qualification Review" at the left
 * edge) or straight through its neighbor (quadrant dot labels overprinted each
 * other). The SVG-native legend already solved the same problem for KEY rows —
 * `svg-legend.js` wraps a label to a character budget and emits one `<tspan>`
 * per line. This module lifts that solved mechanism out to the diagram side
 * rather than growing a second wrapper (HARD RULE #15): the greedy line-breaker
 * `wrapLabelToLines` is IMPORTED from svg-legend, not reimplemented here.
 *
 * WHY NOT `<foreignObject>` + CSS flex. It wraps natively, but it loses on all
 * three axes that matter here: it is not "fully SVG", it is unreliable in the
 * Chromium→PDF export path, and — decisively — a `foreignObject` label is an
 * HTML `<div>`, so `chartToScene` (docs/src/lib/chart-anima.ts) would never see
 * it as a `<text>` node and would never animate it. `<tspan>` lines stay inside
 * one `<text>`, which keeps the label a single addressable motion target and a
 * single `[data-mark]` popover target. See
 * engineering/decisions/2026-07-26-svg-chart-labels-motion.md §2.
 *
 * EVERYTHING IS VIEWBOX USER UNITS. Widths, font sizes and line heights are all
 * expressed in the chart's own coordinate space, never device px. That is what
 * makes the result resolution-independent: the same vector drawn at 1280×720
 * and at 8K is the same shape scaled, so a label keeps its proportion to the
 * geometry and stays crisp at any output size. Sizing in px would pin the text
 * to one output resolution and break the moment the SVG scaled.
 *
 * WHO OWNS THE FONT SIZE. The caller does, and it must match what CSS renders,
 * because the line-breaker measures in units of the font size. This follows the
 * legend's precedent exactly: `chart-family.css` deliberately sets NO
 * `font-size` on `.chart-key-label` — the kernel emits it as an attribute, so
 * the wrap math and the painted glyphs can never desync. A chart that wraps a
 * label therefore owns that label's nominal size too.
 *
 * NO FONT METRICS. A pure kernel has no DOM and no font tables, so width is
 * estimated as `chars × ADVANCE × fontSize` with a deliberately CONSERVATIVE
 * average advance (the legend's tuned 0.6). The budget therefore breaks EARLY
 * rather than late: a label may wrap one word sooner than a perfect measurer
 * would, but it never overruns its box. Erring the other way would put us back
 * to clipping, which is the defect this module exists to remove.
 *
 * Pure string-in/string-out — no fs, no DOM — so it runs identically on both
 * render paths (HARD RULE #1) and is safe in every browser bundle.
 */

const { wrapLabelToLines, xmlEsc } = require('./svg-legend');

// Average glyph advance as a fraction of the font size. Shared with the legend
// (svg-legend.js AVG_ADVANCE_R) so a diagram label and a key label break at the
// same visual width — the family reads as one system.
const ADVANCE = 0.6;
// Default line height as a ratio of the font size — the legend's LH_R. Diagram
// labels sit against geometry, so lines stay tight.
const LINE_HEIGHT = 1.16;

/**
 * How many characters fit on one line of `width` user units at `fontSize`.
 * Floors at 1 so a pathologically narrow box still makes progress (a 0-char
 * budget would make the line-breaker loop forever on a single long token).
 */
function charBudget(width, fontSize, advance = ADVANCE) {
  const per = fontSize * advance;
  if (!(per > 0) || !(width > 0)) return 1;
  return Math.max(1, Math.floor(width / per));
}

/**
 * Break `text` to the given width WITHOUT emitting markup — the measurement
 * half of the emitter, for callers that need a label's box before they can
 * place it (the quadrant's de-collision pass measures every label first, then
 * nudges, then emits).
 *
 * `maxLines` caps the block height where geometry is hard-limited (a funnel
 * band's height, a gantt lane's height). Overflow past the cap ellipsizes the
 * LAST line rather than silently dropping text: a visible "…" is honest about
 * truncation, where a dropped line reads as data that was never there. Callers
 * generally derive maxLines from the space they actually have, so the cap is a
 * backstop, not the common path.
 */
function measureLabel(text, { width, fontSize, maxLines = Infinity, advance = ADVANCE, lineHeight = LINE_HEIGHT }) {
  const budget = charBudget(width, fontSize, advance);
  let lines = wrapLabelToLines(String(text == null ? '' : text), budget);
  if (lines.length > maxLines && maxLines >= 1) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    // Trim to make room for the ellipsis, so the truncated line still fits the
    // budget it was broken to.
    kept[maxLines - 1] = `${last.slice(0, Math.max(0, budget - 1)).trimEnd()}…`;
    lines = kept;
  }
  return {
    lines,
    height: (lines.length - 1) * fontSize * lineHeight + fontSize,
    lineHeight: fontSize * lineHeight,
  };
}

/**
 * Emit one wrapping `<text>` element: a single `<text>` carrying one `<tspan>`
 * per line, each with an explicit `x` + `y` (absolute per-line placement, the
 * legend's convention — more robust than cumulative `dy`, which drifts if a
 * line is ever dropped and re-anchors wrong under `text-anchor`).
 *
 * @param {string} text         the label (tags already stripped by the caller)
 * @param {object} o
 * @param {number} o.x          anchor x, in viewBox user units
 * @param {number} o.y          anchor y — see `vAlign`
 * @param {number} o.width      the width the label may occupy, user units
 * @param {number} o.fontSize   nominal font size, user units (must match CSS)
 * @param {string} [o.anchor]   SVG `text-anchor`: start | middle | end
 * @param {string} [o.vAlign]   where `y` sits on the block:
 *                              'baseline' — y is the FIRST line's baseline (the
 *                                 single-line default; a 1-line label emits at
 *                                 exactly the y it always did);
 *                              'middle'  — the whole block is centered on y, so
 *                                 a label centered against geometry (a funnel
 *                                 band, a quadrant dot) STAYS centered as it
 *                                 grows lines instead of drifting downward;
 *                              'hanging' — y is the block's top edge.
 * @param {number} [o.maxLines] cap; the last line ellipsizes past it
 * @param {string} [o.className] class attribute
 * @param {string} [o.attrs]    extra attributes, pre-escaped by the caller
 *                              (data-mark, data-anima-role, dominant-baseline…)
 * @param {number} [o.lineHeight] line height as a ratio of fontSize
 * @param {boolean} [o.emitFontSize] emit the font-size attribute (default true —
 *                              the kernel owns the size it wrapped to). Pass
 *                              false only where CSS is the sole owner AND the
 *                              caller passed that same size in.
 * @returns {{ svg: string, lines: string[], height: number, top: number, bottom: number }}
 *          `top`/`bottom` are the block's vertical extent in user units — the
 *          caller uses them to grow its geometry or de-collide neighbors.
 */
function wrapSvgLabel(text, {
  x, y, width, fontSize,
  anchor = 'start',
  vAlign = 'baseline',
  maxLines = Infinity,
  className = '',
  attrs = '',
  lineHeight = LINE_HEIGHT,
  advance = ADVANCE,
  emitFontSize = true,
}) {
  const m = measureLabel(text, { width, fontSize, maxLines, advance, lineHeight });
  const LH = m.lineHeight;
  const n = m.lines.length;
  // First-line baseline. 'baseline' keeps a single-line label byte-identical to
  // the un-wrapped emitter it replaces; 'middle' lifts the block by half its
  // extra height so growth is symmetric about y; 'hanging' drops a full
  // font-size so y reads as the top edge.
  let firstBaseline = y;
  if (vAlign === 'middle') firstBaseline = y - ((n - 1) * LH) / 2;
  else if (vAlign === 'hanging') firstBaseline = y + fontSize;

  const cls = className ? ` class="${className}"` : '';
  const fs = emitFontSize ? ` font-size="${round(fontSize)}"` : '';
  const tspans = m.lines
    .map((ln, i) => `<tspan x="${round(x)}" y="${round(firstBaseline + i * LH)}">${xmlEsc(ln)}</tspan>`)
    .join('');
  const svg = `<text${cls}${fs} text-anchor="${anchor}"${attrs}>${tspans}</text>`;

  return {
    svg,
    lines: m.lines,
    height: m.height,
    // Optical extent — the box the DE-COLLISION pass compares, so it brackets
    // the painted glyphs, not the baselines: ascent above the first baseline,
    // descent below the last. For the body faces this engine ships a baseline
    // sits ~0.78em below the ascender top and ~0.28em above the descender
    // bottom, which makes this box slightly TALLER than `height` (a pure
    // baseline-to-baseline + one line measure). That surplus is deliberate:
    // two labels whose optical boxes merely touch would still visually crowd,
    // so the pass separates them a hair before they actually overlap.
    top: firstBaseline - fontSize * 0.78,
    bottom: firstBaseline + (n - 1) * LH + fontSize * 0.28,
  };
}

function round(n) {
  return Number(Number(n).toFixed(2)).toString();
}

module.exports = { wrapSvgLabel, measureLabel, charBudget, ADVANCE, LINE_HEIGHT };
