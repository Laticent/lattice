/**
 * Radar / spider chart — kernel for the `radar` chart-family member.
 *
 * Pure parsing + SVG-geometry engine. Section dispatch and chart-frame
 * wrapping are owned by lib/components/chart/_chart-family/chart-family.js (radar is one of the
 * CHART_LAYOUTS members alongside progress / timeline-list / piechart /
 * gantt / kanban). This module just turns a parsed value model into a
 * positioned `<div class="radar-figure">` HTML string.
 *
 * Authoring (series-major nested list):
 *
 *   <!-- _class: radar -->
 *
 *   `Scale · 0–100`            <- optional: eyebrow pins the value scale
 *   ## Skills audit
 *
 *   - Teacher
 *     - Calculus `85`
 *     - Geometry `70`
 *     - Algebra `90`
 *   - Student
 *     - Calculus `75`
 *     - Geometry `80`
 *     - Algebra `85`
 *
 * Each top-level <li> is a series; nested <li>s are `axis <code>value</code>`.
 * The first series fixes the axis order; later series align by axis label
 * (falling back to position). The scale auto-fits the data max (rounded up
 * to a clean interval) unless the eyebrow `<code>` declares a range — e.g.
 * `0–100`, `0-100`, `0 to 100`, or a lone `100`.
 *
 * One default plus five modifier variants — each answers a distinct read:
 *   radar                  multi-series overlay (the workhorse)
 *   radar target           series vs a `Target`/`Goal` ring, gap shaded
 *   radar delta            two series (before → after), change shaded
 *   radar benchmark        hero series vs a min–max envelope of the rest
 *   radar quadrant         axes grouped into named sectors (3-level list)
 *   radar small-multiples  one mini radar per series, shared scale
 *
 * `minimal` (stroke-only, faint grid) and `dark` are composable cross-cutting
 * modifiers — they layer on any variant. `minimal` is read here as a flag;
 * `dark` is handled entirely in CSS.
 *
 * This module is pure: HTML string in, HTML string out. No DOM, no markdown-it
 * dependency. The geometry is deterministic — same source, same SVG.
 *
 * Callers of this kernel (three-renderer parity):
 *   - lib/components/chart/_chart-family/chart-family.js     — engine-path dispatch (lib/engine)
 *   - lattice-emulator.js     — inline build-path dispatch
 *   - lattice-runtime.js      — DOM mirror for marp-vscode preview / web
 */

const RADAR_MODIFIERS = ['target', 'delta', 'benchmark', 'quadrant', 'small-multiples'];

// Series colour rotation. Same categorical tokens the other native charts
// cycle (piechart in lib/components/chart/_chart-family/chart-family.js — PIE_PALETTE; journey
// in lib/components/journey/journey.transform.js; roadmap in
// lib/components/roadmap/roadmap.transform.js). Palette-blind — every
// active theme supplies --cat-1-mark … --cat-8-mark via its categorical block.
//
// Regression history: this list briefly referenced --cat-blue/--cat-orange/…
// which were valid before the themes/G-generation refactor on 2026-05-15
// (commit 552e84a) unified categorical tokens to --c{N}-dark. The radar
// feature landed earlier the same day (commit e03a71f) and was never
// caught because the unit tests pin SVG structure, not fill colour.
// Each entry resolves to the slot's *canvas-vivid* hue — the saturated end
// lives on a different cN cycle per canvas (--cN-dark on light, --cN-light on
// dark), so light-dark() picks the vivid one for the current canvas and the
// curves stay bold in both modes. Matches the --catN-hue used by the rest of
// the categorical chart family (see _chart-family.css). Each colour drives a
// translucent area fill + solid stroke via --series-color.
const RADAR_PALETTE = [
  'var(--chart-cat-1-hue)', 'var(--chart-cat-2-hue)', 'var(--chart-cat-3-hue)', 'var(--chart-cat-4-hue)',
  'var(--chart-cat-5-hue)', 'var(--chart-cat-6-hue)', 'var(--chart-cat-7-hue)', 'var(--chart-cat-8-hue)',
];

