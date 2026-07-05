/**
 * Chart-family DOM transform — shared between the build path
 * (lattice-emulator.js) and the owned engine (lib/engine).
 *
 * Operates on rendered HTML strings so it can run in both contexts:
 *   - the emulator's per-slide HTML during PDF/HTML build
 *   - the marp-core engine's whole-render output for VS Code Marp preview
 *
 * This module is pure: no DOM, no markdown-it dependency. Inputs and outputs
 * are HTML strings.
 *
 * Why not a markdown-it ruler? The transform is structural (extract eyebrow
 * before h2, subtitle after h2, caption italic at the tail, rewrite the list
 * into chart-specific markup) and easier to express on rendered HTML than
 * on the token stream. The owned engine wraps `render`
 * and post-processes the resulting `html` string.
 *
 * Why ship through the engine instead of relying on a runtime <script>?
 * VS Code Marp preview filters HTML elements through Marp's allowlist,
 * which excludes <script> by default. Even with `markdown.marp.html: "all"`,
 * relative-path resolution and webview CSP made the runtime path unreliable.
 * The engine wrapper bakes the transform into the rendered HTML, so the
 * preview and the export pipelines see the same DOM.
 */

const CHART_LAYOUTS = ['progress', 'timeline-list', 'piechart', 'gantt', 'kanban', 'radar', 'quadrant', 'state-chart', 'funnel', 'map', 'journey', 'word-cloud', 'roadmap'];
// The six categorical slot hues, in rotation order — the rotation anchor for
// wedges and legend swatches (buildPieChart reads `.length` and derives each
// slot's --catN-hue per index). Wedges ride a hub→rim area-fade of --catN-hue
// (radar's vivid identity colour), not the pale --catN-fill, paired with the
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
let PIE_GRAD_SEQ = 0;

// Radar is a chart-family member. Its parsing + SVG geometry lives in
// lib/radar.js (the kernel); chart-family is the dispatch + chart-frame
// wrapping point. Three-renderer parity is enforced via the same kernel
// being called from lattice-emulator.js's inline chart-family block and
// from lattice-runtime.js's chart-family DOM mirror.
const radar = require('../radar/radar.transform');

// Quadrant — 2×2 scatter / matrix chart. Same kernel-as-module pattern
// as radar: lib/quadrant.js owns parsing + SVG emission; chart-family
// dispatches. Three-renderer parity enforced the same way.
const quadrant = require('../quadrant/quadrant.transform');

// State-chart — native finite-state-machine diagram. Numbered list of
// states, nested inline-code arrows for transitions. Kernel-as-module
// pattern; three-renderer parity via the same registry path.
const stateChart = require('../state-chart/state-chart.transform');

// Funnel — tapering stage chart. Same kernel-as-module pattern as radar /
// quadrant / state-chart: parse + SVG geometry live in the module, dispatch
// + chart-frame wrapping here.
const funnel = require('../funnel/funnel.transform');

// Map — spatial choropleth / highlight chart, the one component on the
// `spatial` form. Same kernel-as-module pattern; the baked basemap (projected
// SVG path data) lives in the kernel's map.basemap.json and ships inline in
// the JS bundles, never in dist/lattice.css.
const map = require('../map/map.transform');

// Journey — native user-journey board (mood curve / swimlane / heatmap /
// weighted). Folded into the chart family: a chart-frame member like the
// rest. Its kernel rewrites the nested list into a `.journey-board`; the
// chart-frame wrap then supplies the header/body/caption skeleton. Same
// kernel-as-module pattern as radar/quadrant; three-renderer parity via the
// same registry path. Lives at ../journey/ (chart bucket) since the fold.
const journey = require('../journey/journey.transform');

// Word-cloud — spiral-packed weighted terms. Also a chart-frame member; its
// kernel rewrites the first <ul> into a `.word-cloud-canvas` of absolutely
// positioned <span class="wc-word">, then the chart-frame wrap frames it.
// Before the fold it duplicated the chart-frame chrome in its own CSS; now it
// inherits the real skeleton. Kernel-as-module; three-renderer parity.
const wordCloud = require('../word-cloud/word-cloud.transform');

// Roadmap — workstream × phase grid (table) with cell state markers, plus a
// `horizons` variant that transposes the table into Now/Next/Later cards.
// Folded into the chart family: the kernel tags cells / transposes in place
// (it operates on a <table>, not a list), then the dispatch wraps the figure
// in `.roadmap-figure` so the div-based chart-frame body matcher catches it.
// Kernel-as-module; three-renderer parity. Lives at ../roadmap/ (chart bucket).
const roadmap = require('../roadmap/roadmap.transform');

// The shared SVG-native legend + spine builder — the keystone that keeps the four
// KEYED charts (pie/radar/map/cohort quadrant) one family. buildPieChart calls it
// here; the radar/map/quadrant kernels call it directly. See svg-legend.js and
// engineering/decisions/2026-06-13-svg-native-legend.md.
const { buildSvgLegend } = require('./svg-legend');
// Shared per-mark detail substrate (data-mark template payload + speaker-note
// fallback), generalized from the pie's original bespoke wiring. The pie now
// rides the same vocabulary as funnel/map/quadrant/radar — one source of truth
// (Hard Rules #1/#15). See mark-detail.js and
// engineering/decisions/2026-06-20-chart-detail-reveal-family.md.
const markDetail = require('./mark-detail');

// Canonical depth-aware list walkers + section walker (moved to lib/core so
// core primitives like split-panels never import a component kernel — see
// lib/core/html-lists.js / lib/core/section-walk.js).
const { parseTopLevelLis, extractFirstList } = require('../../../core/html-lists');
const { mapSections } = require('../../../core/section-walk');

function escAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Roadmap's body is a <table> (default / status) or a transposed
// `<div class="horizons">` grid (horizons variant) — not a single labelled
// figure div like the list-based members. Wrap whichever is present in a
// `.roadmap-figure` div so the (div-based) chart-frame body matcher and its
// depth-aware close scan treat it as the body. Idempotent.
function wrapRoadmapFigure(html, legend = '') {
  if (/class="roadmap-figure"/.test(html)) return html;
  // The status-marker key (or '') rides INSIDE the figure, after the grid, so
  // the chart-frame body wrap treats [grid + legend] as one body unit and the
  // legend sits bottom-centre within the body (never spilling to the footer).
  const inject = legend || '';
  // Horizons variant: wrap the .horizons grid (depth-aware, it nests
  // .horizon-card divs).
  const hz = html.indexOf('<div class="horizons">');
  if (hz >= 0) {
    let depth = 0, pos = hz, end = -1;
    while (pos < html.length) {
      if (html.startsWith('<div', pos)) {
        const c = html.indexOf('>', pos);
        if (c < 0) break;
        depth++; pos = c + 1;
      } else if (html.startsWith('</div>', pos)) {
        depth--;
        if (depth === 0) { end = pos + 6; break; }
        pos += 6;
      } else { pos++; }
    }
    if (end > 0) {
      return html.slice(0, hz) + '<div class="roadmap-figure">' +
        html.slice(hz, end) + inject + '</div>' + html.slice(end);
    }
    return html;
  }
  // Default / status: wrap the <table> (roadmap tables never nest a table).
  const t = html.indexOf('<table');
  if (t >= 0) {
    const close = html.indexOf('</table>', t);
    if (close >= 0) {
      const end = close + '</table>'.length;
      return html.slice(0, t) + '<div class="roadmap-figure">' +
        html.slice(t, end) + inject + '</div>' + html.slice(end);
    }
  }
  return html;
}

function stripTrailingPills(lead) {
  const pills = [];
  let s = lead;
  while (true) {
    const m = s.match(/^([\s\S]*?)\s*<code>([^<]+)<\/code>\s*$/);
    if (!m) break;
    pills.unshift(m[2].trim());
    s = m[1];
  }
  return { leadStripped: s, pills };
}

function buildProgressBars(ulInner) {
  const items = parseTopLevelLis(ulInner);
  const rows = items.map(item => {
    const nestedIdx = item.search(/<ul[^>]*>/);
    const lead = nestedIdx >= 0 ? item.slice(0, nestedIdx) : item;
    let note = '';
    if (nestedIdx >= 0) {
      const nestedMatch = item.slice(nestedIdx).match(/<ul[^>]*>\s*<li[^>]*>([\s\S]*?)<\/li>\s*<\/ul>/);
      if (nestedMatch) note = nestedMatch[1].trim();
    }
    const { leadStripped, pills } = stripTrailingPills(lead.replace(/<\/?p>/g, '').trim());
    const pctRaw = pills[0] || '';
    const status = pills[1] || '';
    const pct = parseInt(pctRaw, 10) || 0;
    const labelText = leadStripped.trim();
    const statusAttr = status ? ` data-s="${escAttr(status)}"` : '';
    const statusEl = status
      ? `<span class="chart-status"${statusAttr}>${status}</span>`
      : '<span class="chart-status-empty"></span>';
    const noteEl = note ? `<div class="progress-note">${note}</div>` : '';
    return `<div class="progress-row">` +
      `<div class="progress-label">${labelText}</div>` +
      `<div class="progress-track"><div class="progress-fill"${statusAttr} style="--pct:${pct}"><span class="progress-pct">${pctRaw}</span></div></div>` +
      statusEl +
      noteEl +
      `</div>`;
  }).join('');
  return `<div class="progress-bars">${rows}</div>`;
}

function buildTimelineSpine(olInner) {
  const items = parseTopLevelLis(olInner);
  const itemEls = items.map(item => {
    const nestedIdx = item.search(/<ul[^>]*>/);
    let lead = nestedIdx >= 0 ? item.slice(0, nestedIdx) : item;
    let body = '';
    if (nestedIdx >= 0) {
      const nestedMatch = item.slice(nestedIdx).match(/<ul[^>]*>\s*<li[^>]*>([\s\S]*?)<\/li>\s*<\/ul>/);
      if (nestedMatch) body = nestedMatch[1].trim();
    }
    lead = lead.replace(/<\/?p>/g, '').trim();
    const leadingMatch = lead.match(/^<code>([^<]+)<\/code>\s*/);
    const datePill = leadingMatch ? leadingMatch[1].trim() : '';
    if (leadingMatch) lead = lead.slice(leadingMatch[0].length);
    const { leadStripped, pills } = stripTrailingPills(lead);
    const statusPill = pills[0] || '';
    const title = leadStripped.trim();
    const dateEl = datePill
      ? `<div class="timeline-pill">${datePill}</div>`
      : '<div class="timeline-pill timeline-pill--empty"></div>';
    const statusEl = statusPill
      ? `<span class="chart-status" data-s="${escAttr(statusPill)}">${statusPill}</span>`
      : '';
    const bodyEl = body ? `<div class="timeline-body">${body}</div>` : '';
    return `<div class="timeline-item">` +
      `<div class="timeline-dot"></div>` +
      dateEl +
      `<div class="timeline-title">${title}</div>` +
      statusEl +
      bodyEl +
      `</div>`;
  }).join('');
  return `<div class="timeline-spine">${itemEls}</div>`;
}

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
  // fixed 200-tall box and is centred by the builder's diagramDy (the unit only
  // grows taller for a pathological long-tail key). See
  // engineering/decisions/2026-06-13-svg-native-legend.md.
  const DIAGRAM_H = 200;
  const DISC_R_EDGE = 180;               // disc right edge (cx 100 + R 80)
  const rows = parsed.map((p, idx) => {
    const slot = (idx % PIE_PALETTE.length) + 1;
    return {
      // 0-based slot in the categorical cycle — lets an a11y theme texture the
      // legend swatch to MATCH its wedge (`.wedge:nth-of-type(6n+…)`). Inert
      // otherwise (no rule keys off [data-cat] under a colour theme).
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
    const gradId = `pie-wedge-${++PIE_GRAD_SEQ}`;
    // Solid-area finish — a radial hub→rim DOME, the SAME area-fade the quadrant
    // zones use (identical 42/58/82 stops toward --chart-cat-base), so the two
    // solid-area charts read as one family: lighter at the hub, vivid toward the
    // rim. --chart-cat-base is --bg on light, black on dark, so warm wedges stay
    // hue-true on the navy canvas instead of mudding into it. The --catN-ink
    // stroke (piechart.styles.css) carries the hue at the wedge edge.
    //
    // The dome is the BASE finish: solid-area charts radiate from a centre, so a
    // centre-out fade reads more naturally than a bar's vertical wash, and it
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
      return `<path class="wedge" data-mark="${idx}" style="fill:${wedgeFill}" d="${d}"/>`;
    }
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return `<path class="wedge" data-mark="${idx}" style="fill:${wedgeFill}" d="${d}"/>`;
  }).join('');

  // The disc lives in a fixed 200-tall box; the builder centres it (diagramDy) in
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

