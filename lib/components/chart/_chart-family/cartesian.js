/**
 * cartesian.js — the shared PLOT SUBSTRATE for the chart family's Cartesian
 * members (bar, stacked-bar, line, waterfall, scatter, slope, bullet).
 *
 * WHY THIS EXISTS. Until this module the family had no Cartesian chart at all:
 * every member either drew a bespoke geometry (funnel's trapezoids, radar's
 * spokes, the pie's wedges) or laid out boxes (progress, kanban). The gantt is
 * the one thing that ever computed an axis, and its tick code is private to it
 * and keyed to time. Adding seven Cartesian charts one at a time would have
 * minted seven private tick generators, seven gutter conventions and seven
 * gridline weights — i.e. seven charts that look like seven products. HARD RULE
 * #1 says the shared transform lands in one kernel; this is that kernel, and it
 * is also the thing that makes a bar slide and a line slide read as one system.
 *
 * WHAT IT OWNS
 *   · the series DSL (`parseSeries`) every Cartesian member authors against
 *   · nice-number tick selection + SI/affix-preserving tick formatting
 *   · linear and band scales
 *   · the plot box: ONE gutter convention, ONE viewBox per orientation
 *   · the painted chrome: gridlines, the zero rule, the axis rule, tick labels,
 *     category labels (wrapped, collision-culled), axis titles
 *
 * WHAT IT DOES NOT OWN
 *   · color — every emitted element carries a class and, where it is
 *     categorical, a `--i` index. No fill, no stroke, no hex (HARD RULE #3).
 *     The paint lives in chart-family.css § Cartesian chrome and in each
 *     member's own stylesheet.
 *   · the marks — a bar, a line, a dot is the member's own geometry.
 *   · the legend — that is svg-legend.js, composed by the member.
 *
 * Pure string-in/string-out CommonJS: no fs, no DOM. It is bundled into the
 * runtime, the emulator and the docs-site bundles like the rest of the family.
 */

const { wrapSvgLabel, measureLabel } = require('./svg-label');
const { plainText } = require('./transform-utils');
const { parseTopLevelLis } = require('../../../core/html-lists');
const { renderIdPrefix, nextRenderSeq } = require('../../../core/render-ids');

// ── Geometry ───────────────────────────────────────────────────────────────
//
// ONE viewBox per orientation, shared by every Cartesian member — this is the
// single biggest reason a bar slide and a line slide look like the same deck.
// Landscape matches the funnel's 320×180 so the whole family shares a canvas
// aspect. Portrait is 320×300 rather than the funnel's 320×420: a funnel is a
// vertical STACK and grows happily to 420, but a plot at 320×420 letterboxes
// its own plot area into a narrow column and throws the type ratio out (the
// viewBox height maps to the body height, so a taller viewBox scales the whole
// unit DOWN — the same coupling svg-legend.js documents).
//
// SQUARE deliberately keeps the landscape box, matching roadmap's decision
// (roadmap.transform.js §351): a square deck's chart body is wide enough for
// the landscape composition, and re-tuning a third geometry buys nothing that
// `preserveAspectRatio="xMidYMid meet"` does not already give for free.
const VIEW = Object.freeze({
  landscape: Object.freeze({ w: 320, h: 180 }),
  portrait: Object.freeze({ w: 320, h: 300 }),
});

/** The viewBox for a deck orientation stamp. `square` → landscape (see above). */
function viewFor(orientation) {
  return orientation === 'portrait' ? VIEW.portrait : VIEW.landscape;
}

// Nominal label sizes in viewBox user units, MIRRORING chart-family.css
// § Cartesian chrome. CSS owns what is painted; the kernel must know the same
// numbers to break lines and cull colliding ticks to the right width. The
// mirror is gated by test/unit/components/cartesian.test.js, which reads the
// stylesheet and fails when the two drift — a silent drift wraps text to a
// width the glyphs do not actually occupy.
const FS = Object.freeze({
  tick: 7,       // value-axis tick label
  cat: 7.5,      // category-axis label
  value: 8,      // a data label printed next to a mark
  series: 7.5,   // an inline series name (direct labeling)
  axisTitle: 6.5, // the uppercase tracked axis caption
});

