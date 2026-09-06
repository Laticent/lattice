/**
 * line chart kernel — the Cartesian family member whose claim is MOVEMENT:
 * *this moved over time*. Nothing else in the chart family plots a continuous
 * series at all (engineering/decisions/2026-09-06-cartesian-chart-expansion.md
 * §2), so a deck that needs "revenue by quarter" or "headcount through the
 * reorg" had nothing to say it with.
 *
 * Four variants, selected by class token, each a different claim:
 *
 *   line               one or several series across an ordered category axis
 *   line area          ONE series with the region under it filled — the fill is
 *                      a magnitude cue, so it is only honest for a single
 *                      series (or a stack)
 *   line stacked-area  composition over time: the series stack to a total
 *   line step          a value that HOLDS and JUMPS (headcount, price tier,
 *                      rate). Interpolating between two step values draws a
 *                      change that did not happen.
 *
 * Authoring is the shared Cartesian DSL (`parseSeries` in _chart-family/
 * cartesian.js) — flat for one series, nested for several:
 *
 *   FLAT                      NESTED
 *   - Q1 `4.2`                - Q1
 *   - Q2 `5.1`                  - Product `2.4`
 *                               - Services `1.8`
 *
 * Everything geometric comes from the shared substrate: the viewBox, the plot
 * box, the scales, the nice-number ticks, the grid, the tick and category
 * labels. This kernel owns exactly one thing — the MARKS (the line, the dots,
 * the filled region) and where the series' own name is written.
 *
 * Palette-blind (HARD RULE #3): every mark carries a class, `--i` and
 * `data-cat`; not one color literal is emitted. Area fills reference the
 * family's canonical gradient defs, which name TOKENS in their stops.
 */

const cart = require('../_chart-family/cartesian');
const { buildSvgRoot } = cart;
const { wrapSvgLabel, measureLabel, deCollideLabels } = require('../_chart-family/svg-label');
const { buildSvgLegend } = require('../_chart-family/svg-legend');
const markDetail = require('../_chart-family/mark-detail');
const { spliceFirstList, escHtml } = require('../_chart-family/transform-utils');

const { FS } = cart;

// ── Tuning constants, all in viewBox USER UNITS ────────────────────────────

// Gap between a label column and the thing it labels.
const TICK_GAP = 4;
// Clear space between the axis rule and the TOP of the category label block.
// The substrate hangs those labels (`vAlign: 'hanging'`), so `gap` is the
// distance to the glyph tops, not to a baseline — which is what lets `bottom`
// below be derived exactly. 6 keeps the labels clear of the bottom TICK, whose
// text is centered ON the axis rule whenever the axis reaches zero and so
// descends about 3.7 units past it.
const CAT_GAP = 6;
const SERIES_GAP = 4;

// The left gutter is DERIVED from the widest tick string rather than taken from
// the substrate's 30-unit default. A line chart lives or dies on plot width —
// it is the axis along which the movement is read — and an axis reading
// `0 · 2 · 4 · 6` needs nothing like 30 units. Clamped both ways: never so
// narrow that a tick touches the viewBox edge, never so wide that a long
// currency tick eats the plot.
const LEFT_MIN = 13;
const LEFT_MAX = 34;
// A category label centered on the FIRST point overhangs the plot's left edge by
// half its own width; the gutter has to hold that as well as the ticks.
const LEFT_HARD_MAX = 44;

// The right gutter holds the DIRECT LABELS (see §"Direct labeling" below).
// Capped at ~23% of the viewBox: past that the plot is paying more for the
// names than for the data, and the legend is the better trade.
const RIGHT_CAP = 74;
const RIGHT_BARE = 8;

const TOP_PAD = 9;

// A dot per datapoint says "these are the measurements"; no dots says "this is
// a continuous quantity". The honest switch is DENSITY, not a count: below this
// spacing the dots merge into a beaded string and stop reading as measurements.
const DOT_MIN_SPACING = 20;
const DOT_R = 2.3;

// Category labels sit in a slot as wide as the band, minus a sliver. Without
// the sliver adjacent slots EXACTLY touch, and the substrate's collision cull
// (`c - half < lastEnd`) then decides on float noise — which is what culled
// `Feb` from a six-month axis and `FY26` from a four-year one while keeping
// their neighbors. 0.92 also buys visible air between two long labels.
const CAT_SLOT = 0.92;

// Category labels wrap to at most two lines; a third would eat the plot.
const CAT_MAX_LINES = 2;
// A direct label may take two lines before we call it a failure.
const SERIES_MAX_LINES = 2;

// svg-label's flat advance, mirrored so this kernel can size its own gutters
// from a measured label rather than a guess.
const ADVANCE = 0.6;

// ── Parsing ────────────────────────────────────────────────────────────────

/**
 * The author's list → a rectangular series model.
 *
 * `parseSeries` gives groups (categories) each carrying either its own value
 * (flat) or a nested list of per-series values. A line chart wants the
 * TRANSPOSE of that — one row per series, one column per category — because a
 * line is a series, not a category. The transpose is where MISSING POINTS
 * appear: a category that does not carry every series leaves a hole, and the
 * hole is kept as `null` rather than filled, so the builder can decide.
 *
 * @returns {null|object} null when there is nothing to draw.
 */
