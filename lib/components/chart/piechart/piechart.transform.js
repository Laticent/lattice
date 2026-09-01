/**
 * piechart — proportional wedges (pie / donut). Chart-family member;
 * kernel-as-module.
 *
 * One of the four KEYED charts: it shares svg-legend.js's legend + spine
 * builder with radar, map and the cohort quadrant, and mark-detail.js's popover
 * substrate with funnel/map/quadrant/radar. The family dispatches here through
 * the `kernel` block in piechart.manifest.json.
 */

const { parseTopLevelLis } = require('../../../core/html-lists');
const { stripTrailingPills, spliceFirstList } = require('../_chart-family/transform-utils');
const { nextRenderSeq, renderIdPrefix } = require('../../../core/render-ids');
const { buildSvgLegend } = require('../_chart-family/svg-legend');
const markDetail = require('../_chart-family/mark-detail');

// The six categorical slot hues, in rotation order — the rotation anchor for
// wedges and legend swatches (buildPieChart reads `.length` and derives each
// slot's --catN-hue per index). Wedges ride a hub→rim area-fade of --catN-hue
// (radar's vivid identity color), not the pale --catN-fill, paired with the
// CSS --catN-ink wedge border (piechart.styles.css). Six is the perceptual
// cap (Wong 2011, IBM Carbon); pies past it should consolidate "Other".
const PIE_PALETTE = [
  'var(--chart-cat-1-hue)', 'var(--chart-cat-2-hue)', 'var(--chart-cat-3-hue)',
  'var(--chart-cat-4-hue)', 'var(--chart-cat-5-hue)', 'var(--chart-cat-6-hue)',
];

// Per-wedge radial-depth gradient counter. SVG fill can't take a CSS
// gradient, so each wedge gets its own <radialGradient> (hub slightly
// translucent → full at the rim) for a glassy depth that matches radar's
// area-fade restraint. Unique ids per render dodge the SVG duplicate-id trap.
// Siblings: radar.transform.js areaGradient, quadrant.transform.js.
// The sequence is RENDER-scoped (lib/core/render-ids.js) — a module-level counter was
// process-scoped, which made render() non-deterministic across calls.