// Default gutters, user units. `left` holds the value-tick column, `bottom`
// the category row, `top` the headroom a value label printed above the tallest
// mark needs, `right` the air a last category label needs to not touch the box.
// A member overrides any of them; it should not invent its own defaults.
const GUTTER = Object.freeze({ left: 30, right: 10, top: 12, bottom: 20 });

/**
 * The plot rectangle inside a viewBox.
 * @param {object} o
 * @param {object} [o.view]      {w,h}; defaults to landscape
 * @param {object} [o.gutter]    partial override of GUTTER
 * @returns {{x0:number,y0:number,x1:number,y1:number,w:number,h:number,view:object}}
 *          x0/y0 = top-left of the plot area, x1/y1 = bottom-right.
 */
function plotBox({ view = VIEW.landscape, gutter = {} } = {}) {
  const g = { ...GUTTER, ...gutter };
  const x0 = g.left;
  const y0 = g.top;
  const x1 = view.w - g.right;
  const y1 = view.h - g.bottom;
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, view, gutter: g };
}

// ── Scales ─────────────────────────────────────────────────────────────────

/**
 * A linear scale from a numeric domain to a pixel range.
 * `range` is [lo, hi] in the SAME order as the domain — for a vertical value
 * axis the caller passes [y1, y0] so that the domain maximum lands at the TOP.
 */
function linearScale(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  // A zero-span domain (every value identical) would divide by zero; pin it to
  // the range midpoint, which is what a reader expects from a flat series.
  if (!span) return () => (r0 + r1) / 2;
  const k = (r1 - r0) / span;
  return (v) => r0 + (v - d0) * k;
}

/**
 * A band scale — n equal slots across [lo, hi] with padding, the standard
 * categorical-axis scale.
 * @param {number} n          slot count
 * @param {number[]} range    [lo, hi]
 * @param {object} [o]
 * @param {number} [o.padInner] fraction of a step left as the gap BETWEEN bands
 * @param {number} [o.padOuter] fraction of a step left at each END
 * @returns {{step:number,width:number,start:(i:number)=>number,center:(i:number)=>number}}
 */
function bandScale(n, range, { padInner = 0.28, padOuter = 0.14 } = {}) {
  const [lo, hi] = range;
  const span = hi - lo;
  const count = Math.max(1, n);
  const step = span / (count + padOuter * 2);
  const width = Math.max(0, step * (1 - padInner));
  const start = (i) => lo + step * padOuter + step * i + (step - width) / 2;
  return { step, width, start, center: (i) => start(i) + width / 2 };
}

// ── Ticks ──────────────────────────────────────────────────────────────────

/** The next "nice" number ≥ raw from the 1 / 2 / 2.5 / 5 / 10 ladder. */
function niceStep(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const pow = Math.pow(10, exp);
  const f = raw / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * pow;
}

/**
 * A nice value-axis domain + its ticks.
 *
 * `target` is a WISH, not a promise: the returned tick count lands within about
 * ±1 of it, because the step is snapped to the nice ladder first and the domain
 * is then widened to whole steps. Four gridlines is the family default — enough
 * to read a value off the chart, few enough that the grid stays behind the data
 * rather than competing with it (the 10/10 bar's "restraint" line).
 *
 * `includeZero` defaults TRUE because a bar whose baseline is not zero lies
 * about its own magnitude; a line or scatter passes false to let the trend
 * fill the box.
 *
 * @returns {{min:number,max:number,step:number,ticks:number[]}}
 */
function niceTicks(minIn, maxIn, { target = 4, includeZero = true } = {}) {
  let min = Number.isFinite(minIn) ? minIn : 0;
  let max = Number.isFinite(maxIn) ? maxIn : 0;
  if (includeZero) { min = Math.min(min, 0); max = Math.max(max, 0); }
  if (min === max) {
    // A flat series still needs a readable axis: give it one step of air.
    if (min === 0) { return { min: 0, max: 1, step: 1, ticks: [0, 1] }; }
    const pad = niceStep(Math.abs(min) / target);
    min = Math.min(0, min - pad); max = max + pad;
  }
  const step = niceStep((max - min) / Math.max(1, target));
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  // Accumulate by multiplication, not repeated addition — repeated addition of
  // a fractional step (0.1, 2.5) drifts by float error and prints a tick as
  // `0.30000000000000004`. The count is derived, then each tick recomputed.
  const n = Math.round((hi - lo) / step);
  for (let i = 0; i <= n; i++) ticks.push(round6(lo + i * step));
  return { min: lo, max: hi, step, ticks };
}

