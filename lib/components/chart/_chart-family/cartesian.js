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

const { wrapSvgLabel, measureLabel, upperAdvance, ADVANCE, LINE_HEIGHT } = require('./svg-label');
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
// SQUARE deliberately keeps the landscape box. `roadmap` reached the same call
// on its own geometry (roadmap.transform.js §351) — it kept the wide table at
// square because the portrait alternative MEASURED three times worse, not
// because square was roomy — and the reasoning transfers: a third tuned
// geometry has to beat what `preserveAspectRatio="xMidYMid meet"` already
// gives for free, and nothing here suggests it would.
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
 * @param {number} [o.maxWidth] cap on a band's thickness, user units. Without
 *                              one, a single category takes ~70% of the plot
 *                              as a slab and a two-category chart paints two
 *                              barn doors. Extra space goes to the gaps.
 * @param {number} [o.padOuter] EXTRA fraction of a step left at each end, on top
 *                              of the half-gap a band already carries from
 *                              `padInner`. At the defaults the outer air is
 *                              0.28 x step, not 0.14 — `padOuter: 0` still
 *                              leaves the half-gap.
 * @returns {{step:number,width:number,start:(i:number)=>number,center:(i:number)=>number}}
 */
function bandScale(n, range, { padInner = 0.28, padOuter = 0.14, maxWidth = Infinity } = {}) {
  // The range is taken LOW-to-HIGH, unlike `linearScale`, which deliberately
  // takes it in domain order so a value axis can pass [y1, y0]. A caller who
  // reasons by analogy and writes `bandScale(n, [plot.y1, plot.y0])` used to
  // get width 0 — invisible bars, no error — so a descending range is
  // normalized rather than punished.
  const lo = Math.min(range[0], range[1]);
  const hi = Math.max(range[0], range[1]);
  const span = hi - lo;
  // `Math.max(1, n)` LOOKS like a guard and does not catch NaN, which then
  // poisons every coordinate the member computes.
  const count = Number.isFinite(n) ? Math.max(1, n) : 1;
  const step = span / (count + padOuter * 2);
  const width = Math.min(maxWidth, Math.max(0, step * (1 - padInner)));
  const start = (i) => lo + step * padOuter + step * i + (step - width) / 2;
  return { step, width, start, center: (i) => start(i) + width / 2 };
}

/**
 * A POINT scale — n positions spread edge to edge, the scale a line or a slope
 * needs. Distinct from `bandScale`, which gives each category a SLOT of finite
 * width for a bar to sit in; here a category is a position with no width.
 *
 * It exists because members were synthesizing one out of `bandScale(n, range,
 * { padInner: 0, padOuter: -0.5 })`. That happens to work and is a trap: a
 * future guard on a non-negative `padOuter` would break `line`, `slope` and
 * `scatter` at once, with nothing naming the dependency.
 *
 * `inset` pulls both ends inward — a point scale puts the first and last marks
 * ON the plot edge, so a mark there is half-clipped and its label hangs into
 * the gutter unless the caller reserves room.
 *
 * @returns {{at:(i:number)=>number, step:number, first:number, last:number}}
 */
function pointScale(n, range, { inset = 0 } = {}) {
  const lo = Math.min(range[0], range[1]) + inset;
  const hi = Math.max(range[0], range[1]) - inset;
  const count = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
  if (count === 1) {
    const mid = (lo + hi) / 2;
    return { at: () => mid, step: 0, first: mid, last: mid };
  }
  const step = (hi - lo) / (count - 1);
  return { at: (i) => lo + step * i, step, first: lo, last: hi };
}

// ── Ticks ──────────────────────────────────────────────────────────────────

