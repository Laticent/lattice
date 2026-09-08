/**
 * stacked-bar chart kernel — the chart-family's DECOMPOSITION member.
 *
 * THE CLAIM. `piechart` decomposes ONE total; comparing two pies is the
 * anti-pattern its own manifest warns about. This member decomposes a total
 * ACROSS categories: revenue mix by quarter, cost mix by function, headcount by
 * team. The bar height is the total, the segment heights are the parts, and the
 * reader gets both reads out of one mark.
 *
 * Three compositions, all one kernel and one authoring shape:
 *   default        absolute stack — segment length IS the value, so the total
 *                  and the mix are both readable off the axis
 *   `share`        every bar normalized to 100 % — ONLY the mix is readable,
 *                  which is a different claim; the absolute total is printed
 *                  above the bar so normalization does not destroy it
 *   `row`          horizontal, for long category names
 *
 * WHY `share` AND NOT `100`. A CSS class token becomes a selector, and
 * `.stacked-bar.100` is not a valid one — a class starting with a digit has to
 * be written `.\31 00`. `share` also says what the variant CLAIMS rather than
 * what it computes.
 *
 * Everything Cartesian comes from the shared substrate (_chart-family/
 * cartesian.js): the viewBox, the plot box, the scales, the nice ticks, the
 * grid, the axis, the labels, and the canonical rectangular fill. This kernel
 * owns exactly three things the substrate cannot know: the STACK (cumulative
 * geometry in series order), the SEGMENT SEPARATION, and the label strategy.
 *
 * NO COLOR (HARD RULE #3): segments carry a class and `style="--i:N"`, and take
 * their paint from `buildFillDefs`, whose gradient stops name TOKENS.
 */

const cart = require('../_chart-family/cartesian');
const markDetail = require('../_chart-family/mark-detail');
const { buildSvgLegend } = require('../_chart-family/svg-legend');
const {
  wrapSvgLabel, measureLabel, deCollideLabels, upperAdvance, ADVANCE,
} = require('../_chart-family/svg-label');
const { spliceFirstList, escAttr } = require('../_chart-family/transform-utils');

// The categorical palette's perceptual cap (Wong 2011). Past it the substrate
// reports an overflow rather than dropping data, and this kernel CONSOLIDATES:
// see `foldModel`.
const CAP = 6;

// The label a consolidated tail wears. A stacked bar can absorb a long tail
// without lying — the total is preserved and only the naming is coarsened —
// which is why this member consolidates where a line chart could not.
const OTHER = 'Other';

// Gutters per composition. The substrate's GUTTER is the anchor; each entry
// only says where THIS composition needs more room and why.
const GUTTER = {
  // `top` carries the total printed above the tallest bar; `bottom` the
  // category row. The direct-label column is NOT a gutter — it sits OUTSIDE
  // the diagram box, past `plot.x1`, exactly where the shared legend's rail
  // goes, so no gridline ever runs through a series name.
  column: { left: 28, right: 10, top: 15, bottom: 22 },
  // `left` holds the category names (the whole point of `row`); `right` the
  // total printed past the end of the longest bar. `row` always keys, so it
  // reserves no name column — see `namesFit`.
  row: { left: 64, right: 30, top: 8, bottom: 20 },
};

// The direct-label column, user units — how wide a series name may run before
// it wraps. The gutter minus the air between the bar and the name.
const NAME_W = 68;

// The thickest a bar may be drawn, user units — column then row. `bandScale`
// spreads its slots over the whole axis, so a one-category chart takes 70 % of
// the plot for a single slab and a two-category chart is not much better. The
// cap is roughly the width a four-bar chart gives each bar, so a short chart
// looks like a short chart rather than a different component.
const MAX_BAR = { column: 56, row: 34 };

// Air between a mark and the value printed off it, user units.
const LABEL_GAP = 3;

function esc(s) {
  return escAttr(s);
}

/**
 * Parse the author's list into the stack model.
 *
 * Delegates the DSL entirely to `cartesian.parseSeries` — one authoring shape
 * for all seven Cartesian members — and then folds it into stack terms:
 * per-group segments in AUTHOR SERIES ORDER (never sorted per bar; a stack
 * whose order changes between bars cannot be read), a signed total, and the
 * consolidated tail.
 *
 * @returns {null|object} null when there is nothing to draw.
 */
function parseStackedBar(ulInner) {
  const base = cart.parseSeries(ulInner, { maxSeries: CAP });
  return base ? foldModel(base) : null;
}