// Round away binary-float noise without touching a number that was already
// exact. 6 decimals is far past any axis a deck prints and well inside the
// double's exact range for these magnitudes.
function round6(n) {
  return Number(n.toFixed(6));
}

// ── Value formatting ───────────────────────────────────────────────────────

/**
 * The AFFIX a series was authored with — the currency symbol, the unit, the
 * magnitude suffix — so the axis prints in the author's own vocabulary.
 *
 * This is the difference between a boardroom chart and a spreadsheet plot. A
 * deck that authors `$4.2M` gets an axis reading `$0M · $2M · $4M · $6M`, not
 * `0 · 2 · 4 · 6` with the unit stranded in the title. It is derived from the
 * data rather than declared in front matter because front matter is not the
 * series DSL (design/skills/chart-component.md) — and because an affix the
 * author did not type is an affix that can contradict the numbers.
 *
 * Only an affix EVERY value agrees on is adopted; a mixed series (`$4M`, `12%`)
 * gets none, which is the honest read of an axis that cannot describe itself.
 */
function affixOf(raws) {
  const seen = raws.map(parseAffix).filter(Boolean);
  if (!seen.length || seen.length !== raws.filter((r) => r != null && r !== '').length) {
    return { prefix: '', suffix: '' };
  }
  const first = seen[0];
  const same = seen.every((a) => a.prefix === first.prefix && a.suffix === first.suffix);
  return same ? first : { prefix: '', suffix: '' };
}

function parseAffix(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  const m = s.match(/^([^\d\-+.]*)\s*-?[\d,.]+\s*([^\d]*)$/);
  if (!m) return null;
  return { prefix: m[1].trim(), suffix: m[2].trim() };
}

/**
 * The NUMBER inside an authored value pill, with the magnitude suffix APPLIED.
 *
 * `12k` is 12 000 and `1.2M` is 1 200 000 — the funnel's parser takes the first
 * numeric run and silently drops the suffix (its own manifest warns authors off
 * `$12k` for exactly this reason), which is fine for a chart whose values are
 * all the same magnitude and wrong for an axis. A Cartesian axis has to be able
 * to put `800k` and `1.2M` on one scale, so the suffix is scale, not decoration.
 * `%` is NOT a magnitude — it stays a plain number, so `12%` is 12.
 */
const MAGNITUDE = Object.freeze({ k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9, bn: 1e9, T: 1e12 });

function parseValue(raw) {
  if (raw == null) return NaN;
  const s = String(raw).replace(/,/g, '').trim();
  const m = s.match(/-?\d*\.?\d+/);
  if (!m) return NaN;
  const n = parseFloat(m[0]);
  if (!Number.isFinite(n)) return NaN;
  // The magnitude letter must sit immediately after the number, so a label-ish
  // suffix ("4 beds") does not multiply anything.
  const after = s.slice(m.index + m[0].length).trim();
  const mag = after.match(/^(bn|[kKmMBbT])\b/);
  return mag ? n * MAGNITUDE[mag[1]] : n;
}

/**
 * Format a tick for the axis: compact magnitude, the series' own affix, and no
 * trailing zeros. `step` decides the decimals so an axis of 0.25s prints
 * `0.25` while an axis of 5s prints `5`, rather than every tick carrying the
 * widest series value's precision.
 */
