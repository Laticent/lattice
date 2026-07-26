/**
 * Quadrant chart — kernel for the `quadrant` chart-family member.
 *
 * Pure parsing + SVG-geometry engine. Section dispatch and chart-frame
 * wrapping are owned by lib/components/chart/_chart-family/chart-family.js (quadrant is one of the
 * CHART_LAYOUTS members alongside progress / timeline-list / piechart /
 * gantt / kanban / radar). This module just turns a parsed value model
 * into a positioned `<div class="quadrant-figure">` HTML string.
 *
 * Authoring (group-by-quadrant nested list):
 *
 *   <!-- _class: quadrant -->
 *
 *   `Effort 0–10 → Reach 0–100`        <- axes + (optional) scale + (optional) targets
 *   ## Where to put the next dollar.
 *
 *   - Strategic Bets                    <- 1st li → top-LEFT quadrant
 *     - Scoring model v2 `3, 70`
 *     - Per-team calibration `7, 85`
 *   - Quick Wins                        <- 2nd li → top-RIGHT
 *     - Weekly signal brief `8, 40`
 *   - Defer                             <- 3rd li → bottom-LEFT
 *     - Per-team weighting UI `4, 55`
 *   - Time Sinks                        <- 4th li → bottom-RIGHT
 *     - Bespoke board exports `2, 20`
 *
 * Reading order matches the Z-pattern (TL → TR → BL → BR). Top-level <li>s
 * carry the quadrant *label*; nested <li>s are items plotted by x,y.
 *
 * The eyebrow declares axis names and (optionally) per-axis scale and
 * threshold lines. Grammar:
 *
 *   <x-name>? <x-min>–<x-max>? → <y-name>? <y-min>–<y-max>?  [· targets <tx>, <ty>]
 *
 * If a scale is omitted on either axis it auto-fits (nice-ceil) the data.
 *
 * One default plus five modifier variants — each answers a distinct read:
 *   quadrant                   four named quadrants + scatter dots (workhorse)
 *   quadrant bubble            third pill sizes the dot (√-area honest)
 *   quadrant trail             two coords per item: before → after
 *   quadrant cohort            convex-hull tint per top-level group
 *   quadrant threshold         midlines replaced by target lines + zone labels
 *   quadrant magic             Gartner-style MQ tribute: vendor labels + iconic names
 *
 * `minimal` (no quadrant fill, faint grid) and `dark` (lifted grid) are
 * composable cross-cutting modifiers handled in CSS.
 *
 * This module is pure: HTML string in, HTML string out. No DOM, no
 * markdown-it dependency. The geometry is deterministic — same source,
 * same SVG.
 *
 * Callers of this kernel (three-renderer parity):
 *   - lib/components/chart/_chart-family/chart-family.js     — engine-path dispatch (lib/engine)
 *   - lattice-emulator.js     — inline build-path dispatch
 *   - lattice-runtime.js      — DOM mirror for marp-vscode preview / web
 */

const QUADRANT_MODIFIERS = ['bubble', 'trail', 'cohort', 'threshold', 'magic'];

// Palette assignment is owned by lattice.css: per-cell rules map
// `data-cell="0"…"3"` (reading-order: TL, TR, BL, BR) straight to the
// curated categorical palette — c1…c4, fill `--cN-light` + ink
// `--cN-dark` — exactly like the other chart-family members cycle cN.
// The kernel just emits the cell index; the cascade picks the colour.
// Every variant (cohort included) inherits the same routing — see CSS.

// Magic-Quadrant default names. Reading order: TL, TR, BL, BR.
// Maps to the canonical Gartner placement (Challengers TL, Leaders TR,
// Niche BL, Visionaries BR). Author-supplied names override these.
const MAGIC_DEFAULT_NAMES = ['Challengers', 'Leaders', 'Niche Players', 'Visionaries'];
const MAGIC_DEFAULT_AXES  = { x: 'Completeness of Vision', y: 'Ability to Execute' };

// Threshold variant zone labels — one per quadrant in TL/TR/BL/BR order.
// The labels are intentionally action-oriented ("Star" pulls focus to the
// invest-here zone) not BCG-academic ("Question Mark" etc.).
const THRESHOLD_ZONE_NAMES = ['On Pace', 'Star', 'At Risk', 'Lagging'];

// The shared SVG-native legend + spine builder — the cohort key now lives inside
// the diagram <svg> (one scaling unit) instead of an HTML <ol> beside it, so it
// reads as one family with the pie/radar/map. See svg-legend.js and
// engineering/decisions/2026-06-13-svg-native-legend.md.
const { buildSvgLegend } = require('../_chart-family/svg-legend');

// Shared wrapping <text> emitter + the placement pass. The quadrant is the
// chart that needs BOTH halves: a long item name used to run off its box AND
// two items plotted close together printed their names straight through each
// other (and through the corner label). See svg-label.js.
const {
  wrapSvgLabel, measureLabel, deCollideLabels, ADVANCE_UPPER,
} = require('../_chart-family/svg-label');

// Nominal label sizes in viewBox user units, MIRRORING quadrant.styles.css.
// CSS owns what is painted; the kernel needs the same numbers to break lines to
// the right width. quadrant.test.js reads the stylesheet and fails if the two
// drift apart. The axis/tick sizes are theme-overridable tokens
// (--quadrant-axis-size / --quadrant-tick-size) and the mirror tracks their
// DEFAULTS: a theme that raises them wraps a touch early, which is the safe
// direction — the conservative advance leaves room for it.
const FS = {
  label: 11,        // .quadrant-label (corner)
  labelMagic: 12,   // .quadrant-label--magic
  labelZone: 10.5,  // .quadrant-label--zone
  dotLabel: 8.5,    // .quadrant-dot-label / .quadrant-bubble-label
  bubbleValue: 8.5, // .quadrant-bubble-value
  cohort: 11,       // .quadrant-cohort-label
  axis: 12,         // --quadrant-axis-size default
  tick: 10,         // --quadrant-tick-size default
  badge: 9,         // .quadrant-target-badge
};

// How much width a label may claim, in user units. The plot is 336 wide; a
// scatter label that spanned it would read as a caption, not a point name, so
// item labels wrap inside a share of it and grow downward instead.
const LW = {
  corner: 120,   // a quadrant name, inset in its corner
  item: 104,     // a dot / bubble name
  cohort: 120,   // a cohort name at its centroid
  // The axis title is centered on the FULL viewBox (x = 224 of 420), not on the
  // plot band, so it may use nearly the whole width. Capping it at the plot
  // width truncated titles the previous renderer showed in full.
  axis: 392,
};
// Item names cap at three lines. Two proved too tight — a realistic name
// ("Enterprise data platform modernization") needs three at this width, and
// capping at two ellipsized text that had room to render. Past three the block
// stands far enough from its dot that the association starts to break down.
const ITEM_MAX_LINES = 3;