function foldModel(base) {
  // FLAT input (no nested sublist) is a bar chart, not a stack — one part per
  // category is a decomposition of nothing. We still render it rather than
  // refusing the author: a single-segment stack is exactly a bar, and the
  // manifest steers to `bar`. The synthetic series name is the group's own
  // label-free "Total" so the legend does not invent a category.
  const flat = base.flat;

  // THE CAP, and why a stack may consolidate where other members may not.
  // `parseSeries` keeps the first 6 series and reports the rest. Cycling the
  // palette past 6 would put two identically-colored segments in ONE bar, which
  // is not "hard to read", it is wrong. Summing the tail into `Other` keeps the
  // total exact, keeps every value in the accessible description, and is what a
  // board deck does anyway. Five named + `Other` = six slots.
  const overflow = base.seriesOverflow || [];
  const named = overflow.length ? base.series.slice(0, CAP - 1) : base.series;
  const consolidated = overflow.length
    ? base.series.slice(CAP - 1).concat(overflow)
    : [];
  // DEDUPE. An author is told, by this component's own docs, to "fold slivers
  // into Other before authoring" — so `named` may ALREADY hold a series called
  // `Other`. Appending a second one gave that name two palette slots, and
  // `byName.get('Other')` handed the same number to both: six rects, two of
  // them identical, `Other` printed twice in the name column, and a bar total
  // 13% higher than the author's data. The consolidated tail folds into the
  // author's existing slot instead, which is where they put it.
  const series = flat
    ? ['Total']
    : (consolidated.length && !named.includes(OTHER) ? named.concat([OTHER]) : named);

  const groups = base.groups.map((g) => {
    const byName = new Map();
    const points = flat
      ? (Number.isFinite(g.num) ? [{ series: 'Total', raw: g.raw, num: g.num }] : [])
      : g.points;
    for (const p of points) {
      const key = consolidated.includes(p.series) ? OTHER : p.series;
      const prev = byName.get(key);
      // Two points naming the SAME series inside one group are summed rather
      // than fighting over one slot — the alternative is a second segment in the
      // same color, which reads as a rendering bug.
      byName.set(key, { num: (prev ? prev.num : 0) + p.num, raw: prev ? null : p.raw });
    }
    const segs = series
      .map((name, idx) => {
        const hit = byName.get(name);
        if (!hit || !Number.isFinite(hit.num)) return null;
        return { series: name, slot: idx + 1, num: hit.num, raw: hit.raw };
      })
      .filter(Boolean);
    const sum = segs.reduce((s, p) => s + p.num, 0);
    // An authored lead value (`- Q1 \`4.8\`` with nested parts under it) is kept
    // by the substrate as `total`. We print it INSTEAD of the sum only when it
    // agrees with the sum — printing a total the drawn bar does not equal is the
    // one thing a decomposition chart must never do.
    const authored = Number.isFinite(g.total) && sum !== 0
      && Math.abs(g.total - sum) / Math.abs(sum) < 0.005;
    // A group with an authored lead value and NO parts is a mixed-depth list —
    // "Q1-Q3 by product, Q4 as one forecast number". It cannot be drawn as a
    // stack, but the number is real and dropping it here made the accessible
    // description say "no data" about a figure the author typed.
    const bare = !segs.length && Number.isFinite(g.total);
    return {
      label: g.label,
      segs,
      sum,
      totalRaw: (authored || bare) ? (g.totalRaw || null) : null,
      leadNum: bare ? g.total : null,
      detail: g.detail?.length ? g.detail : null,
    };
  }).filter((g) => g.label || g.segs.length);

  if (!groups.length || !groups.some((g) => g.segs.length)) return null;

  return {
    groups,
    series,
    flat,
    consolidated,
    affix: base.affix,
    // The stack's domain is the SIGNED extent of the stacks, not of the points:
    // six 2s stack to 12, and an axis that stopped at 2 would clip every bar.
    posMax: Math.max(0, ...groups.map((g) => sumSide(g.segs, 1))),
    negMin: Math.min(0, ...groups.map((g) => sumSide(g.segs, -1))),
  };
}

/**
 * The tightest nice axis that still reads as one.
 *
 * `niceTicks(target)` snaps the step to the 1/2/2.5/5 ladder and then widens the
 * domain to whole steps, so the tick TARGET does not bound the overshoot: data
 * topping out at 40.2 asks for a step of 10.05, gets 20, and lands on an axis of
 * 0 · 20 · 40 · 60 — every bar drawn into two thirds of the plot with a third of
 * the height spent on a gridline nothing reaches.
 *
 * The fix is not a new tick generator (the substrate owns that) but a CHOICE
 * between the ones it already makes: ask for 3, 4 and 5 and keep the candidate
 * whose top tick sits closest above the data, breaking ties toward the family's
 * four-to-five lines. The cap of six TICKS is the family's "never more than
 * five" GRIDLINES — the zero rule is a separate mark, not a gridline.
 */
