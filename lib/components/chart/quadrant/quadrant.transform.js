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
  wrapSvgLabel, placeLabels, ADVANCE_UPPER,
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
  corner: 120,   // a quadrant name, centered on its column outside the plot
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

// Geometry. 420×348 viewBox with the plot box inset for axis labels and
// rim text, plus a band under the plot for the bottom quadrant names. Data x grows rightward; data y grows upward (SVG y is flipped
// in plotPoint). All coords are in viewBox units (no responsive math here).
// The CSS pins the SVG at 472×360 — matching radar's vertical-fit
// guarantee inside chart-body. Insets below leave room for axis names
// at the bottom-centre and left-centre even at that compact size.
const GEOM = {
  viewBox: '0 0 420 348',
  vbW: 420, vbH: 348,
  plot: { x0: 56, y0: 30, x1: 392, y1: 274 },
  // Quadrant NAMES sit OUTSIDE the plot — centered on their own column, above
  // the top row and below the bottom row — so the plot interior belongs
  // entirely to the data. The 30 units above `plot.y0` hold the top names; this
  // band reserves the same room below `plot.y1` for the bottom pair, and the
  // x-axis tick row + axis title are pushed below it.
  labelBand: 28,
  // Gap between the plot edge and a quadrant name.
  labelGap: 6,
  // Bubble sizing: √-scaled radius so dot AREA encodes magnitude honestly.
  bubble: { rMin: 5, rMax: 26 },
  // Standard scatter dot radius.
  dotR: 4.5,
};