/** The next "nice" number ≥ raw from the 1 / 2 / 2.5 / 5 / 10 ladder. */
function niceStep(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const pow = 10 ** exp;
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
 * `tight` changes WHAT IS SNAPPED. By default the DOMAIN is widened to whole
 * steps, which is right for a bar — the axis top is a round number and the
 * baseline is zero. It is wrong for a correlation or a trend, where it spends
 * the plot on nothing: a $60k-$420k series got a $0-$600k axis, i.e. the right
 * third of the box empty. With `tight` the domain is the data plus a small pad
 * and only the nice-step ticks that fall INSIDE it are drawn, so the marks fill
 * the plot and the gridlines are still round numbers.
 *
 * `target: 'auto'` tries 3..6 and keeps whichever wastes the least headroom.
 * Snapping to whole steps at a fixed target can leave a quarter of the plot
 * empty (a max of 4.4 lands on a 0-6 axis); 'auto' costs four cheap tries.
 *
 * @returns {{min:number,max:number,step:number,ticks:number[]}}
 */
function niceTicks(minIn, maxIn, { target = 4, includeZero = true, tight = false, pad = 0.06 } = {}) {
  if (target === 'auto') {
    let best = null;
    for (const t of [3, 4, 5, 6]) {
      const cand = niceTicks(minIn, maxIn, { target: t, includeZero, tight, pad });
      const span = cand.max - cand.min;
      // Dead space is the domain the data does not reach, at either end.
      const waste = span > 0
        ? ((Number.isFinite(maxIn) ? cand.max - maxIn : 0) +
           (Number.isFinite(minIn) ? minIn - cand.min : 0)) / span
        : 1;
      if (!best || waste < best.waste - 1e-9) best = { waste, cand };
    }
    return best.cand;
  }
  let min = Number.isFinite(minIn) ? minIn : 0;
  let max = Number.isFinite(maxIn) ? maxIn : 0;
  if (includeZero) { min = Math.min(min, 0); max = Math.max(max, 0); }
  if (min === max) {
    // A flat series still needs a readable axis: give it one step of air.
    if (min === 0) { return { min: 0, max: 1, step: 1, ticks: [0, 1] }; }
    const pad = niceStep(Math.abs(min) / target);
    // `includeZero` has to be honored HERE too. Forcing zero in unconditionally
    // squashed a flat positive series against the top of the box — the exact
    // thing the option exists to prevent — and did it asymmetrically, since the
    // negative side already excluded zero correctly.
    min = includeZero ? Math.min(0, min - pad) : min - pad;
    max = max + pad;
  }
  // A denormal domain drives niceStep to 0 (10 ** -324 underflows), which would
  // make every derived quantity NaN and the tick set empty.
  const step = niceStep((max - min) / Math.max(1, target)) || 1;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  // Accumulate by multiplication, not repeated addition — repeated addition of
  // a fractional step (0.1, 2.5) drifts by float error and prints a tick as
  // `0.30000000000000004`. The count is derived, then each tick recomputed.
  // BOUNDED. `hi` can overflow to Infinity for a domain near Number.MAX_VALUE,
  // and `n` with it — the loop then ran for ten seconds and threw an uncaught
  // RangeError from inside a chart kernel, which takes the whole render down.
  // The snapped step bounds a real domain at target + 2 ticks anyway, so the
  // cap only ever engages on the pathological input.
  const raw = Math.round((hi - lo) / step);
  const n = Number.isFinite(raw) ? Math.min(200, Math.max(1, raw)) : 1;
  for (let i = 0; i <= n; i++) ticks.push(round6(lo + i * step));
  const last = ticks[ticks.length - 1];
  if (!tight) return { min: lo, max: Number.isFinite(hi) ? hi : last, step, ticks };

  // TIGHT: keep the step the ladder chose, but let the DOMAIN be the data plus
  // a small pad, and draw only the ticks that fall inside it.
  const air = (max - min) * pad || step * pad;
  const tLo = includeZero ? Math.min(0, min - air) : min - air;
  const tHi = max + air;
  const inside = ticks.filter((t) => t >= tLo - 1e-9 && t <= tHi + 1e-9);
  // A pad narrower than one step can leave nothing to draw; fall back to the
  // snapped axis rather than a plot with no gridlines at all.
  if (inside.length < 2) return { min: lo, max: Number.isFinite(hi) ? hi : last, step, ticks };
  return { min: tLo, max: tHi, step, ticks: inside };
}

// Round away binary-float noise without touching a number that was already
// exact. RELATIVE precision, not a fixed decimal count: `toFixed(6)` flattens
// every tick below 1e-6 to zero, so an axis over [-1e-9, 1e-9] became five
// ticks of `-0`/`0` — and since `buildGrid` tests `t === 0` (and `-0 === 0`),
// that painted five stacked zero rules and not one gridline.
//
// NOTE this rounding, not the accumulate-by-multiplication below, is what keeps
// a fractional step from printing `0.30000000000000004`: `3 * 0.1` and
// `0.1 + 0.1 + 0.1` drift identically. Multiplication is used because it does
// not COMPOUND the drift over a long axis; the rounding is what makes it
// printable. Do not remove this in the belief that the multiplication covers it.
function round6(n) {
  return n === 0 || !Number.isFinite(n) ? n : Number(n.toPrecision(12));
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
  // Every sign form `parseValue` understands is stripped before the prefix is
  // read. A signed series (`+$1.1M`, `-$0.8M`, `($1.2M)`) otherwise matched
  // nothing, and since `affixOf` adopts an affix only when EVERY value agrees,
  // one negative value dropped the `$` from the whole axis — so the parts
  // printed `$4.2M` from their raw text while the computed total printed
  // `3.4M`, on the same slide.
  const bare = s.replace(/^\(\s*/, '').replace(/\s*\)$/, '').replace(/^[+\-\u2212]\s*/, '');
  const m = bare.match(/^([^\d\-+.]*)\s*-?[\d,.]+\s*([^\d]*)$/);
  if (!m) return null;
  const suffix = m[2].trim();
  // A MAGNITUDE letter is not an affix — `parseValue` has already folded it
  // into the number, so carrying it here too prints it twice: a series authored
  // `$1.2M` would reach an axis that compacts to millions and emit `$2MM`.
  // `%` and a real unit (`kg`, `bps`, `units`) are affixes and survive.
  return { prefix: m[1].trim(), suffix: MAGNITUDE_ONLY.test(suffix) ? '' : suffix };
}

// The magnitude letters, anchored — `kg` is a unit, `k` is a magnitude.
const MAGNITUDE_ONLY = /^(?:bn|[kKmMBbT])$/;

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

/**
 * Normalize the thousands/decimal separators a spreadsheet exports.
 *
 * A deck pasted out of a French, German, Italian or Swedish sheet writes
 * `1.234.567` and `1,25M`. Stripping every comma read `1,25M` as 125M — a
 * hundredfold misplot with the author's own label printed beside it proving it
 * wrong — and the dot form failed the pill test outright, so three of four
 * points in a grouped chart silently became mark-detail.
 *
 * The rule is unambiguous rather than clever: a GROUP separator is always
 * followed by exactly three digits. So a comma followed by three digits groups
 * and anything else is a decimal comma, and two or more dots can only be
 * grouping. A single dot stays a decimal point, which is the common case.
 *
 * ONE case stays genuinely ambiguous and is resolved US-first: a lone
 * `900.000` is read as 900, not as nine hundred thousand. Nothing in the string
 * distinguishes the two, and this repo's house dialect is US (HARD RULE #21).
 * An author writing EU groups should carry them consistently — `1.234.567`
 * disambiguates itself — or use a magnitude suffix, which never does.
 */
function normalizeSeparators(s) {
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  if (commas && !dots) {
    // `1,234` groups; `1,25` and `1,5` are decimal commas.
    return /,\d{3}(?!\d)/.test(s) && !/,\d{1,2}(?!\d)/.test(s)
      ? s.replace(/,/g, '')
      : s.replace(/,/g, '.');
  }
  if (dots > 1 && !commas) return s.replace(/\./g, '');   // 1.234.567
  if (commas && dots) return s.replace(/,/g, '');          // 1,234.5 — US
  return s;
}

function parseValue(raw) {
  if (raw == null) return NaN;
  let s = normalizeSeparators(String(raw).trim());

  // The SIGN is read separately from the numeric run, because the run is not
  // where the sign necessarily is. `parseValue` used to take the first match of
  // /-?\d*\.?\d+/ over the whole string, so in `-$0.8M` the minus is not
  // adjacent to the digits and was silently dropped — which turns every
  // negative currency step of a waterfall into a positive one, closes the
  // bridge on the wrong number, and never crosses the zero rule the chart is
  // read against. Three forms all mean negative:
  //   `-$0.8M`  a minus before the currency symbol (what an author types)
  //   `−1.2M`   U+2212, what a paste from a spreadsheet or smart typography gives
  //   `($1.2M)` the accounting parenthesis
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
  const lead = s.match(/^[-\u2212]\s*/);
  if (lead) { neg = !neg; s = s.slice(lead[0].length); }

  const m = s.match(/-?\d*\.?\d+/);
  if (!m) return NaN;
  const n = parseFloat(m[0]);
  if (!Number.isFinite(n)) return NaN;
  // The magnitude letter must sit immediately after the number, so a label-ish
  // suffix ("4 beds", "12kg") does not multiply anything.
  const after = s.slice(m.index + m[0].length).trim();
  const mag = after.match(/^(bn|[kKmMBbT])\b/);
  const val = mag ? n * MAGNITUDE[mag[1]] : n;
  return neg ? -Math.abs(val) : val;
}

/**
 * The value AND whether its sign was written down.
 *
 * `parseValue` answers "what number is this". A chart whose claim is DIRECTION
 * — a waterfall's floating step versus its zero-anchored level — also has to
 * know whether the author *said* which way, and that is a different question:
 * `12.0M` and `+12.0M` are the same number and mean different marks.
 *
 * It lives here rather than in the member because there are four ways to write
 * a sign and a member that re-derives it will find three. `waterfall` did
 * exactly that — it read a leading `+`/`-` itself, normalized U+2212, and
 * missed `($0.8M)`, so the accounting negative every finance system prints
 * became a zero-anchored LEVEL that reset the running total, with the right
 * figure on it and nothing to say the chart was wrong.
 *
 * @returns {{ value:number, signed:boolean, negative:boolean }}
 *          `signed` is false for a bare `12.0M`, true for `+12M`, `-12M`,
 *          `−12M` (U+2212) and `(12M)`.
 */
function signedValue(raw) {
  const s = String(raw == null ? '' : raw).trim();
  // A sign counts wherever it sits BEFORE the digits — `-$0.9M` and `$-0.9M`
  // are both an author saying "down", and only the first has it in front. The
  // accounting parenthesis is the fourth spelling.
  const paren = /^\(.*\)$/.test(s);
  const beforeDigits = s.replace(/^\(/, '').split(/\d/)[0];
  const signed = paren || /[+\-\u2212]/.test(beforeDigits);
  const value = parseValue(s);
  return { value, signed, negative: signed && value < 0 };
}

/**
 * Is this pill a VALUE, or is it prose that merely contains digits?
 *
 * `parseSeries` uses this to tell a data point from a mark-detail bullet, and
 * "does `parseValue` return a number" is not a strong enough test: `parseValue`
 * takes the first numeric run, so a ticket id `PROJ-42` parses as -42 and would
 * be plotted as a data point that drags the axis to -42. The pill has to be
 * WHOLLY a number — an optional sign, an optional symbol prefix, digits, and an
 * optional short unit — with no prose around it.
 *
 * A bare number IS data, deliberately: `Closed `2024`` plots at 2024. There is
 * nothing in the markup that distinguishes a year from a measurement, and
 * guessing would be worse than the documented rule.
 */
const NUMERIC_PILL =
  /^[(+\-\u2212]?\s*[^\w\s]{0,3}\s*[-\u2212]?\d[\d,.]*\s*(?:%|‰|[A-Za-z]{1,6})?\s*\)?$/;

function isValuePill(raw) {
  if (raw == null) return false;
  const s = String(raw).trim();
  return s !== '' && NUMERIC_PILL.test(s) && Number.isFinite(parseValue(s));
}

/**
 * The magnitude unit an axis should speak, chosen ONCE from its widest tick.
 *
 * This has to be an axis-level decision, not a per-tick one. Deciding per tick
 * gives an axis reading `0 · 500k · 1M · 1.5M` — three units on four ticks,
 * where a reader has to re-scale their eye at every gridline. Compaction is
 * also gated on the STEP, so an axis running 0…1500 in steps of 500 stays
 * `0 · 500 · 1000 · 1500` rather than becoming `0 · 0.5k · 1k · 1.5k`.
 *
 * @returns {{unit:string, divisor:number}}
 */
function axisUnit(max, step) {
  const abs = Math.abs(max);
  // The unit comes from the DOMAIN, then steps back down if the STEP would
  // need more than two decimals under it. Gating the unit on the step directly
  // read the wrong quantity: a $4.12M-$4.31M axis stepping by 50k printed
  // `$4300k`, because the step alone said "thousands" while the numbers were
  // plainly millions. Two decimals is the boardroom limit — `$4.15M` reads,
  // `$4.155M` does not.
  // Each rung carries its own FLOOR, not just its divisor. `k` needs 1e4 rather
  // than 1e3 so an axis topping out at 1500 stays `0 · 500 · 1000 · 1500`
  // instead of becoming `0 · 0.5k · 1k · 1.5k` — compaction has to buy back
  // more characters than it costs.
  const ladder = [
    { unit: 'B', divisor: 1e9, floor: 1e9 },
    { unit: 'M', divisor: 1e6, floor: 1e6 },
    { unit: 'k', divisor: 1e3, floor: 1e4 },
  ];
  for (const rung of ladder) {
    if (abs < rung.floor) continue;
    if (decimalsFor(step / rung.divisor) <= 2) return rung;
  }
  return { unit: '', divisor: 1 };
}

/**
 * A formatter for ONE axis: compact magnitude chosen once, the series' own
 * affix, and no trailing zeros. `step` decides the decimals, so an axis of
 * 0.25s prints `0.25` while an axis of 5s prints `5` — rather than every tick
 * carrying the widest value's precision.
 *
 * @param {object} o
 * @param {number[]} o.ticks   the axis ticks (the widest sets the unit)
 * @param {number} o.step
 * @param {object} [o.affix]   {prefix, suffix} from `affixOf`
 * @returns {(v:number)=>string}
 */
function axisFormatter({ ticks = [], step = 1, affix = {} } = {}) {
  const max = ticks.length ? Math.max(...ticks.map(Math.abs)) : 0;
  const { unit, divisor } = axisUnit(max, step);
  const decimals = decimalsFor(step / divisor);
  const { prefix = '', suffix = '' } = affix;
  // Zero carries no magnitude. `$0k` reads as a quantity of thousands, and on a
  // compacted axis it is the one tick where the unit says nothing at all.
  // U+2212 MINUS SIGN, not a hyphen. A hyphen sits low and short beside tabular
  // figures, so a negative tick set as `-2M` reads with a gap where the minus
  // should be; the true minus is the same width and height as a `+`. It is a
  // mathematical operator with a real place in the type family, not a character
  // standing in for a drawing, so HARD RULE #29 does not reach it.
  // The sign goes OUTSIDE the prefix — `−$2M`, the accounting form — and it is
  // applied to the NUMBER, not to the finished string. Applied to the string it
  // matched `^-`, which a currency prefix pushes off the front, so `$-2M` slid
  // past the substitution and every currency axis kept its hyphen while the
  // bare ones were fixed.
  return (v) => (v === 0
    ? `${prefix}0${suffix}`
    : signed(trimZeros((v / divisor).toFixed(decimals)), prefix, `${unit}${suffix}`));
}

/**
 * A formatter for the values printed ON the marks.
 *
 * Neither of the other two is right for this, and every Cartesian member needs
 * it — so without it seven members solve it seven ways, which is what this
 * kernel exists to prevent. `formatTick` per mark gives three units on one
 * chart (`3M | 900k | 5M | 400k`); `axisFormatter` takes its decimals from the
 * axis STEP, which rounds a real value to `0M`. The mark formatter fixes the
 * unit from the axis — so the whole chart speaks one magnitude — and takes its
 * precision from the VALUE, so a small value keeps its significant figures.
 *
 * @param {object} o
 * @param {number[]} o.ticks   the axis ticks (they fix the unit)
 * @param {object} [o.affix]
 * @param {number} [o.sig]     significant figures after the unit divide
 * @returns {(v:number)=>string}
 */
function markFormatter({ ticks = [], step = 1, affix = {}, sig = 2 } = {}) {
  const max = ticks.length ? Math.max(...ticks.map(Math.abs)) : 0;
  const { unit, divisor } = axisUnit(max, step);
  const { prefix = '', suffix = '' } = affix;
  return (v) => {
    const scaled = v / divisor;
    const abs = Math.abs(scaled);
    // Whole numbers print whole; a fraction keeps `sig` significant figures,
    // floored at one decimal so 0.9M does not collapse to 1M.
    if (v === 0) return `${prefix}0${suffix}`;
    const decimals = Number.isInteger(scaled) ? 0
      : Math.min(4, Math.max(1, sig - Math.max(0, Math.floor(Math.log10(abs)) + 1)));
    return signed(trimZeros(scaled.toFixed(decimals)), prefix, `${unit}${suffix}`);
  };
}

/**
 * Format ONE value the way its axis would. Prefer `axisFormatter` whenever you
 * are labeling a whole axis — this exists for a lone value label, where there
 * is no axis to be consistent with.
 */
function formatTick(v, { step = 1, prefix = '', suffix = '', ticks = null } = {}) {
  return axisFormatter({ ticks: ticks || [v], step, affix: { prefix, suffix } })(v);
}

/**
 * `-1.2` + `$` + `M` → `−$1.2M`.
 *
 * U+2212 MINUS SIGN, not a hyphen. A hyphen sits low and short beside tabular
 * figures, so a negative value set as `-2M` reads with a gap where the minus
 * should be; the true minus is the same width and height as a `+`. It is a
 * mathematical operator with a real place in the type family, not a character
 * standing in for a drawing, so HARD RULE #29 does not reach it.
 *
 * The sign is lifted OFF the number and set before the prefix, because that is
 * where a reader expects it (`−$2M`, never `$−2M`) and because the substitution
 * this replaced ran on the finished string and therefore silently did nothing
 * on any axis carrying a currency symbol.
 */
function signed(number, prefix, tail) {
  const neg = number.startsWith('-');
  return `${neg ? '\u2212' : ''}${prefix}${neg ? number.slice(1) : number}${tail}`;
}

function decimalsFor(step) {
  const s = Math.abs(step);
  if (!(s > 0) || !Number.isFinite(s)) return 0;
  // How many decimals does this step ACTUALLY need? The old rule returned 0 for
  // any step >= 1, which prints the 2.5 rung of the nice ladder as "3" — a
  // gridline drawn at 2.5 and labeled 3, a 20% error on the reference a reader
  // uses to take a value off the chart, on the most ordinary domain there is
  // ([0,10] picks step 2.5). So count the decimals the step carries, capped so
  // a pathological step cannot print a 17-digit tail.
  for (let d = 0; d <= 6; d++) {
    if (Math.abs(Number(s.toFixed(d)) - s) < s * 1e-9) return d;
  }
  return 6;
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
 * ONE PILL PER ITEM. `readLeadValue` takes the LAST `<code>` as the value, so
 * a two-pill item (`` `12.0M` `total` ``, the shape `progress` uses for a
 * value plus a status, and the shape `waterfall`, `bullet` and `scatter` all
 * need) parses as `raw: "total"`, `num: NaN`, and the whole model is thrown
 * away. A member whose item carries more than one pill parses its own list
 * with `stripTrailingPills` + `parseValue` + `affixOf` and does not call this.
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
      if (isValuePill(raw)) {
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
      // `isValuePill` on BOTH paths. It guarded the nested children only, so a
      // flat `- Alpha \`PROJ-42\`` reached `parseValue`, plotted at -42, became
      // the largest mark on the chart and dragged the domain with it — the
      // exact case this guard's own docblock names as the reason it exists.
      raw: points.length || !isValuePill(gRaw) ? null : gRaw,
      num: points.length || !isValuePill(gRaw) ? NaN : parseValue(gRaw),
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

  // Every point past the cap is TAGGED, not removed. Leaving them untagged in
  // `groups[].points` handed the member two contradictory truths: iterate
  // `series` and the axis has dead headroom no mark reaches; iterate `points`
  // and the 7th mark's palette index is `series.indexOf(name)` = -1, an
  // unstyled mark. The member can now filter or consolidate, which is the
  // decision the cap is supposed to leave it.
  for (const g of groups) for (const pt of g.points) pt.over = !series.includes(pt.series);

  // MIXED DEPTH — an author converts one group to multi-series and leaves
  // another flat, which is the commonest authoring edit there is. `flat` is one
  // global flag, so reading only `points` here dropped the flat group out of
  // the domain entirely: a member either drew nothing for it, or drew a bar
  // several times the axis maximum, straight off the plot box.
  const mixedDepth = !flat && groups.some((g) => !g.points.length && Number.isFinite(g.num));
  const cells = groups.flatMap((g) => (g.points.length
    ? g.points.filter((pt) => !pt.over)
    : (Number.isFinite(g.num) ? [{ raw: g.raw, num: g.num }] : [])));
  const finite = cells.map((c) => c.num).filter(Number.isFinite);
  if (!finite.length) return null;

  return {
    groups,
    series,
    seriesOverflow: overflow,
    flat,
    mixedDepth,
    affix: affixOf(cells.map((c) => c.raw)),
    min: Math.min(...finite),
    max: Math.max(...finite),
  };
}

/** Split an <li>'s own lead HTML from its nested <li> children. */
function splitNested(item) {
  // `<ol>` as well as `<ul>`: an author who writes `1. Product \`2.4\`` under a
  // group got a blank chart, because the sublist was invisible here while
  // `parseTopLevelLis` tracked its depth correctly.
  const idx = item.search(/<(?:ul|ol)[^>]*>/);
  if (idx < 0) return { lead: item, nested: [] };
  const lead = item.slice(0, idx);
  const rest = item.slice(idx);
  const inner = rest.replace(/^<(?:ul|ol)[^>]*>/, '').replace(/<\/(?:ul|ol)>\s*$/, '');
  return { lead, nested: parseTopLevelLis(inner) };
}

function stripNested(item) {
  const idx = item.search(/<(?:ul|ol)[^>]*>/);
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
  // ONE formatter for the whole axis — see axisFormatter on why the magnitude
  // unit cannot be a per-tick decision.
  const fmt = axisFormatter({ ticks, step, affix });
  return ticks.map((t) => {
    const text = fmt(t);
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
      fontSize: FS.tick, anchor: 'middle', vAlign: 'hanging', maxLines: 1,
      className: 'cart-tick', attrs: ' data-anima-role="label"', emitFontSize: false,
    }).svg;
  }).join('');
}

/**
 * Category labels along the base of the plot.
 *
 * NOTE the vertical alignment below a horizontal axis is `hanging`, not `top`.
 * `wrapSvgLabel`'s vAlign vocabulary is baseline / middle / hanging / bottom,
 * and an unrecognized value falls through to `baseline` SILENTLY — so `'top'`
 * put `y` on the first line's baseline and every category name straddled the
 * axis rule it was meant to sit under. No error, just a chart that looks
 * slightly wrong; it took rendering one to see it.
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
 * SIZING `width`. Two labels that each paint their full budget always overlap
 * by `MIN_LABEL_GAP`, so passing the band width exactly means the widest
 * labels cull. To guarantee no name is lost, pass slightly UNDER the band
 * pitch — `step * Math.min(0.99, 1 - 2 / step)` is what a member with long
 * category names wants.
 *
 * @param {Function} o.center  index → the band's center on the category axis
 * @param {number} o.width     the width one label may occupy. On the VERTICAL
 *                             axis the gutter is the real box, so this is
 *                             ignored there and `plot.gutter.left - gap` is
 *                             used for both the measurement and the emission.
 * @param {number} [o.pitch]   VERTICAL axis only: the band pitch, in user
 *                             units. Given one, the line budget is derived
 *                             from it so a long name ELLIPSIZES instead of
 *                             being culled. Always pass it for a row chart —
 *                             a dropped category name is invisible data loss.
 */
function buildCategoryLabels({
  plot, labels, center, width, maxLines = 2, axis = 'x', gap = 5, edgeAnchor = false, pitch = 0,
}) {
  const parts = [];
  let lastEnd = -Infinity;
  // Measure and emit at the SAME width. The vertical branch used to measure at
  // the caller's `width` and emit at the gutter, so a label could be culled for
  // colliding at a size it was never painted at.
  const boxW = axis === 'y' ? Math.max(1, plot.gutter.left - gap) : width;

  // On the vertical axis the line budget comes from the BAND PITCH, so a name
  // that does not fit ELLIPSIZES rather than being culled. Culling a category
  // name is invisible data loss — ten dumbbell rows with two-line names lost
  // five of the ten, and five rows rendered anonymous with nothing to say so.
  // The cull below is kept only as the last resort, for the case where even one
  // line cannot fit, and it is unreachable at any sane pitch.
  const rowLines = axis === 'y' && pitch > 0
    ? Math.max(1, Math.floor((pitch * 0.92) / (FS.cat * LINE_HEIGHT)))
    : maxLines;

  labels.forEach((label, i) => {
    if (!label) return;
    const c = center(i);
    // Measure what the label will actually PAINT, not the width it was allowed.
    // Culling on the allowed width culls a short name out of a wide band (2 of
    // 20 labels survived a case where ~9 fit), and — worse — with the natural
    // call, where `width` is the band width, `c - width/2 < lastEnd` reduces to
    // `step < width`, which the band scale makes impossible. So the cull never
    // fired at all and long labels were silently ellipsized instead.
    const lines = axis === 'y' ? rowLines : maxLines;
    const m = measureLabel(label, { width: boxW, fontSize: FS.cat, maxLines: lines });
    const painted = Math.min(boxW, widestLine(m.lines, FS.cat));
    if (axis === 'x') {
      // On a POINT scale the first and last marks sit ON the plot edge, so a
      // centered label there hangs half its width into the gutter. `edgeAnchor`
      // turns those two inward instead, which is cheaper than widening the
      // gutters to hold an overhang that only two labels ever produce.
      const anchor = !edgeAnchor ? 'middle'
        : i === 0 ? 'start'
        : i === labels.length - 1 ? 'end'
        : 'middle';
      // THE EXTENT FOLLOWS THE ANCHOR. Measuring every label as if it were
      // centered made the cull wrong in both directions under `edgeAnchor`: an
      // edge label reserved half its width on the side it does not occupy and
      // none on the side it does, so a long first label culled the LAST one —
      // whose half-width the gutter had already been widened to hold, giving up
      // a third of the viewBox for a label that was then thrown away.
      const from = anchor === 'start' ? c : anchor === 'end' ? c - painted : c - painted / 2;
      const to = from + painted;
      // Cull against the previous SURVIVING label, so a culled one does not go
      // on reserving space it no longer occupies.
      if (from < lastEnd) return;
      lastEnd = to + MIN_LABEL_GAP;
      parts.push(wrapSvgLabel(label, {
        x: round2(c), y: round2(plot.y1 + gap), width: boxW,
        fontSize: FS.cat, anchor, vAlign: 'hanging', maxLines: m.lines.length,
        className: 'cart-cat', attrs: ' data-anima-role="label"', emitFontSize: false,
      }).svg);
    } else {
      const half = (m.lines.length * FS.cat * LINE_HEIGHT) / 2;
      // WITH A PITCH, the only cull left is "not even one line fits". The line
      // budget above already sized the block to the pitch, so the remaining
      // test was really about the GAP between two blocks — and dropping a row
      // name to buy 1.5 units of air is the invisible data loss this whole
      // branch exists to stop. Measured: fourteen dumbbell rows lost seven
      // names, and the reader pairs name k with bar k from the second row on.
      // Below that floor the rows genuinely cannot all be named, and the
      // gap-based cull comes back so SOME names survive rather than none.
      const fits = pitch > 0 && pitch >= FS.cat * LINE_HEIGHT;
      if (!fits && c - half < lastEnd) return;
      lastEnd = c + half + MIN_LABEL_GAP;
      parts.push(wrapSvgLabel(label, {
        x: round2(plot.x0 - gap), y: round2(c), width: boxW,
        fontSize: FS.cat, anchor: 'end', vAlign: 'middle', baseline: 'central',
        maxLines: m.lines.length, className: 'cart-cat',
        attrs: ' data-anima-role="label"', emitFontSize: false,
      }).svg);
    }
  });
  return parts.join('');
}

// Clear space to keep between two surviving category labels, user units.
const MIN_LABEL_GAP = 1.5;

/** The painted width of the widest wrapped line, in user units. */
function widestLine(lines, fontSize) {
  return lines.reduce((w, l) => Math.max(w, l.length * fontSize * ADVANCE), 0);
}

/**
 * The axis rule — the line the categories sit on.
 *
 * It draws at the plot EDGE, which is the zero line only while every value is
 * positive. On a signed chart (a diverging bar, a waterfall) the reference the
 * marks are read against is the zero rule `buildGrid` already emits as
 * `.cart-zero`; drawing this one as well paints a second, false baseline at the
 * bottom of the plot. Use `buildGrid` alone there.
 */
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
function buildValueLabel(text, {
  x, y, anchor = 'middle', vAlign = 'bottom', width = 44,
  fontSize = FS.value, className = 'cart-value', extra = '',
}) {
  return wrapSvgLabel(text, {
    x: round2(x), y: round2(y), width, fontSize,
    anchor, vAlign, maxLines: 1, className,
    attrs: ` data-anima-role="label"${extra}`, emitFontSize: false,
  }).svg;
}

/**
 * An uppercase tracked axis caption, in the gutter.
 *
 * `.cart-axis-title` paints `text-transform: uppercase` with 0.12em tracking,
 * and caps are wider than the flat 0.6 advance `wrapSvgLabel` assumes — so
 * measuring at the default under-counted and `Second category` ellipsized to
 * `SECOND…` inside a box it actually fitted. `upperAdvance` is the family's
 * measured per-glyph table for exactly this case; the emitter asks it here so
 * no member has to know.
 */
function buildAxisTitle(text, { x, y, anchor = 'middle', vAlign = 'hanging', width = 200, rotate = 0 }) {
  const { svg } = wrapSvgLabel(text, {
    x: round2(x), y: round2(y), width, fontSize: FS.axisTitle,
    advance: upperAdvance(String(text), { tracking: 0.12 }),
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
 * @param {string} [o.name]   an optional SUFFIX distinguishing two gradient sets
 *                             within one chart. The stem is always `cart-fill`,
 *                             because `lib/core/render-ids.js` matches families
 *                             by name to decide whether a deck is squatting an
 *                             id — a stem it does not carry is a stem whose ids
 *                             an author's raw `<linearGradient>` can hijack,
 *                             and SVG is first-def-wins, so the chart would
 *                             paint with the author's gradient while its legend
 *                             still read correctly.
 * @param {number} [o.x2]/[o.y2]  gradient axis; default vertical (0,0)→(0,1)
 * @returns {{defs:string, id:(slot:string|number)=>string, url:(slot)=>string}}
 */
function buildFillDefs({ kind = 'cat', slots = [], name = '', x1 = 0, y1 = 0, x2 = 0, y2 = 1 } = {}) {
  const stem = `cart-fill${name ? `-${String(name).replace(/[^\w-]/g, '')}` : ''}`;
  // The sequence makes the id document-unique. A fixed `cart-fill-3` id would
  // collide the moment a deck puts two Cartesian charts on one slide — and an
  // SVG `url(#id)` resolves against the WHOLE document, so the second chart
  // would silently paint with the first one's stops.
  const ns = nextRenderSeq(stem);
  // A slot reaches an `id` ATTRIBUTE and a `var()` NAME. Cartesian slots are
  // numeric palette indices, but the JSDoc admits strings and the `state` path
  // takes author-typed status words — and a shared kernel must not depend on
  // every future caller sanitizing. Untrusted chart SVG lands in a same-origin
  // preview frame (HARD RULE #22), so an attribute break-out here is not
  // theoretical.
  const safe = (slot) => String(slot).replace(/[^\w-]/g, '');
  const hue = (slot) => (kind === 'state' ? `var(--state-${safe(slot)}-hue)` : `var(--chart-cat-${safe(slot)}-hue)`);
  const id = (slot) => `${renderIdPrefix()}${stem}-${safe(slot)}-${ns}`;
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

/**
 * The `<svg>` root every Cartesian member emits.
 *
 * `design/skills/chart-component.md` pins this contract — `viewBox`,
 * `preserveAspectRatio="xMidYMid meet"`, `role="img"` — and seven members
 * hand-writing it is seven chances to drop one. It matters more than it looks:
 * `role="img"` is children-presentational, so it PRUNES the whole subtree and
 * every `<text>` the chart draws is unreachable. The `<title>` and `<desc>` are
 * therefore the ONLY route to the data for a screen reader, which is why `desc`
 * is a required argument rather than an option — and why a member's desc should
 * carry the RELATIONSHIP the chart is for, not just its values (the funnel's
 * lists conversion rates, because drop-off is what a funnel is).
 *
 * @param {object} o
 * @param {object} o.view     {w,h} from viewFor()
 * @param {string} o.className  the member's root class (e.g. `bar-svg`)
 * @param {string} o.title    what the chart IS, one short phrase
 * @param {string} o.desc     the data and its relationship, read aloud
 * @param {string} [o.defs]   `<defs>` content (gradients, patterns)
 * @param {string} o.body     the marks and chrome, already emitted
 */
function buildSvgRoot({ view, className, title, desc, defs = '', body }) {
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return `<svg class="${className}" viewBox="0 0 ${view.w} ${view.h}"` +
    ' preserveAspectRatio="xMidYMid meet" role="img">' +
    `<title>${esc(title)}</title>${desc ? `<desc>${esc(desc)}</desc>` : ''}` +
    `${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}

function round2(n) {
  return Number(Number(n).toFixed(2));
}

module.exports = {
  VIEW, FS, GUTTER,
  viewFor, plotBox,
  linearScale, bandScale, pointScale,
  niceStep, niceTicks,
  parseValue, signedValue, normalizeSeparators, parseAffix, affixOf, isValuePill,
  formatTick, axisFormatter, markFormatter, axisUnit,
  parseSeries, readLeadValue,
  buildGrid, buildValueTicks, buildCategoryLabels, buildAxisRule,
  buildValueLabel, buildAxisTitle, buildFillDefs, buildSvgRoot,
  round2,
};