function tightTicks(min, max) {
  const span = Math.max(Math.abs(min), Math.abs(max)) || 1;
  let best = null;
  for (const target of [3, 4, 5]) {
    const t = cart.niceTicks(min, max, { target, includeZero: true });
    if (t.ticks.length > 6) continue;
    // There USED to be a 0.5 penalty on a 2.5-rung step here, on the stated
    // ground that `axisFormatter`'s `decimalsFor` returned 0 for any step at or
    // above 1, so `0 · 2.5M · 5M · 7.5M` printed as `$0 · $3M · $5M · $8M`.
    // `decimalsFor` now counts the decimals the step carries and that axis
    // prints correctly (`cartesian.test.js` pins it), so the penalty guarded
    // nothing and steered real charts into a worse axis: a series topping out
    // at 10.25 took 0 · 5 · 10 · 15 — 46% of the plot spent on headroom —
    // where 0 · 2.5 · … · 12.5 wastes 22%.
    // Overshoot as a fraction of the data's own extent, plus a small charge for
    // straying from four-to-five lines — so a tie between two equally tight
    // axes goes to the one whose gridlines actually help read a value.
    const waste = (t.max - max + (min - t.min)) / span
      + Math.abs(t.ticks.length - 5) * 0.02;
    if (!best || waste < best.waste) best = { t, waste };
  }
  return best ? best.t : cart.niceTicks(min, max, { target: 4, includeZero: true });
}

function sumSide(segs, sign) {
  return segs.reduce((s, p) => s + (Math.sign(p.num) === sign ? p.num : 0), 0);
}

/**
 * Per-group percentages for `share`, rounded so the PRINTED numbers sum to 100.
 *
 * Largest-remainder (Hamilton) apportionment: floor everything, then hand the
 * leftover units to the largest remainders. Plain per-segment rounding prints
 * 33 / 33 / 33 for a three-way split and a reader adds it to 99.
 *
 * The denominator is the sum of ABSOLUTE values, so a group carrying a negative
 * contribution still normalizes to a full bar; the negative part is drawn below
 * the zero rule at its own share.
 */
function sharePercents(segs) {
  const denom = segs.reduce((s, p) => s + Math.abs(p.num), 0);
  if (!denom) return segs.map(() => 0);
  const exact = segs.map((p) => (p.num / denom) * 100);
  const floors = exact.map((v) => (v < 0 ? Math.ceil(v) : Math.floor(v)));
  let left = Math.round(exact.reduce((s, v) => s + Math.abs(v), 0))
    - floors.reduce((s, v) => s + Math.abs(v), 0);
  const order = exact
    .map((v, i) => ({ i, rem: Math.abs(v) - Math.abs(floors[i]) }))
    .sort((a, b) => b.rem - a.rem);
  const out = floors.slice();
  for (let k = 0; left > 0 && k < order.length; k++, left--) {
    const i = order[k].i;
    out[i] += exact[i] < 0 ? -1 : 1;
  }
  return out;
}

/**
 * A printed percentage, with the same MINUS SIGN the axis uses.
 *
 * `buildValueTicks` goes out of its way to set U+2212 beside tabular figures;
 * a hyphen in the name column two centimeters away is the same chart speaking
 * two dialects. HARD RULE #29 does not reach this — U+2212 is a real character
 * in the type family, not a shape standing in for a drawing.
 */
function pctText(v) {
  return `${v < 0 ? `\u2212${Math.abs(v)}` : v}%`;
}

/** The exact (unrounded) share a segment occupies, for GEOMETRY. */
function shareFractions(segs) {
  const denom = segs.reduce((s, p) => s + Math.abs(p.num), 0);
  return denom ? segs.map((p) => (p.num / denom) * 100) : segs.map(() => 0);
}