// ── Gantt: continuous-time model ─────────────────────────────────────────────
// A time POINT is an ISO date (2026-03-15), a quarter (Q1, or year-qualified
// 2026 Q1), or a month (Jan, 2026 Jan). Every point resolves to a numeric
// position so bars + milestones lay on ONE continuous scale. Two vocabularies:
//   • ordinal (quarters or months, no dates) — unit = month-index; ticks are an
//     equal-width grid in month-space (quarters = 3 units, months = 1; exact).
//   • date (any ISO date present) — unit = epoch-days; ticks land on month /
//     quarter boundaries positioned by percent.
// `..` is the ONE span delimiter — in the eyebrow window AND in task spans.
// `after:` is parsed out and ignored here (validated in lint-core, never drawn).
// 2026-06-21-gantt-component-redesign.md.

const GANTT_MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const GANTT_MONTHS_FULL = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const GANTT_MONTH_LABEL = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function ganttDayOf(y, mo, d) { return Math.round(Date.UTC(y, mo, d) / 86400000); }

// Classify + parse one time point. Returns null when unrecognised.
//   { kind: 'date', day }            — ISO date → epoch days
//   { kind: 'q',   year|null, idx }  — quarter (idx 0..3)
//   { kind: 'm',   year|null, idx }  — month   (idx 0..11)
function parseTimePoint(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  const d = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (d) {
    const y = +d[1], mo = +d[2] - 1, dd = +d[3];
    const t = Date.UTC(y, mo, dd);
    const dt = new Date(t);
    // Date.UTC never returns NaN for overflow (2026-13-01 → 2027), so reject a
    // value that didn't round-trip — a malformed date is null, not a silent roll.
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== dd) return null;
    return { kind: 'date', day: Math.round(t / 86400000) };
  }
  const q = s.match(/^(?:(\d{4})\s*)?Q([1-4])$/i);
  if (q) return { kind: 'q', year: q[1] ? +q[1] : null, idx: +q[2] - 1 };
  // Month — an EXACT 3-letter abbrev or full name only, never a prefix, so a
  // label word ("Marketing", "Decision", "September") can't masquerade as one.
  const m = s.match(/^(?:(\d{4})\s*)?([A-Za-z]+)$/);
  if (m) {
    const w = m[2].toLowerCase();
    let mi = w.length === 3 ? GANTT_MONTHS.indexOf(w) : -1;
    if (mi < 0) mi = GANTT_MONTHS_FULL.indexOf(w);
    if (mi >= 0) return { kind: 'm', year: m[1] ? +m[1] : null, idx: mi };
  }
  return null;
}

// Split a span token on `..` → { startRaw, endRaw } (a bar) or { pointRaw } (a
// single point → milestone). Tolerant of optional surrounding whitespace.
function parseSpanToken(tok) {
  const parts = String(tok || '').split('..');
  if (parts.length >= 2) return { startRaw: parts[0].trim(), endRaw: parts.slice(1).join('..').trim() };
  return { pointRaw: String(tok || '').trim() };
}

// Resolve a point to [startVal, endVal] in the chart's unit. A span's START
// token contributes startVal; its END token contributes endVal — so `Q1..Q2`
// covers Q1 AND Q2 (inclusive), and a single date is zero-width.
function ganttPointSpan(pt, mode, baseYear) {
  if (mode === 'date') {
    if (pt.kind === 'date') return [pt.day, pt.day];
    const y = pt.year != null ? pt.year : (baseYear != null ? baseYear : 2000);
    if (pt.kind === 'q') return [ganttDayOf(y, pt.idx * 3, 1), ganttDayOf(y, pt.idx * 3 + 3, 1)];
    return [ganttDayOf(y, pt.idx, 1), ganttDayOf(y, pt.idx + 1, 1)];
  }
  // ordinal — month-index units
  if (pt.kind === 'date') {
    const dt = new Date(pt.day * 86400000);
    const ym = dt.getUTCFullYear() * 12 + dt.getUTCMonth();
    return [ym, ym + 1];
  }
  const y = pt.year != null ? pt.year : (baseYear != null ? baseYear : 0);
  if (pt.kind === 'q') return [y * 12 + pt.idx * 3, y * 12 + pt.idx * 3 + 3];
  return [y * 12 + pt.idx, y * 12 + pt.idx + 1];
}

// Read the eyebrow's inline-code pills → { window, today } (both raw strings).
// The eyebrow paragraph may carry the axis window (the pill containing `..`) and
// an optional `today <point>` pill, in any order.
function parseGanttEyebrow(eyebrowHtml) {
  const codes = [...String(eyebrowHtml || '').matchAll(/<code[^>]*>([^<]*)<\/code>/g)]
    .map(m => m[1].trim());
  let window = '', today = '';
  for (const c of codes) {
    if (/^today\b/i.test(c)) today = c.replace(/^today\s*:?\s*/i, '').trim();
    else if (c.includes('..')) window = c;
  }
  return { window, today };
}