// Shared per-mark detail substrate (data-mark template payload + speaker-note
// fallback), generalized from the pie. See mark-detail.js and
// engineering/decisions/2026-06-20-chart-detail-reveal-family.md.
const markDetail = require('../_chart-family/mark-detail');

// Geometry. 420×320 viewBox with the plot box inset for axis labels and
// rim text. Data x grows rightward; data y grows upward (SVG y is flipped
// in plotPoint). All coords are in viewBox units (no responsive math here).
// The CSS pins the SVG at 472×360 — matching radar's vertical-fit
// guarantee inside chart-body. Insets below leave room for axis names
// at the bottom-centre and left-centre even at that compact size.
const GEOM = {
  viewBox: '0 0 420 320',
  vbW: 420, vbH: 320,
  plot: { x0: 56, y0: 30, x1: 392, y1: 274 },
  // Corner-label inset from the plot edge. Larger inset reduces collisions
  // with dot labels that sit near the corners (e.g. high-x, high-y items
  // crowding the LEADERS / QUICK WINS corner).
  cornerInset: 14,
  // Bubble sizing: √-scaled radius so dot AREA encodes magnitude honestly.
  bubble: { rMin: 5, rMax: 26 },
  // Standard scatter dot radius.
  dotR: 4.5,
};

// Shared string/list helpers for the SVG chart kernels (one home; the
// quadrant/radar copies were the duplication scan's biggest exact clone).
const {
  escAttr, stripTags, fmtNum, findOuterUL, splitTopLevelLI,
} = require('../_chart-family/transform-utils');

// ── Source parsing ─────────────────────────────────────────────────────────

// Item payload from a leaf <li>: label plus the trailing inline-code that
// carries the coordinates. Returns the raw pill text alongside the parsed
// numbers so variant emitters can choose to render the original string
// (e.g. bubble showing "$1.2M" rather than "1.2").
function parseItemPills(liInner) {
  const text = liInner.trim();
  // Extract all trailing <code> pills (right-to-left), stopping when a
  // non-code element is encountered. Walk repeatedly to support multiple
  // pills (e.g. trail: `name <code>x, y</code> <code>x2, y2</code>`).
  const pills = [];
  let rest = text;
  while (true) {
    const m = /<code\b[^>]*>([^<]*)<\/code>\s*$/.exec(rest);
    if (!m) break;
    pills.unshift(stripTags(m[1]));
    rest = rest.slice(0, m.index).trim();
  }
  return { label: stripTags(rest), pills };
}

// Parse a comma-separated coordinate pill ("3, 70", "0.4, 0.55, 12",
// "$1.2M, 70" — the first two numbers are coords; later numbers become
// "extras" while non-numeric tokens stay as text).
function parseCoordPill(pillText) {
  const parts = String(pillText).split(',').map(s => s.trim()).filter(Boolean);
  const nums = [], extras = [];
  for (const part of parts) {
    const n = parseFloat(part);
    if (Number.isFinite(n) && /^[-+]?\d/.test(part)) {
      nums.push(n);
      extras.push(part);          // keep the author's exact rendition
    } else {
      extras.push(part);
    }
  }
  return { x: nums[0] || 0, y: nums[1] || 0, size: nums[2], parts: extras };
}

// One nested <li> → an item record. Pulls (x, y) from the first coord pill;
// for `trail` the second pill is (x2, y2); for `bubble` the first pill's
// third comma-token is the magnitude. The raw `parts` array is preserved
// so renderers can show the original pill text (e.g. "$1.2M" for bubble).
function parseItem(liInner) {
  // Split an optional nested detail sublist (3rd level — the item's x,y are
  // inline pills, so this level is free) off BEFORE reading the coord pills.
  // It's the present-mode popover payload, not part of the label/coords.
  const { lead, detail } = markDetail.splitDetail(liInner);
  const { label, pills } = parseItemPills(lead);
  const a = pills[0] ? parseCoordPill(pills[0]) : { x: 0, y: 0, size: undefined, parts: [] };
  const b = pills[1] ? parseCoordPill(pills[1]) : null;
  return {
    label,
    x: a.x,
    y: a.y,
    size: a.size,
    sizePill: pills[0] && a.parts[2] !== undefined ? a.parts[2] : '',
    to: b ? { x: b.x, y: b.y } : null,
    detail,
  };
}

// Top-level <li>: a named group (quadrant label) with nested items.
function parseGroup(liInner) {
  const nested = findOuterUL(liInner);
  const name = stripTags(nested ? liInner.slice(0, nested.start) : liInner);
  const items = nested
    ? splitTopLevelLI(nested.inner).map(parseItem).filter(it => it.label || (it.x || it.y))
    : [];
  return { name, items };
}

// Outer <ul> inner HTML → model.
//   { groups: [{ name, items }], axes: { x: {label,min,max}, y: {...} },
//     targets: { x?, y? } }
// Axes + targets are filled in by resolveScale (driven by the eyebrow);
// parseQuadrant only handles the list structure.
function parseQuadrant(ulInner) {
  const groups = splitTopLevelLI(ulInner)
    .map(parseGroup)
    .filter(g => g.name || g.items.length > 0);
  if (groups.length === 0) return null;
  // Assign each item a stable GLOBAL mark index in flattened group order — the
  // same order allItems() and every variant renderer iterate, so a dot's
  // data-mark aligns with its detail <template> by index.
  let mark = 0;
  for (const g of groups) for (const it of g.items) it.mark = mark++;
  return { groups };
}

// Flatten every item across every group — used by variants that don't
// honour the group structure (cohort still uses groups; bubble/threshold/
// magic just need the full point set).
function allItems(model) {
  const flat = [];
  for (const g of model.groups) {
    for (const it of g.items) flat.push({ group: g.name, ...it });
  }
  return flat;
}

// ── Eyebrow grammar: axes + scale + targets ────────────────────────────────
// Accepts (any subset of) the following in the eyebrow `<code>`:
//   "<X-name> <Xmin>–<Xmax> → <Y-name> <Ymin>–<Ymax> · targets <tx>, <ty>"
// Either axis name and either range is independently optional.

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

// Pull "X–Y" / "X-Y" / "X to Y" out of the tail of `text`. Returns
// { name, range } where `name` is everything before the matched range
// and `range` is `{min,max}` (or null).
function pullRange(text) {
  const t = String(text).trim();
  const m = t.match(/(.*?)\s*(-?[\d.]+)\s*(?:[–—-]|to)\s*(-?[\d.]+)\s*$/);
  if (m) {
    const min = parseFloat(m[2]), max = parseFloat(m[3]);
    if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
      return { name: m[1].trim(), range: { min, max } };
    }
  }
  return { name: t, range: null };
}