function buildStackedBar(model, ctx = {}) {
  const tokens = ctx.classTokens || [];
  // `share` on a FLAT list normalizes one synthetic `Total` series to 100% per
  // bar — identical full-height bars, no key, and a description reading
  // "FY23 total 28.7: Total 100%". There is no mix to show, so the modifier is
  // ignored rather than obeyed into nonsense.
  const share = tokens.includes('share') && !model.flat;
  const row = tokens.includes('row');
  const view = cart.viewFor(ctx.orientation);

  // ── the value domain ──────────────────────────────────────────────────────
  // `share` normalizes every bar to 100, so the domain is fixed at the top and
  // only opens downward when a group carries a negative contribution.
  const groups = model.groups;
  const fracs = groups.map((g) => (share ? shareFractions(g.segs) : null));
  // GEOMETRY reads `fracs` (exact); every PRINTED percentage reads `pcts`
  // (largest-remainder). They were separate functions from the start and the
  // `share` path called neither for its labels — it rounded `fracs` at three
  // sites with two different roundings, so a three-way split printed 33/33/33
  // (the very thing `sharePercents` exists to prevent) and −12.5 printed as
  // −12 on the chart and −13 in the accessible description. One chart, two
  // numbers, and the reader who could not check them got the other one.
  const pcts = share ? groups.map((g) => sharePercents(g.segs)) : null;
  const domain = share
    ? [Math.min(0, ...fracs.map((f) => f.filter((v) => v < 0).reduce((s, v) => s + v, 0))), 100]
    : [model.negMin, model.posMax];
  const ticks = tightTicks(domain[0], domain[1]);

  // WHICH COMPOSITION, decided BEFORE the plot box is cut — the name column is
  // a gutter, so the chart cannot discover halfway through that it does not
  // need one and be left with 74 units of empty right margin.
  // A FLAT list has one synthetic series, so there is nothing to key: a column
  // reading `Total 40.2` beside a bar already captioned `40.2` is a legend for
  // a color the reader never has to identify. It renders as a plain bar chart
  // and the manifest steers the author to `bar`.
  const keyed = !model.flat;
  const named = keyed && !row && namesFit(model.series);
  const affix = share ? { prefix: '', suffix: '%' } : model.affix;
  // ONE formatter per magnitude (substrate `axisFormatter`): the unit is chosen
  // once from the widest tick, so a set of labels never reads `500k · 1M · 1.5M`.
  // `buildValueTicks` applies the same treatment to the axis itself.
  // The TOTAL is an absolute figure in BOTH compositions — in `share` it is the
  // number normalization destroyed — so it never wears the `%` axis affix. Its
  // magnitude is settled once over the real totals, for the same reason.
  const totTicks = share
    ? cart.niceTicks(model.negMin, model.posMax, { target: 4 })
    : ticks;
  // The shared MARK formatter, not the axis one: it fixes the magnitude from
  // the axis so the whole chart speaks one unit, and takes its precision from
  // the value, so a computed total keeps its significant figures instead of
  // being rounded to a gridline's. `$4.2M`, `240k`, `28.7`, `81`.
  const valueFmt = cart.markFormatter({
    ticks: totTicks.ticks, step: totTicks.step, affix: model.affix,
  });

  // THE ROW GUTTER IS SIZED TO THE TOTALS IT HAS TO PRINT. A fixed 30 units is
  // six characters at `FS.value`, and the categories slot explicitly invites an
  // authored total — `- FY23 `$1,234.5M`` printed `$1,23…`, a truncated NUMBER
  // on the chart's most-read caption, where a reader cannot tell thousands from
  // billions. Computed totals compact to six and never showed it, which is why
  // the gallery is clean.
  const totalTexts = groups
    .filter((g) => g.segs.length)
    .map((g) => String(g.totalRaw || valueFmt(g.sum)));
  const widestTotal = totalTexts.reduce(
    (w, t) => Math.max(w, t.length * cart.FS.value * ADVANCE), 0);
  const rowGutter = {
    ...GUTTER.row,
    right: Math.min(72, Math.max(GUTTER.row.right, Math.ceil(widestTotal) + LABEL_GAP + 2)),
  };
  const plot = cart.plotBox({ view, gutter: row ? rowGutter : GUTTER.column });
  // A vertical value axis maps the domain MAXIMUM to the TOP, so the range is
  // passed reversed; a horizontal one runs left to right.
  const vs = cart.linearScale([ticks.min, ticks.max], row ? [plot.x0, plot.x1] : [plot.y1, plot.y0]);
  const band = cart.bandScale(groups.length, row ? [plot.y0, plot.y1] : [plot.x0, plot.x1], {
    // Fat bars, small ends. A stack is READ INSIDE the bar, so width is
    // legibility here, not decoration — the thin bars of a first cut left the
    // 2 % parts a couple of units of area. The outer pad only has to keep the
    // first bar off the axis rule.
    padInner: 0.3, padOuter: 0.08, maxWidth: row ? MAX_BAR.row : MAX_BAR.column,
  });

  // ── chrome (substrate) ────────────────────────────────────────────────────
  const parts = [];
  parts.push(cart.buildGrid({ plot, ticks: ticks.ticks, scale: vs, axis: row ? 'x' : 'y' }));
  // Only while nothing is signed. `buildGrid` already draws the zero rule at
  // the real reference; adding the plot-edge rule under a negative segment
  // paints a second, false baseline. `bar` refuses the rule outright and
  // `waterfall` gates it the same way — the substrate's own docblock says so.
  const signed = share
    ? fracs.some((f) => f.some((v) => v < 0))
    : model.negMin < 0;
  if (!signed) parts.push(cart.buildAxisRule({ plot, axis: row ? 'y' : 'x' }));
  parts.push(cart.buildValueTicks({
    plot, ticks: ticks.ticks, scale: vs, step: ticks.step, affix, axis: row ? 'x' : 'y',
  }));
  parts.push(cart.buildCategoryLabels({
    plot,
    labels: groups.map((g) => g.label),
    center: (i) => band.center(i),
    width: row ? plot.gutter.left : band.step * 0.98,
    axis: row ? 'y' : 'x',
    maxLines: 2,
    // The substrate's default. This was 11 on the column axis, paying for an
    // ascender `buildCategoryLabels` did not leave room for — it asked for
    // `vAlign: 'top'`, which `wrapSvgLabel` does not know, so the value fell
    // through to `baseline` and the names rendered struck through. THAT IS
    // FIXED (`vAlign: 'hanging'`), and the compensation then double-counted,
    // pushing the second line of a wrapped name toward the bottom of the
    // viewBox where the SVG clips it.
    gap: 5,
    // REQUIRED on the vertical axis: without the band pitch the substrate culls
    // a colliding row label, and a dropped category name is invisible data loss.
    pitch: row ? band.step : 0,
  }));

  // ── the stack ─────────────────────────────────────────────────────────────
  // ONE cumulative pair per bar, walked in AUTHOR SERIES ORDER — never sorted
  // per bar. A stack whose order changes between bars cannot be compared
  // segment to segment, which is the entire read this chart exists for.
  // WHETHER THE TOTAL IS WORTH PRINTING. In the absolute stack it always is —
  // it IS the bar's height. Under `share` it is the number normalization threw
  // away, and it earns its place only when it VARIES: a deck whose parts are
  // already percentages gets six bars each captioned `100`, which is six
  // repetitions of what the axis already says.
  const totals = groups.map((g) => Math.abs(g.sum)).filter((v) => v > 0);
  const showTotals = !share || !totals.length
    || Math.max(...totals) / Math.min(...totals) > 1.01;

  const marks = [];
  const anchors = [];   // per group: the segment mid-points the names hang off
  groups.forEach((g, gi) => {
    const mine = [];
    anchors.push(mine);
    let up = 0;     // running total of the positive side
    let down = 0;   // running total of the negative side
    g.segs.forEach((seg, si) => {
      const v = share ? fracs[gi][si] : seg.num;
      // A zero-value part gets NO rect. A zero-height rect still paints its
      // separator stroke, which draws a hairline where there is no data.
      if (!v) return;
      const from = v > 0 ? up : down;
      const to = from + v;
      if (v > 0) up = to; else down = to;
      const a = vs(from);
      const b = vs(to);
      const lo = Math.min(a, b);
      const size = Math.abs(b - a);
      const x = row ? lo : band.start(gi);
      const y = row ? band.start(gi) : lo;
      const w = row ? size : band.width;
      const h = row ? band.width : size;
      // `si` is the index in the group's OWN seg list, carried rather than
      // re-derived: a zero-value part draws no rect, so this list is shorter
      // than `g.segs` and a positional lookup would read the wrong share.
      mine.push({
        series: seg.series, slot: seg.slot, si, raw: seg.raw, num: seg.num,
        mid: lo + size / 2, size,
      });
      marks.push(
        // `data-hue` is the mark contract's slot — 1-based, the same number the
        // family's slot table resolves to --mark-hue/--mark-ink/--mark-fill, and
        // the same one the legend stamps on its swatch. It replaced `data-cat`
        // (0-based) and the `--i` that rode alongside it for a CSS cycling idiom
        // no rule ever read. It does not paint, so the PDF is byte-identical.
        // slot-contract.md
        `<rect class="sbar-seg" data-mark="${gi}" data-hue="${seg.slot}" data-encodes="hue" data-paint="fill" data-anima-role="bar"` +
        ` data-label="${esc(`${g.label} · ${seg.series}`)}"` +
        ` data-value="${esc(seg.raw || valueFmt(seg.num))}"` +
        ` x="${cart.round2(x)}" y="${cart.round2(y)}"` +
        ` width="${cart.round2(w)}" height="${cart.round2(h)}"/>`,
      );
    });
    // THE TOTAL, printed on the canvas past the end of the bar. In `share` this
    // is the ABSOLUTE total — the number normalization destroys — so a reader
    // still knows that the Q4 mix sits on twice the revenue of Q1.
    const text = g.totalRaw || valueFmt(g.sum);
    if (g.segs.length && showTotals) {
      // WHICH END, and WHICH WAY OFF IT. An all-negative bar has no positive
      // side, so `Math.max(up, 0)` used to hand back the bar's FAR edge and the
      // offset then moved the label INTO the mark — heading ink over a
      // saturated fill, which is the one placement `buildValueLabel`'s own
      // docblock bans. And under `share` the caption was pinned to `vs(100)`
      // whatever the bar did, so a stack carrying a negative part printed its
      // number a fifth of the plot above its own top.
      // The POSITIVE end, always — the top of the positive stack, or the zero
      // line when there is none. A bar that hangs entirely below zero has its
      // far end down in the category-label row, so the canvas immediately
      // above its zero edge is the only clean place left, and it is still
      // adjacent to the mark it names.
      const end = vs(Math.max(up, 0));
      marks.push(cart.buildValueLabel(text, row
        ? {
          x: end + LABEL_GAP,
          y: band.center(gi),
          anchor: 'start',
          vAlign: 'middle',
          // The gutter is the RESERVED room, not the budget: nothing sits
          // outside it on this side, and an authored total the categories slot
          // explicitly invites (`- FY23 \`$1,234.5M\``) ellipsized to `$1,23…`
          // at six characters — a truncated NUMBER on the chart's most-read
          // caption, where a reader cannot tell thousands from billions.
          width: plot.gutter.right,
          className: 'cart-value sbar-total',
        }
        : {
          x: band.center(gi),
          y: end - LABEL_GAP,
          anchor: 'middle',
          vAlign: 'bottom',
          width: band.step,
          className: 'cart-value sbar-total',
        }));
    }
  });
  parts.push(marks.join(''));

  // ── naming the colors: DIRECT FIRST, a key only when it cannot fit ────────
  // "Direct labeling beats a legend whenever it fits" is the family's rule, and
  // a stacked bar has the one place it can go: the last bar's own segments are
  // already stacked down a column, so their names sit beside them at the height
  // of the band they name, in the band's own ink. Nothing to look up, and the
  // rail — 36 % of the unit's width on the legend version of this chart — comes
  // back to the plot.
  //
  // It does NOT always fit, and the fallback is not a defeat: a name too long
  // for the column would ellipsize (a key entry the reader cannot read), and
  // `row` has no free column at all — the segment axis is horizontal there, so
  // there is no consistent position beside a segment for any bar but the last.
  const direct = named ? nameColumn(groups, anchors, plot, share, pcts, valueFmt) : null;
  let svgW = direct ? Math.ceil(direct.right + 4) : view.w;
  let svgH = view.h;
  let bodyDx = 0;
  let bodyDy = 0;
  let defs = '';
  let keyBody = '';
  if (direct) {
    parts.push(direct.svg);
  } else if (keyed) {
    // The key carries the SAME reading the direct column does — the last bar's
    // own mix, under a heading naming it — so the two compositions differ in
    // placement, not in what the reader is told.
    const gi = lastPopulated(groups);
    const last = gi < 0 ? [] : groups[gi].segs;
    const readOf = (name) => {
      const si = last.findIndex((p) => p.series === name);
      if (si < 0) return null;
      return share ? pctText(pcts[gi][si]) : (last[si].raw || valueFmt(last[si].num));
    };
    const rows = (gi >= 0 && groups[gi].label ? [{ head: true, label: groups[gi].label }] : [])
      .concat(model.series.map((name, idx) => ({
        cat: idx,
        swatchFill: `var(--chart-cat-${idx + 1}-body)`,
        swatchStroke: `var(--chart-cat-${idx + 1}-ink)`,
        label: name,
        value: readOf(name),
      })));
    // `diagramRight` is the plot's own right edge, NOT the viewBox width. The
    // rail starts a fixed gap after whatever it is handed, so passing the full
    // 320 opened a dead column the width of the right gutter between the last
    // gridline and the spine.
    const key = buildSvgLegend({
      rows, diagramRight: plot.x1 + 4, diagramHeight: view.h, hasValues: true,
      orientation: ctx.orientation,
    });
    svgW = key.viewW; svgH = key.viewH;
    bodyDx = key.diagramDx; bodyDy = key.diagramDy;
    defs = key.defs; keyBody = key.body;
  }

  // The shared root carries the viewBox / preserveAspectRatio / role="img"
  // contract and escapes the title and desc, so this member cannot drop one of
  // them. The `view` it takes is the COMPOSED unit, which is wider than the
  // diagram box whenever a name column or a key was added.
  const svg = cart.buildSvgRoot({
    view: { w: svgW, h: svgH },
    className: 'cart-svg',
    title: 'Stacked bar chart',
    desc: buildDesc(model, share, valueFmt),
    defs,
    body: `<g transform="translate(${bodyDx} ${bodyDy})">${parts.join('')}</g>${keyBody}`,
  });

  const marksForDetail = groups.map((g) => ({
    label: g.label,
    valueRaw: g.totalRaw || null,
    // ESCAPED, like the sibling on the same substrate (`bar.transform.js`).
    // `parseSeries` builds `detail` with `plainText`, which DECODES `&lt;` — so
    // re-emitting it raw let an author's detail bullet carrying `</template>`
    // close the element and turn everything after it into live markup in a
    // same-origin preview frame (HARD RULE #22), while truncating the reveal
    // payload and the speaker note at the same point.
    detail: g.detail ? g.detail.map((d) => `<li>${escAttr(d)}</li>`).join('') : '',
  }));
  const payload = markDetail.detailPayload(marksForDetail);
  const note = markDetail.detailNote(marksForDetail);
  return `<div class="stacked-bar-figure">${svg}${payload}</div>${note}`;
}

