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
const { parseValue } = require('../../../core/chart-values.js');
const { takeRecord, recordRow, settleLead } = require('../../../core/chart-rows.js');
const { escAttr, plainText, stripTrailingPills, spliceFirstList } = require('../_chart-family/transform-utils');
const { nextRenderSeq, renderIdPrefix } = require('../../../core/render-ids');
const { fitKeyToPane } = require('../_chart-family/svg-legend');
const { keySvg } = require('../_chart-family/legend-svg-key');
// The family's ONE aria-hidden wrapper (HARD RULE #1) — see its docblock for
// why `role="img"` does not do this by itself.
const { ariaHiddenMarks } = require('../_chart-family/cartesian');
const markDetail = require('../_chart-family/mark-detail');
const layer = require('../_chart-family/callout-layer');

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

// Per-wedge paint server counter: each wedge's one-stop server carries its flat solid. Unique ids per render dodge
// the SVG duplicate-id trap. Siblings: radar.transform.js areaGradient, quadrant.transform.js.
// The sequence is RENDER-scoped (lib/core/render-ids.js) — a module-level counter was
// process-scoped, which made render() non-deterministic across calls.

// wrapLabelToLines, the SVG-native legend/spine geometry, AND the legend text
// helpers (svgText/xmlEsc — strip inline HTML then escape at emit) moved to
// ./legend-svg-key.js (keySvg), shared by all four keyed charts so they stay
// one family. buildPieChart passes raw label/value strings; the builder handles
// stripping + escaping.
function buildPieChart(ulInner, isDonut, orientation, paneView, ctx = {}) {
  const items = parseTopLevelLis(ulInner);
  const parsed = items.map(item => {
    // A slice may carry an optional nested sublist — captured as present-mode
    // detail (the popover payload). Split it off the lead BEFORE reading the
    // label/value pill, via the shared (depth-aware) substrate splitter so the
    // pie uses the SAME capture as funnel/map/quadrant/radar.
    const { lead: leadPart, detail } = markDetail.splitDetail(item);
    const lead = leadPart.replace(/<\/?p>/g, '').trim();
    // A slice written as one `{35%}` record is read through the row schema (chart-rows.js `takeRecord`), the reader the narrator
    // uses; an old-form slice reads its trailing spans as it always did (phase 4 deletes that branch).
    const { leadStripped, pills } = recordRow('piechart', takeRecord('piechart', lead)) || stripTrailingPills(settleLead('piechart', lead));
    const valueRaw = pills[0] || '0';
    // The one number reader every chart shares (lib/core/chart-values.js, Segno phase 2):
    // `$4.2M`, `1,25M` and `(12)` read the same here as on every other chart. A slice is a
    // share of a whole, so its size is the magnitude; a sign means nothing to a wedge.
    const n = parseValue(valueRaw);
    const num = Number.isFinite(n) ? Math.abs(n) : 0;
    return { label: leadStripped.trim(), valueRaw, authored: pills[0] || '', num, detail };
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
      // legend swatch to MATCH its wedge (`.wedge:nth-of-type(6n+…)`). The wedge
      // itself carries the same slot as `data-hue` (the mark contract), which is
      // what a chart finish keys on.
      cat: idx % PIE_PALETTE.length,
      swatchFill: `var(--chart-cat-${slot}-body)`,
      swatchStroke: `var(--chart-cat-${slot}-ink)`,
      label: p.label,
      value: p.valueRaw,
      // Row idx names wedge idx (`data-mark="${idx}"` below): a tap on it opens the wedge's card.
      markFor: idx,
    };
  });
  // In a PANE the key keeps slide-size type and the disc gives (svg-legend.js fitKeyToPane).
  const { key } = fitKeyToPane(
    (o, fontScale) => keySvg({ rows, diagramRight: DISC_R_EDGE, diagramHeight: DIAGRAM_H, hasValues: true, orientation: o, fontScale }),
    { orientation, paneView, diagramHeight: DIAGRAM_H });

  const cx = 100, cy = DIAGRAM_H / 2, R = 80, r = 50;
  let cumul = 0;
  const defs = [];
  const wedgeShapes = []; // each wedge's outline and the point a marker sits at, for a callout
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
    const mid = (startAngle + endAngle) / 2;
    const rm = isDonut ? (R + r) / 2 : R * 0.62;
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
    // The wedge is its category's flat SOLID (chart-family.styles.css § THE SOLID TIER), the same paint as every
    // other mark in the family. A one-stop paint server is the vehicle, because a presentation attribute cannot read
    // a var(); the fill it carries is one color.
    defs.push(`<radialGradient id="${gradId}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${R}">` +
      `<stop offset="0%" style="stop-color:${hue}"/>` +
      `</radialGradient>`);
    const wedgeFill = `url(#${gradId})`;
    // The wedge's own identity, for the Present Guide: `narratePie` / the data-series floor say
    // "Deck production, forty-six percent", so the wedge that label leads and that value
    // corroborates is the one the pointer lands on. The legend row used to be the only place a
    // wedge's name existed, and a wedge that cannot be named cannot be pointed at.
    const ident = ` data-label="${escAttr(plainText(p.label))}"` + (p.authored ? ` data-value="${escAttr(p.authored)}"` : '');
    if (isDonut) {
      const ix1 = (cx + r * Math.sin(startAngle)).toFixed(2);
      const iy1 = (cy - r * Math.cos(startAngle)).toFixed(2);
      const ix2 = (cx + r * Math.sin(endAngle)).toFixed(2);
      const iy2 = (cy - r * Math.cos(endAngle)).toFixed(2);
      const d = `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${r} ${r} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
      wedgeShapes[idx] = { d, x: cx + rm * Math.sin(mid), y: cy - rm * Math.cos(mid) };
      return `<path class="wedge" data-mark="${idx}" data-hue="${slot}" data-encodes="hue" data-paint="fill"${ident} data-anima-role="sector" style="fill:${wedgeFill}" d="${d}"/>`;
    }
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    wedgeShapes[idx] = { d, x: cx + rm * Math.sin(mid), y: cy - rm * Math.cos(mid) };
    return `<path class="wedge" data-mark="${idx}" data-hue="${slot}" data-encodes="hue" data-paint="fill"${ident} data-anima-role="sector" style="fill:${wedgeFill}" d="${d}"/>`;
  }).join('');

  // AUTHORED CALLOUTS (callout-layer.js): a note names a wedge by its label; the wedge is ringed along its
  // own outline and marked, its words sit beside the disc or under it, whichever leaves the plot larger,
  // and the key goes around that whole unit.
  const co = ctx.callouts
    ? { res: layer.resolve(ctx.callouts.legends, { off: ctx.callouts.off, find: wedgeTarget(parsed, wedgeShapes) }) }
    : null;
  if (co?.res.callouts.length) {
    const view = { w: DISC_R_EDGE, h: DIAGRAM_H };
    const plot = { x0: cx - R, x1: cx + R, y0: cy - R, y1: cy + R };
    const attempt = (at) => {
      const r = layer.place(co.res.callouts, { view, plot, side: at.callouts, keyed: true, avoid: [], laneMax: 96 });
      const k = keySvg({
        rows, diagramRight: at.callouts === 'right' ? r.w : DISC_R_EDGE, diagramHeight: r.h, hasValues: true,
        orientation: at.key === 'below' ? 'portrait' : 'landscape',
      });
      return { ...r, key: k, w: k.viewW, h: k.viewH };
    };
    const won = layer.choose({ ctx: { ...ctx, orientation, paneView }, view, hasCallouts: true, hasKey: true, attempt });
    co.res.dropped = won.lost;
    co.res.callouts = won.kept;
    // The key's own `<desc>` names the wedges; the callouts join it, so the one description a screen reader
    // gets carries both (the marks are aria-hidden).
    const said = escAttr(layer.describe(co.res, (i) => plainText(parsed[i].label), { kind: 'wedge' }));
    const desc2 = won.key.desc ? won.key.desc.replace(/<\/desc>$/, () => `${said}</desc>`) : `<desc>${said.trim()}</desc>`;
    const svg2 = `<svg class="piechart-svg" viewBox="0 0 ${won.w} ${won.h}" role="img"><title>Pie chart</title>${desc2}` +
      `<defs>${defs.join('')}${won.key.defs}</defs>` +
      ariaHiddenMarks(`<g transform="translate(${won.key.diagramDx} ${won.key.diagramDy})">${wedges}${won.svg}</g>${won.key.body}`) + '</svg>';
    const marks = layer.mergeDetail(parsed, co.res, escAttr);
    return `<div class="piechart-figure">${svg2}${markDetail.detailPayload(marks)}</div>${markDetail.detailNote(marks)}`;
  }

  // The disc lives in a fixed 200-tall box; the builder centers it (diagramDy) in
  // the unit, appends the spine + key rail to its right, and sets the viewBox.
  // Callouts that draw nothing (switched off, or none naming a wedge) still say so in the description.
  const said0 = co ? escAttr(layer.describe(co.res, (i) => plainText(parsed[i].label), { kind: 'wedge' })) : '';
  const keyDesc = said0 ? (key.desc ? key.desc.replace(/<\/desc>$/, () => `${said0}</desc>`) : `<desc>${said0.trim()}</desc>`) : key.desc;
  const svg = `<svg class="piechart-svg" viewBox="0 0 ${key.viewW} ${key.viewH}" role="img"><title>Pie chart</title>${keyDesc}` +
    `<defs>${defs.join('')}${key.defs}</defs>` +
    ariaHiddenMarks(
      `<g transform="translate(${key.diagramDx} ${key.diagramDy})">${wedges}</g>${key.body}`,
    ) + '</svg>';
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
  const detailParsed = co ? layer.mergeDetail(parsed, co.res, escAttr) : parsed;
  const detailWrap = markDetail.detailPayload(detailParsed);
  const noteComment = markDetail.detailNote(detailParsed);
  return `<div class="piechart-figure">${svg}${detailWrap}</div>${noteComment}`;
}

/** Tie a callout's `for=` to a wedge by its label or index; its marker sits at the wedge's middle, and the
 *  ring follows its outline. */
function wedgeTarget(parsed, shapes) {
  const names = parsed.map((p) => plainText(p.label));
  return (target) => {
    const i = layer.matchName(target, names);
    if (i < 0 || !shapes[i]) return null;
    const s = shapes[i];
    const size = 16;
    return { mark: i, box: { cx: s.x, cy: s.y, w: size, h: size, ring: 'path', d: s.d } };
  };
}

function transformSection(html, ctx) {
  const isDonut = ctx.classTokens.includes('donut');
  return layer.around(html, ctx, (h, lifted) => spliceFirstList(h, (ext) => buildPieChart(ext.inner, isDonut, ctx.orientation, ctx.paneView, lifted ? { ...ctx, callouts: lifted } : ctx)));
}

module.exports = { transformSection, buildPieChart, PIE_PALETTE };