function parseLine(ulInner) {
  const model = cart.parseSeries(ulInner);
  if (!model) return null;

  const cats = model.groups.map((g) => g.label);
  const flat = model.flat;
  const series = flat ? [''] : model.series;

  // rows[s][c] = { num, raw } | null
  const rows = series.map((name) => model.groups.map((g) => {
    if (flat) {
      return Number.isFinite(g.num) ? { num: g.num, raw: g.raw } : null;
    }
    const p = g.points.find((q) => q.series === name);
    return p ? { num: p.num, raw: p.raw } : null;
  }));

  // A series that carries no point at all is not a series; drop it so the
  // palette does not spend a slot on an empty line. (Reachable when the cap in
  // parseSeries admits a name that only ever appeared past the cap.)
  const keep = rows.map((r) => r.some(Boolean));
  const keptSeries = series.filter((_, i) => keep[i]);
  const keptRows = rows.filter((_, i) => keep[i]);
  if (!keptSeries.length) return null;
  // TWO POINTS IS THE FLOOR, and below it the kernel passes the list through
  // untouched — the same refusal the funnel makes below two stages. A line is a
  // claim about movement BETWEEN readings; with one reading there is no
  // movement, no shape and nothing for the category axis to order. Rendered
  // anyway it is a lone dot adrift in an empty box, which is a worse answer than
  // the author's own bullet. (Two points still renders, but `antiPatterns` sends
  // it to `slope`, which draws that comparison properly.)
  if (cats.length < 2) return null;

  // Detail rides on the CATEGORY (a group), which is where the author wrote it.
  const marks = model.groups.map((g) => ({
    label: g.label,
    valueRaw: flat ? g.raw : null,
    detail: (g.detail || []).map((d) => `<li>${escHtml(d)}</li>`).join(''),
  }));

  return {
    cats,
    series: keptSeries,
    rows: keptRows,
    flat,
    affix: model.affix,
    seriesOverflow: model.seriesOverflow || [],
    // An author who left one category flat and nested the others: for a line
    // that category carries no point for ANY series, so it renders as a hole in
    // every line at once. Surfaced on the model so a caller can say so; named
    // in the manifest's dataShapeGuidance.
    mixedDepth: !!model.mixedDepth,
    marks,
    min: model.min,
    max: model.max,
  };
}

// ── Variant selection ──────────────────────────────────────────────────────

/**
 * Which of the four claims is this slide making?
 *
 * `area` DOWNGRADES to a plain line when there is more than one series, and
 * that is a deliberate refusal rather than an oversight: two opaque filled
 * regions on one plot hide each other, so the second series' fill would be
 * drawing over data it is not entitled to cover. The composition claim has its
 * own variant (`stacked-area`); the docs say so and `commonMistakes` names it.
 *
 * `stacked-area` with a single series IS an area — same geometry, same domain
 * rule — so it resolves there rather than growing a special case.
 */
function variantOf(classTokens, seriesCount) {
  const t = Array.isArray(classTokens) ? classTokens : [];
  if (t.includes('stacked-area')) return seriesCount > 1 ? 'stacked-area' : 'area';
  if (t.includes('area')) return seriesCount > 1 ? 'line' : 'area';
  if (t.includes('step')) return 'step';
  return 'line';
}

// ── The zero rule ──────────────────────────────────────────────────────────

/**
 * Does the value axis have to reach zero?
 *
 * `niceTicks` defaults `includeZero: true`, which is right for a bar — a bar's
 * LENGTH is the claim, so a baseline anywhere else lies about its magnitude.
 * A line's claim is its SHAPE, and forcing zero onto a revenue series running
 * 4.1 → 4.4 flattens the whole story into a horizontal scratch at the top of
 * the box. Dropping zero, though, exaggerates: the same 7% move can be made to
 * look like a collapse.
 *
 * The rule, stated so a reader can check it:
 *
 *   1. A FILLED chart (`area`, `stacked-area`) always includes zero. The filled
 *      REGION is a magnitude cue — its area is read as quantity — so an area
 *      chart floating off zero is not a debatable trade, it is a lie.
 *   2. Otherwise zero is included when the data already comes within a SIXTH of
 *      it (`min <= 0.15 × max`) — at that point the series still fills 85% of
 *      the box with zero on the axis, so the honest baseline is nearly free.
 *      The threshold was a quarter until a three-series chart running 1.2 → 5.2
 *      was rendered and measured: it qualified at 0.23 and spent the bottom
 *      quarter of the plot on nothing, which is the cost the rule is supposed
 *      to be weighing.
 *   3. Otherwise the axis floats, and the tick labels say plainly where it
 *      starts. A floating axis that is LABELLED is not a deception; an unlabelled
 *      one would be, which is why the tick column is never suppressed.
 *
 * A NEGATIVE series does NOT force the zero-based branch, which is the one part
 * of this that reads backwards. It does not need to: a domain that spans zero
 * always puts zero on a tick (the tick range is floor/ceil'd to whole steps
 * either side), so the zero rule draws whatever branch is taken. Forcing the
 * zero branch only pins the domain to the tick range, and on a six-series plot
 * running −0.4 to 5.4 that spent a fifth of the plot on the empty stretch
 * between −2 and the lowest real value.
 */
function includeZeroFor(variant, min, max) {
  if (variant === 'area' || variant === 'stacked-area') return true;
  if (min === 0) return true;
  return min > 0 && max > 0 && min <= 0.15 * max;
}

/**
 * Are these tick labels TRUE? A label that misstates its own gridline is worse
 * than an inelegant axis, and the family's formatter can produce one: a 2.5
 * step prints `decimalsFor(2.5) === 0`, so an axis running 0 · 2.5 · 5 · 7.5 · 10
 * paints `0 · 3 · 5 · 8 · 10` — two gridlines lying about where they are.
 * (Seen on a real render; reported to the orchestrator as a substrate defect.)
 *
 * The test is a round trip: format the tick, parse the formatted string back,
 * and require the number to survive. Uniqueness is checked too, because two
 * ticks rounding to one string is the same defect one step further on.
 */