// Geometry — a 300×300 viewBox, plot centred with room for rim labels.
// .radar-svg sets overflow:visible so long axis labels can spill the box.
const GEOM = { cx: 150, cy: 150, R: 105, rings: 4, labelGap: 22, viewBox: '0 0 300 300' };
const DIAGRAM_W = 300, DIAGRAM_H = 300;   // the radar diagram box; the key rail appends to its right
// Portrait legend-below: the axis labels (anchored at R+labelGap from centre)
// spill past the 300-wide diagram box. Landscape hides this in the right rail;
// portrait has no rail, so reserve symmetric room each side so a long rim label
// (e.g. "Geometry") can't clip at the viewBox edge. See chart-adaptive-sizing §9.
const PORTRAIT_LABEL_PAD = 64;

// The shared SVG-native legend + spine builder — radar's key now lives inside the
// diagram <svg> (one scaling unit) instead of an HTML <ol> beside it, so it reads
// as one family with the pie/map/quadrant. See svg-legend.js and
// engineering/decisions/2026-06-13-svg-native-legend.md.
const { buildSvgLegend } = require('../_chart-family/svg-legend');

// Shared per-mark detail substrate (data-mark template payload + speaker-note
// fallback), generalized from the pie. Radar reveals PER-AXIS — the mark is the
// axis (the spoke/label), so detail is authored as a sublist under each axis in
// the first series (one level deeper under a group for the `quadrant` variant).
// See mark-detail.js and engineering/decisions/2026-06-20-chart-detail-reveal-family.md.
const markDetail = require('../_chart-family/mark-detail');

// Shared string/list helpers for the SVG chart kernels (one home; the
// quadrant/radar copies were the duplication scan's biggest exact clone).
const {
  escHtml, stripTags, fmtNum, findOuterUL, splitTopLevelLI,
} = require('../_chart-family/transform-utils');

// ── Source parsing ─────────────────────────────────────────────────────────

// One `axis <code>value</code>` leaf item. The trailing inline-code holds the
// value; anything before it is the axis label.
function parseAxisItem(liInner) {
  // Split an optional nested detail sublist off the axis BEFORE reading the
  // trailing value pill — it's the per-axis present-mode popover payload, not
  // part of the axis label/value. (For `radar quadrant` this is the 4th list
  // level; for every other variant the 3rd — both free.) See mark-detail.js.
  const { lead, detail } = markDetail.splitDetail(liInner);
  let value = 0;
  let text = lead;
  const m = /<code\b[^>]*>([^<]*)<\/code>\s*$/.exec(lead.trim());
  if (m) {
    const n = parseFloat(stripTags(m[1]));
    value = Number.isFinite(n) ? n : 0;
    text = lead.trim().slice(0, m.index);
  }
  return { label: stripTags(text), value, detail };
}

// One series. For quadrant the nested list is groups → axes (3 levels); for
// every other variant it is axes directly (2 levels).
function parseSeries(liInner, isQuadrant) {
  const nested = findOuterUL(liInner);
  const name = stripTags(nested ? liInner.slice(0, nested.start) : liInner);
  const points = [];
  if (nested) {
    const childLis = splitTopLevelLI(nested.inner);
    if (isQuadrant) {
      for (const groupLi of childLis) {
        const groupNested = findOuterUL(groupLi);
        const groupName = stripTags(groupNested ? groupLi.slice(0, groupNested.start) : groupLi);
        if (!groupNested) continue;
        for (const axLi of splitTopLevelLI(groupNested.inner)) {
          const { label, value, detail } = parseAxisItem(axLi);
          if (label) points.push({ axis: label, group: groupName, value, detail });
        }
      }
    } else {
      for (const axLi of childLis) {
        const { label, value, detail } = parseAxisItem(axLi);
        if (label) points.push({ axis: label, group: null, value, detail });
      }
    }
  }
  return { name, points };
}