// Build axis ticks → [{ label, mid }] where mid is the period MIDPOINT in the
// chart's unit. Both modes reduce to evenly-or-calendar-spaced period midpoints,
// positioned later by percent over [axisMin, axisMax].
function buildGanttTicks(axisMin, axisMax, mode, hasMonthVocab) {
  const ticks = [];
  if (mode === 'ordinal') {
    const step = hasMonthVocab ? 1 : 3;          // month vs quarter periods
    const start = Math.floor(axisMin / step) * step;
    for (let v = start; v < axisMax; v += step) {
      const monthIdx = ((v % 12) + 12) % 12;
      const label = hasMonthVocab
        ? GANTT_MONTH_LABEL[monthIdx]
        : 'Q' + (Math.floor(monthIdx / 3) + 1);
      ticks.push({ label, mid: v + step / 2 });
    }
    return ticks;
  }
  // date mode — values are epoch-days; step by calendar month/quarter
  const stepMonths = (axisMax - axisMin) > 31 * 16 ? 3 : 1;
  const d0 = new Date(axisMin * 86400000);
  const y = d0.getUTCFullYear();
  const m = stepMonths === 3 ? Math.floor(d0.getUTCMonth() / 3) * 3 : d0.getUTCMonth();
  let cursor = ganttDayOf(y, m, 1);
  let guard = 0;
  while (cursor < axisMax && guard++ < 600) {
    const cd = new Date(cursor * 86400000);
    const cy = cd.getUTCFullYear(), cm = cd.getUTCMonth();
    const next = ganttDayOf(cy, cm + stepMonths, 1);
    const mid = (Math.max(cursor, axisMin) + Math.min(next, axisMax)) / 2;
    const yTag = cm === 0 ? ` '${String(cy).slice(2)}` : '';
    const label = stepMonths === 3
      ? 'Q' + (Math.floor(cm / 3) + 1) + yTag
      : GANTT_MONTH_LABEL[cm] + yTag;
    ticks.push({ label, mid });
    cursor = next;
  }
  return ticks;
}

function buildGanttChart(ulInner, eyebrowHtml) {
  const { window: windowText, today: todayText } = parseGanttEyebrow(eyebrowHtml);

  // ── Pass 1 — parse lanes → tasks → typed tokens ──
  const lanes = parseTopLevelLis(ulInner).map(lane => {
    const sub = extractFirstList(lane);
    const label = (sub ? lane.slice(0, sub.start) : lane).replace(/<\/?p>/g, '').trim();
    const tasks = [];
    if (sub) {
      for (const item of parseTopLevelLis(sub.inner)) {
        // Peel an optional nested sublist → this task's reveal detail (the popover
        // payload + speaker note), via the shared substrate, BEFORE reading the
        // pills — the same capture order pie/funnel/state-chart use.
        const { lead, detail } = markDetail.splitDetail(item);
        const bc = lead.replace(/<\/?p>/g, '').trim();
        const { leadStripped, pills } = stripTrailingPills(bc);
        let spanTok = '', status = '', milestone = false;
        for (const p of pills) {
          const pl = p.trim();
          if (/^after\s*:/i.test(pl)) continue;                 // dependency — lint only
          if (/^milestone$/i.test(pl)) { milestone = true; continue; }
          if (KB_STATUS.includes(pl.toLowerCase())) { status = pl.toLowerCase(); continue; }
          if (pl.includes('..') || parseTimePoint(pl)) { spanTok = pl; }
          // any other token is ignored here; lint-core flags it
        }
        const sp = parseSpanToken(spanTok);
        const rawPts = sp.pointRaw != null ? [sp.pointRaw] : [sp.startRaw, sp.endRaw];
        const pts = rawPts.map(parseTimePoint);
        const spanText = sp.pointRaw != null ? sp.pointRaw : [sp.startRaw, sp.endRaw].filter(Boolean).join('–');
        tasks.push({ label: leadStripped.trim(), status, milestone, span: sp, pts, detail, spanText });
      }
    }
    return { label, tasks };
  });

  // ── Determine mode + base year ──
  const allPts = [];
  for (const lane of lanes) for (const t of lane.tasks) for (const p of t.pts) if (p) allPts.push(p);
  const win = windowText ? parseSpanToken(windowText) : null;
  const winPts = win && win.startRaw != null
    ? [parseTimePoint(win.startRaw), parseTimePoint(win.endRaw)].filter(Boolean)
    : [];
  const scopePts = [...allPts, ...winPts];
  const mode = scopePts.some(p => p.kind === 'date') ? 'date' : 'ordinal';
  const hasMonthVocab = scopePts.some(p => p.kind === 'm' || p.kind === 'date');
  const years = scopePts.map(p => p.year).filter(y => y != null);
  const baseYear = years.length ? Math.min(...years) : (mode === 'date' ? 2000 : 0);

  // ── Axis window — eyebrow override, else min start / max end across tasks ──
  let axisMin = Infinity, axisMax = -Infinity;
  if (winPts.length === 2) {
    axisMin = ganttPointSpan(winPts[0], mode, baseYear)[0];
    axisMax = ganttPointSpan(winPts[1], mode, baseYear)[1];
  } else {
    for (const lane of lanes) for (const t of lane.tasks) {
      if (!t.pts.length || t.pts.some(p => !p)) continue;
      const s = ganttPointSpan(t.pts[0], mode, baseYear)[0];
      const e = t.span.pointRaw != null ? s : ganttPointSpan(t.pts[1], mode, baseYear)[1];
      axisMin = Math.min(axisMin, s);
      axisMax = Math.max(axisMax, e);
    }
  }
  if (!Number.isFinite(axisMin) || !Number.isFinite(axisMax)) {
    axisMin = 0; axisMax = 4;                 // nothing parseable — empty ordinal axis
  } else if (axisMax <= axisMin) {
    // A single zero-width point (e.g. one date milestone). Pad a window around
    // it in the chart's own unit so it lands mid-axis instead of off-screen.
    const pad = mode === 'date' ? 30 : 1;
    axisMin -= pad; axisMax += pad;
  }
  const span = axisMax - axisMin;
  const pct = (v) => (((v - axisMin) / span) * 100);

  // ── Axis row — ticks positioned by percent (both modes) ──
  const tickHtml = buildGanttTicks(axisMin, axisMax, mode, hasMonthVocab)
    .filter(t => pct(t.mid) >= -0.01 && pct(t.mid) <= 100.01)
    .map(t => `<div class="gantt-tick" style="--gantt-x:${pct(t.mid).toFixed(3)}">${t.label}</div>`)
    .join('');
  const axisRow = `<div class="gantt-axis-row"><div class="gantt-axis-spacer"></div>` +
    `<div class="gantt-ticks">${tickHtml}</div></div>`;

  // ── Lanes + bars / milestones ──
  // Status is encoded by BAR COLOUR with no text on the bar, so a cold-open /
  // emailed reader needs a key — collect the statuses used and emit one below.
  const presentStatuses = new Set();
  // Per-mark detail (the HTML-mark reveal path, shared with state-chart): every
  // bar/milestone is a MARK tagged with a chart-wide 0-based data-mark + invisible
  // data-label/data-value (the popover title source). `marks` is built in the SAME
  // order so detailPayload/detailNote key their templates/notes by mark index.
  // Attributes don't paint → byte-identical when no task carries a detail sublist.
  let markIdx = 0;
  const marks = [];
  const stripTags = (s) => String(s == null ? '' : s).replace(/<[^>]+>/g, '');
  const markAttrs = (t) => {
    const mi = markIdx++;
    const plainLabel = stripTags(t.label).trim();
    // One value for BOTH surfaces (popover data-value + speaker-note valueRaw):
    // the span, or the status when a task has no span (the unscaled case), so the
    // on-screen popover and the PDF note never diverge.
    const value = t.spanText || t.status || '';
    marks.push({ label: plainLabel, valueRaw: value, detail: t.detail || '' });
    return ` data-mark="${mi}" data-label="${escAttr(plainLabel)}"` +
      (value ? ` data-value="${escAttr(value)}"` : '');
  };
  const lanesHtml = lanes.map(lane => {
    const barsHtml = lane.tasks.map(t => {
      const sAttr = t.status ? ` data-s="${escAttr(t.status)}"` : '';
      if (t.status) presentStatuses.add(t.status);
      const mAttr = markAttrs(t);
      const valid = t.pts.length && !t.pts.some(p => !p);
      if (!valid) {
        // Unparseable / missing span — keep the task visible (full-width, muted)
        // rather than dropping it; lint-core flags the cause.
        return `<div class="gantt-bar gantt-bar--unscaled"${sAttr}${mAttr} style="--gantt-x:0;--gantt-w:100">` +
          `${t.label}</div>`;
      }
      const clamp = (v) => Math.max(0, Math.min(100, v));
      const isMilestone = t.milestone || t.span.pointRaw != null;
      if (isMilestone) {
        const x = clamp(pct(ganttPointSpan(t.pts[0], mode, baseYear)[0]));
        // Near the right edge, flip the label to the LEFT of the diamond so it
        // doesn't run off the frame (the inclusive-window math usually leaves
        // headroom, but an end-anchored date milestone hits the edge).
        const endCls = x > 85 ? ' gantt-milestone--end' : '';
        return `<div class="gantt-milestone${endCls}"${sAttr}${mAttr} style="--gantt-x:${x.toFixed(3)}">` +
          `<span class="gantt-diamond" aria-hidden="true"></span>` +
          `<span class="gantt-mlabel">${t.label}</span></div>`;
      }
      // Clamp to the visible axis so a task reaching beyond an explicit eyebrow
      // window clips at the frame instead of overflowing the label column / edge.
      const x0 = clamp(pct(ganttPointSpan(t.pts[0], mode, baseYear)[0]));
      const x1 = clamp(pct(ganttPointSpan(t.pts[1], mode, baseYear)[1]));
      const x = x0, w = Math.max(x1 - x0, 0);
      return `<div class="gantt-bar"${sAttr}${mAttr} style="--gantt-x:${x.toFixed(3)};--gantt-w:${w.toFixed(3)}">` +
        `${t.label}</div>`;
    }).join('');
    return `<div class="gantt-lane">` +
      `<div class="gantt-lane-label">${lane.label}</div>` +
      `<div class="gantt-bars">${barsHtml}</div>` +
      `</div>`;
  }).join('');

  // ── Optional "today" line — opt-in via the eyebrow only ──
  let todayHtml = '';
  if (todayText) {
    const tp = parseTimePoint(todayText);
    if (tp) {
      const x = pct(ganttPointSpan(tp, mode, baseYear)[0]);
      if (x >= 0 && x <= 100) {
        todayHtml = `<div class="gantt-today" style="--gantt-x:${x.toFixed(3)}" aria-hidden="true"></div>`;
      }
    }
  }
  const lanesBlock = `<div class="gantt-lanes">${lanesHtml}${todayHtml}</div>`;

  // Status key — swatch + label per status present, in canonical order (the
  // piechart-legend idiom). The swatch reuses the bar's --fill-hue/--fill-ink,
  // so a chip and a bar of the same status read identically.
  const keyStatuses = KB_STATUS.filter(s => presentStatuses.has(s));
  const legendHtml = keyStatuses.length
    ? `<div class="gantt-legend" role="list" aria-label="Status key">` +
      keyStatuses.map(s =>
        `<span class="gantt-legend-item" role="listitem" data-s="${s}">` +
          `<span class="gantt-legend-swatch" aria-hidden="true"></span>` +
          `<span class="gantt-legend-label">${s}</span>` +
        `</span>`
      ).join('') +
      `</div>`
    : '';

  // Optional per-task detail → two coexisting surfaces from one authored sublist
  // (mark-detail.js), identical to the SVG charts + state-chart: (1) an inert
  // <template class="chart-detail" data-mark="i"> the parent-hosted reveal layer
  // shows in a popover on hover/tap; (2) the same detail folded into the slide's
  // speaker note. Emitted as SIBLINGS of .gantt-chart so the inert <template>s
  // (which carry data-mark) aren't miscounted as marks by the reveal layer.
  return `<div class="gantt-chart">${axisRow}${lanesBlock}${legendHtml}</div>` +
    markDetail.detailPayload(marks) + markDetail.detailNote(marks);
}