function ticksAreFaithful(ticks, step, affix) {
  const fmt = cart.axisFormatter({ ticks, step, affix });
  const seen = new Set();
  for (const t of ticks) {
    const text = fmt(t);
    if (seen.has(text)) return false;
    seen.add(text);
    const back = cart.parseValue(text);
    if (!Number.isFinite(back)) return false;
    const tol = Math.max(Math.abs(t), Math.abs(step)) * 1e-6;
    if (Math.abs(back - t) > tol) return false;
  }
  return true;
}

/**
 * The value axis: which ticks to draw, and what domain to map them through.
 *
 * TWO decisions live here, and neither is the substrate's default.
 *
 * 1. THE TICK TARGET IS CHOSEN, NOT ASSUMED. `niceTicks` takes a wish and
 *    snaps the step to the 1/2/2.5/5/10 ladder; a 2.5 rung then formats
 *    unfaithfully (above). So four targets are tried in preference order and
 *    the first that both TELLS THE TRUTH and stays inside the family's
 *    five-gridline ceiling wins. Four gridlines is still the default — this
 *    only moves off it when four would lie.
 *
 * 2. THE DOMAIN IS NOT THE TICK RANGE, when the axis floats. Mapping straight
 *    onto [tick.min, tick.max] puts the series minimum exactly on the axis rule
 *    whenever the data floor happens to be a round number — a price series
 *    holding at 1,200 drew its first plateau ON the axis, indistinguishable
 *    from it. So a floating axis pads the domain by a tenth of the data range
 *    and drops any tick that falls outside; the marks then sit INSIDE the box
 *    they are measured in. A zero-based axis keeps the tick range exactly,
 *    because an area chart's baseline has to be the axis and nothing else — it
 *    only gains headroom at the top, and only when the peak lands on the top
 *    gridline.
 */
function valueAxis(min, max, includeZero, affix) {
  // The padded domain comes FIRST, because on a floating axis it decides which
  // ticks are visible at all — scoring a candidate on the ticks it generates
  // rather than on the ticks that SURVIVE picked a step whose gridlines then
  // fell outside the box, leaving a three-series plot with two of them.
  const range = max - min;
  const pad = includeZero ? 0 : (range > 0 ? range * 0.1 : (Math.abs(max) * 0.05 || 1));

  const score = (c) => {
    if (!ticksAreFaithful(c.ticks, c.step, affix)) return null;
    const lo = includeZero ? c.min : min - pad;
    const hi = includeZero ? c.max : max + pad;
    const inside = c.ticks.filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9);
    // Two gridlines is the floor (one line is not a scale) and five is the
    // family's ceiling — past that the grid competes with the data.
    if (inside.length < 2 || inside.length > 5) return null;
    // HOW MUCH OF THE BOX THE DATA ACTUALLY OCCUPIES comes first, and tick count
    // second. Ranking on tick count alone chose the axis nearest four
    // gridlines regardless of what it cost: a six-series plot spanning −0.4 to
    // 5.4 took a step of 5 (−5 · 0 · 5 · 10, exactly four lines) over a step of
    // 2 (−2 · 0 · 2 · 4 · 6, five lines) and spent HALF the plot height on
    // empty axis. Weighted 10 to 0.5, a candidate has to gain a lot of fill to
    // buy one more gridline, which is the trade in the right order.
    const used = (max - min) / ((hi - lo) || 1);
    return { c, inside, rank: (1 - used) * 10 + Math.abs(inside.length - 4) * 0.5 };
  };

  const cands = [4, 3, 5, 6, 2].map((target) => cart.niceTicks(min, max, { target, includeZero }));
  const scored = cands.map(score).filter(Boolean);
  const best = scored.reduce((b, q) => (b && b.rank <= q.rank ? b : q), null);
  const pick = best ? best.c : (cands.find((c) => ticksAreFaithful(c.ticks, c.step, affix)) || cands[0]);
  let ticks = best ? best.inside : pick.ticks;

  const span = pick.max - pick.min || 1;
  let lo = pick.min;
  let hi = pick.max;

  if (includeZero) {
    // Only the TOP gets air, and only when the peak lands on the last gridline:
    // the baseline is load-bearing and must stay exactly where it is, because an
    // area chart's fill is measured from it.
    if (max >= pick.max - 1e-9) hi = pick.max + span * 0.06;
    // A trough sitting ON the bottom gridline is the same defect as a floor
    // sitting on the axis rule, one gridline down.
    if (min < 0 && min <= pick.min + span * 0.05) lo = pick.min - span * 0.06;
  } else {
    lo = min - pad;
    hi = max + pad;
    if (!best) {
      // No candidate scored, so `ticks` is still the raw set and NOTHING has
      // checked it against this domain. A dead-flat series is the case that
      // reaches here: `niceTicks` widens a zero-span domain by a whole step, so
      // every tick it returns can sit outside a padded domain five percent
      // wide, and drawing them unfiltered puts gridlines off the plot entirely.
      const inside = ticks.filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9);
      if (inside.length >= 2) ticks = inside;
      else { lo = Math.min(lo, pick.min); hi = Math.max(hi, pick.max); }
    }
  }
  return { ticks, step: pick.step, lo, hi };
}

/**
 * Which category labels to print — at a REGULAR STRIDE.
 *
 * The substrate culls greedily against the previous survivor, which keeps every
 * label legible but produces an irregular rhythm on a dense axis (Jan · Feb ·
 * Apr · Jun · Jul · Sep · Nov · Dec on a twelve-month series). An irregular
 * rhythm reads as a chart that broke; a regular one reads as a chart that chose.
 * So the stride is computed from the widest label and applied uniformly, and
 * the LAST category is always kept — on a time axis the endpoint is the one
 * label a reader looks for.
 */