/**
 * THE SEGMENT-VALUE PROBLEM, and where this chart landed on it.
 *
 * A reader wants each part's number where the part is, and the 10/10 bar
 * forbids the one place it would naturally go — never on the colored mark,
 * because contrast there is at the mercy of a narrow band. Three arrangements
 * were built and rendered before this one:
 *
 *   · a number in the gutter beside EVERY part, level with its middle. It
 *     works and it is honest, and on a real slide it is too much: three bars of
 *     three parts put twenty-four pieces of type on the canvas, and — measured
 *     — the numbers only fit at four categories or fewer, because the gutter
 *     between bars narrows as bars are added. Worse, inside the plot the
 *     gridlines run straight through them.
 *   · the total above each bar and nothing else, with a key off to the side.
 *     Clean, but the key eats a third of the unit's width and the reader gets
 *     no part values at all.
 *   · values on the largest part only — arbitrary from the reader's side: the
 *     part that happens to be biggest is not the part they came to read.
 *
 * What ships is the third read: the LAST bar's own parts, named and valued in
 * one column beside them, under a heading naming that bar. It is a key, a
 * direct label and a table at once — the name sits at the height of the band it
 * names and in that band's ink, so nothing is looked up; the number is the
 * current period's actual figure, which is the one a board asks for; and every
 * other bar is read off the axis, which is what an axis is for.
 *
 * Returns null when even one name would ellipsize inside the column — a
 * truncated key entry is worse than a key — and the caller builds the shared
 * legend instead, carrying the same reading.
 *
 * The rows are de-collided with the shared `deCollideLabels`, passed TOP TO
 * BOTTOM all pushing DOWN. That direction is not arbitrary: the pass is greedy
 * in the order it is given, so a uniform downward push preserves the stack's
 * own order and two names can never cross — which is worse than an overlap,
 * because a crossed pair names the wrong bands. The cluster is then lifted by
 * half its own drift so it stays optically centered on the bar rather than
 * sinking below it.
 *
 * Returns null when even one name cannot be set inside the column without
 * ellipsizing — a truncated key entry is worse than a key — and the caller then
 * builds the shared legend instead.
 *
 * The names are de-collided with the shared `deCollideLabels`, passed TOP TO
 * BOTTOM all pushing DOWN. That direction is not arbitrary: the pass is greedy
 * in the order it is given, so a uniform downward push preserves the stack's
 * own order and two names can never cross — which would be worse than an
 * overlap, because a crossed pair names the wrong bands. The cluster is then
 * lifted by half its own drift so it stays optically centered on the bar rather
 * than sinking below it.
 */