const KB_STATUS = ['on-track','done','live','at-risk','warn','blocked','fail','pilot','decision','deferred'];
const KB_SIZE   = ['s','m','l','xl'];
const KB_DONE_NAMES = ['done','completed','shipped','closed'];
// Lane colours ride the chart-family's own vivid catN spectrum (the same
// Apple-inspired hues pie/quadrant use), canvas-aware via --catN-ink — not
// the engine-wide --cN palette.
const LANE_COLOR_VARS = [
  'var(--chart-cat-1-ink)','var(--chart-cat-2-ink)','var(--chart-cat-3-ink)','var(--chart-cat-4-ink)',
  'var(--chart-cat-5-ink)','var(--chart-cat-6-ink)','var(--chart-cat-7-ink)','var(--chart-cat-8-ink)',
];

function buildKanbanBoard(ulInner) {
  const laneColorMap = {};
  let laneColorIdx = 0;
  const getLaneColor = (lane) => {
    if (!lane) return '';
    const key = lane.toLowerCase();
    if (!laneColorMap[key]) laneColorMap[key] = LANE_COLOR_VARS[laneColorIdx++ % LANE_COLOR_VARS.length];
    return laneColorMap[key];
  };

  const columns = parseTopLevelLis(ulInner);
  const columnsHtml = columns.map(col => {
    const colSub = extractFirstList(col);
    const colHeader = (colSub ? col.slice(0, colSub.start) : col)
      .replace(/<\/?p>/g, '').trim();
    const isDone = KB_DONE_NAMES.includes(colHeader.toLowerCase());

    let cardsHtml = '';
    if (colSub) {
      const cardItems = parseTopLevelLis(colSub.inner);
      cardsHtml = cardItems.map(cardContent => {
        const bodySub = extractFirstList(cardContent);
        const cardLead = (bodySub ? cardContent.slice(0, bodySub.start) : cardContent)
          .replace(/<\/?p>/g, '').trim();
        // Size: one trailing size code on the title line
        let size = '', cardTitle = cardLead;
        const sizeM = cardLead.match(/^([\s\S]*?)\s*<code>([^<]+)<\/code>\s*$/);
        if (sizeM && KB_SIZE.includes(sizeM[2].trim().toLowerCase())) {
          size = sizeM[2].trim().toUpperCase();
          cardTitle = sizeM[1].trim();
        }

        // Label + status: first sub-bullet (prose = label, trailing code = status)
        let label = '', status = '', cardBody = '';
        if (bodySub) {
          const subItems = parseTopLevelLis(bodySub.inner);
          if (subItems[0]) {
            const metaLine = subItems[0].replace(/<\/?p>/g, '').trim();
            const statM = metaLine.match(/^([\s\S]*?)\s*<code>([^<]+)<\/code>\s*$/);
            if (statM && KB_STATUS.includes(statM[2].trim().toLowerCase())) {
              status = statM[2].trim();
              label  = statM[1].replace(/<[^>]+>/g, '').trim();
            } else {
              label = metaLine.replace(/<[^>]+>/g, '').trim();
            }
          }
          cardBody = subItems[1] ? subItems[1].replace(/<\/?p>/g, '').trim() : '';
        }

        const laneColor = getLaneColor(label);
        const laneStyle = laneColor ? ` style="--lane-color:${laneColor}"` : '';
        const sAttr     = status ? ` data-s="${escAttr(status)}"` : '';
        const sizeEl    = size  ? `<span class="kanban-size">${size}</span>` : '';
        const laneEl    = label
          ? `<span class="kanban-lane" style="--lane-color:${laneColor || 'var(--accent)'}">${escAttr(label)}</span>`
          : '';
        const statusEl  = status
          ? `<span class="chart-status" data-s="${escAttr(status)}">${status}</span>`
          : '';
        const titleEl   = `<div class="kanban-card-title"><span class="kanban-title-text">${cardTitle}</span>${sizeEl}</div>`;
        const metaEl    = (laneEl || statusEl) ? `<div class="kanban-card-meta">${laneEl}${statusEl}</div>` : '';
        const bodyEl    = cardBody ? `<div class="kanban-card-body">${cardBody}</div>` : '';

        return `<div class="kanban-card"${sAttr}${laneStyle}>${titleEl}${metaEl}${bodyEl}</div>`;
      }).join('');
    }

    const doneAttr = isDone ? ' data-done' : '';
    return `<div class="kanban-column"${doneAttr}>` +
      `<div class="kanban-column-header">${colHeader}</div>` +
      `<div class="kanban-cards">${cardsHtml}</div>` +
      `</div>`;
  }).join('');

  return `<div class="kanban-board">${columnsHtml}</div>`;
}