function labelStride(cats, slotW) {
  const widest = cats.reduce((w, c) => Math.max(w, c.length * FS.cat * ADVANCE), 0);
  const stride = Math.max(1, Math.ceil((widest + 4) / Math.max(1, slotW)));
  if (stride === 1) return { labels: cats.slice(), stride };
  const out = cats.map(() => '');
  for (let i = 0; i < cats.length; i += stride) out[i] = cats[i];
  const last = cats.length - 1;
  if (!out[last]) {
    let prev = last - 1;
    while (prev >= 0 && !out[prev]) prev -= 1;
    // The endpoint WINS a crowding fight with its neighbor. Keeping both was
    // measured on a twenty-four-month axis: the substrate's own cull then threw
    // the endpoint away and kept the neighbor, so the series appeared to stop
    // at `Oct 25`. One hiccup in the rhythm is a cheaper price than an unlabeled
    // end of a time series.
    if (last - prev < stride && prev > 0) out[prev] = '';
    out[last] = cats[last];
  }
  return { labels: out, stride };
}

// ── Geometry helpers ───────────────────────────────────────────────────────

// The painted width of a wrapped label, user units — the same conservative
// estimate svg-label breaks lines with, so a gutter sized from it is never
// narrower than the glyphs it has to hold.
function paintedWidth(text, width, fontSize, maxLines) {
  const m = measureLabel(text, { width, fontSize, maxLines, advance: ADVANCE });
  const chars = m.lines.reduce((w, l) => Math.max(w, l.length), 0);
  return { w: chars * fontSize * ADVANCE, lines: m.lines, clipped: m.lines.some((l) => l.endsWith('…')) };
}

/**
 * The category axis.
 *
 * TWO SCALES, because the two claims are geometrically different, and this is
 * the substrate's `bandScale` doing both rather than a private point scale:
 *
 *   · a LINE value is measured at an instant, so its points span the full plot
 *     width — first point on the left edge, last on the right. `padOuter: -0.5`
 *     turns the band scale into exactly that point scale (`step = w/(n-1)`,
 *     `center(i) = x0 + i·step`), which is why no second scale is written here.
 *   · a STEP value HOLDS ACROSS AN INTERVAL, so it gets a real band: the
 *     plateau spans the whole slot and the jump lands on the boundary. Drawing
 *     a step on the point scale would give the last value no plateau at all.
 */
function categoryAxis(n, plot, variant) {
  if (n === 1) {
    const c = (plot.x0 + plot.x1) / 2;
    return { center: () => c, width: plot.w, step: plot.w, start: () => plot.x0 };
  }
  if (variant === 'step') {
    const b = cart.bandScale(n, [plot.x0, plot.x1], { padInner: 0, padOuter: 0 });
    return { center: b.center, width: b.width, step: b.step, start: b.start };
  }
  const b = cart.bandScale(n, [plot.x0, plot.x1], { padInner: 0, padOuter: -0.5 });
  return { center: b.center, width: b.step, step: b.step, start: b.start };
}

/** Contiguous runs of present points — a hole BREAKS the line (see the docs). */
function segmentsOf(row) {
  const segs = [];
  let cur = null;
  row.forEach((p, i) => {
    if (!p) { cur = null; return; }
    if (!cur) { cur = []; segs.push(cur); }
    cur.push(i);
  });
  return segs;
}

function num(n) {
  return cart.round2(n);
}

// ── Path emitters ──────────────────────────────────────────────────────────

function linePath(idxs, x, y) {
  return idxs.map((i, k) => `${k ? 'L' : 'M'}${num(x(i))} ${num(y(i))}`).join(' ');
}

/**
 * The step path: a plateau across the whole band, then a vertical jump at the
 * boundary. Emitted as explicit H/V so the corner is square at any scale.
 */
function stepPath(idxs, axis, y) {
  const parts = [];
  idxs.forEach((i, k) => {
    const x0 = axis.start(i);
    const x1 = x0 + axis.width;
    const yv = y(i);
    if (k === 0) parts.push(`M${num(x0)} ${num(yv)}`);
    else parts.push(`V${num(yv)}`);
    parts.push(`H${num(x1)}`);
  });
  return parts.join(' ');
}

/** Close a line (or step) path down onto the baseline to make a filled region. */
function areaPath(idxs, axis, y, baseY, variant) {
  const top = variant === 'step' ? stepPath(idxs, axis, y) : linePath(idxs, (i) => axis.center(i), y);
  const first = idxs[0];
  const last = idxs[idxs.length - 1];
  const xL = variant === 'step' ? axis.start(first) : axis.center(first);
  const xR = variant === 'step' ? axis.start(last) + axis.width : axis.center(last);
  return `${top} L${num(xR)} ${num(baseY)} L${num(xL)} ${num(baseY)} Z`;
}

/** A stacked band: the upper edge forward, the lower edge back, closed. */
function bandPath(idxs, axis, yUp, yLo, variant) {
  const up = variant === 'step' ? stepPath(idxs, axis, yUp) : linePath(idxs, (i) => axis.center(i), yUp);
  const back = [...idxs].reverse();
  const down = back.map((i, k) => {
    const xc = variant === 'step' ? axis.start(i) + axis.width : axis.center(i);
    const x0 = variant === 'step' ? axis.start(i) : xc;
    return k === 0 ? `L${num(xc)} ${num(yLo(i))}` : `L${num(xc)} ${num(yLo(i))} L${num(x0)} ${num(yLo(i))}`;
  }).join(' ');
  return `${up} ${down} Z`;
}