// Nested <ul> → { axes, series, groups }. Axis order and grouping come from
// the first series; later series are aligned to it by axis label (case-
// insensitive), falling back to position when a label doesn't match.
function parseRadar(ulInner, isQuadrant) {
  const raw = splitTopLevelLI(ulInner)
    .map(li => parseSeries(li, isQuadrant))
    .filter(s => s.name && s.points.length > 0);
  if (raw.length === 0) return null;

  const axes = raw[0].points.map(p => ({ label: p.axis, group: p.group, detail: p.detail }));
  const series = raw.map(s => {
    const byLabel = new Map(s.points.map(p => [p.axis.toLowerCase(), p.value]));
    const values = axes.map((ax, i) => {
      const key = ax.label.toLowerCase();
      if (byLabel.has(key)) return byLabel.get(key);
      return s.points[i] ? s.points[i].value : 0;
    });
    return { name: s.name, values };
  });

  const groups = [];
  for (const ax of axes) {
    if (ax.group && !groups.includes(ax.group)) groups.push(ax.group);
  }
  return { axes, series, groups };
}

// ── Scale resolution ───────────────────────────────────────────────────────

// Round up to a "nice" axis maximum: 1, 2, 2.5, 5 × 10^k. Keeps the ring
// tick labels readable instead of e.g. 87.3.
function niceCeil(v) {
  if (!(v > 0)) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const n = v / base;
  let nice;
  if (n <= 1) nice = 1;
  else if (n <= 2) nice = 2;
  else if (n <= 2.5) nice = 2.5;
  else if (n <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

// Pull an explicit scale out of the eyebrow text. Accepts a range
// ("0–100", "0-100", "0 to 100") or a lone maximum ("100"). Returns null
// when the eyebrow carries no numbers, so the caller falls back to auto.
function parseScale(text) {
  const t = String(text);
  let m = t.match(/(-?[\d.]+)\s*(?:[–—-]|to)\s*(-?[\d.]+)/);
  if (m) {
    const min = parseFloat(m[1]), max = parseFloat(m[2]);
    if (Number.isFinite(min) && Number.isFinite(max) && max > min) return { min, max };
  }
  m = t.match(/(?:^|\s)([\d.]+)\s*$/);
  if (m) {
    const max = parseFloat(m[1]);
    if (Number.isFinite(max) && max > 0) return { min: 0, max };
  }
  return null;
}

function resolveScale(model, eyebrowText) {
  const explicit = eyebrowText ? parseScale(eyebrowText) : null;
  if (explicit) return explicit;
  let max = 0;
  for (const s of model.series) {
    for (const v of s.values) if (v > max) max = v;
  }
  return { min: 0, max: niceCeil(max) };
}

// ── Geometry primitives ────────────────────────────────────────────────────

// Axis i sits at i × (360° / n), measured clockwise from straight up — the
// same convention buildPieChart uses, so the two charts read alike.
function axisAngle(i, n) {
  return i * 2 * Math.PI / n;
}

function polar(radius, angle) {
  return {
    x: GEOM.cx + radius * Math.sin(angle),
    y: GEOM.cy - radius * Math.cos(angle),
  };
}

function valueRadius(value, scale) {
  const span = scale.max - scale.min || 1;
  const t = (value - scale.min) / span;
  return GEOM.R * Math.max(0, Math.min(1, t));
}

function fmtPt(p) {
  return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
}

// Polygon point string for one series' values across the axes.
function seriesPoints(values, axisCount, scale) {
  const pts = [];
  for (let i = 0; i < axisCount; i++) {
    pts.push(fmtPt(polar(valueRadius(values[i], scale), axisAngle(i, axisCount))));
  }
  return pts.join(' ');
}

// ── SVG fragment builders ──────────────────────────────────────────────────

// Concentric ring polygons + radial spokes. `aria-hidden` — the legend and
// axis labels carry the accessible content.
function gridSvg(axisCount) {
  let out = '<g class="radar-grid" aria-hidden="true">';
  for (let r = 1; r <= GEOM.rings; r++) {
    const frac = r / GEOM.rings;
    const pts = [];
    for (let i = 0; i < axisCount; i++) {
      pts.push(fmtPt(polar(GEOM.R * frac, axisAngle(i, axisCount))));
    }
    out += `<polygon class="radar-ring" data-ring="${r}" points="${pts.join(' ')}"/>`;
  }
  for (let i = 0; i < axisCount; i++) {
    const p = polar(GEOM.R, axisAngle(i, axisCount));
    out += `<line class="radar-spoke" x1="${GEOM.cx}" y1="${GEOM.cy}" x2="${p.x.toFixed(2)}" y2="${p.y.toFixed(2)}"/>`;
  }
  out += '</g>';
  return out;
}

// Axis labels around the rim. text-anchor / dominant-baseline are set per
// label from the axis angle so text never crosses the plot.
function axisLabelsSvg(axes, gap) {
  const n = axes.length;
  const labelGap = gap == null ? GEOM.labelGap : gap;
  let out = '<g class="radar-axes">';
  for (let i = 0; i < n; i++) {
    const a = axisAngle(i, n);
    const p = polar(GEOM.R + labelGap, a);
    const sin = Math.sin(a), cos = Math.cos(a);
    const anchor = sin > 0.34 ? 'start' : sin < -0.34 ? 'end' : 'middle';
    const baseline = cos > 0.34 ? 'auto' : cos < -0.34 ? 'hanging' : 'middle';
    out += `<text class="radar-axis-label" data-mark="${i}" x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" ` +
      `text-anchor="${anchor}" dominant-baseline="${baseline}">${escHtml(axes[i].label)}</text>`;
  }
  out += '</g>';
  return out;
}

// Tick labels up the top spoke — one per ring.
function tickLabelsSvg(scale) {
  let out = '<g class="radar-ticks" aria-hidden="true">';
  for (let r = 1; r <= GEOM.rings; r++) {
    const frac = r / GEOM.rings;
    const val = scale.min + (scale.max - scale.min) * frac;
    const p = polar(GEOM.R * frac, 0);
    out += `<text class="radar-tick" x="${(p.x + 3).toFixed(2)}" y="${p.y.toFixed(2)}" ` +
      `dominant-baseline="middle">${escHtml(fmtNum(val))}</text>`;
  }
  out += '</g>';
  return out;
}

// Vertex dots for one series.
function dotsSvg(values, axisCount, scale, seriesIdx, color) {
  let out = '';
  for (let i = 0; i < axisCount; i++) {
    const p = polar(valueRadius(values[i], scale), axisAngle(i, axisCount));
    out += `<circle class="radar-dot" data-series="${seriesIdx}" style="--series-color:${color}" ` +
      `cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="2.6"/>`;
  }
  return out;
}

function figure(variant, model, inner) {
  // Optional per-AXIS detail: an inert <template> payload inside the figure
  // (read by the reveal layer via data-mark on the axis label) + a speaker-note
  // fallback after it. Indexed by axis order (== the data-mark on each
  // radar-axis-label). Empty when no axis carries a sublist — a plain radar
  // stays byte-identical. See mark-detail.js.
  const detailWrap = markDetail.detailPayload(model.axes);
  const note = markDetail.detailNote(
    model.axes.map((ax) => ({ label: ax.label, valueRaw: '', detail: ax.detail })));
  return `<div class="radar-figure" data-variant="${variant}" ` +
    `data-axes="${model.axes.length}" data-series="${model.series.length}">${inner}${detailWrap}</div>${note}`;
}

function openSvg(extraClass) {
  return `<svg class="radar-svg${extraClass ? ' ' + extraClass : ''}" ` +
    `viewBox="${GEOM.viewBox}" role="img" aria-hidden="true">`;
}

// Compose the diagram (defs + body, in the 300×300 box) with the shared
// SVG-native key into ONE <svg>, then the figure — the radar analogue of
// buildPieChart's tail. `entries` is the legend model ({name, color, kind?});
// radar keys carry NO value column. A muted reference entry (target / before /
// comparison band) gets a quiet chip so it still reads as the reference, not a
// series. The diagram is vertically centred by the builder's diagramDy.
function composeFigure(variant, model, extraClass, defsInner, bodyInner, entries, orientation) {
  const rows = entries.map((e) => {
    // The swatch paints via the `.chart-key-swatch[data-cat|data-muted]` CSS rule —
    // never an inline presentation attribute (D2). A reference entry (target / before
    // / comparison band) is `muted`; a series reads its 0-based slot from its palette
    // colour (`var(--chart-cat-N-hue)` → N-1).
    const muted = e.kind === 'target' || e.kind === 'before' || e.kind === 'band';
    if (muted) return { muted: true, label: e.name };
    const m = /--chart-cat-(\d+)-hue/.exec(e.color);
    return { cat: m ? Number(m[1]) - 1 : 0, label: e.name };
  });
  const key = buildSvgLegend({ rows, diagramRight: DIAGRAM_W, diagramHeight: DIAGRAM_H, hasValues: false, orientation, diagramPadX: PORTRAIT_LABEL_PAD });
  const svg = `<svg class="radar-svg${extraClass ? ' ' + extraClass : ''}" ` +
    `viewBox="0 0 ${key.viewW} ${key.viewH}" role="img"><title>Radar chart</title>${key.desc}` +
    `<defs>${defsInner}${key.defs}</defs>` +
    `<g transform="translate(${key.diagramDx} ${key.diagramDy})">${bodyInner}</g>` +
    `${key.body}</svg>`;
  return figure(variant, model, svg);
}

// Gentle translucent area wash. SVG fill cannot take a CSS gradient, so each
// series gets its own <radialGradient> centred on the plot. PROTOTYPE
// (kanban-finish standardization): the fade was a 12× rim-dense ramp
// (0.03→0.36) — the same hub→rim dome removed from pie. Compressed to a near-
// uniform low-alpha wash (0.10→0.20) so the curves read flat, not bulging; the
// fill stays translucent because radar OVERLAYS series (alpha is functional,
// you must see through them), and the solid --series-color stroke carries hue
// identity at the edge. The hue rides --catN-hue via an inline stop-color so it
// still flips with the canvas. Unique ids per render
// (one Node process per deck / one page-load in the runtime) avoid the SVG
// duplicate-id trap where the first def wins for every later chart. Siblings:
// chart-family.js pie wedges, quadrant.transform.js region rects.
let gradSeq = 0;
function areaGradient(color) {
  const id = `radar-area-${++gradSeq}`;
  const def = `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
    `cx="${GEOM.cx}" cy="${GEOM.cy}" r="${GEOM.R}">` +
      `<stop offset="0%" style="stop-color:${color}" stop-opacity="0.10"/>` +
      `<stop offset="58%" style="stop-color:${color}" stop-opacity="0.14"/>` +
      `<stop offset="100%" style="stop-color:${color}" stop-opacity="0.20"/>` +
    `</radialGradient>`;
  return { id, def };
}

// ── Variant renderers ──────────────────────────────────────────────────────

// default + minimal: every series as its own polygon, overlaid. `minimal`
// drops the fills (CSS) — same DOM, the variant flag rides on .radar-figure.
function renderStandard(model, scale, isMinimal, orientation) {
  const { axes, series } = model;
  const n = axes.length;
  // Per-series area-fade gradients (default only; `minimal` keeps unfilled
  // curves, so no gradient and no inline fill that would override CSS).
  const grads = isMinimal
    ? null
    : series.map((_s, idx) => areaGradient(RADAR_PALETTE[idx % RADAR_PALETTE.length]));
  const defsInner = grads ? grads.map(g => g.def).join('') : '';
  let plot = '<g class="radar-plot">';
  series.forEach((s, idx) => {
    const color = RADAR_PALETTE[idx % RADAR_PALETTE.length];
    // Pin fill-opacity:1 alongside the gradient so the base .radar-poly fill-opacity
    // (the flat-fill area share for non-gradient variants) does not double-dim the
    // area gradient, whose own stop-opacity already carries the fade.
    const fill = grads ? `; fill:url(#${grads[idx].id}); fill-opacity:1` : '';
    plot += `<polygon class="radar-poly" data-series="${idx}" style="--series-color:${color}${fill}" ` +
      `points="${seriesPoints(s.values, n, scale)}"/>`;
  });
  series.forEach((s, idx) => {
    const color = RADAR_PALETTE[idx % RADAR_PALETTE.length];
    plot += dotsSvg(s.values, n, scale, idx, color);
  });
  plot += '</g>';

  const bodyInner = gridSvg(n) + axisLabelsSvg(axes) + tickLabelsSvg(scale) + plot;
  const entries = series.map((s, i) => ({ name: s.name, color: RADAR_PALETTE[i % RADAR_PALETTE.length] }));
  return composeFigure(isMinimal ? 'minimal' : 'default', model, '', defsInner, bodyInner, entries, orientation);
}

// target: an actual series against a `Target`/`Goal` reference polygon. The
// per-axis gap is drawn as a segment along the spoke — data-dir under/over so
// CSS can tint shortfall vs surplus.
function renderTarget(model, scale, orientation) {
  const { axes, series } = model;
  const n = axes.length;
  let targetIdx = series.findIndex(s => /^(target|goal|plan)$/i.test(s.name.trim()));
  if (targetIdx < 0) targetIdx = series.length - 1;
  const actualIdx = targetIdx === 0 ? Math.min(1, series.length - 1) : 0;
  const actual = series[actualIdx];
  const target = series[targetIdx];
  const actualColor = RADAR_PALETTE[0];

  let gaps = '<g class="radar-gaps" aria-hidden="true">';
  for (let i = 0; i < n; i++) {
    const a = axisAngle(i, n);
    const pa = polar(valueRadius(actual.values[i], scale), a);
    const pt = polar(valueRadius(target.values[i], scale), a);
    const dir = actual.values[i] < target.values[i] ? 'under' : 'over';
    gaps += `<line class="radar-gap" data-dir="${dir}" ` +
      `x1="${pa.x.toFixed(2)}" y1="${pa.y.toFixed(2)}" x2="${pt.x.toFixed(2)}" y2="${pt.y.toFixed(2)}"/>`;
  }
  gaps += '</g>';

  const bodyInner = gridSvg(n) + axisLabelsSvg(axes) + tickLabelsSvg(scale) +
    `<polygon class="radar-poly radar-poly--target" points="${seriesPoints(target.values, n, scale)}"/>` +
    gaps +
    `<g class="radar-plot">` +
      `<polygon class="radar-poly" data-series="0" style="--series-color:${actualColor}" ` +
        `points="${seriesPoints(actual.values, n, scale)}"/>` +
      dotsSvg(actual.values, n, scale, 0, actualColor) +
    `</g>`;
  return composeFigure('target', model, '', '', bodyInner, [
    { name: actual.name, color: actualColor },
    { name: target.name, color: 'var(--text-muted)', kind: 'target' },
  ], orientation);
}

// delta: exactly two series read as before → after. The before polygon is
// drawn muted; per-axis change segments (data-dir up/down/flat) ride the
// spokes so the movement is the read.
function renderDelta(model, scale, orientation) {
  const { axes, series } = model;
  const n = axes.length;
  const before = series[0];
  const after = series[1] || series[0];
  const afterColor = RADAR_PALETTE[0];

  let segs = '<g class="radar-deltas" aria-hidden="true">';
  for (let i = 0; i < n; i++) {
    const a = axisAngle(i, n);
    const pb = polar(valueRadius(before.values[i], scale), a);
    const pa = polar(valueRadius(after.values[i], scale), a);
    const dir = after.values[i] > before.values[i] ? 'up'
      : after.values[i] < before.values[i] ? 'down' : 'flat';
    segs += `<line class="radar-delta-seg" data-dir="${dir}" ` +
      `x1="${pb.x.toFixed(2)}" y1="${pb.y.toFixed(2)}" x2="${pa.x.toFixed(2)}" y2="${pa.y.toFixed(2)}"/>`;
  }
  segs += '</g>';

  const bodyInner = gridSvg(n) + axisLabelsSvg(axes) + tickLabelsSvg(scale) +
    `<polygon class="radar-poly radar-poly--before" points="${seriesPoints(before.values, n, scale)}"/>` +
    segs +
    `<g class="radar-plot">` +
      `<polygon class="radar-poly" data-series="0" style="--series-color:${afterColor}" ` +
        `points="${seriesPoints(after.values, n, scale)}"/>` +
      dotsSvg(after.values, n, scale, 0, afterColor) +
    `</g>`;
  return composeFigure('delta', model, '', '', bodyInner, [
    { name: before.name, color: 'var(--text-muted)', kind: 'before' },
    { name: after.name, color: afterColor },
  ], orientation);
}

// benchmark: series[0] is the hero; the rest collapse into a min–max envelope
// band (an even-odd path of the max polygon minus the min polygon) so a wide
// comparison set reads as one shape, not a tangle of overlaid polygons.
function renderBenchmark(model, scale, orientation) {
  const { axes, series } = model;
  const n = axes.length;
  const hero = series[0];
  const pack = series.slice(1);
  const heroColor = RADAR_PALETTE[0];

  let band = '';
  if (pack.length > 0) {
    const maxPts = [], minPts = [];
    for (let i = 0; i < n; i++) {
      const vals = pack.map(s => s.values[i]);
      const a = axisAngle(i, n);
      maxPts.push(polar(valueRadius(Math.max.apply(null, vals), scale), a));
      minPts.push(polar(valueRadius(Math.min.apply(null, vals), scale), a));
    }
    const outer = 'M ' + maxPts.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ') + ' Z';
    const inner = 'M ' + minPts.slice().reverse()
      .map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ') + ' Z';
    band = `<path class="radar-band" fill-rule="evenodd" d="${outer} ${inner}"/>`;
  }

  const bodyInner = gridSvg(n) + axisLabelsSvg(axes) + tickLabelsSvg(scale) +
    band +
    `<g class="radar-plot">` +
      `<polygon class="radar-poly radar-poly--hero" data-series="0" style="--series-color:${heroColor}" ` +
        `points="${seriesPoints(hero.values, n, scale)}"/>` +
      dotsSvg(hero.values, n, scale, 0, heroColor) +
    `</g>`;
  return composeFigure('benchmark', model, '', '', bodyInner, [
    { name: hero.name, color: heroColor, kind: 'hero' },
    { name: pack.length ? 'Comparison range' : hero.name, color: 'var(--text-muted)', kind: 'band' },
  ], orientation);
}

// quadrant: axes grouped into named sectors. Tinted sector wedges sit behind
// the plot, a mean arc marks the hero series' average per group, and the
// group names label the rim. Falls back to the standard overlay when the
// source had no grouping (a 2-level list under a `radar quadrant` class).
function renderQuadrant(model, scale, isMinimal, orientation) {
  const { axes, series, groups } = model;
  const n = axes.length;
  if (groups.length === 0) return renderStandard(model, scale, isMinimal, orientation);

  const half = Math.PI / n;
  const heroVals = series[0].values;

  let sectors = '<g class="radar-sectors" aria-hidden="true">';
  let arcs = '<g class="radar-sector-means" aria-hidden="true">';
  let rim = '<g class="radar-sector-labels">';
  groups.forEach((g, gi) => {
    const idxs = [];
    for (let i = 0; i < n; i++) if (axes[i].group === g) idxs.push(i);
    if (idxs.length === 0) return;
    const color = RADAR_PALETTE[gi % RADAR_PALETTE.length];
    const startA = axisAngle(idxs[0], n) - half;
    const endA = axisAngle(idxs[idxs.length - 1], n) + half;
    const largeArc = (endA - startA) > Math.PI ? 1 : 0;
    const p1 = polar(GEOM.R, startA), p2 = polar(GEOM.R, endA);
    sectors += `<path class="radar-sector" data-group="${gi}" style="--series-color:${color}" ` +
      `d="M ${GEOM.cx} ${GEOM.cy} L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ` +
      `A ${GEOM.R} ${GEOM.R} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z"/>`;

    const mean = idxs.reduce((s, i) => s + heroVals[i], 0) / idxs.length;
    const mr = valueRadius(mean, scale);
    const m1 = polar(mr, startA), m2 = polar(mr, endA);
    arcs += `<path class="radar-sector-mean" data-group="${gi}" style="--series-color:${color}" ` +
      `d="M ${m1.x.toFixed(2)} ${m1.y.toFixed(2)} ` +
      `A ${mr.toFixed(2)} ${mr.toFixed(2)} 0 ${largeArc} 1 ${m2.x.toFixed(2)} ${m2.y.toFixed(2)}"/>`;

    const midA = (startA + endA) / 2;
    const lp = polar(GEOM.R + GEOM.labelGap + 16, midA);
    const sin = Math.sin(midA), cos = Math.cos(midA);
    const anchor = sin > 0.34 ? 'start' : sin < -0.34 ? 'end' : 'middle';
    const baseline = cos > 0.34 ? 'auto' : cos < -0.34 ? 'hanging' : 'middle';
    rim += `<text class="radar-sector-label" data-group="${gi}" style="--series-color:${color}" ` +
      `x="${lp.x.toFixed(2)}" y="${lp.y.toFixed(2)}" text-anchor="${anchor}" ` +
      `dominant-baseline="${baseline}">${escHtml(g)}</text>`;
  });
  sectors += '</g>'; arcs += '</g>'; rim += '</g>';

  let plot = '<g class="radar-plot">';
  series.forEach((s, idx) => {
    const color = RADAR_PALETTE[idx % RADAR_PALETTE.length];
    plot += `<polygon class="radar-poly" data-series="${idx}" style="--series-color:${color}" ` +
      `points="${seriesPoints(s.values, n, scale)}"/>`;
  });
  series.forEach((s, idx) => {
    plot += dotsSvg(s.values, n, scale, idx, RADAR_PALETTE[idx % RADAR_PALETTE.length]);
  });
  plot += '</g>';

  const bodyInner = sectors + gridSvg(n) + arcs +
    axisLabelsSvg(axes, GEOM.labelGap - 6) + tickLabelsSvg(scale) + rim + plot;
  const entries = series.map((s, i) => ({ name: s.name, color: RADAR_PALETTE[i % RADAR_PALETTE.length] }));
  return composeFigure('quadrant', model, '', '', bodyInner, entries, orientation);
}

// small-multiples: one mini radar per series on a shared scale. The honest
// answer when there are more series than a single overlay can carry.
function renderSmallMultiples(model, scale) {
  const { axes, series } = model;
  const n = axes.length;
  const minis = series.map((s, idx) => {
    const color = RADAR_PALETTE[idx % RADAR_PALETTE.length];
    const svg = openSvg('radar-svg--mini') +
      gridSvg(n) + axisLabelsSvg(axes, GEOM.labelGap - 8) +
      `<g class="radar-plot">` +
        `<polygon class="radar-poly" data-series="0" style="--series-color:${color}" ` +
          `points="${seriesPoints(s.values, n, scale)}"/>` +
        dotsSvg(s.values, n, scale, 0, color) +
      `</g>` +
      '</svg>';
    return `<figure class="radar-mini" style="--series-color:${color}">` +
      svg +
      `<figcaption class="radar-mini-label">${escHtml(s.name)}</figcaption>` +
    `</figure>`;
  }).join('');
  return figure('small-multiples', model, `<div class="radar-multiples">${minis}</div>`);
}

// ── Variant resolution + dispatch ──────────────────────────────────────────

function pickVariant(tokens) {
  for (const mod of RADAR_MODIFIERS) {
    if (tokens.includes(mod)) return mod;
  }
  return 'default';
}

function buildRadar(model, variant, scale, isMinimal, orientation) {
  switch (variant) {
    case 'target':           return renderTarget(model, scale, orientation);
    case 'delta':            return renderDelta(model, scale, orientation);
    case 'benchmark':        return renderBenchmark(model, scale, orientation);
    case 'quadrant':         return renderQuadrant(model, scale, isMinimal, orientation);
    case 'small-multiples':  return renderSmallMultiples(model, scale);
    default:                 return renderStandard(model, scale, isMinimal, orientation);
  }
}

// First `<p><code>…</code></p>` in the section — the eyebrow. Used only to
// read an optional explicit scale; the eyebrow itself stays in the DOM and
// renders normally (chart-frame wraps it as `.chart-eyebrow`).
function matchEyebrowText(html) {
  const m = html.match(/<p[^>]*>\s*<code[^>]*>([^<]+?)<\/code>\s*<\/p>/);
  return m ? m[1] : '';
}

module.exports = {
  RADAR_MODIFIERS,
  RADAR_PALETTE,
  GEOM,
  parseRadar,
  parseSeries,
  parseAxisItem,
  parseScale,
  resolveScale,
  niceCeil,
  pickVariant,
  buildRadar,
  seriesPoints,
  valueRadius,
  axisAngle,
  polar,
  findOuterUL,
  splitTopLevelLI,
  matchEyebrowText,
};