// Shared string/list helpers for the SVG chart kernels (one home; the
// quadrant/radar copies were the duplication scan's biggest exact clone).
const {
  escHtml, escAttr, stripTags, plainText, fmtNum, findOuterUL, splitTopLevelLI,
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
  return { label: plainText(rest), pills };
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
  const name = plainText(nested ? liInner.slice(0, nested.start) : liInner);
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
// The four quadrant-name anchors, TL / TR / BL / BR. Extracted so the emitter below
// and `cornerObstacles` derive their geometry from ONE table — the boxes the
// de-collision pass avoids must be exactly the boxes that get painted, and two
// copies of this table would silently drift apart.
// Where each quadrant's NAME sits. Reading order TL, TR, BL, BR.
//
// The names live OUTSIDE the plot: the top pair centered above their column,
// the bottom pair centered below it. They used to sit inset INSIDE their
// corner, which cost twice over — they competed with the data for the corner
// they occupied (item labels had to be routed around them, and still collided
// when a cluster sat in that corner), and an inset label reads as a data
// annotation rather than as the name of the whole region.
//
// Outside and centered, a name is unambiguously about its column, the plot
// interior belongs entirely to the marks, and the de-collision pass has one
// less fixed obstacle to work around.
//
// Each is centered on its own CELL, not on the half-viewBox: the split is
// author-movable (the threshold/target variants put it anywhere), so the
// center is derived from `splitX`.
//
// `baseline` is the painted `dominant-baseline`; `vAlign` decides which way a
// SECOND line grows — the top pair grow UP and the bottom pair DOWN, i.e.
// always away from the plot.
// A name is centered on its column, but its WIDTH is the wrap budget, not the
// column — a `threshold` target near an axis extreme leaves a 15-unit column
// under a 120-unit name. Centering naively then hangs the name past the
// viewBox edge (measured: a target at x=10 put the right name at 345.6…438.4
// in a 420-wide box). Two guards, in order: wrap to the room the column
// actually has (never below a readable floor), then clamp the center so the
// painted box stays inside the viewBox.
const CORNER_MIN_W = 72;
function cornerBudget(colWidth) {
  return Math.max(CORNER_MIN_W, Math.min(LW.corner, colWidth));
}
function clampCenter(mid, width) {
  const half = width / 2;
  return Math.min(Math.max(mid, half), GEOM.vbW - half);
}

function cornerPositions(splitX) {
  const { plot, labelGap } = GEOM;
  const sx = Number.isFinite(splitX) ? splitX : (plot.x0 + plot.x1) / 2;
  const leftW = cornerBudget(sx - plot.x0);
  const rightW = cornerBudget(plot.x1 - sx);
  const leftMid = clampCenter((plot.x0 + sx) / 2, leftW);
  const rightMid = clampCenter((sx + plot.x1) / 2, rightW);
  return [
    { x: leftMid,  y: plot.y0 - labelGap, width: leftW,  anchor: 'middle', baseline: 'auto',    vAlign: 'bottom' },
    { x: rightMid, y: plot.y0 - labelGap, width: rightW, anchor: 'middle', baseline: 'auto',    vAlign: 'bottom' },
    { x: leftMid,  y: plot.y1 + labelGap, width: leftW,  anchor: 'middle', baseline: 'hanging', vAlign: 'baseline' },
    { x: rightMid, y: plot.y1 + labelGap, width: rightW, anchor: 'middle', baseline: 'hanging', vAlign: 'baseline' },
  ];
}

// The y of the x-axis tick row — below the bottom quadrant names, which now
// occupy the band immediately under the plot.
//
// `hasNames` is false for the one variant that draws NO quadrant names
// (`cohort`, which names its clusters at their centroids instead). Reserving
// the band there would push the tick row and axis title 28 units down for
// nothing and shrink the whole unit to fit — an empty gap the reader reads as
// a mistake.
function axisRowY(hasNames = true) {
  return GEOM.plot.y1 + (hasNames ? GEOM.labelBand : 0) + 14;
}

// The composed viewBox height, which carries the name band only when there
// are names.
function vbHeight(hasNames = true) {
  return hasNames ? GEOM.vbH : GEOM.vbH - GEOM.labelBand;
}

// The wrap spec for corner label `i` — shared by the emitter and the obstacle
// pass so both describe the same painted box.
function cornerSpec(i, extraClass, splitX) {
  const p = cornerPositions(splitX)[i];
  const fontSize = extraClass === 'quadrant-label--magic' ? FS.labelMagic
    : extraClass === 'quadrant-label--zone' ? FS.labelZone
      : FS.label;
  return {
    x: p.x, y: p.y, width: p.width, fontSize,
    baseline: p.baseline,
    // .quadrant-label is `text-transform: uppercase` + `letter-spacing: 0.04em`,
    // so it paints wider than the mixed-case source string implies.
    advance: ADVANCE_UPPER,
    anchor: p.anchor, vAlign: p.vAlign, maxLines: 2,
    className: `quadrant-label${extraClass ? ` ${extraClass}` : ''}`,
    attrs: ` data-cell="${i}"`,
    emitFontSize: false,
  };
}

function quadrantLabelsSvg(names, extraClass, splitX) {
  let out = '<g class="quadrant-labels">';
  names.forEach((name, i) => {
    if (!name) return;
    out += wrapSvgLabel(name, cornerSpec(i, extraClass, splitX)).svg;
  });
  out += '</g>';
  return out;
}

// The quadrant names are FIXED obstacles for the item-label pass.
//
// Moving them outside the plot did not retire this. "Outside the plot" is only
// six units out (`labelGap`), and nothing stops a mark's label from crossing
// that edge — a label placed below a low dot, or a bubble's caption, lands
// squarely in the name band. The names hold their place (they name the region);
// the item labels move around them, exactly as before.
//
// Boxes come from `cornerSpec`, so the avoided box is by construction the
// painted box — two copies of this geometry would drift apart silently.
function cornerObstacles(names, extraClass, splitX) {
  if (!Array.isArray(names)) return [];
  const out = [];
  names.forEach((name, i) => {
    if (!name) return;
    const m = wrapSvgLabel(name, cornerSpec(i, extraClass, splitX));
    out.push({ left: m.left, right: m.right, top: m.top, bottom: m.bottom, fixed: true });
  });
  return out;
}

/**
 * Collect item labels and place them AS A SET, beside the marks they name.
 *
 * A label belongs to one dot, and the only thing that makes it readable is
 * sitting next to that dot. So the caller hands over the MARK, not a position —
 * `placeLabels` (svg-label.js) tries eight anchors around it and takes the first
 * that clears everything already placed.
 *
 * This replaced a guess-then-slide pass, and the reason is worth keeping: a
 * slide has one direction, so a crowded label travelled a long way from its dot
 * and a cluster of three stacked into a column while their dots stayed put
 * (seen on a real deck — "Maturity self-assessment" and "Per-team weighting UI"
 * stacked in the DEFER corner with both dots well below them). The fix is not a
 * better slide; it is having somewhere else to go.
 *
 * `bounds` is the plot box, which is also how a rim dot gets a sensible label:
 * every outward anchor leaves the box and is rejected, so the label lands on an
 * inward side by construction rather than by a special case.
 */
function itemLabelSet(obstacles) {
  const items = [];
  const extraMarks = [];
  return {
    add(text, mark, spec) { if (text) items.push({ text, ...mark, spec }); },
    // A mark with no label of its own — a trail's start dot, a bubble's value
    // pill — is still something a label must not land on.
    mark(cx, cy, r) { extraMarks.push({ left: cx - r, right: cx + r, top: cy - r, bottom: cy + r }); },
    box(b) { extraMarks.push(b); },
    emit() {
      if (!items.length) return '';
      const { plot } = GEOM;
      return placeLabels(items, {
        obstacles: obstacles.concat(extraMarks),
        bounds: { x0: plot.x0, y0: plot.y0, x1: plot.x1, y1: plot.y1 },
      }).map((r) => r.svg).join('');
    },
  };
}

// X-axis label, centered below the plot. Y-axis label, rotated -90°
// at the left of the plot. Range numbers at the four corners of the plot.
function axisLabelsSvg(scale, hasNames = true) {
  const { plot } = GEOM;
  const vbH = vbHeight(hasNames);
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
  out += tick(plot.x0, axisRowY(hasNames), 'start', 'hanging', fmtNum(scale.x.min));
  out += tick(plot.x1, axisRowY(hasNames), 'end', 'hanging', fmtNum(scale.x.max));
  out += tick(plot.x0 - 6, plot.y1, 'end', 'auto', fmtNum(scale.y.min));
  out += tick(plot.x0 - 6, plot.y0, 'end', 'hanging', fmtNum(scale.y.max));
  out += '</g>';
  return out;
}

// One scatter dot plus the label SPEC for it. The dot's position is data; the
// LABEL's position is not decided here — the whole plot's labels are placed as
// a set by `itemLabelSet` / `placeLabels`, which is the only level that can see
// where a neighbor ended up.
//
// This used to carry a zone heuristic (near a corner → beside the dot; else
// interior-facing above/below) that guessed one position per dot and left the
// de-collision pass to slide it. Both halves are gone: the guess is now eight
// candidate positions scored against what is actually there, and the rim case
// falls out of the plot-box bounds instead of a hand-written corner zone.
function dotWithLabelSvg(p, label, cellIdx, opts) {
  const r = opts && opts.r != null ? opts.r : GEOM.dotR;
  const markAttr = opts && opts.mark != null
    ? ` data-mark="${opts.mark}"${opts.label ? ` data-label="${escAttr(opts.label)}"` : ''}`
    : '';
  // `data-anima-role="point"` — a scatter dot is a POINT, not a bar. Declared
  // natively so the motion system reads the role instead of guessing.
  const dot = `<circle class="quadrant-dot" data-cell="${cellIdx}" data-anima-role="point"${markAttr} ` +
    `cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${r.toFixed(2)}"/>`;
  const spec = label ? {
    width: LW.item, fontSize: FS.dotLabel,
    maxLines: ITEM_MAX_LINES,
    className: 'quadrant-dot-label',
    attrs: ` data-cell="${cellIdx}"`,
    emitFontSize: false,
  } : null;
  return { dot, label: label || '', spec, mark: { cx: p.x, cy: p.y, r } };
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

// `hasNames` decides whether the viewBox carries the lower name band — a
// variant (or a deck) with no quadrant names must not reserve room for them.
// NAMED, and NOT aria-hidden. These four variant roots used to carry
// `aria-hidden="true"` with no `<title>`, which made the chart wholly absent from
// the accessibility tree — and the all-SVG migration (2026-07-27) made that worse
// rather than better by moving the last HTML labels INTO the viewBox, so the item
// names went behind the same curtain. A screen reader got nothing at all: no name,
// no data, not even "image". The cohort variant below was already correct; these
// now match it. See the semantic-html ADR §17.5.
function openSvg(extraClass, hasNames = true, title = 'Quadrant chart') {
  return `<svg class="quadrant-svg${extraClass ? ' ' + extraClass : ''}"` +
    `${hasNames ? '' : ' data-band="none"'} ` +
    `viewBox="0 0 ${GEOM.vbW} ${vbHeight(hasNames)}" role="img"><title>${escHtml(title)}</title>`;
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
  const labels = itemLabelSet(cornerObstacles(names, labelClass, splitX));
  let plot = '<g class="quadrant-plot">';
  model.groups.forEach((g, gi) => {
    const cellIdx = gi % 4;
    for (const it of g.items) {
      const p = plotPoint(it.x, it.y, scale);
      const d = dotWithLabelSvg(p, labelEveryDot ? it.label : '', cellIdx, { mark: it.mark, label: it.label });
      plot += d.dot;
      if (d.spec) labels.add(d.label, d.mark, d.spec);
      else labels.mark(p.x, p.y, GEOM.dotR);
    }
  });
  // Labels come AFTER every dot in document order, so a wrapped name is painted
  // over the plot's own dots rather than under a later one.
  plot += labels.emit();
  plot += '</g>';
  // The band this gates is the BOTTOM row's, so it is the bottom pair that
  // decides. `some(Boolean)` reserved 28 units under a chart whose only names
  // are on top — the same empty-gap defect the cohort variant had, one row over.
  const hasNames = Boolean(names[2] || names[3]);
  const svg = openSvg(isMagic ? 'quadrant-svg--magic' : '', hasNames,
    isMagic ? 'Magic-quadrant chart' : 'Quadrant chart') +
    quadrantTintsSvg(splitX, splitY) +
    plotFrameSvg(splitX, splitY, 'centerline') +
    axisLabelsSvg(labelScale, hasNames) +
    quadrantLabelsSvg(names, labelClass, splitX) +
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

  const labels = itemLabelSet(cornerObstacles(names, '', splitX));
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
      const inside = r >= 11;
      const valY = inside ? p.y + 3 : p.y - r - 3;
      const valBaseline = inside ? 'middle' : 'auto';
      if (it.sizePill) {
        // The value sits ON its bubble, so it is placed with the geometry and
        // stays out of the placement set — moving it would detach it from the
        // bubble it measures. It IS an obstacle, though: a name that landed on
        // a magnitude reads as one number labelling the other.
        const v = wrapSvgLabel(it.sizePill, {
          x: p.x, y: valY, width: Math.max(24, r * 2), fontSize: FS.bubbleValue,
          anchor: 'middle', vAlign: 'baseline', maxLines: 1,
          className: 'quadrant-bubble-value',
          baseline: valBaseline,
          attrs: ` data-pos="${inside ? 'inside' : 'above'}" data-cell="${cellIdx}"`,
          emitFontSize: false,
        });
        plot += v.svg;
        if (!inside) labels.box({ left: v.left, right: v.right, top: v.top, bottom: v.bottom });
      }
      // Where the name goes is `placeLabels`' call, not this loop's — the
      // bubble is the mark, and the anchors are tried around it. The old
      // hand-written below-then-flip-above rule is gone with the rest of the
      // guess-then-slide model.
      if (it.label) {
        labels.add(it.label, { cx: p.x, cy: p.y, r }, {
          width: LW.item, fontSize: FS.dotLabel,
          maxLines: ITEM_MAX_LINES,
          className: 'quadrant-bubble-label',
          attrs: ` data-cell="${cellIdx}"`,
          emitFontSize: false,
        });
      } else {
        labels.mark(p.x, p.y, r);
      }
    }
  });
  plot += labels.emit();
  plot += '</g>';

  // The band this gates is the BOTTOM row's, so it is the bottom pair that
  // decides. `some(Boolean)` reserved 28 units under a chart whose only names
  // are on top — the same empty-gap defect the cohort variant had, one row over.
  const hasNames = Boolean(names[2] || names[3]);
  const svg = openSvg('quadrant-svg--bubble', hasNames, 'Quadrant bubble chart') +
    quadrantTintsSvg(splitX, splitY) +
    plotFrameSvg(splitX, splitY, 'centerline') +
    axisLabelsSvg(scale, hasNames) +
    quadrantLabelsSvg(names, '', splitX) +
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

  const labels = itemLabelSet(cornerObstacles(names, '', splitX));
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
      // The BEFORE dot carries no label of its own, so it is registered as a
      // bare obstacle; the after dot arrives with its label below.
      labels.mark(a.x, a.y, GEOM.dotR - 0.5);
      if (!it.label) labels.mark(b.x, b.y, GEOM.dotR + 0.5);
      // The trail's name belongs to where the item ENDED — that is the reading
      // the chart is making — so the AFTER dot is the mark it is placed around.
      if (it.label) {
        labels.add(it.label, { cx: b.x, cy: b.y, r: GEOM.dotR + 0.5 }, {
          width: LW.item, fontSize: FS.dotLabel,
          maxLines: ITEM_MAX_LINES,
          className: 'quadrant-dot-label',
          attrs: ` data-cell="${cellIdx}"`,
          emitFontSize: false,
        });
      }
    }
  });
  plot += labels.emit();
  plot += '</g>';

  // The band this gates is the BOTTOM row's, so it is the bottom pair that
  // decides. `some(Boolean)` reserved 28 units under a chart whose only names
  // are on top — the same empty-gap defect the cohort variant had, one row over.
  const hasNames = Boolean(names[2] || names[3]);
  const svg = openSvg('quadrant-svg--trail', hasNames, 'Quadrant trail chart') +
    quadrantTintsSvg(splitX, splitY) +
    plotFrameSvg(splitX, splitY, 'centerline') +
    axisLabelsSvg(scale, hasNames) +
    quadrantLabelsSvg(names, '', splitX) +
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
    axisLabelsSvg(scale, false) +
    hullsSvg +
    plot +
    labels;
  const key = buildSvgLegend({ rows, diagramRight: GEOM.vbW, diagramHeight: vbHeight(false), hasValues: true, orientation });
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

  const labels = itemLabelSet(cornerObstacles(names, 'quadrant-label--zone', splitX));
  let plot = '<g class="quadrant-plot">';
  model.groups.forEach((g, gi) => {
    const cellIdx = gi % 4;
    for (const it of g.items) {
      const pp = plotPoint(it.x, it.y, scale);
      const d = dotWithLabelSvg(pp, it.label, cellIdx, { mark: it.mark, label: it.label });
      plot += d.dot;
      if (d.spec) labels.add(d.label, d.mark, d.spec);
      else labels.mark(pp.x, pp.y, GEOM.dotR);
    }
  });
  plot += labels.emit();
  plot += '</g>';

  // Target-value badges at the axis crossings.
  let badges = '<g class="quadrant-target-badges" aria-hidden="true">';
  badges += wrapSvgLabel(fmtNum(tx), {
    x: splitX, y: axisRowY(), width: 60, fontSize: FS.badge,
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

  // The band this gates is the BOTTOM row's, so it is the bottom pair that
  // decides. `some(Boolean)` reserved 28 units under a chart whose only names
  // are on top — the same empty-gap defect the cohort variant had, one row over.
  const hasNames = Boolean(names[2] || names[3]);
  const svg = openSvg('quadrant-svg--threshold', hasNames, 'Quadrant threshold chart') +
    quadrantTintsSvg(splitX, splitY) +
    plotFrameSvg(splitX, splitY, 'target') +
    axisLabelsSvg(scale, hasNames) +
    quadrantLabelsSvg(names, 'quadrant-label--zone', splitX) +
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
  // Exported for the regression tests the trio found had no coverage.
  cornerObstacles,
  cornerBudget,
  vbHeight,
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