/** The last REPORTED value of a series, as the author wrote it. */
function endValueOf(model, si, variant) {
  const row = model.rows[si];
  if (variant === 'stacked-area') {
    const p = row[model.cats.length - 1];
    return p ? (p.raw != null && p.raw !== '' ? p.raw : String(p.num)) : null;
  }
  let i = model.cats.length - 1;
  while (i >= 0 && !row[i]) i -= 1;
  if (i < 0) return null;
  return row[i].raw != null && row[i].raw !== '' ? row[i].raw : String(row[i].num);
}

// ── The <desc> ─────────────────────────────────────────────────────────────

/**
 * `role="img"` prunes the whole subtree from the accessibility tree, so every
 * `<text>` this kernel draws is unreachable and THIS STRING is the only route
 * to the data. It therefore carries the relationship the chart is FOR — a line
 * exists to show movement, so listing endpoint values alone would leave the one
 * fact the chart is about unreachable. Each series states where it started,
 * where it ended, the change between them, and its peak.
 */
function buildDesc(model, variant, totals) {
  const { cats, rows, series, flat } = model;
  const shown = (p) => (p.raw != null && p.raw !== '' ? p.raw : String(p.num));
  const parts = [];
  const span = cats.length > 1 ? `${cats[0]} to ${cats[cats.length - 1]}` : cats[0];
  parts.push(`${cats.length} point${cats.length === 1 ? '' : 's'}, ${span}`);

  rows.forEach((row, s) => {
    const present = row.map((p, i) => (p ? { p, i } : null)).filter(Boolean);
    if (!present.length) return;
    const first = present[0];
    const last = present[present.length - 1];
    const peak = present.reduce((b, q) => (q.p.num > b.p.num ? q : b), present[0]);
    const name = flat ? 'Value' : series[s];
    const bits = [`${shown(first.p)} at ${cats[first.i]}`];
    if (last.i !== first.i) {
      bits.push(`${shown(last.p)} at ${cats[last.i]}`);
      if (first.p.num !== 0) {
        const pct = Math.round(((last.p.num - first.p.num) / Math.abs(first.p.num)) * 100);
        bits.push(`${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct)}%`);
      }
    }
    if (peak.i !== last.i && peak.i !== first.i) bits.push(`peak ${shown(peak.p)} at ${cats[peak.i]}`);
    const holes = row.filter((p) => !p).length;
    if (holes) bits.push(`${holes} point${holes === 1 ? '' : 's'} not reported`);
    parts.push(`${name} — ${bits.join(', ')}`);
  });

  if (variant === 'stacked-area' && totals) {
    const f = totals[0];
    const l = totals[totals.length - 1];
    parts.push(`Total — ${cart.round2(f)} at ${cats[0]}, ${cart.round2(l)} at ${cats[cats.length - 1]}`);
  }
  return `${parts.join('. ')}.`;
}

const TITLES = {
  line: 'Line chart',
  area: 'Area chart',
  'stacked-area': 'Stacked area chart',
  step: 'Step line chart',
};

// ── Build ──────────────────────────────────────────────────────────────────