// wrapLabelToLines, the SVG-native legend/spine geometry, AND the legend text
// helpers (svgText/xmlEsc — strip inline HTML then escape at emit) moved to
// ./svg-legend.js (buildSvgLegend), shared by all four keyed charts so they stay
// one family. buildPieChart passes raw label/value strings; the builder handles
// stripping + escaping.
function buildPieChart(ulInner, isDonut, orientation) {
  const items = parseTopLevelLis(ulInner);
  const parsed = items.map(item => {
    // A slice may carry an optional nested sublist — captured as present-mode
    // detail (the popover payload). Split it off the lead BEFORE reading the
    // label/value pill, via the shared (depth-aware) substrate splitter so the
    // pie uses the SAME capture as funnel/map/quadrant/radar.
    const { lead: leadPart, detail } = markDetail.splitDetail(item);
    const lead = leadPart.replace(/<\/?p>/g, '').trim();
    const { leadStripped, pills } = stripTrailingPills(lead);
    const valueRaw = pills[0] || '0';
    const numMatch = valueRaw.match(/[\d.]+/);
    const num = numMatch ? parseFloat(numMatch[0]) : 0;
    return { label: leadStripped.trim(), valueRaw, num, detail };
  });
  const total = parsed.reduce((s, p) => s + p.num, 0) || 1;

  // ── SVG-native legend via the shared family builder (svg-legend.js) ──────────
  // diagram + spine + key share ONE viewBox, so the WHOLE unit scales with the
  // container — the key never fights `cqh` in a CSS font-size. Swatch fill is the
  // slot's wedge tone with the matching --catN-ink edge; labels route through
  // --font-label in CSS so the sketch finish reskins them. The disc lives in a
  // fixed 200-tall box and is centered by the builder's diagramDy (the unit only
  // grows taller for a pathological long-tail key). See
  // engineering/decisions/2026-06-13-svg-native-legend.md.
  const DIAGRAM_H = 200;
  const DISC_R_EDGE = 180;               // disc right edge (cx 100 + R 80)
  const rows = parsed.map((p, idx) => {
    const slot = (idx % PIE_PALETTE.length) + 1;
    return {
      // 0-based slot in the categorical cycle — lets an a11y theme texture the
      // legend swatch to MATCH its wedge (`.wedge:nth-of-type(6n+…)`). Inert
      // otherwise (no rule keys off [data-cat] under a color theme).
      cat: idx % PIE_PALETTE.length,
      swatchFill: `color-mix(in oklab, var(--chart-cat-${slot}-hue) 82%, var(--bg))`,
      swatchStroke: `var(--chart-cat-${slot}-ink)`,
      label: p.label,
      value: p.valueRaw,
    };
  });
  const key = buildSvgLegend({ rows, diagramRight: DISC_R_EDGE, diagramHeight: DIAGRAM_H, hasValues: true, orientation });

  const cx = 100, cy = DIAGRAM_H / 2, R = 80, r = 50;
  let cumul = 0;
  const defs = [];
  const wedges = parsed.map((p, idx) => {
    const startAngle = (cumul / total) * 2 * Math.PI;
    cumul += p.num;
    const endAngle = (cumul / total) * 2 * Math.PI;
    const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
    const x1 = (cx + R * Math.sin(startAngle)).toFixed(2);
    const y1 = (cy - R * Math.cos(startAngle)).toFixed(2);
    const x2 = (cx + R * Math.sin(endAngle)).toFixed(2);
    const y2 = (cy - R * Math.cos(endAngle)).toFixed(2);
    const slot = (idx % PIE_PALETTE.length) + 1;
    const hue = `var(--chart-cat-${slot}-hue)`;
    // Radar's principle, tuned for a solid proportion. The wedge rides the
    // vivid slot hue (--catN-hue — the canvas-saturated end radar strokes its
    // curves with), NOT the pale --catN-fill tint that read pastel, with a
    // hub→rim area-fade: lighter at the hub, vivid toward the rim. Denser than
    // radar's translucent overlay fill because pie wedges are opaque, abutting
    // part-to-whole areas (not stacked curves you must see through); the mix
    // with --bg keeps each stop opaque and flips the whole wedge with the
    // canvas. Same hue source + same area-fade language as radar.transform.js
    // and the quadrant tints — the three categorical charts read as one family.
    const gradId = `${renderIdPrefix()}pie-wedge-${nextRenderSeq('pie-wedge')}`;
    // Solid-area finish — a radial hub→rim DOME, the SAME area-fade the quadrant
    // zones use (identical 42/58/82 stops toward --chart-cat-base), so the two
    // solid-area charts read as one family: lighter at the hub, vivid toward the
    // rim. --chart-cat-base is --bg on light, black on dark, so warm wedges stay
    // hue-true on the navy canvas instead of mudding into it. The --catN-ink
    // stroke (piechart.styles.css) carries the hue at the wedge edge.
    //
    // The dome is the BASE finish: solid-area charts radiate from a center, so a
    // center-out fade reads more naturally than a bar's vertical wash, and it
    // matches the quadrant. A flatter top→bottom wash (the bar-family finish) was
    // prototyped and is held as a documented FUTURE VARIANT — see
    // chart-family.style.md › "Fill finish (a future variant)".
    defs.push(`<radialGradient id="${gradId}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${R}">` +
      `<stop offset="0%" style="stop-color:color-mix(in oklab, ${hue} 42%, var(--chart-cat-base))"/>` +
      `<stop offset="62%" style="stop-color:color-mix(in oklab, ${hue} 58%, var(--chart-cat-base))"/>` +
      `<stop offset="100%" style="stop-color:color-mix(in oklab, ${hue} 82%, var(--chart-cat-base))"/>` +
      `</radialGradient>`);
    const wedgeFill = `url(#${gradId})`;
    if (isDonut) {
      const ix1 = (cx + r * Math.sin(startAngle)).toFixed(2);
      const iy1 = (cy - r * Math.cos(startAngle)).toFixed(2);
      const ix2 = (cx + r * Math.sin(endAngle)).toFixed(2);
      const iy2 = (cy - r * Math.cos(endAngle)).toFixed(2);
      const d = `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${r} ${r} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
      return `<path class="wedge" data-mark="${idx}" data-anima-role="sector" style="fill:${wedgeFill}" d="${d}"/>`;
    }
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return `<path class="wedge" data-mark="${idx}" data-anima-role="sector" style="fill:${wedgeFill}" d="${d}"/>`;
  }).join('');

  // The disc lives in a fixed 200-tall box; the builder centers it (diagramDy) in
  // the unit, appends the spine + key rail to its right, and sets the viewBox.
  const svg = `<svg class="piechart-svg" viewBox="0 0 ${key.viewW} ${key.viewH}" role="img"><title>Pie chart</title>${key.desc}` +
    `<defs>${defs.join('')}${key.defs}</defs>` +
    `<g transform="translate(${key.diagramDx} ${key.diagramDy})">${wedges}</g>` +
    `${key.body}</svg>`;
  // Optional per-slice detail. Two coexisting surfaces, from one authored sublist,
  // both via the shared substrate (mark-detail.js) — identical to the other SVG
  // charts:
  //   1. Present/Practice — an inert <template class="chart-detail" data-mark="i">
  //      per slice (renders nothing), read by the parent-hosted reveal layer via
  //      data-mark (the wedge <path> carries the matching data-mark).
  //   2. Static PDF — the same detail, folded into the slide's SPEAKER NOTE as a
  //      Marp-faithful HTML comment. notes-core lifts it into the per-slide note
  //      (a PDF text annotation + the hidden aside) and strips the comment BEFORE
  //      render, so the pie's pixels stay byte-identical — the detail rides the
  //      existing notes channel, not the slide face. See the css-3d-charts note.
  const detailWrap = markDetail.detailPayload(parsed);
  const noteComment = markDetail.detailNote(parsed);
  return `<div class="piechart-figure">${svg}${detailWrap}</div>${noteComment}`;
}

function transformSection(html, ctx) {
  const isDonut = ctx.classTokens.includes('donut');
  return spliceFirstList(html, (ext) => buildPieChart(ext.inner, isDonut, ctx.orientation));
}

module.exports = { transformSection, buildPieChart, PIE_PALETTE };