/**
 * Transform a single section's inner HTML for the given chart layout.
 *
 * @param {string} innerHtml — the section's inner HTML (between <section> tags)
 * @param {string} cls — the section's space-separated class list
 * @returns {{ html: string, cls: string, transformed: boolean }}
 *          transformed=false if the layout is not a chart layout, or the
 *          section is missing the required h2/list — the inputs are returned
 *          verbatim and the caller should not splice anything back.
 */
// `orientation` is the deck-wide stamp ('portrait' | 'square' | undefined for
// landscape) read off the section's `data-orientation` — the single source both
// render paths already carry. Charts whose layout is baked into an SVG/viewBox
// (funnel today; the keyed radial/square charts next) use it to emit a tall
// composition for a portrait box. See 2026-06-19-chart-adaptive-sizing.md §7.
// ── Per-layout section builders ─────────────────────────────────────────────
// One small builder per chart layout: extract the list, run the kernel,
// splice the figure back. Each takes (html, ctx) where ctx carries
// { cls, classTokens, orientation } and returns { html, cls } — cls comes
// back because roadmap can add the auto-selected `horizons` token.
// transformChartSection dispatches through SECTION_BUILDERS below.

function spliceFirstList(html, build) {
  // Depth-aware extraction — a naive non-greedy /<ul>…<\/ul>/ stops at an
  // item's NESTED close tag, truncating the outer list. Match by depth.
  const ext = extractFirstList(html);
  if (!ext) return html;
  const figure = build(ext);
  if (figure == null) return html;
  return html.slice(0, ext.start) + figure + html.slice(ext.end);
}

function buildProgressSection(html) {
  return spliceFirstList(html, (ext) => buildProgressBars(ext.inner));
}

function buildTimelineSection(html) {
  return spliceFirstList(html, (ext) => buildTimelineSpine(ext.inner));
}

function buildPiechartSection(html, ctx) {
  const isDonut = ctx.classTokens.includes('donut');
  return spliceFirstList(html, (ext) => buildPieChart(ext.inner, isDonut, ctx.orientation));
}

function buildGanttSection(html) {
  // The eyebrow paragraph may carry TWO pills — the axis window and a `today`
  // marker — so capture a whole paragraph that is only inline-code pills and
  // let the builder read both (window has `..`, today starts with `today`).
  const eyeMatch = html.match(/<p[^>]*>((?:\s*<code[^>]*>[^<]*<\/code>)+)\s*<\/p>/);
  return spliceFirstList(html, (ext) => buildGanttChart(ext.inner, eyeMatch ? eyeMatch[1] : ''));
}

function buildKanbanSection(html) {
  return spliceFirstList(html, (ext) => buildKanbanBoard(ext.inner));
}