function namesFit(series) {
  return series.every((name) => {
    const m = measureLabel(name, { width: NAME_W, fontSize: cart.FS.series, maxLines: 2 });
    return !m.lines.some((l) => l.endsWith('…'));
  });
}

function nameColumn(groups, anchors, plot, share, pcts, valueFmt) {
  const gi = lastPopulated(groups);
  if (gi < 0) return null;
  const segs = anchors[gi];
  if (!segs.length) return null;

  // ONE x for every name, just past the plot's right edge — not hugging each
  // segment. Two reasons, both learned from a render. A ragged column reads as
  // scattered captions where a flush one reads as a key; and a label set INSIDE
  // the plot has gridlines running through it, which is a label on a mark
  // wearing different clothes.
  const x = plot.x1 + 5;
  const nameSpec = {
    width: NAME_W, fontSize: cart.FS.series, maxLines: 2,
    anchor: 'start', vAlign: 'middle', baseline: 'central', emitFontSize: false,
  };
  // TOP TO BOTTOM BY POSITION, not by reversing the series order. The two agree
  // only while every part is positive: a negative part is drawn BELOW the zero
  // rule, so its place in the stack is nothing like its place in the list, and
  // reversing put a signed chart's column heading in the middle of the column
  // and handed the de-collision pass a non-monotonic order to preserve.
  const order = segs.slice().sort((a, b) => a.mid - b.mid);
  const rows = order.map((sg) => ({
    sg,
    value: share ? pctText(pcts[gi][sg.si]) : (sg.raw || valueFmt(sg.num)),
    name: wrapSvgLabel(sg.series, { ...nameSpec, x, y: sg.mid }),
  }));
  if (rows.some((r) => r.name.lines.some((l) => l.endsWith('…')))) return null;

  const nameRight = rows.reduce((w, r) => Math.max(w, r.name.right), x);
  const valueRight = nameRight + 4
    + rows.reduce((w, r) => Math.max(w, r.value.length * cart.FS.tick * 0.62), 0);

  const shifts = deCollideLabels(
    rows.map((r) => ({
      left: r.name.left, right: valueRight, top: r.name.top, bottom: r.name.bottom, dir: 1,
    })),
    { minGap: 2, maxShift: 40 },
  );
  let lift = (shifts[shifts.length - 1] || 0) / 2;

  // THE HEADER IS AN OBSTACLE, not a caption that gets out of the way. It sits
  // just above the first row, and with six parts the topmost band is a 2%
  // sliver pinned to the plot's top edge — so `Q2 FY25` and `Other` printed on
  // top of each other, neither legible. The cluster is pushed DOWN by whatever
  // it takes to clear the header, which costs a couple of units of drift from
  // the bands and buys back two labels.
  const headLabel = groups[gi].label;
  const headY = headLabel
    ? cart.round2(Math.max(
      plot.y0 - 6,
      rows[0].sg.mid + shifts[0] - lift - cart.FS.series - 6))
    : null;
  if (headY != null) {
    // `buildAxisTitle` hangs from its y, so the header occupies
    // [headY, headY + FS.axisTitle] — not a box centered on it.
    const clear = headY + cart.FS.axisTitle + 3 + cart.FS.series * 0.5;
    const topY = rows[0].sg.mid + shifts[0] - lift;
    if (topY < clear) lift -= clear - topY;
  }

  const out = rows.map((r, i) => {
    const y = r.sg.mid + shifts[i] - lift;
    return wrapSvgLabel(r.sg.series, {
      ...nameSpec, x, y,
      className: 'cart-series sbar-name',
      attrs: ` data-hue="${r.sg.slot}" data-anima-role="label"`,
    }).svg + wrapSvgLabel(r.value, {
      x: valueRight, y, width: valueRight - nameRight, fontSize: cart.FS.tick,
      anchor: 'end', vAlign: 'middle', baseline: 'central', maxLines: 1,
      className: 'cart-tick sbar-part', attrs: ' data-anima-role="label"',
      emitFontSize: false,
    }).svg;
  });

  // THE COLUMN HEADER — the one line that keeps the numbers honest. Without it
  // a column of figures beside a chart of six bars reads as though it described
  // all six; it describes the LAST one. Naming that category over the column,
  // in the axis-caption register, ties the numbers to the bar they came from,
  // and the alignment of each row to its own band does the rest.
  // Set just above the FIRST row, not at the top of the plot: a caption pinned
  // to `plot.y0` floats away from the column it heads whenever the top part is
  // short, and on a real slide it drifted up next to the title rule and read as
  // slide furniture instead.
  const label = headLabel;
  // THE HEADER SETS ITS OWN WIDTH, and it has to be measured as what it will
  // actually be painted as: `.cart-axis-title` is uppercased and tracked at
  // 0.12em, so the flat advance the emitters default to under-counts it badly
  // and `Second category` came out as `SECOND…`. `upperAdvance` is the shared
  // per-glyph estimator built for exactly these tracked uppercase labels.
  // Nothing sits to the right of the header, so it may run past the value
  // column and simply widen the unit — capped, because a very long category
  // name should not stretch the whole chart to fit a caption that is also
  // printed under its own bar.
  const headW = label
    ? Math.min(NAME_W + 40, label.length * cart.FS.axisTitle * upperAdvance(label, { tracking: 0.12 }))
    : 0;
  const head = label
    ? cart.buildAxisTitle(label, { x, y: headY, anchor: 'start', width: headW + 1 })
    : '';

  return { svg: head + out.join(''), right: Math.max(valueRight, x + headW) };
}