function buildLine(model, ctx = {}, opts = {}) {
  const orientation = ctx.orientation;
  // Direct labeling is the default and a key is the fallback. When the fallback
  // fires the geometry has to be rebuilt — the right gutter existed only to
  // hold the names — so this runs a second, terminal pass rather than trying to
  // retro-fit a layout that was measured for something else.
  const useDirect = !opts.forceLegend;
  const view = cart.viewFor(orientation);
  const variant = variantOf(ctx.classTokens, model.series.length);
  const filled = variant === 'area' || variant === 'stacked-area';
  const nCats = model.cats.length;
  const nSeries = model.series.length;

  // ── the value domain ──
  let totals = null;
  let domMin = model.min;
  let domMax = model.max;
  if (variant === 'stacked-area') {
    totals = model.cats.map((_, i) => model.rows.reduce((s, r) => s + (r[i] ? r[i].num : 0), 0));
    domMin = Math.min(0, ...totals);
    domMax = Math.max(0, ...totals);
  }
  const zeroed = includeZeroFor(variant, domMin, domMax);
  const ax = valueAxis(domMin, domMax, zeroed, model.affix);

  // ── gutters ──
  // Left, from the widest tick the axis will actually print.
  // `axisFormatter`, not a per-tick `formatTick` loop: the magnitude unit has
  // to be chosen ONCE from the whole axis, or a domain running to 1.5M prints
  // `0 · 500k · 1M · 1.5M` — three units on four ticks.
  const fmt = cart.axisFormatter({ ticks: ax.ticks, step: ax.step, affix: model.affix });
  const tickTexts = ax.ticks.map(fmt);
  const widestTick = tickTexts.reduce((w, t) => Math.max(w, t.length * FS.tick * ADVANCE), 0);
  const leftTicks = Math.min(LEFT_MAX, Math.max(LEFT_MIN, widestTick + TICK_GAP + 2));

  // Right, from the direct labels — measured against the cap, so a name that
  // needs more room than the cap allows is DETECTED here rather than clipped.
  const labelBudget = RIGHT_CAP - SERIES_GAP - 2;
  // THE ENDPOINT VALUE ships with the name. A trend chart is read for its shape,
  // but the one number an audience writes down is where it ENDED, and making
  // them read it off a gridline by eye is exactly the work the gutter exists to
  // save.
  //
  // IT HAS TO STAY ON ONE LINE WITH THE NAME, and that was learned the
  // expensive way. Stacking the value UNDER its name doubles the label's height,
  // which doubles the pressure on the de-collision pass: rendered with three
  // series ending fifteen units apart, every pair was pushed off its own line
  // end and the numbers drifted into the gap between two names, so `5.2` sat
  // nearer Mid-market's line than Services'. A number attached to the wrong line
  // is worse than no number.
  //
  // So the label degrades in three tiers, and the tier is chosen for ALL series
  // at once — a chart where two names carry their value and four do not reads as
  // broken data, not as a considered layout:
  //   1. `Name 5.2` on one line — the richest label, and the default;
  //   2. `Name` alone, wrapping to two lines — when the values will not fit;
  //   3. a key — when the names themselves will not fit (see the fallback below).
  const endValues = model.series.map((_, si) => endValueOf(model, si, variant));
  const joined = model.series.map((name, si) => (endValues[si] ? `${name} ${endValues[si]}` : name));
  const oneLine = model.flat
    ? []
    : joined.map((t) => paintedWidth(t, labelBudget, FS.series, 1));
  const withValues = !model.flat && oneLine.every((m) => !m.clipped);
  const directTexts = model.flat ? [] : (withValues ? joined : model.series.slice());
  const directBoxes = model.flat
    ? []
    : directTexts.map((t) => paintedWidth(t, labelBudget, FS.series, withValues ? 1 : SERIES_MAX_LINES));
  const namesClippedFinal = directBoxes.some((m) => m.clipped);
  const widestDirect = directBoxes.reduce((w, m) => Math.max(w, m.w), 0);
  const soloValue = model.flat
    ? endValues.reduce((w, v) => Math.max(w, v ? v.length * FS.value * ADVANCE : 0), 0)
    : 0;
  const rightNames = !useDirect
    ? RIGHT_BARE
    : (model.flat
      ? (soloValue ? Math.min(RIGHT_CAP, soloValue + SERIES_GAP + 2) : RIGHT_BARE)
      : Math.min(RIGHT_CAP, widestDirect + SERIES_GAP + 2));

  // Bottom and the two side gutters settle together, so this runs twice.
  //
  // The category label width depends on the band step, which depends on the
  // gutters; and on the POINT scale (plain line / area) the first and last
  // labels are centered ON the plot's own edges, so half of each hangs into a
  // gutter. Sizing the gutters from the ticks alone printed `0` straight
  // through `Q1 2025`. One iteration settles it — the second pass only ever
  // widens, so it converges.
  let bottom = CAT_GAP + FS.cat * 1.16 + 2.5;
  let left = leftTicks;
  let right = rightNames;
  let plot = cart.plotBox({ view, gutter: { left, right, top: TOP_PAD, bottom } });
  let axis = categoryAxis(nCats, plot, variant);
  let catLabels = model.cats.slice();

  let catSlotW = axis.width * CAT_SLOT;
  for (let pass = 0; pass < 2; pass++) {
    const strided = labelStride(model.cats, axis.width * CAT_SLOT);
    catLabels = strided.labels;
    // THE LABEL BOX IS THE STRIDE'S WIDTH, not one slot's. When a dense axis
    // prints every third month, the space that label owns is three slots wide —
    // wrapping it to one slot broke `Jan 24` into `Ja` / `n…` across a
    // twenty-four-month series while two slots either side of it sat empty.
    catSlotW = axis.width * strided.stride * CAT_SLOT;
    const shown = catLabels.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    const boxes = shown.map((i) => paintedWidth(catLabels[i], catSlotW, FS.cat, CAT_MAX_LINES));
    const lines = boxes.reduce((n, b) => Math.max(n, b.lines.length), 1);
    // The block hangs BELOW `plot.y1 + CAT_GAP`, one line height per line, so
    // the gutter is derived rather than guessed — a label that does not fit is
    // a label the viewBox clips, and the clip is silent.
    bottom = CAT_GAP + lines * FS.cat * 1.16 + 2.5;
    if (variant !== 'step' && shown.length) {
      // Only the point scale overhangs; a step chart's labels sit inside their
      // own band and need nothing.
      const firstOver = shown[0] === 0 ? boxes[0].w / 2 + 1 : 0;
      const lastOver = shown[shown.length - 1] === nCats - 1 ? boxes[boxes.length - 1].w / 2 + 1 : 0;
      left = Math.min(LEFT_HARD_MAX, Math.max(leftTicks, firstOver));
      right = Math.max(rightNames, lastOver);
    }
    plot = cart.plotBox({ view, gutter: { left, right, top: TOP_PAD, bottom } });
    axis = categoryAxis(nCats, plot, variant);
  }

  const y = cart.linearScale([ax.lo, ax.hi], [plot.y1, plot.y0]);
  const yAt = (row) => (i) => y(row[i].num);
  const baseY = Math.min(plot.y1, Math.max(plot.y0, y(Math.max(ax.lo, Math.min(0, ax.hi)))));

  // ── chrome, from the substrate ──
  const chrome =
    cart.buildGrid({ plot, ticks: ax.ticks, scale: y, axis: 'y' }) +
    cart.buildAxisRule({ plot, axis: 'x' }) +
    cart.buildValueTicks({ plot, ticks: ax.ticks, scale: y, step: ax.step, affix: model.affix, axis: 'y', gap: TICK_GAP }) +
    cart.buildCategoryLabels({ plot, labels: catLabels, center: axis.center, width: catSlotW, maxLines: CAT_MAX_LINES, axis: 'x', gap: CAT_GAP });

  // ── the marks ──
  const slots = model.series.map((_, s) => (s % 6) + 1);
  // THE GRADIENT RUNS THE OTHER WAY for an area. The family's canonical fill is
  // authored for a BAR — densest at the bottom, where the bar meets its
  // baseline — and `buildFillDefs` exposes the gradient axis precisely so a
  // member can re-aim it. An area's dense end belongs at the LINE, fading
  // toward the baseline, because that is where the reader's eye is and because
  // a slab of even ink over a third of the slide competes with the line it is
  // supposed to support. Same recipe, same tokens, reversed.
  // …for an AREA. A STACKED area keeps the canonical direction, because there
  // the wash is doing a second job: each band densest at its own base puts the
  // darkest ink immediately above every boundary, which is what separates one
  // series from the next when three of them tile with no gap. Flipping it there
  // (tried, rendered, rejected) hangs every band from its upper edge and the
  // stack reads as four detached ribbons.
  const fills = filled
    ? cart.buildFillDefs(variant === 'stacked-area'
      ? { kind: 'cat', slots, name: 'line-area' }
      : { kind: 'cat', slots, name: 'line-area', y1: 1, y2: 0 })
    : null;
  const marks = [];
  const dots = [];

  // Dots are a FUNCTION OF DENSITY, not a preference: at four points the reader
  // should see the measurements; at twenty-four the dots bead the line and the
  // shape is what matters. Never on a stacked area, where the dot would sit on
  // a filled band rather than on the canvas.
  const spacing = nCats > 1 ? axis.step : plot.w;
  const showDots = variant !== 'stacked-area' && spacing >= DOT_MIN_SPACING;

  if (variant === 'stacked-area') {
    // Bottom-up in AUTHORED ORDER. The author's order IS the stacking order and
    // is never silently rearranged — a reordered stack changes which series sits
    // on the stable baseline and therefore which one reads as the foundation.
    const lower = model.cats.map(() => 0);
    model.rows.forEach((row, s) => {
      const upper = model.cats.map((_, i) => lower[i] + (row[i] ? row[i].num : 0));
      const idxs = model.cats.map((_, i) => i);
      const yUp = (i) => y(upper[i]);
      const yLo = (i) => y(lower[i]);
      marks.push(`<path class="line-band" data-cat="${s}" data-anima-role="area" style="--i:${s}"`
        + ` fill="${fills.url(slots[s])}" d="${bandPath(idxs, axis, yUp, yLo, variant)}"/>`);
      marks.push(`<path class="line-path line-edge" data-cat="${s}" data-series="${s}" data-anima-role="line" style="--i:${s}"`
        + ` d="${variant === 'step' ? stepPath(idxs, axis, yUp) : linePath(idxs, axis.center, yUp)}"/>`);
      model.cats.forEach((_, i) => { lower[i] = upper[i]; });
    });
  } else {
    model.rows.forEach((row, s) => {
      const segs = segmentsOf(row);
      const yv = yAt(row);
      if (filled) {
        segs.forEach((idxs) => {
          if (idxs.length < 2) return;
          marks.push(`<path class="line-area" data-cat="${s}" data-anima-role="area" style="--i:${s}"`
            + ` fill="${fills.url(slots[s])}" d="${areaPath(idxs, axis, yv, baseY, variant)}"/>`);
        });
      }
      segs.forEach((idxs) => {
        // A one-point segment has no line to draw; it gets a dot regardless of
        // density, otherwise an isolated reading would vanish entirely.
        if (idxs.length < 2) {
          const i = idxs[0];
          const cx = variant === 'step' ? axis.center(i) : axis.center(i);
          dots.push(`<circle class="line-dot line-dot-lone" data-cat="${s}" data-anima-role="point"`
            + ` style="--i:${s}" cx="${num(cx)}" cy="${num(yv(i))}" r="${DOT_R}"/>`);
          return;
        }
        marks.push(`<path class="line-path" data-cat="${s}" data-series="${s}" data-anima-role="line" style="--i:${s}"`
          + ` d="${variant === 'step' ? stepPath(idxs, axis, yv) : linePath(idxs, axis.center, yv)}"/>`);
      });
      if (showDots) {
        row.forEach((p, i) => {
          if (!p) return;
          dots.push(`<circle class="line-dot" data-cat="${s}" data-anima-role="point" style="--i:${s}"`
            + ` cx="${num(axis.center(i))}" cy="${num(y(p.num))}" r="${DOT_R}"/>`);
        });
      }
    });
  }

  // ── direct labels ──
  //
  // A multi-series line chart is the best case in the whole family for direct
  // labeling. A legend asks the reader to hold a color in their head, travel to
  // a key, and come back; a name written at the end of its own line in that
  // line's own ink asks nothing. So this is tried FIRST and a legend is the
  // fallback, not the default (design/skills/chart-component.md: "direct
  // labeling beats a legend whenever it fits").
  //
  // Each label is a PAIR — the series name over its final value — and the pair
  // moves as one block, because splitting them would let de-collision put a
  // number under someone else's name.
  const labels = [];
  let legendRows = null;
  if (nCats && useDirect) {
    const anchorFor = (si) => {
      if (variant === 'stacked-area') {
        const lower = model.rows.slice(0, si)
          .reduce((a, r) => a + (r[nCats - 1] ? r[nCats - 1].num : 0), 0);
        const own = model.rows[si][nCats - 1] ? model.rows[si][nCats - 1].num : 0;
        // The band's MIDDLE, not its upper edge: the label names the band, and
        // an edge label would read as belonging to the boundary it sits on.
        return y(lower + own / 2);
      }
      const row = model.rows[si];
      let last = nCats - 1;
      while (last >= 0 && !row[last]) last -= 1;
      return last >= 0 ? y(row[last].num) : (plot.y0 + plot.y1) / 2;
    };

    const labX = plot.x1 + SERIES_GAP;
    const labW = right - SERIES_GAP - 2;
    // A named series takes the body register in its own ink; a lone unnamed
    // series (the flat shape) has nothing but its number, so that takes the
    // value register instead.
    const emit = (a, dy) => (a.name
      ? wrapSvgLabel(a.text, {
        x: labX, y: a.y + dy, width: labW, fontSize: FS.series,
        anchor: 'start', vAlign: 'middle', baseline: 'central',
        maxLines: withValues ? 1 : SERIES_MAX_LINES,
        className: 'cart-series line-series',
        attrs: ` data-cat="${a.s}" style="--i:${a.s}" data-anima-role="label"`,
        emitFontSize: false,
      })
      : wrapSvgLabel(a.text, {
        x: labX, y: a.y + dy, width: labW, fontSize: FS.value,
        anchor: 'start', vAlign: 'middle', baseline: 'central', maxLines: 1,
        className: 'cart-value line-endvalue',
        attrs: ' data-anima-role="label"', emitFontSize: false,
      }));

    const anchors = model.series.map((name, si) => ({
      s: si,
      name,
      text: name ? directTexts[si] : endValues[si],
      y: anchorFor(si),
    })).filter((a) => a.text);

    // `deCollideLabels` is greedy in the order it is given and slides every box
    // along ONE direction, so a top-down pass drives the stack toward the floor
    // and a bottom-up pass toward the ceiling. Run both and keep whichever
    // stays inside the box; if NEITHER does, direct labeling has genuinely run
    // out of room and the legend takes over.
    const run = (order, dir) => {
      const boxes = order.map((a) => ({ ...emit(a, 0), dir }));
      const shifts = deCollideLabels(boxes, { minGap: 2, maxShift: plot.h });
      const top = Math.min(...boxes.map((b, k) => b.top + shifts[k]));
      const bot = Math.max(...boxes.map((b, k) => b.bottom + shifts[k]));
      const overflow = Math.max(0, plot.y0 - 2 - top) + Math.max(0, bot - (view.h - 2));
      return { order, shifts, overflow };
    };
    const asc = [...anchors].sort((p, q) => p.y - q.y);
    const down = run(asc, 1);
    const up = run([...asc].reverse(), -1);
    const best = down.overflow <= up.overflow ? down : up;

    if (!namesClippedFinal && best.overflow <= 0.5) {
      best.order.forEach((a, k) => { labels.push(emit(a, best.shifts[k]).svg); });
    } else {
      // THE FALLBACK, and the two ways it is reached, both real:
      //   · a series name too long for the right column, which would otherwise
      //     be silently ellipsized — a name cut to `Channel Partne…` is worse
      //     than a key;
      //   · lines that end so close together that even after de-collision the
      //     block runs out of the viewBox.
      // A key costs the reader a lookup, so it is taken only here.
      return buildLine(model, ctx, { forceLegend: true });
    }
  } else if (nCats && !model.flat) {
    legendRows = model.series.map((name, si) => ({
      swatchFill: `var(--chart-cat-${slots[si]}-hue)`,
      cat: si,
      label: name,
      value: endValues[si] || null,
    }));
  }

  const defsInner = fills ? fills.defs : '';

  // Per-category hit target for the detail reveal — emitted ONLY where the
  // author wrote a nested detail bullet, so a chart without detail is
  // byte-identical to one that never had the feature.
  const hits = model.marks.map((m, i) => (m.detail
    ? `<rect class="line-hit" data-mark="${i}" x="${num(Math.max(plot.x0, axis.center(i) - axis.step / 2))}" y="${num(plot.y0)}"`
      + ` width="${num(Math.min(axis.step, plot.x1 - Math.max(plot.x0, axis.center(i) - axis.step / 2)))}" height="${num(plot.h)}"/>`
    : '')).join('');

  const body = chrome + marks.join('') + hits + dots.join('') + labels.join('');
  const desc = buildDesc(model, variant, totals);
  // ONE root emitter for the whole family (`buildSvgRoot`), so the viewBox,
  // `preserveAspectRatio` and `role="img"` contract cannot be dropped a piece
  // at a time across seven members.
  const svg = legendRows
    // The shared SVG-native key composes the diagram and the key into ONE
    // viewBox and hands back where to put the diagram. Its own `<desc>` is
    // dropped in favor of this kernel's, which carries the movement — a key
    // that only lists the series names is the weaker of the two.
    ? (() => {
      const lg = buildSvgLegend({
        rows: legendRows, diagramRight: view.w, diagramHeight: view.h,
        hasValues: legendRows.some((r) => r.value), orientation,
      });
      return buildSvgRoot({
        view: { w: lg.viewW, h: lg.viewH },
        className: 'cart-svg line-svg',
        title: TITLES[variant],
        desc,
        defs: defsInner + lg.defs,
        body: `<g transform="translate(${lg.diagramDx} ${lg.diagramDy})">${body}</g>${lg.body}`,
      });
    })()
    : buildSvgRoot({
      view, className: 'cart-svg line-svg', title: TITLES[variant], desc, defs: defsInner, body,
    });

  const detailWrap = markDetail.detailPayload(model.marks);
  const note = markDetail.detailNote(model.marks);
  return `<div class="line-figure" data-variant="${variant}" style="--line-count:${nSeries}">${svg}${detailWrap}</div>${note}`;
}

function transformSection(html, ctx) {
  return spliceFirstList(html, (ext) => {
    const model = parseLine(ext.inner);
    return model ? buildLine(model, ctx) : null;
  });
}

module.exports = {
  transformSection, parseLine, buildLine,
  variantOf, includeZeroFor, segmentsOf,
  DOT_MIN_SPACING, RIGHT_CAP, LEFT_MIN, LEFT_MAX,
};