function buildRadarSection(html, ctx) {
  return spliceFirstList(html, (ext) => {
    const variant = radar.pickVariant(ctx.classTokens);
    const isMinimal = ctx.classTokens.includes('minimal');
    const model = radar.parseRadar(ext.inner, variant === 'quadrant');
    if (!model) return null;
    const scale = radar.resolveScale(model, radar.matchEyebrowText(html));
    return radar.buildRadar(model, variant, scale, isMinimal, ctx.orientation);
  });
}

function buildQuadrantSection(html, ctx) {
  return spliceFirstList(html, (ext) => {
    const variant = quadrant.pickVariant(ctx.classTokens);
    const model = quadrant.parseQuadrant(ext.inner);
    if (!model) return null;
    const scale = quadrant.resolveScale(model, quadrant.matchEyebrowText(html));
    return quadrant.buildQuadrant(model, variant, scale, ctx.orientation);
  });
}

function buildStateChartSection(html, ctx) {
  return spliceFirstList(html, (ext) => {
    const model = stateChart.parseStateChart(ext.inner);
    if (!model) return null;
    // Pass the full class-token list: state-chart reads two orthogonal
    // axes — presentation (inline) and direction (lr / tb). `orientation`
    // lets a portrait deck force the vertical default over an `lr` machine
    // that can't fit a tall box (state-chart.transform.js §buildStateChart).
    return stateChart.buildStateChart(model, ctx.classTokens, ctx.orientation);
  });
}

function buildFunnelSection(html, ctx) {
  return spliceFirstList(html, (ext) => {
    const model = funnel.parseFunnel(ext.inner);
    return model ? funnel.buildFunnel(model, ctx.orientation) : null;
  });
}

function buildMapSection(html, ctx) {
  return spliceFirstList(html, (ext) => {
    const basemap = map.pickBasemap(ctx.classTokens);
    const model = map.parseMap(ext.inner, basemap);
    if (!model) return null;
    const variant = map.pickVariant(ctx.classTokens);
    return map.buildMap(model, variant, ctx.classTokens, ctx.orientation);
  });
}

function buildJourneySection(html, ctx) {
  // The kernel rewrites the nested <ul> into a `.journey-board` in place,
  // leaving the h2 for the chart-frame wrap to lift into the header.
  return journey.transformJourneySection(html, ctx.cls, ctx.orientation);
}

function buildWordCloudSection(html, ctx) {
  // The kernel rewrites the first <ul> into a `.word-cloud-canvas` in place,
  // leaving the h2 for the chart-frame wrap.
  return wordCloud.transformWordCloudSection(html, ctx.cls);
}

function buildRoadmapSection(html, ctx) {
  let cls = ctx.cls;
  // On a PORTRAIT deck, auto-select the horizons card form: the wide table
  // letterboxes in a tall box (5+ columns crushed, header collisions), while
  // the phase cards stack into a clean top-to-bottom read. Adding the token to
  // `cls` drives BOTH the transpose (transformRoadmapSection reads it) AND the
  // section-class-gated card CSS (`section.roadmap.horizons`) — and it rides
  // into the returned cls, so the live section carries the class. The CSS then
  // stacks the cards to one column box-locally. 2026-06-19-chart-adaptive-sizing §10.
  if (ctx.orientation === 'portrait' && !ctx.classTokens.includes('horizons')) {
    cls = (cls + ' horizons').trim();
  }
  // The kernel tags the table's cells (and transposes to .horizons under the
  // `horizons` variant) in place. Unlike the list-based members, roadmap's
  // body is a <table> / .horizons grid, so wrap it in a `.roadmap-figure`
  // div for the (div-based) chart-frame body matcher.
  html = roadmap.transformRoadmapSection(html, cls);
  // Build the status-marker key from the now-tagged cells and tuck it inside
  // the figure (bottom-centre under the grid). Empty when no markers exist.
  // Only `status` opts out: its heavy treatment already prints SHIPPED /
  // IN FLIGHT / … on every cell, so a key is redundant. (`horizons` once
  // opted out too — its cards filled the body — but the horizons grid now
  // sizes to content and centres, freeing a key row; see roadmap.styles.css.)
  const skipKey = /\bstatus\b/.test(cls);
  const roadmapKey = skipKey ? '' : roadmap.buildStatusLegend(html);
  return { html: wrapRoadmapFigure(html, roadmapKey), cls };
}

const SECTION_BUILDERS = {
  progress: buildProgressSection,
  'timeline-list': buildTimelineSection,
  piechart: buildPiechartSection,
  gantt: buildGanttSection,
  kanban: buildKanbanSection,
  radar: buildRadarSection,
  quadrant: buildQuadrantSection,
  'state-chart': buildStateChartSection,
  funnel: buildFunnelSection,
  map: buildMapSection,
  journey: buildJourneySection,
  'word-cloud': buildWordCloudSection,
  roadmap: buildRoadmapSection,
};

// ── The chart-frame wrap (eyebrow / h2 / subtitle, body, caption) ──────────

// Locate the h2 and the figure div the builder emitted, then find the
// figure's matching </div> by depth. Returns null when either is missing
// (the section wasn't a well-formed chart — caller falls back untransformed).
function extractChartBody(html) {
  const h2Match = /<h2[^>]*>[\s\S]*?<\/h2>/.exec(html);
  const bodyRE = /<div\s+class="(?:progress-bars|timeline-spine|piechart-figure|gantt-chart|kanban-board|radar-figure|quadrant-figure|state-chart-figure|funnel-figure|map-figure|journey-board|word-cloud-canvas|roadmap-figure)"[^>]*>/;
  const bodyMatch = h2Match && bodyRE.exec(html.slice(h2Match.index + h2Match[0].length));
  if (!h2Match || !bodyMatch) return null;

  const h2El = h2Match[0];
  const beforeH2 = html.slice(0, h2Match.index);
  const afterH2 = html.slice(h2Match.index + h2El.length);
  const bodyStart = bodyMatch.index;
  // Depth-aware close-tag scan to find the matching </div> for chart-body.
  let depth = 0, pos = bodyStart, end = -1;
  while (pos < afterH2.length) {
    if (afterH2.startsWith('<div', pos)) {
      const close = afterH2.indexOf('>', pos);
      if (close < 0) break;
      depth++; pos = close + 1;
    } else if (afterH2.startsWith('</div>', pos)) {
      depth--;
      if (depth === 0) { end = pos + 6; break; }
      pos += 6;
    } else { pos++; }
  }
  if (end <= 0) return null;

  return {
    h2El,
    beforeH2,
    between: afterH2.slice(0, bodyStart),
    bodyHtml: afterH2.slice(bodyStart, end),
    afterBody: afterH2.slice(end),
  };
}