// "tx, ty" → {x,y} (or null).
function parseTargets(text) {
  const m = String(text).match(/([-+]?[\d.]+)\s*,\s*([-+]?[\d.]+)/);
  if (!m) return null;
  const x = parseFloat(m[1]), y = parseFloat(m[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function parseEyebrow(text) {
  // Separate the optional `· targets X, Y` (or `, targets X, Y`) suffix.
  let core = String(text || '').trim();
  let targets = null;
  const tMatch = core.match(/(?:[·,;]\s*)?targets?\s*[:·]?\s*(.+)$/i);
  if (tMatch) {
    targets = parseTargets(tMatch[1]);
    if (targets) core = core.slice(0, tMatch.index).trim();
  }

  // Split axes on the arrow.
  const arrow = core.match(/(.*?)\s*(?:→|->)\s*(.*)/);
  let xText = '', yText = '';
  if (arrow) { xText = arrow[1].trim(); yText = arrow[2].trim(); }
  else { xText = core; }

  const xPart = pullRange(xText);
  const yPart = pullRange(yText);
  return {
    xName: xPart.name,
    yName: yPart.name,
    xRange: xPart.range,
    yRange: yPart.range,
    targets,
  };
}

// Build per-axis scale objects. Honours eyebrow ranges, falls back to
// nice-ceil of the data. Trail items contribute both endpoints.
function resolveScale(model, eyebrow) {
  const eb = parseEyebrow(eyebrow);
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const g of model.groups) {
    for (const it of g.items) {
      const xs = [it.x]; const ys = [it.y];
      if (it.to) { xs.push(it.to.x); ys.push(it.to.y); }
      for (const x of xs) { if (x < xMin) xMin = x; if (x > xMax) xMax = x; }
      for (const y of ys) { if (y < yMin) yMin = y; if (y > yMax) yMax = y; }
    }
  }
  if (!Number.isFinite(xMin)) { xMin = 0; xMax = 1; }
  if (!Number.isFinite(yMin)) { yMin = 0; yMax = 1; }

  const xScale = eb.xRange || {
    min: xMin < 0 ? xMin : 0,
    max: niceCeil(Math.max(xMax, xMin < 0 ? -xMin : xMax)),
  };
  const yScale = eb.yRange || {
    min: yMin < 0 ? yMin : 0,
    max: niceCeil(Math.max(yMax, yMin < 0 ? -yMin : yMax)),
  };
  return {
    x: { ...xScale, label: eb.xName },
    y: { ...yScale, label: eb.yName },
    targets: eb.targets,
  };
}

// ── Geometry primitives ────────────────────────────────────────────────────

function plotPoint(x, y, scale) {
  const { plot } = GEOM;
  const tx = (x - scale.x.min) / (scale.x.max - scale.x.min || 1);
  const ty = (y - scale.y.min) / (scale.y.max - scale.y.min || 1);
  return {
    x: plot.x0 + Math.max(0, Math.min(1, tx)) * (plot.x1 - plot.x0),
    y: plot.y1 - Math.max(0, Math.min(1, ty)) * (plot.y1 - plot.y0),
  };
}

function fmtPt(p) { return `${p.x.toFixed(2)},${p.y.toFixed(2)}`; }

// Bubble radius: √-scaled so AREA is proportional to magnitude. Sizes
// without a magnitude fall back to the standard dot radius.
function bubbleRadius(size, sizeRange) {
  if (!Number.isFinite(size) || !sizeRange || sizeRange.max <= 0) return GEOM.dotR;
  const t = Math.sqrt(Math.max(0, size) / sizeRange.max);
  return GEOM.bubble.rMin + t * (GEOM.bubble.rMax - GEOM.bubble.rMin);
}

// Andrew's monotone-chain convex hull. Returns the hull polygon's points
// (counter-clockwise), suitable for an SVG <polygon>. Degenerate cases
// (0, 1, or 2 points) return as-is — emitter renders them as point or
// line, not a polygon.
function convexHull(points) {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
  const cross = (O, A, B) => (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Polygon centroid (area-weighted for convex polygons). Falls back to
// arithmetic mean for degenerate inputs.
function centroid(points) {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length < 3) {
    const sx = points.reduce((s, p) => s + p.x, 0);
    const sy = points.reduce((s, p) => s + p.y, 0);
    return { x: sx / points.length, y: sy / points.length };
  }
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    const f = p.x * q.y - q.x * p.y;
    a += f; cx += (p.x + q.x) * f; cy += (p.y + q.y) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-6) {
    const sx = points.reduce((s, p) => s + p.x, 0);
    const sy = points.reduce((s, p) => s + p.y, 0);
    return { x: sx / points.length, y: sy / points.length };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

// ── SVG fragment builders ──────────────────────────────────────────────────

// Quadrant fill rectangles. The four reading-order tints sit behind the
// scatter. `splitX` / `splitY` are the SVG coords of the centerlines (or
// threshold lines). Palette assignment is CSS-side per `data-cell`.
// Per-region radial depth gradient, all four sharing one focal centre at the
// axis crossing (splitX/splitY): lighter where the axes meet, vivid toward the
// outer corners where the quadrant labels live — symmetric, no seam at the
// split. Matches the pie wedge look exactly: the SAME opaque hub→rim mix of
// the vivid --catN-hue with --bg (42% at the crossing → 82% at the corners),
// not a translucent wash — so quadrant zones and pie wedges read identically.
// The mix with --bg keeps each stop opaque and flips with the canvas.
// stop-color rides var(--catN-hue) — inherited from the section.chart-frame
// ancestor, so it still flips with the canvas; --cell-fill can't be used here
// because a <defs> stop isn't a descendant of the rect that sets it. Inline
// `style="fill:url()"` beats the .quadrant-tint CSS fill rule.
// Siblings: radar.transform.js areaGradient, chart-family.js pie wedges.
let Q_TINT_SEQ = 0;
function quadrantTintsSvg(splitX, splitY) {
  const { plot } = GEOM;
  const cells = [
    { x: plot.x0, y: plot.y0, w: splitX - plot.x0, h: splitY - plot.y0 }, // TL
    { x: splitX,  y: plot.y0, w: plot.x1 - splitX, h: splitY - plot.y0 }, // TR
    { x: plot.x0, y: splitY,  w: splitX - plot.x0, h: plot.y1 - splitY }, // BL
    { x: splitX,  y: splitY,  w: plot.x1 - splitX, h: plot.y1 - splitY }, // BR
  ];
  // Radius to the farthest corner from the split, so every region's outer
  // corner reaches the rich end of the gradient.
  const rad = Math.max(
    Math.hypot(splitX - plot.x0, splitY - plot.y0),
    Math.hypot(plot.x1 - splitX, splitY - plot.y0),
    Math.hypot(splitX - plot.x0, plot.y1 - splitY),
    Math.hypot(plot.x1 - splitX, plot.y1 - splitY),
  );
  const defs = [];
  let out = '<g class="quadrant-tints" aria-hidden="true">';
  cells.forEach((c, i) => {
    if (c.w <= 0 || c.h <= 0) return;
    const gradId = `q-tint-${++Q_TINT_SEQ}`;
    const hue = `var(--chart-cat-${i + 1}-hue)`;
    defs.push(`<radialGradient id="${gradId}" gradientUnits="userSpaceOnUse" ` +
      `cx="${splitX.toFixed(2)}" cy="${splitY.toFixed(2)}" r="${rad.toFixed(2)}">` +
      `<stop offset="0%" style="stop-color:color-mix(in oklab, ${hue} 42%, var(--chart-cat-base))"/>` +
      `<stop offset="62%" style="stop-color:color-mix(in oklab, ${hue} 58%, var(--chart-cat-base))"/>` +
      `<stop offset="100%" style="stop-color:color-mix(in oklab, ${hue} 82%, var(--chart-cat-base))"/>` +
      `</radialGradient>`);
    out += `<rect class="quadrant-tint" data-cell="${i}" style="fill:url(#${gradId})" ` +
      `x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" ` +
      `width="${c.w.toFixed(2)}" height="${c.h.toFixed(2)}"/>`;
  });
  out += '</g>';
  return `<defs>${defs.join('')}</defs>` + out;
}

function plotFrameSvg(splitX, splitY, splitVariant) {
  const { plot } = GEOM;
  return '<g class="quadrant-frame" aria-hidden="true">' +
    `<rect class="quadrant-bounds" x="${plot.x0}" y="${plot.y0}" ` +
      `width="${(plot.x1 - plot.x0).toFixed(2)}" height="${(plot.y1 - plot.y0).toFixed(2)}"/>` +
    `<line class="quadrant-split quadrant-split--x" data-kind="${splitVariant}" ` +
      `x1="${splitX.toFixed(2)}" y1="${plot.y0}" x2="${splitX.toFixed(2)}" y2="${plot.y1}"/>` +
    `<line class="quadrant-split quadrant-split--y" data-kind="${splitVariant}" ` +
      `x1="${plot.x0}" y1="${splitY.toFixed(2)}" x2="${plot.x1}" y2="${splitY.toFixed(2)}"/>` +
  '</g>';
}

// Per-quadrant rim labels. The four `names` array slots map to
// TL, TR, BL, BR — same reading order as the source.
// The four corner anchors, TL / TR / BL / BR. Extracted so the emitter below
// and `cornerObstacles` derive their geometry from ONE table — the boxes the
// de-collision pass avoids must be exactly the boxes that get painted, and two
// copies of this table would silently drift apart.
// `baseline` is kept as the painted `dominant-baseline` ATTRIBUTE, exactly as
// before, so a single-line corner label lands on precisely the pixel it always
// did — the emitter does not re-derive the baseline shift, it only decides
// which way a SECOND line grows. Top corners grow down ('baseline' = y is the
// first line); bottom corners grow up ('bottom' = y is the last line), so a
// wrapped label never runs off the bottom of the plot.
function cornerPositions() {
  const { plot, cornerInset } = GEOM;
  return [
    { x: plot.x0 + cornerInset, y: plot.y0 + cornerInset, anchor: 'start', baseline: 'hanging', vAlign: 'baseline' },
    { x: plot.x1 - cornerInset, y: plot.y0 + cornerInset, anchor: 'end',   baseline: 'hanging', vAlign: 'baseline' },
    { x: plot.x0 + cornerInset, y: plot.y1 - cornerInset, anchor: 'start', baseline: 'auto',    vAlign: 'bottom' },
    { x: plot.x1 - cornerInset, y: plot.y1 - cornerInset, anchor: 'end',   baseline: 'auto',    vAlign: 'bottom' },
  ];
}

// The wrap spec for corner label `i` — shared by the emitter and the obstacle
// pass so both describe the same painted box.
function cornerSpec(i, extraClass) {
  const p = cornerPositions()[i];
  const fontSize = extraClass === 'quadrant-label--magic' ? FS.labelMagic
    : extraClass === 'quadrant-label--zone' ? FS.labelZone
      : FS.label;
  return {
    x: p.x, y: p.y, width: LW.corner, fontSize,
    // .quadrant-label is `text-transform: uppercase` + `letter-spacing: 0.04em`,
    // so it paints wider than the mixed-case source string implies.
    advance: ADVANCE_UPPER,
    anchor: p.anchor, vAlign: p.vAlign, maxLines: 2,
    className: `quadrant-label${extraClass ? ` ${extraClass}` : ''}`,
    baseline: p.baseline,
    attrs: ` data-cell="${i}"`,
    emitFontSize: false,
  };
}

function quadrantLabelsSvg(names, extraClass) {
  let out = '<g class="quadrant-labels">';
  names.forEach((name, i) => {
    if (!name) return;
    out += wrapSvgLabel(name, cornerSpec(i, extraClass)).svg;
  });
  out += '</g>';
  return out;
}

// The corner labels as FIXED obstacles for the item-label placement pass. A
// corner name is structural — it names the quadrant, not a data point — so it
// holds its position and the data labels move around it. (The verified defect:
// a dot label in the top-left printed straight through "QUICK WINS".)
function cornerObstacles(names, extraClass) {
  const boxes = [];
  names.forEach((name, i) => {
    if (!name) return;
    const r = wrapSvgLabel(name, cornerSpec(i, extraClass));
    boxes.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, fixed: true });
  });
  return boxes;
}

/**
 * Collect item-label placements, then wrap, de-collide and emit them together.
 * Labels must be placed as a SET, not one at a time: whether a label needs to
 * move depends on where its neighbors ended up.
 */
function itemLabelSet(obstacles) {
  const specs = [];
  const marks = [];
  return {
    add(text, spec) { if (text) specs.push({ text, spec }); },
    // Every plotted mark is an obstacle as well. Without this the pass would
    // happily nudge a label off its neighbor and straight onto a DOT — the one
    // outcome the direction rule exists to prevent, just arrived at from the
    // other side. A label over a data point is worse than a label over a label:
    // it hides the value it is naming.
    mark(cx, cy, r) { marks.push({ left: cx - r, right: cx + r, top: cy - r, bottom: cy + r, fixed: true }); },
    emit() {
      if (!specs.length) return '';
      // Place once to learn each label's real box (wrapping decides its height),
      // de-collide those boxes, then re-emit the ones that had to move.
      const first = specs.map((s) => wrapSvgLabel(s.text, s.spec));
      const fixed = obstacles.concat(marks);
      const boxes = fixed.concat(first.map((r, i) => ({
        left: r.left, right: r.right, top: r.top, bottom: r.bottom, dir: specs[i].spec.pushDir,
      })));
      // A generous travel budget: the plot is 244 units tall, so even the
      // largest shift here keeps a label well inside the quadrant it belongs
      // to. The default (24) was tuned for a sparse scatter and made the pass
      // GIVE UP on a tight cluster — and giving up means leaving the label
      // fully overlapping, which is the worst of the available outcomes.
      const shifts = deCollideLabels(boxes, { maxShift: 44 }).slice(fixed.length);
      return specs.map((s, i) => (shifts[i]
        ? wrapSvgLabel(s.text, { ...s.spec, y: s.spec.y + shifts[i] }).svg
        : first[i].svg)).join('');
    },
  };
}

// X-axis label, centered below the plot. Y-axis label, rotated -90°
// at the left of the plot. Range numbers at the four corners of the plot.
function axisLabelsSvg(scale) {
  const { plot, vbH } = GEOM;
  const xMid = (plot.x0 + plot.x1) / 2;
  const yMid = (plot.y0 + plot.y1) / 2;
  let out = '<g class="quadrant-axes" aria-hidden="true">';
  // Axis titles wrap to the plot width. The y title is rotated -90°, so its
  // wrap box runs along the PLOT HEIGHT, not the viewBox width — the rotation
  // is a transform on the painted text, and the emitter works in the local
  // (pre-rotation) frame where the label still reads left-to-right.
  if (scale.x.label) {
    out += wrapSvgLabel(scale.x.label, {
      x: xMid, y: vbH - 8, width: LW.axis, fontSize: FS.axis,
      // Two lines rather than an ellipsis: an axis NAME is the reader's key to
      // the whole chart, so losing its tail is worse than spending a line.
      anchor: 'middle', vAlign: 'bottom', maxLines: 2,
      className: 'quadrant-axis-name quadrant-axis-name--x',
      baseline: 'auto', emitFontSize: false,
    }).svg;
  }
  if (scale.y.label) {
    out += wrapSvgLabel(scale.y.label, {
      x: 18, y: yMid, width: plot.y1 - plot.y0, fontSize: FS.axis,
      anchor: 'middle', vAlign: 'bottom', maxLines: 2,
      className: 'quadrant-axis-name quadrant-axis-name--y',
      baseline: 'auto',
      attrs: ` transform="rotate(-90 18 ${yMid.toFixed(2)})"`,
      emitFontSize: false,
    }).svg;
  }
  // Range tick numbers — four corners. Numeric and short by construction, so
  // they never wrap; they go through the shared emitter so the diagram has ONE
  // text path and picks up any future change to it.
  const tick = (x, y, anchor, baseline, text) => wrapSvgLabel(text, {
    x, y, width: 60, fontSize: FS.tick, anchor, vAlign: 'baseline', maxLines: 1,
    className: 'quadrant-tick', baseline, emitFontSize: false,
  }).svg;
  out += tick(plot.x0, plot.y1 + 14, 'start', 'hanging', fmtNum(scale.x.min));
  out += tick(plot.x1, plot.y1 + 14, 'end', 'hanging', fmtNum(scale.x.max));
  out += tick(plot.x0 - 6, plot.y1, 'end', 'auto', fmtNum(scale.y.min));
  out += tick(plot.x0 - 6, plot.y0, 'end', 'hanging', fmtNum(scale.y.max));
  out += '</g>';
  return out;
}

// One scatter dot + an inline name label. Used by the default + magic +
// threshold variants. The label sits above the dot by default. When the
// dot crowds a corner where a quadrant label lives, the dot label is
// instead placed BESIDE the dot, pointing into the chart interior — out
// of the corner label's path AND out of the path of other dots that the
// usual above/below flip would crash into.
function dotWithLabelSvg(p, label, cellIdx, opts) {
  const r = opts && opts.r != null ? opts.r : GEOM.dotR;
  const offset = r + 4;
  const { plot } = GEOM;

  const cz = { h: 80, v: 35 };
  const nearLeft  = p.x < plot.x0 + cz.h;
  const nearRight = p.x > plot.x1 - cz.h;
  const nearTop   = p.y < plot.y0 + cz.v;
  const nearBot   = p.y > plot.y1 - cz.v;
  const nearCorner = (nearLeft || nearRight) && (nearTop || nearBot);

  // How TALL this label actually is, before deciding where to put it. The old
  // above/below test assumed a single line (`p.y - offset > plot.y0 + 8`), which
  // is why a wrapped 3-line name on a top-row dot was placed above and then had
  // nowhere to go: it started inside the corner label's band, and no amount of
  // nudging could rescue a placement that was wrong to begin with. Measure
  // first, then place.
  const blockH = label
    ? measureLabel(label, { width: LW.item, fontSize: FS.dotLabel, maxLines: ITEM_MAX_LINES }).height
    : 0;

  let lx, ly, anchor, baseline;
  if (nearCorner) {
    // Place label toward the chart interior: away from the nearer x-edge.
    if (nearRight) { lx = p.x - offset; anchor = 'end'; }
    else           { lx = p.x + offset; anchor = 'start'; }
    ly = p.y;
    baseline = 'middle';
  } else {
    // Put the label on the side of the dot that faces the plot's INTERIOR, and
    // only if the whole block fits there. A dot in the top half labels
    // downward, one in the bottom half labels upward — so a tall label always
    // grows toward open space, away from the rim where the corner names live.
    const midY = (plot.y0 + plot.y1) / 2;
    const roomAbove = p.y - offset - blockH > plot.y0 + 2;
    const above = p.y > midY ? roomAbove : false;
    lx = p.x;
    ly = above ? p.y - offset : p.y + offset + 2;
    anchor = 'middle';
    baseline = above ? 'auto' : 'hanging';
  }

  const markAttr = opts && opts.mark != null
    ? ` data-mark="${opts.mark}"${opts.label ? ` data-label="${escAttr(opts.label)}"` : ''}`
    : '';
  // `data-anima-role="point"` — a scatter dot is a POINT, not a bar. Declared
  // natively so the motion system reads the role instead of guessing.
  const dot = `<circle class="quadrant-dot" data-cell="${cellIdx}" data-anima-role="point"${markAttr} ` +
    `cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${r.toFixed(2)}"/>`;
  // The label is NOT emitted here. It goes back to the caller as a spec so the
  // whole plot's labels can be wrapped and de-collided as one set — whether a
  // label has to move depends on where its neighbors landed, which a per-dot
  // emitter cannot know.
  const spec = label ? {
    x: lx, y: ly, width: LW.item, fontSize: FS.dotLabel,
    anchor,
    // Grow away from the dot: a label above it grows upward ('bottom' = y is
    // the last line), a label below grows downward, a side label stays centered.
    vAlign: baseline === 'auto' ? 'bottom' : baseline === 'middle' ? 'middle' : 'baseline',
    // And shove away from the dot too when de-colliding.
    pushDir: baseline === 'auto' ? -1 : 1,
    maxLines: ITEM_MAX_LINES,
    className: 'quadrant-dot-label',
    baseline,
    attrs: ` data-cell="${cellIdx}"`,
    emitFontSize: false,
  } : null;
  return { dot, label: label || '', spec };
}

function figure(variant, model, scale, inner, extraAttrs) {
  const items = allItems(model);
  const xa = scale.x.label ? ` data-x-axis="${escAttr(scale.x.label)}"` : '';
  const ya = scale.y.label ? ` data-y-axis="${escAttr(scale.y.label)}"` : '';
  // Optional per-item detail: an inert <template> payload inside the figure
  // (read by the reveal layer via data-mark) + a speaker-note fallback after it.
  // Indexed in flattened group order (== each item's parse-time `mark`), so it
  // aligns with the dots' data-mark. Empty when no item carries a sublist — a
  // plain quadrant stays byte-identical.
  const detailWrap = markDetail.detailPayload(items);
  const note = markDetail.detailNote(
    items.map((it) => ({ label: it.label, valueRaw: '', detail: it.detail })));
  return `<div class="quadrant-figure" data-variant="${variant}" ` +
    `data-groups="${model.groups.length}" data-items="${items.length}"` +
    xa + ya + (extraAttrs || '') + `>${inner}${detailWrap}</div>${note}`;
}

function openSvg(extraClass) {
  return `<svg class="quadrant-svg${extraClass ? ' ' + extraClass : ''}" ` +
    `viewBox="${GEOM.viewBox}" role="img" aria-hidden="true">`;
}

// ── Variant renderers ──────────────────────────────────────────────────────

// default + magic: tinted quadrants + scatter dots. Magic adds the iconic
// Gartner-style label vocabulary as a fallback and renders item names
// next to every dot; default uses the author's group names and labels
// items only when there are few enough that labels won't overlap.
function renderStandard(model, scale, variant) {
  const isMagic = variant === 'magic';
  const splitX = (GEOM.plot.x0 + GEOM.plot.x1) / 2;
  const splitY = (GEOM.plot.y0 + GEOM.plot.y1) / 2;

  // Group names → quadrant label slots (TL, TR, BL, BR). Magic falls back
  // to the canonical MQ names when an author-supplied slot is empty.
  const names = [0, 1, 2, 3].map(i => {
    const fromGroup = model.groups[i] ? model.groups[i].name : '';
    return fromGroup || (isMagic ? MAGIC_DEFAULT_NAMES[i] : '');
  });
  // Magic uses its canonical axis labels if the eyebrow named neither.
  const labelScale = isMagic
    ? {
        x: { ...scale.x, label: scale.x.label || MAGIC_DEFAULT_AXES.x },
        y: { ...scale.y, label: scale.y.label || MAGIC_DEFAULT_AXES.y },
        targets: scale.targets,
      }
    : scale;

  const items = allItems(model);
  // Label dots when there's room: magic always labels; default labels when
  // total items ≤ 16 (above that, names overlap and the chart becomes mush).
  const labelEveryDot = isMagic || items.length <= 16;

  const labelClass = isMagic ? 'quadrant-label--magic' : '';
  // The corner names are fixed obstacles: they name the quadrant, so they hold
  // their place and the dot labels move around them.
  const labels = itemLabelSet(cornerObstacles(names, labelClass));
  let plot = '<g class="quadrant-plot">';
  model.groups.forEach((g, gi) => {
    const cellIdx = gi % 4;
    for (const it of g.items) {
      const p = plotPoint(it.x, it.y, scale);
      const d = dotWithLabelSvg(p, labelEveryDot ? it.label : '', cellIdx, { mark: it.mark, label: it.label });
      plot += d.dot;
      labels.mark(p.x, p.y, GEOM.dotR);
      if (d.spec) labels.add(d.label, d.spec);
    }
  });
  // Labels come AFTER every dot in document order, so a wrapped name is painted
  // over the plot's own dots rather than under a later one.
  plot += labels.emit();
  plot += '</g>';
  const svg = openSvg(isMagic ? 'quadrant-svg--magic' : '') +
    quadrantTintsSvg(splitX, splitY) +
    plotFrameSvg(splitX, splitY, 'centerline') +
    axisLabelsSvg(labelScale) +
    quadrantLabelsSvg(names, labelClass) +
    plot +
  '</svg>';
  return figure(variant, model, labelScale, svg);
}

// bubble: each item's third pill value sizes a √-area dot. Dots are not
// quadrant-tinted (the size IS the encoding); group names still label
// the four corners so context is preserved.
function renderBubble(model, scale) {
  const splitX = (GEOM.plot.x0 + GEOM.plot.x1) / 2;
  const splitY = (GEOM.plot.y0 + GEOM.plot.y1) / 2;
  const names = [0, 1, 2, 3].map(i => (model.groups[i] ? model.groups[i].name : ''));

  // Size range across all items — null/zero magnitudes fall back to the
  // standard dot radius (rendered at rMin).
  let maxSize = 0;
  for (const g of model.groups) {
    for (const it of g.items) if (Number.isFinite(it.size) && it.size > maxSize) maxSize = it.size;
  }
  const sizeRange = maxSize > 0 ? { min: 0, max: maxSize } : null;

  // Bottom corner label band — name labels placed below the bubble would
  // crash into this if the bubble sits in the bottom quartile. Flip those
  // to ABOVE the bubble instead.
  const botCornerTop = GEOM.plot.y1 - GEOM.cornerInset - 13;

  const labels = itemLabelSet(cornerObstacles(names));
  let plot = '<g class="quadrant-plot">';
  model.groups.forEach((g, gi) => {
    const cellIdx = gi % 4;
    for (const it of g.items) {
      const p = plotPoint(it.x, it.y, scale);
      const r = bubbleRadius(it.size, sizeRange);
      // `data-anima-role="point"` — a bubble is a scatter point WITH a
      // magnitude, not a bar. Before this it fell through to the generic 'bar'
      // default, which is exactly the "no real role" gap this change closes.
      plot += `<circle class="quadrant-bubble" data-cell="${cellIdx}" data-anima-role="point" data-mark="${it.mark}"` +
        `${it.label ? ` data-label="${escAttr(it.label)}"` : ''} ` +
        `cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${r.toFixed(2)}"/>`;
      labels.mark(p.x, p.y, r);
      const inside = r >= 11;
      const valY = inside ? p.y + 3 : p.y - r - 3;
      const valBaseline = inside ? 'middle' : 'auto';
      if (it.sizePill) {
        // The value sits ON its bubble, so it is placed with the geometry and
        // stays out of the de-collision set — shifting it would detach it from
        // the bubble it measures.
        plot += wrapSvgLabel(it.sizePill, {
          x: p.x, y: valY, width: Math.max(24, r * 2), fontSize: FS.bubbleValue,
          anchor: 'middle', vAlign: 'baseline', maxLines: 1,
          className: 'quadrant-bubble-value',
          baseline: valBaseline,
          attrs: ` data-pos="${inside ? 'inside' : 'above'}" data-cell="${cellIdx}"`,
          emitFontSize: false,
        }).svg;
      }
      // Name label position: below bubble by default; above when the
      // below position's text-body would overlap a bottom corner label.
      // 12 ≈ label font + buffer; checks the BOTTOM of the label, not
      // the top. Without this, small bubbles near the bottom rim still
      // landed inside the corner band even though belowY < cornerTop.
      if (it.label) {
        const belowY = inside ? p.y + r + 3 : p.y + r + 11;
        const aboveY = p.y - r - (inside ? 3 : 11);
        // Flip above only when the block would otherwise run into the bottom
        // corner band AND it actually fits above — measured, not assumed.
        const bh = measureLabel(it.label, {
          width: LW.item, fontSize: FS.dotLabel, maxLines: ITEM_MAX_LINES,
        }).height;
        const flipUp = belowY > botCornerTop - 12 && aboveY - bh > GEOM.plot.y0 + 2;
        const ny = flipUp ? aboveY : belowY;
        const baseline = flipUp ? 'auto' : 'hanging';
        labels.add(it.label, {
          x: p.x, y: ny, width: LW.item, fontSize: FS.dotLabel,
          anchor: 'middle',
          vAlign: flipUp ? 'bottom' : 'baseline',
          pushDir: flipUp ? -1 : 1,
          maxLines: ITEM_MAX_LINES,
          className: 'quadrant-bubble-label',
          baseline,
    attrs: ` data-cell="${cellIdx}"`,
          emitFontSize: false,
        });
      }
    }
  });
  plot += labels.emit();
  plot += '</g>';

  const svg = openSvg('quadrant-svg--bubble') +
    quadrantTintsSvg(splitX, splitY) +
    plotFrameSvg(splitX, splitY, 'centerline') +
    axisLabelsSvg(scale) +
    quadrantLabelsSvg(names) +
    plot +
  '</svg>';
  return figure('bubble', model, scale, svg);
}

// trail: each item has two coords (before → after). Faded before-dot,
// dashed connector, solid after-dot — the canonical "what moved" read.
function renderTrail(model, scale) {
  const splitX = (GEOM.plot.x0 + GEOM.plot.x1) / 2;
  const splitY = (GEOM.plot.y0 + GEOM.plot.y1) / 2;
  const names = [0, 1, 2, 3].map(i => (model.groups[i] ? model.groups[i].name : ''));

  const labels = itemLabelSet(cornerObstacles(names));
  let plot = '<g class="quadrant-plot">';
  model.groups.forEach((g, gi) => {
    const cellIdx = gi % 4;
    for (const it of g.items) {
      const a = plotPoint(it.x, it.y, scale);
      const b = it.to ? plotPoint(it.to.x, it.to.y, scale) : a;
      plot += `<line class="quadrant-trail-line" data-cell="${cellIdx}" ` +
        `x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}"/>`;
      plot += `<circle class="quadrant-trail-before" data-cell="${cellIdx}" ` +
        `cx="${a.x.toFixed(2)}" cy="${a.y.toFixed(2)}" r="${(GEOM.dotR - 0.5).toFixed(2)}"/>`;
      // The trail's "after" dot is the one that carries the mark and the name —
      // it is where the item ENDED UP, so it is the point the reader tracks.
      // A point role, not the generic 'bar' fallback it used to take.
      plot += `<circle class="quadrant-trail-after" data-cell="${cellIdx}" data-anima-role="point" data-mark="${it.mark}"` +
        `${it.label ? ` data-label="${escAttr(it.label)}"` : ''} ` +
        `cx="${b.x.toFixed(2)}" cy="${b.y.toFixed(2)}" r="${(GEOM.dotR + 0.5).toFixed(2)}"/>`;
      labels.mark(b.x, b.y, GEOM.dotR + 0.5);
      if (it.label) {
        const labelAbove = b.y - 10 > GEOM.plot.y0 + 8;
        const ly = labelAbove ? b.y - 9 : b.y + 12;
        const baseline = labelAbove ? 'auto' : 'hanging';
        labels.add(it.label, {
          x: b.x, y: ly, width: LW.item, fontSize: FS.dotLabel,
          anchor: 'middle',
          vAlign: labelAbove ? 'bottom' : 'baseline',
          pushDir: labelAbove ? -1 : 1,
          maxLines: ITEM_MAX_LINES,
          className: 'quadrant-dot-label',
          baseline,
    attrs: ` data-cell="${cellIdx}"`,
          emitFontSize: false,
        });
      }
    }
  });
  plot += labels.emit();
  plot += '</g>';

  const svg = openSvg('quadrant-svg--trail') +
    quadrantTintsSvg(splitX, splitY) +
    plotFrameSvg(splitX, splitY, 'centerline') +
    axisLabelsSvg(scale) +
    quadrantLabelsSvg(names) +
    plot +
  '</svg>';
  return figure('trail', model, scale, svg);
}

// cohort: items colored by group, convex-hull region tint per cohort.
// The four corner labels become cohort labels rather than quadrant labels
// — placed at each hull's centroid (or near it).
function renderCohort(model, scale, orientation) {
  const splitX = (GEOM.plot.x0 + GEOM.plot.x1) / 2;
  const splitY = (GEOM.plot.y0 + GEOM.plot.y1) / 2;

  // Build hulls per group.
  const hulls = model.groups.map((g, gi) => {
    const pts = g.items.map(it => ({ ...plotPoint(it.x, it.y, scale), mark: it.mark, label: it.label }));
    const hull = convexHull(pts);
    const c = centroid(hull.length ? hull : pts);
    return { name: g.name, cellIdx: gi % 4, hull, points: pts, centroid: c };
  });

  let hullsSvg = '<g class="quadrant-hulls" aria-hidden="true">';
  for (const h of hulls) {
    if (h.hull.length >= 3) {
      hullsSvg += `<polygon class="quadrant-hull" data-cell="${h.cellIdx}" ` +
        `points="${h.hull.map(fmtPt).join(' ')}"/>`;
    } else if (h.hull.length === 2) {
      // 2-point hull: draw as a thickened line.
      const [a, b] = h.hull;
      hullsSvg += `<line class="quadrant-hull-line" data-cell="${h.cellIdx}" ` +
        `x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}"/>`;
    }
  }
  hullsSvg += '</g>';

  let plot = '<g class="quadrant-plot">';
  hulls.forEach(h => {
    for (const p of h.points) {
      plot += `<circle class="quadrant-dot" data-cell="${h.cellIdx}" data-anima-role="point" data-mark="${p.mark}"` +
        `${p.label ? ` data-label="${escAttr(p.label)}"` : ''} ` +
        `cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${GEOM.dotR.toFixed(2)}"/>`;
    }
  });
  plot += '</g>';

  // Cohort labels at centroids.
  // A cohort name sits at its cluster's centroid, so it wraps around that point
  // and grows symmetrically ('middle') rather than sliding off it.
  let labels = '<g class="quadrant-cohort-labels">';
  for (const h of hulls) {
    if (!h.name || h.points.length === 0) continue;
    labels += wrapSvgLabel(h.name, {
      x: h.centroid.x, y: h.centroid.y, width: LW.cohort, fontSize: FS.cohort,
      advance: ADVANCE_UPPER,   // uppercase + tracked in CSS
      anchor: 'middle', vAlign: 'middle', maxLines: 2,
      className: 'quadrant-cohort-label',
      baseline: 'middle',
      attrs: ` data-cell="${h.cellIdx}"`,
      emitFontSize: false,
    }).svg;
  }
  labels += '</g>';

  // SVG-native key — one chip per cohort with its item count. The swatch uses the
  // family formula (slot hue at 82% over the canvas + the --catN-ink edge), the
  // count is the value column. Cohorts without a name are dropped from the key.
  const rows = hulls.filter(h => h.name).map(h => ({
    swatchFill: `color-mix(in oklab, var(--chart-cat-${h.cellIdx + 1}-hue) 82%, var(--bg))`,
    swatchStroke: `var(--chart-cat-${h.cellIdx + 1}-ink)`,
    label: h.name,
    value: String(h.points.length),
  }));
  const bodyInner =
    plotFrameSvg(splitX, splitY, 'centerline') +
    axisLabelsSvg(scale) +
    hullsSvg +
    plot +
    labels;
  const key = buildSvgLegend({ rows, diagramRight: GEOM.vbW, diagramHeight: GEOM.vbH, hasValues: true, orientation });
  const svg = `<svg class="quadrant-svg quadrant-svg--cohort" ` +
    `viewBox="0 0 ${key.viewW} ${key.viewH}" role="img"><title>Quadrant cohort chart</title>${key.desc}` +
    `<defs>${key.defs}</defs>` +
    `<g transform="translate(${key.diagramDx} ${key.diagramDy})">${bodyInner}</g>` +
    `${key.body}</svg>`;
  return figure('cohort', model, scale, svg);
}

// threshold: midlines replaced by explicit x/y target lines. The four
// zones get action-oriented labels (Star / On Pace / Lagging / At Risk)
// when the author hasn't supplied group names.
function renderThreshold(model, scale) {
  const tx = scale.targets ? scale.targets.x : (scale.x.min + scale.x.max) / 2;
  const ty = scale.targets ? scale.targets.y : (scale.y.min + scale.y.max) / 2;
  const p = plotPoint(tx, ty, scale);
  const splitX = p.x, splitY = p.y;

  // Zone labels: prefer author-supplied group names; fall back to the
  // canonical Star/On Pace/Lagging/At Risk vocabulary.
  const names = [0, 1, 2, 3].map(i => {
    const fromGroup = model.groups[i] ? model.groups[i].name : '';
    return fromGroup || THRESHOLD_ZONE_NAMES[i];
  });

  const labels = itemLabelSet(cornerObstacles(names, 'quadrant-label--zone'));
  let plot = '<g class="quadrant-plot">';
  model.groups.forEach((g, gi) => {
    const cellIdx = gi % 4;
    for (const it of g.items) {
      const pp = plotPoint(it.x, it.y, scale);
      const d = dotWithLabelSvg(pp, it.label, cellIdx, { mark: it.mark, label: it.label });
      plot += d.dot;
      labels.mark(pp.x, pp.y, GEOM.dotR);
      if (d.spec) labels.add(d.label, d.spec);
    }
  });
  plot += labels.emit();
  plot += '</g>';

  // Target-value badges at the axis crossings.
  let badges = '<g class="quadrant-target-badges" aria-hidden="true">';
  badges += wrapSvgLabel(fmtNum(tx), {
    x: splitX, y: GEOM.plot.y1 + 14, width: 60, fontSize: FS.badge,
    anchor: 'middle', vAlign: 'baseline', maxLines: 1,
    className: 'quadrant-target-badge quadrant-target-badge--x',
    baseline: 'hanging', emitFontSize: false,
  }).svg;
  badges += wrapSvgLabel(fmtNum(ty), {
    x: GEOM.plot.x0 - 6, y: splitY, width: 60, fontSize: FS.badge,
    anchor: 'end', vAlign: 'baseline', maxLines: 1,
    className: 'quadrant-target-badge quadrant-target-badge--y',
    baseline: 'middle', emitFontSize: false,
  }).svg;
  badges += '</g>';

  const svg = openSvg('quadrant-svg--threshold') +
    quadrantTintsSvg(splitX, splitY) +
    plotFrameSvg(splitX, splitY, 'target') +
    axisLabelsSvg(scale) +
    quadrantLabelsSvg(names, 'quadrant-label--zone') +
    badges +
    plot +
  '</svg>';
  return figure('threshold', model, scale, svg, ` data-tx="${escAttr(fmtNum(tx))}" data-ty="${escAttr(fmtNum(ty))}"`);
}

// ── Variant resolution + dispatch ──────────────────────────────────────────

function pickVariant(tokens) {
  for (const mod of QUADRANT_MODIFIERS) {
    if (tokens.includes(mod)) return mod;
  }
  return 'default';
}

function buildQuadrant(model, variant, scale, orientation) {
  switch (variant) {
    case 'bubble':     return renderBubble(model, scale);
    case 'trail':      return renderTrail(model, scale);
    case 'cohort':     return renderCohort(model, scale, orientation);
    case 'threshold':  return renderThreshold(model, scale);
    case 'magic':      return renderStandard(model, scale, 'magic');
    default:           return renderStandard(model, scale, 'default');
  }
}

// First `<p><code>…</code></p>` in the section — the eyebrow. Same helper
// shape as radar's, lifted verbatim for parity with the dispatch site in
// lib/components/chart/_chart-family/chart-family.js.
function matchEyebrowText(html) {
  const m = html.match(/<p[^>]*>\s*<code[^>]*>([^<]+?)<\/code>\s*<\/p>/);
  return m ? m[1] : '';
}

module.exports = {
  QUADRANT_MODIFIERS,
  MAGIC_DEFAULT_NAMES,
  MAGIC_DEFAULT_AXES,
  THRESHOLD_ZONE_NAMES,
  GEOM,
  parseQuadrant,
  parseGroup,
  parseItem,
  parseItemPills,
  parseCoordPill,
  parseEyebrow,
  resolveScale,
  niceCeil,
  pickVariant,
  buildQuadrant,
  plotPoint,
  convexHull,
  centroid,
  bubbleRadius,
  findOuterUL,
  splitTopLevelLI,
  matchEyebrowText,
};