function formatTick(v, { step = 1, prefix = '', suffix = '' } = {}) {
  const abs = Math.abs(v);
  let unit = '';
  let scaled = v;
  // Compact only when the STEP is also large — an axis running 0…1500 in steps
  // of 500 reads better as 0 · 500 · 1000 · 1500 than as 0 · 0.5k · 1k · 1.5k.
  if (abs >= 1e9 && step >= 1e8) { scaled = v / 1e9; unit = 'B'; }
  else if (abs >= 1e6 && step >= 1e5) { scaled = v / 1e6; unit = 'M'; }
  else if (abs >= 1e4 && step >= 1e3) { scaled = v / 1e3; unit = 'k'; }
  const stepScaled = unit ? step / (unit === 'B' ? 1e9 : unit === 'M' ? 1e6 : 1e3) : step;
  const decimals = decimalsFor(stepScaled);
  const body = trimZeros(scaled.toFixed(decimals));
  // The magnitude letter joins the AUTHORED suffix rather than replacing it:
  // a series authored in `$` with a 1e6 axis prints `$4M`; one authored in `%`
  // never reaches the compaction branch, so `%` is never turned into `%M`.
  return `${prefix}${body}${unit}${suffix}`;
}

function decimalsFor(step) {
  const s = Math.abs(step);
  if (!(s > 0)) return 0;
  if (s >= 1) return 0;
  // How many decimals does this step actually need? log10 gives the first
  // significant place; +1 covers a 2.5-style step whose ladder rung is finer.
  return Math.min(4, Math.max(0, Math.ceil(-Math.log10(s)) + (String(s).includes('5') ? 1 : 0)));
}