// A trailing single-pill paragraph right before the h2 becomes the eyebrow.
function liftChartEyebrow(beforeH2) {
  const eyeMatch = beforeH2.match(/<p[^>]*>\s*<code>([^<]+?)<\/code>\s*<\/p>\s*$/);
  if (!eyeMatch) return { eyebrowEl: '', beforeRest: beforeH2 };
  return {
    eyebrowEl: `<p class="chart-eyebrow"><code>${eyeMatch[1]}</code></p>`,
    beforeRest: beforeH2.slice(0, eyeMatch.index),
  };
}

// The first paragraph between the h2 and the figure becomes the subtitle.
function liftChartSubtitle(between) {
  const subMatch = between.match(/<p[^>]*>([\s\S]*?)<\/p>/);
  return subMatch ? `<p class="chart-subtitle">${subMatch[1]}</p>` : '';
}

// A trailing paragraph after the figure becomes the caption (unwrapping a
// full-body <em>). A `_footer` directive makes Marpit append
// `<footer>…</footer>` after the user's trailing caption paragraph, so the
// caption is no longer at the end of afterBody — the `\s*$` anchor would
// miss it and the caption would fall through as a raw full-width <p> at the
// slide edge (engineering/gotchas.md "Chart caption swallowed when _footer
// is set"). Peel a trailing <footer> off first, match the caption against
// the remainder, then re-append the footer so its order is preserved.
function liftChartCaption(afterBody) {
  const footerM = afterBody.match(/\s*<footer\b[\s\S]*?<\/footer>\s*$/);
  const trailingFooter = footerM ? footerM[0] : '';
  const captionScope = footerM ? afterBody.slice(0, footerM.index) : afterBody;
  const capMatch = captionScope.match(/<p[^>]*>([\s\S]*?)<\/p>\s*$/);
  if (!capMatch) return { captionEl: '', afterRest: afterBody };
  let cap = capMatch[1];
  const emM = cap.match(/^<em>([\s\S]*)<\/em>$/);
  if (emM) cap = emM[1];
  return {
    captionEl: `<p class="chart-caption">${cap}</p>`,
    afterRest: captionScope.slice(0, capMatch.index) + trailingFooter,
  };
}

function transformChartSection(innerHtml, cls, orientation) {
  const classTokens = String(cls).trim().split(/\s+/);
  const chartLayout = CHART_LAYOUTS.find(l => classTokens.includes(l));
  if (!chartLayout) return { html: innerHtml, cls, transformed: false };
  // Idempotency: a section already wrapped in chart-frame is a no-op.
  if (classTokens.includes('chart-frame')) return { html: innerHtml, cls, transformed: false };

  // The engine's renderer adds id="..." to headings and may add attributes
  // to <ul>/<ol>; the builders' regexes all tolerate optional attributes on
  // the opening tag. Lattice's own emulator emits attribute-free tags so
  // the same patterns work for both render paths.
  const built = SECTION_BUILDERS[chartLayout](innerHtml, { cls, classTokens, orientation });
  let html = built;
  if (built && typeof built === 'object') { html = built.html; cls = built.cls; } // roadmap threads cls

  // Wrap in chart-frame skeleton (eyebrow / h2 / subtitle, body, caption).
  const parts = extractChartBody(html);
  if (!parts) return { html: innerHtml, cls, transformed: false };

  const { eyebrowEl, beforeRest } = liftChartEyebrow(parts.beforeH2);
  const subtitleEl = liftChartSubtitle(parts.between);
  const { captionEl, afterRest } = liftChartCaption(parts.afterBody);

  const newHtml = beforeRest +
    `<div class="chart-header">` + eyebrowEl + parts.h2El + subtitleEl + `</div>` +
    `<div class="chart-body">` + parts.bodyHtml + `</div>` +
    captionEl +
    afterRest;

  const newCls = classTokens.includes('chart-frame')
    ? cls
    : (cls + ' chart-frame').trim();

  return { html: newHtml, cls: newCls, transformed: true };
}

/**
 * Transform every chart-family `<section>` in a Marpit `render()` HTML output.
 * Used by the owned engine (lib/engine) so the preview
 * renders the same DOM the export pipeline does, without any runtime script.
 *
 * The regex finds Marpit's slide sections — `<section id="N" ... class="..."
 * data-lattice-slide="N" ...>...</section>` — and rewrites those whose class
 * list contains a chart layout token. Sections that don't match a chart
 * layout pass through unchanged.
 */
function applyToRenderedHtml(html) {
  return mapSections(html, (openTag, cls, inner) => {
    const classTokens = cls.trim().split(/\s+/);
    if (!CHART_LAYOUTS.some(l => classTokens.includes(l))) return null;
    // Deck-wide orientation stamp (absent → landscape, byte-identical). Read off
    // the same `data-orientation` the slide pipeline already wrote on the section.
    const orientMatch = openTag.match(/\sdata-orientation="([^"]*)"/);
    const orientation = orientMatch ? orientMatch[1] : undefined;
    const { html: newInner, cls: newCls, transformed } = transformChartSection(inner, cls, orientation);
    if (!transformed) return null;
    // Rebuild the open tag with the updated class attribute.
    const newOpenTag = /\sclass="[^"]*"/.test(openTag)
      ? openTag.replace(/\sclass="[^"]*"/, ` class="${escAttr(newCls)}"`)
      : openTag.replace(/<section/, `<section class="${escAttr(newCls)}"`);
    return { openTag: newOpenTag, inner: newInner };
  });
}

module.exports = {
  CHART_LAYOUTS,
  PIE_PALETTE,
  transformChartSection,
  applyToRenderedHtml,
  // Exposed for unit tests
  parseTopLevelLis,
  stripTrailingPills,
  buildProgressBars,
  buildTimelineSpine,
  buildPieChart,
  buildGanttChart,
  buildKanbanBoard,
  extractFirstList,
};