/** The last group that actually drew something — the bar the names hang off. */
function lastPopulated(groups) {
  for (let i = groups.length - 1; i >= 0; i--) if (groups[i].segs.length) return i;
  return -1;
}

/**
 * The accessible description.
 *
 * `role="img"` PRUNES the whole SVG subtree, so every `<text>` above is
 * unreachable and this string is the only route to the data. A stacked bar is
 * for the MIX, so — following the funnel's standard, whose desc carries the
 * conversion rates rather than just the stage values — each part carries its
 * share of its own total, not only its value.
 */
function buildDesc(model, share, valueFmt) {
  const lines = model.groups.map((g) => {
    // A MIXED-DEPTH list — some groups broken into parts, one written as a
    // plain number ("Q1-Q3 by product, Q4 as one forecast") — leaves a group
    // with an authored total and no parts. It draws no bar, which is the right
    // refusal for a decomposition chart, but "no data" was a lie about a number
    // the author typed. Say what is there and why it is not drawn.
    if (!g.segs.length) {
      const lead = g.totalRaw || (Number.isFinite(g.leadNum) ? valueFmt(g.leadNum) : null);
      return lead ? `${g.label} ${lead}, not broken out` : `${g.label} — no data`;
    }
    const pcts = sharePercents(g.segs);
    const parts = g.segs.map((s, si) => {
      const val = share ? pctText(pcts[si]) : (s.raw || valueFmt(s.num));
      return share ? `${s.series} ${val}` : `${s.series} ${val} (${pcts[si]}%)`;
    });
    const total = g.totalRaw || valueFmt(g.sum);
    return `${g.label} total ${total}: ${parts.join(', ')}`;
  });
  // The FOLDED names. Past six series the tail is summed into `Other`, and
  // both the docs and this file's own comment promised the consolidated names
  // reach the accessible description — the one promise attached to the one
  // string that is the only route to the data, and it was the one that failed.
  const folded = model.consolidated?.length
    ? ` ${OTHER} folds ${model.consolidated.join(', ')}.`
    : '';
  // Returned as TEXT: `buildSvgRoot` owns the element and the escaping.
  return `Stacked bars — ${lines.join('; ')}.${folded}`;
}

/** The chart-family entrypoint (see the `kernel` block in the manifest). */
function transformSection(html, ctx) {
  return spliceFirstList(html, (ext) => {
    const model = parseStackedBar(ext.inner);
    return model ? buildStackedBar(model, ctx) : null;
  });
}

module.exports = {
  transformSection, parseStackedBar, buildStackedBar,
  sharePercents, shareFractions, GUTTER, CAP, OTHER,
};