function trimZeros(s) {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

// ── The series DSL ─────────────────────────────────────────────────────────

/**
 * Parse the family's series list into a Cartesian model.
 *
 * ONE authoring shape, two depths — this is what makes the seven members feel
 * like one component to write:
 *
 *   FLAT (single series)            NESTED (multi-series)
 *   - Q1 `4.2`                      - Q1
 *   - Q2 `5.1`                        - Product `2.4`
 *                                     - Services `1.8`
 *                                   - Q2
 *                                     - Product `3.0`
 *
 * DETAIL vs DATA — the one rule an author has to know, and the reason this is
 * not ambiguous. A nested item whose trailing inline-code pill parses as a
 * NUMBER is a data point; anything else is mark-detail (the reveal payload the
 * family already supports through mark-detail.js). So:
 *
 *   - Q1                     ← a group
 *     - Product `2.4`        ← DATA  (numeric pill)
 *     - Closed two weeks early   ← DETAIL (no pill)
 *     - Best quarter in `EMEA`   ← DETAIL (pill, but not a number)
 *
 * Testing the pill for a NUMBER rather than merely for its presence is what
 * keeps a detail bullet that happens to end in inline code — a region, a code
 * name, a ticket id — from being silently plotted as a data point at zero.
 *
 * @param {string} ulInner  the <li> HTML of the section's first list
 * @param {object} [o]
 * @param {number} [o.maxSeries]  cap on distinct series (default 6, the family's
 *                                perceptual cap — Wong 2011, and the categorical
 *                                palette only curates 8 slots)
 * @returns {null|{groups:Array,series:string[],flat:boolean,affix:object,min:number,max:number}}
 *          null when there is nothing to draw — the kernels' pass-through signal.
 */
function parseSeries(ulInner, { maxSeries = 6 } = {}) {
  const items = parseTopLevelLis(ulInner);
  if (!items.length) return null;

  const seriesOrder = [];
  const groups = items.map((item) => {
    const { lead, nested } = splitNested(item);
    const { label: gLabel, raw: gRaw } = readLeadValue(lead);
    const points = [];
    const detail = [];
    for (const child of nested) {
      const { label, raw } = readLeadValue(stripNested(child));
      if (raw != null && Number.isFinite(parseValue(raw))) {
        if (!seriesOrder.includes(label)) seriesOrder.push(label);
        points.push({ series: label, raw, num: parseValue(raw) });
      } else {
        detail.push(plainText(child).trim());
      }
    }
    // A group that carries BOTH a value on its own lead and nested data points
    // is an authoring error we resolve in the reader's favor: the nested points
    // win, and the lead value is kept as `total` for any member that wants to
    // print an authored total instead of summing (stacked-bar does).
    return {
      label: gLabel,
      raw: points.length ? null : gRaw,
      num: points.length ? NaN : parseValue(gRaw),
      total: gRaw != null ? parseValue(gRaw) : NaN,
      totalRaw: gRaw,
      points,
      detail: detail.filter(Boolean),
    };
  }).filter((g) => g.label || g.points.length || g.raw != null);

  if (!groups.length) return null;
  const flat = !seriesOrder.length;
  // Past the cap the categorical palette repeats and the chart stops being
  // readable; truncating silently would DROP data, so the cap is reported and
  // the member decides (every shipped member consolidates in its docs instead).
  const series = seriesOrder.slice(0, maxSeries);
  const overflow = seriesOrder.slice(maxSeries);

  const nums = flat
    ? groups.map((g) => g.num)
    : groups.flatMap((g) => g.points.map((p) => p.num));
  const finite = nums.filter(Number.isFinite);
  if (!finite.length) return null;

  const raws = flat
    ? groups.map((g) => g.raw)
    : groups.flatMap((g) => g.points.map((p) => p.raw));

  return {
    groups,
    series,
    seriesOverflow: overflow,
    flat,
    affix: affixOf(raws),
    min: Math.min(...finite),
    max: Math.max(...finite),
  };
}

/** Split an <li>'s own lead HTML from its nested <li> children. */
function splitNested(item) {
  const idx = item.search(/<ul[^>]*>/);
  if (idx < 0) return { lead: item, nested: [] };
  const lead = item.slice(0, idx);
  const rest = item.slice(idx);
  const inner = rest.replace(/^<ul[^>]*>/, '').replace(/<\/ul>\s*$/, '');
  return { lead, nested: parseTopLevelLis(inner) };
}

function stripNested(item) {
  const idx = item.search(/<ul[^>]*>/);
  return idx < 0 ? item : item.slice(0, idx);
}

/**
 * Lead text + its trailing inline-code value pill.
 * Returns `raw: null` when the item carries no trailing pill at all — the
 * signal `parseSeries` uses to tell a group header from a data point.
 */
function readLeadValue(lead) {
  const s = String(lead).replace(/<\/?p>/g, '').trim();
  const m = s.match(/^([\s\S]*?)\s*<code>([^<]*)<\/code>\s*$/);
  if (!m) return { label: plainText(s), raw: null };
  return { label: plainText(m[1]), raw: m[2].trim() };
}

// ── Painted chrome ─────────────────────────────────────────────────────────
//
// Every emitter below returns an SVG STRING and emits NO color. Classes are the
// family's shared `cart-*` vocabulary, painted once in chart-family.css
// § Cartesian chrome — so a gridline is the same gray at the same weight on a
// bar slide and on a scatter slide, which is the whole point of this file.

/**
 * Horizontal gridlines for a vertical value axis (or vertical ones for a
 * horizontal axis), plus the emphasized zero rule when zero is inside the
 * domain.
 *
 * The zero line is a SEPARATE class rather than a styled variant of the grid
 * because it is not decoration: on a waterfall or a diverging bar it is the
 * reference the marks are read against, and it has to survive a theme that
 * softens the grid to near-nothing.
 *
 * @param {object} o
 * @param {object} o.plot     from plotBox()
 * @param {number[]} o.ticks
 * @param {Function} o.scale  value → pixel on the value axis
 * @param {string} [o.axis]   'y' (default; horizontal rules) or 'x'
 */
function buildGrid({ plot, ticks, scale, axis = 'y' }) {
  const parts = [];
  for (const t of ticks) {
    const p = round2(scale(t));
    const zero = t === 0;
    const cls = zero ? 'cart-zero' : 'cart-grid';
    parts.push(axis === 'y'
      ? `<line class="${cls}" x1="${round2(plot.x0)}" y1="${p}" x2="${round2(plot.x1)}" y2="${p}"/>`
      : `<line class="${cls}" x1="${p}" y1="${round2(plot.y0)}" x2="${p}" y2="${round2(plot.y1)}"/>`);
  }
  return parts.join('');
}

/**
 * Tick labels for a value axis.
 *
 * They sit in the GUTTER, on the canvas — never on a mark — so their contrast
 * is a property of the slide background and not of whichever fill happens to
 * be behind them (the 10/10 bar's "labels on the canvas" line).
 */
function buildValueTicks({ plot, ticks, scale, step, affix = {}, axis = 'y', gap = 4 }) {
  return ticks.map((t) => {
    const text = formatTick(t, { step, ...affix });
    const p = round2(scale(t));
    if (axis === 'y') {
      return wrapSvgLabel(text, {
        x: round2(plot.x0 - gap), y: p, width: plot.gutter.left - gap,
        fontSize: FS.tick, anchor: 'end', vAlign: 'middle', baseline: 'central',
        maxLines: 1, className: 'cart-tick', attrs: ' data-anima-role="label"',
        emitFontSize: false,
      }).svg;
    }
    return wrapSvgLabel(text, {
      x: p, y: round2(plot.y1 + gap), width: 40,
      fontSize: FS.tick, anchor: 'middle', vAlign: 'top', maxLines: 1,
      className: 'cart-tick', attrs: ' data-anima-role="label"', emitFontSize: false,
    }).svg;
  }).join('');
}

/**
 * Category labels along the base of the plot.
 *
 * Two things here are load-bearing and both were learned elsewhere in this
 * family. (1) The labels WRAP to their band (svg-label.js) instead of running
 * off the viewBox — the funnel's side labels used to clip at x=0 with no
 * warning. (2) A label that still cannot fit after wrapping is CULLED rather
 * than overprinted, the way the gantt culls colliding month ticks; culling
 * keeps every surviving label legible, where overprinting loses both.
 *
 * @param {object} o
 * @param {string[]} o.labels
 * @param {Function} o.center  index → the band's center on the category axis
 * @param {number} o.width     the width one label may occupy
 */
function buildCategoryLabels({ plot, labels, center, width, maxLines = 2, axis = 'x', gap = 5 }) {
  const parts = [];
  let lastEnd = -Infinity;
  labels.forEach((label, i) => {
    if (!label) return;
    const c = center(i);
    if (axis === 'x') {
      const m = measureLabel(label, { width, fontSize: FS.cat, maxLines });
      const half = width / 2;
      // Cull against the PREVIOUS surviving label, not the previous index — so
      // a culled label does not go on reserving space it no longer occupies.
      if (c - half < lastEnd) return;
      lastEnd = c + half;
      parts.push(wrapSvgLabel(label, {
        x: round2(c), y: round2(plot.y1 + gap), width,
        fontSize: FS.cat, anchor: 'middle', vAlign: 'top', maxLines: m.lines.length,
        className: 'cart-cat', attrs: ' data-anima-role="label"', emitFontSize: false,
      }).svg);
    } else {
      parts.push(wrapSvgLabel(label, {
        x: round2(plot.x0 - gap), y: round2(c), width: plot.gutter.left - gap,
        fontSize: FS.cat, anchor: 'end', vAlign: 'middle', baseline: 'central',
        maxLines, className: 'cart-cat', attrs: ' data-anima-role="label"',
        emitFontSize: false,
      }).svg);
    }
  });
  return parts.join('');
}

/** The axis rule itself — the line the categories sit on. */
function buildAxisRule({ plot, axis = 'x' }) {
  return axis === 'x'
    ? `<line class="cart-axis" x1="${round2(plot.x0)}" y1="${round2(plot.y1)}" x2="${round2(plot.x1)}" y2="${round2(plot.y1)}"/>`
    : `<line class="cart-axis" x1="${round2(plot.x0)}" y1="${round2(plot.y0)}" x2="${round2(plot.x0)}" y2="${round2(plot.y1)}"/>`;
}

/**
 * A value printed next to a mark. Always on the canvas side of the mark, never
 * inside it — see the 10/10 bar. `anchorY`/`anchorX` is the mark edge; the
 * label is offset outward from it by `gap`.
 */
function buildValueLabel(text, { x, y, anchor = 'middle', vAlign = 'bottom', width = 44, className = 'cart-value', extra = '' }) {
  return wrapSvgLabel(text, {
    x: round2(x), y: round2(y), width, fontSize: FS.value,
    anchor, vAlign, maxLines: 1, className,
    attrs: ` data-anima-role="label"${extra}`, emitFontSize: false,
  }).svg;
}

/** An uppercase tracked axis caption, in the gutter. */
function buildAxisTitle(text, { x, y, anchor = 'middle', vAlign = 'top', width = 200, rotate = 0 }) {
  const { svg } = wrapSvgLabel(text, {
    x: round2(x), y: round2(y), width, fontSize: FS.axisTitle,
    anchor, vAlign, maxLines: 1, className: 'cart-axis-title', emitFontSize: false,
  });
  return rotate ? `<g transform="rotate(${rotate} ${round2(x)} ${round2(y)})">${svg}</g>` : svg;
}

/**
 * The family's CANONICAL RECTANGULAR FILL, as SVG `<defs>`.
 *
 * `chart-family.css` § THE CANONICAL CHART FILL defines one fill recipe — a
 * vertical wash from `--chart-fill-top-*` to `--chart-fill-bottom-*` over a
 * hue, with a saturated ink edge — and every rectangular data mark in the
 * family wears it: the kanban card, the progress bar, the state-chart node, the
 * gantt bar. SVG `fill` cannot take a CSS gradient, so the gantt re-emits the
 * recipe as inline stops (gantt.transform.js §ganttGradientDefs). Seven new
 * Cartesian members would have meant seven more copies of those stops, drifting
 * one percentage point at a time; this is that emitter, lifted.
 *
 * The stops name TOKENS (`var(--chart-cat-3-hue)`, `var(--chart-fill-top-l)`),
 * never a color — the kernel stays palette-blind and HARD RULE #3 holds.
 *
 * @param {object} o
 * @param {string} o.kind     'cat' → `--chart-cat-<slot>-hue`; 'state' → `--state-<slot>-hue`
 * @param {Array<string|number>} o.slots  the slots actually present on this chart
 * @param {string} [o.name]   id stem, so two charts on one slide cannot collide
 * @param {number} [o.x2]/[o.y2]  gradient axis; default vertical (0,0)→(0,1)
 * @returns {{defs:string, id:(slot:string|number)=>string, url:(slot)=>string}}
 */
function buildFillDefs({ kind = 'cat', slots = [], name = 'cart-fill', x1 = 0, y1 = 0, x2 = 0, y2 = 1 } = {}) {
  // The sequence makes the id document-unique. A fixed `cart-fill-3` id would
  // collide the moment a deck puts two Cartesian charts on one slide — and an
  // SVG `url(#id)` resolves against the WHOLE document, so the second chart
  // would silently paint with the first one's stops.
  const ns = nextRenderSeq(name);
  const hue = (slot) => (kind === 'state' ? `var(--state-${slot}-hue)` : `var(--chart-cat-${slot}-hue)`);
  const id = (slot) => `${renderIdPrefix()}${name}-${slot}-${ns}`;
  const defs = slots.map((slot) =>
    `<linearGradient id="${id(slot)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
      `<stop offset="0%" style="stop-color:light-dark(` +
        `color-mix(in oklab, ${hue(slot)} var(--chart-fill-top-l), var(--bg)),` +
        `color-mix(in oklab, ${hue(slot)} var(--chart-fill-top-d), black))"/>` +
      `<stop offset="100%" style="stop-color:light-dark(` +
        `color-mix(in oklab, ${hue(slot)} var(--chart-fill-bottom-l), var(--bg)),` +
        `color-mix(in oklab, ${hue(slot)} var(--chart-fill-bottom-d), black))"/>` +
    `</linearGradient>`).join('');
  return { defs, id, url: (slot) => `url(#${id(slot)})` };
}

function round2(n) {
  return Number(Number(n).toFixed(2));
}

module.exports = {
  VIEW, FS, GUTTER,
  viewFor, plotBox,
  linearScale, bandScale,
  niceStep, niceTicks,
  parseValue, parseAffix, affixOf, formatTick,
  parseSeries, readLeadValue,
  buildGrid, buildValueTicks, buildCategoryLabels, buildAxisRule,
  buildValueLabel, buildAxisTitle, buildFillDefs,
  round2,
};
