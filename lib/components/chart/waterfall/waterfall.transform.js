/**
 * waterfall chart kernel — the BRIDGE. "We got from A to B via these signed
 * contributions."
 *
 * Every other Cartesian member plots values against an axis. This one plots a
 * RUNNING TOTAL: each step bar floats, starting where the previous one ended,
 * so the geometry itself carries the arithmetic. That is the claim no other
 * member of the family can make (see
 * engineering/decisions/2026-09-06-cartesian-chart-expansion.md §2).
 *
 * THREE REGISTERS, and the whole design is in the split:
 *   · an INCREASE  — a floating bar that climbs, `--state-pass-*`
 *   · a DECREASE   — a floating bar that falls,  `--state-fail-*`
 *   · a TOTAL      — anchored to zero, drawn in the CANVAS'S OWN INK
 * (a fourth outcome, `flat`, is a step that netted to zero: a hairline, no hue.)
 * Color means something here, which it does nowhere else in the family's
 * Cartesian members. Everything else on the plot stays neutral so the one
 * semantic channel is unmistakable — and the direction is never carried by hue
 * ALONE: it is in the geometry, in the sign printed on the label, and in which
 * side of the bar that label sits on, so the walk still reads when a palette
 * strips the hue (themes/a11y-achromatopsia.css).
 *
 * Authoring — THE SIGN IS THE SYNTAX:
 *
 *   - Opening   `12.0M`     ← unsigned → a LEVEL, anchored to zero
 *   - Price      `+1.4M`    ← signed   → a STEP, floating
 *   - Volume     `-0.8M`
 *   - Closing   ` 9.8M`     ← unsigned → a LEVEL
 *
 * A value the author wrote a `+` or `-` on is a CHANGE; a value written bare is
 * a LEVEL. That is one sentence, it needs no second vocabulary, and it matches
 * how the numbers are said out loud ("price added one-four", "we closed at
 * nine-eight"). The first and last items are levels whatever their sign, so a
 * walk that closes in the red (`Closing \`-2.4M\``) still anchors. A second pill
 * overrides for the rare walk that opens on a step: `` `total` `` / `` `step` ``
 * (the family's two-pill convention — see progress.transform.js).
 *
 * Rejected: a bare-negative-only syntax (nothing distinguishes a level from a
 * rise, so every mid-walk subtotal needs a marker anyway), and a marker-pill-only
 * syntax (`` `+1.4M` `step` `` — the sign is already on the number; the second
 * pill restates it and doubles the width of every line in the source).
 *
 * §THE COMPRESSED WALK — the one variant, and why it is opt-in.
 *
 * A walk from 12.0M to 9.8M through steps of ±0.3M is this chart's
 * characteristic failure: two full-height anchors and five hairlines, with
 * two-thirds of the plot empty. The fix is a baseline at the walk's own floor,
 * and the fix is a LIE unless the reader is told — a truncated axis restates
 * every anchor's magnitude as whatever is left above the cut.
 *
 * So it is the author's call, not the chart's: `<!-- _class: waterfall zoom -->`
 * re-bases the value axis on the levels the running total actually visits and
 * draws each anchor with a TORN BOTTOM EDGE where it was cut. Auto-detecting it
 * was rejected — a chart that silently moves its own baseline when the numbers
 * get inconvenient is exactly the behavior the zero baseline exists to prevent,
 * and the compressed picture is often the finding ("the drivers are noise").
 *
 * The default answers the same case less drastically and honestly: the domain is
 * tightened to what the data needs rather than rounded out to a whole tick, and
 * a step too small to paint is floored to a visible sliver from its own base,
 * with the exact figure printed beside it either way.
 *
 * Pure string-in/string-out CommonJS — no fs, no DOM, no color (HARD RULE #3).
 * Paint lives in waterfall.styles.css; the axis furniture is the shared
 * _chart-family/cartesian.js substrate.
 */

const cart = require('../_chart-family/cartesian');
const markDetail = require('../_chart-family/mark-detail');
const { charBudget } = require('../_chart-family/svg-label');
const { parseTopLevelLis } = require('../../../core/html-lists');
const {
  escAttr, plainText, spliceFirstList, stripTrailingPills,
} = require('../_chart-family/transform-utils');

// The explicit type markers, as a SECOND inline-code pill. They exist for the
// two shapes the sign rule cannot express on its own: a walk that opens or
// closes on a step, and a mid-walk subtotal whose value the author wants stated
// as a level even though it reads like a delta.
const MARK_TOTAL = new Set(['total', 'subtotal', 'sum', 'level']);
const MARK_STEP = new Set(['step', 'delta', 'change']);

// Gutters. The family defaults with two overrides, both forced by this chart's
// composition rather than taste:
//   bottom 26 — a waterfall's category names are the steps of an argument
//     ("Price", "Volume", "Mix"), so they must not be culled; they get two
//     lines, which the family's 20 cannot hold (5 gap + 7.5 + 8.7 = 21.2).
//   top 15 — a step's delta label prints ABOVE the bar it names, so the tallest
//     bar in the walk needs headroom the family's 12 does not leave.
const GUTTER = { left: 32, right: 9, top: 15, bottom: 26 };

// Band padding. Wider bars than the family's 0.28 default: a waterfall reads as
// a chain of adjacent blocks, and a wide bar makes the connector between two of
// them SHORT, which is what makes the eye follow the bridge instead of the gap.
// `maxWidth` keeps a two-bar walk from painting two barn doors — the case the
// substrate added the cap for, and a documented waterfall shape ("two bars and
// nothing between them"). Without it each bar took about a third of the plot.
const BAND = { padInner: 0.3, padOuter: 0.1, maxWidth: 56 };

// The size the printed figures are wrapped to, in viewBox user units. It is NOT
// a free choice: `buildValueLabel` takes no font size and always wraps at the
// family's `FS.value`, so waterfall.styles.css must PAINT that same number or
// the kernel breaks lines to a width the glyphs do not occupy. Mirrored from the
// substrate rather than restated, and the mirror against the stylesheet is gated
// by test/unit/components/waterfall.test.js.
const FS = { value: cart.FS.value };

// The floor a step bar is drawn at, user units. A walk whose steps are 2% of
// its anchors is this chart's characteristic case (see the manifest's stressDoc)
// and a 0-unit rect paints NOTHING — the reader loses the step entirely, while
// the connector still jogs, which reads as a rendering fault. 1.5u is under 1%
// of the plot height, so the distortion is far below the reading precision of a
// bar chart, and the exact figure is printed on the label regardless.
const MIN_BAR = 1.5;

// Clear air between a bar edge and the figure printed against it, user units.
const LABEL_GAP = 2.5;

// The canvas one printed figure needs beyond the bar edge it hangs off: the gap,
// the glyphs, and air so the figure does not read as part of the axis. The air
// is 4 rather than 1 because a value-axis tick label is centered ON the plot
// floor and stands ~3.5 units above it — measured, `−4.2M` came out level with
// the `-2M` tick and read as another tick rather than as that bar's delta.
// `padDomain` reserves one unit MORE than this, so the domain padding always
// wins and a bar at the extreme keeps its label on the side it grew toward.
const LABEL_ROOM = FS.value + LABEL_GAP + 4;

// How much of its own BAND a category label may occupy, as a fraction of the
// band STEP — not of the bar WIDTH: the gap between two bars is empty canvas
// and a driver's name is welcome to lean into it, which buys ~40% more
// characters per line at seven bars.
//
// IT MUST LEAVE ROOM FOR THE CULL, and losing a driver's name is the one
// failure this chart cannot accept — a waterfall's category labels are the steps
// of an argument, not tick marks. `buildCategoryLabels` drops a label whose
// painted box would start before the previous surviving one ended plus a 1.5-unit
// gap, and consecutive band centers are exactly one step apart. So two labels
// that each paint the full budget cull each other at ANY budget of 1.0 or more
// (measured at 1.06: "Price", "Mix" and "Cost inflation" all vanished from the
// seven-bar walk). Reserving the gap plus a half-unit of float margin makes the
// worst case — every name painting its whole budget — still fit.
const CAT_GAP = 2;
const catWidthFor = (step) => step * Math.min(0.99, 1 - CAT_GAP / step);


// The TORN EDGE on a clipped anchor, user units: how far the teeth swing, and
// how many half-teeth span the bar.
const TEAR = { amp: 1.5, teeth: 8 };

/**
 * An anchor bar whose base is off the bottom of a zoomed domain, drawn with a
 * TORN BOTTOM EDGE.
 *
 * The tear is the whole licence for the `zoom` variant. A bar cut off flat at a
 * non-zero baseline states a magnitude it does not have, and the reader has no
 * way to know — that is the ordinary "truncated axis" lie. A ragged edge is the
 * conventional mark for "this continues past here", it costs no legend and no
 * caption, and it is drawn rather than typed (HARD RULE #29 bars a glyph doing
 * the job of a drawing, and this is exactly that job).
 *
 * One path, not a rect plus an overlay: the tear has to be part of the bar's own
 * outline or the stroke that carries the semantic color would run straight
 * across the bottom and undo it.
 */
function clippedBarPath(x, top, w, cut, edge = 'bottom') {
  const { amp, teeth } = TEAR;
  const seg = w / teeth;
  // TEAR THE EDGE THAT WAS ACTUALLY CUT. An anchor's true base is zero, and on
  // an ALL-NEGATIVE walk — a cost bridge, net debt, a cumulative loss, all
  // ordinary for this chart — zero is off the domain at the TOP. Tearing the
  // bottom there rips the edge that carries the data and draws the cut edge
  // flat, telling the reader the bar continues below the floor (it does not)
  // and that its top is a real value at the ceiling (it is not).
  if (edge === 'top') {
    const lo = cut + amp * 2;
    const pts = [`M ${cart.round2(x)} ${cart.round2(top)}`];
    for (let i = 1; i <= teeth; i++) {
      pts.push(`L ${cart.round2(x + seg * i)} ${cart.round2(i % 2 ? lo : cut)}`);
    }
    pts.push(`L ${cart.round2(x + w)} ${cart.round2(top)}`);
    return `${pts.join(' ')} Z`;
  }
  const hi = cut - amp * 2;
  const pts = [`M ${cart.round2(x)} ${cart.round2(top)}`,
    `L ${cart.round2(x + w)} ${cart.round2(top)}`,
    `L ${cart.round2(x + w)} ${cart.round2(hi)}`];
  for (let i = 1; i <= teeth; i++) {
    pts.push(`L ${cart.round2(x + w - seg * i)} ${cart.round2(i % 2 ? cut : hi)}`);
  }
  return `${pts.join(' ')} Z`;
}

/**
 * Ellipsize a category name's OVER-LONG WORDS before the family wraps it.
 *
 * `wrapLabelToLines` (svg-legend.js, under `buildCategoryLabels`) hard-splits
 * any word wider than one line — mid-character, with no ellipsis — and the
 * remainder starts the next line. On a nine-bar walk each band is about six
 * characters wide, so "Opening balance" came out as "Openin" over "g…": a
 * fragment that is not a word, followed by an orphan letter. That is worse than
 * a truncation, because a truncation at least tells the reader a truncation
 * happened.
 *
 * Truncating the WORD instead gives "Openi…", which is one honest token. It does
 * not conjure room that is not there — nine long driver names do not fit a
 * landscape plot and the manifest says so — it only makes the failure legible.
 * The budget comes from the substrate's own `charBudget` at the family's
 * category size, so this shortens exactly what the wrapper would have split and
 * nothing else.
 */
function fitCategoryLabels(labels, width) {
  const budget = charBudget(width, cart.FS.cat);
  return labels.map((label) => String(label).split(/\s+/)
    .map((w) => (w.length > budget ? `${w.slice(0, Math.max(1, budget - 1))}\u2026` : w))
    .join(' '));
}

/**
 * Widen the DOMAIN — not the tick list — until the extreme bars have canvas
 * above and below them for the figures printed against them.
 *
 * A bar whose top lands within a label's height of the plot ceiling has nowhere
 * to print its delta, and the placement pass answers by flipping the label to
 * the other side of the bar. That is the right fallback and the wrong DEFAULT:
 * it costs the "above means up" cue on the one bar with the biggest number, and
 * it lands the label next to the NEXT bar's, which is where the reader has to
 * work out which figure belongs to which. Measured on the cross-zero walk, where
 * `+3.1M` — the largest rise on the slide — flipped underneath its own bar.
 *
 * The domain grows, the TICKS DO NOT. Extending by a whole step would buy the
 * headroom at the cost of a fifth or sixth gridline, and the family's grid
 * budget is four (never more than five). A top tick that sits a little below the
 * plot ceiling is ordinary; a plot with six gridlines is not.
 *
 * The floor only grows when the walk actually goes negative. On an all-positive
 * walk the bottom of the plot IS zero, and pushing the domain below it would put
 * a negative gridline under a chart that never goes there — a worse lie than a
 * flipped label.
 */
function padDomain({ min, max }, model, plot) {
  const need = LABEL_ROOM + 1;
  const k = need / plot.h;
  let lo = min;
  let hi = max;
  // Solve (hi − dataMax) / (hi − lo) ≥ k for hi, twice, because moving one end
  // changes the span the other end is measured against.
  for (let i = 0; i < 2; i++) {
    hi = Math.max(model.max, (model.max - k * lo) / (1 - k));
    if (model.min < 0) lo = Math.min(model.min, (model.min - k * hi) / (1 - k));
  }
  // The domain is the REQUIREMENT, not the top tick. `niceTicks` rounds the
  // axis out to a whole step, and on a walk of 340→423 that step is 200, so the
  // domain ran to 600 and a third of the plot was reserved for a number the data
  // never approaches. Ticks that fall outside the tightened domain are dropped
  // by the caller — a plot whose top gridline sits below its ceiling is
  // ordinary; a plot two-thirds of which is headroom is not.
  return [Math.min(lo, min), hi];
}

/**
 * Parse the walk. Returns null when there is nothing to bridge.
 *
 * @param {string} ulInner  the <li> HTML of the section's first list
 * @returns {null|{rows:Array,affix:object,min:number,max:number,opening:number,
 *                 closing:number,arrivedAt:number,reconciles:boolean,net:number}}
 */
function parseWaterfall(ulInner) {
  const raw = [];
  for (const item of parseTopLevelLis(ulInner)) {
    // Detail comes off FIRST — it is the reveal payload, not part of the label.
    const { lead, detail } = markDetail.splitDetail(item);
    const { leadStripped, pills } = stripTrailingPills(lead.replace(/<\/?p>/g, '').trim());
    if (!pills.length) continue;
    const tail = pills[pills.length - 1].toLowerCase();
    const marker = MARK_TOTAL.has(tail) ? 'total' : MARK_STEP.has(tail) ? 'step' : '';
    const valueRaw = marker ? (pills.length > 1 ? pills[pills.length - 2] : null) : pills[pills.length - 1];
    if (valueRaw == null) continue;
    // THE SIGN IS THE SYNTAX, so asking whether the author wrote one is this
    // chart's central question — and there are FOUR ways to write it: `+1.4M`,
    // `-0.8M`, `−0.8M` (U+2212, what a paste out of Excel or a PDF carries) and
    // `($0.8M)` (the accounting parenthesis every finance system prints). This
    // kernel used to read the sign itself and knew only the first three, so an
    // accounting negative became a zero-anchored LEVEL that reset the running
    // total — the right figure on the wrong kind of bar, with nothing on the
    // slide to say the bridge was wrong. `signedValue` is the substrate's one
    // answer (HARD RULE #1); a member that re-derives it finds three of four.
    // DECODE the pill. markdown-it hands the kernel `&gt;100` for an authored
    // `` `>100` ``, and every sink downstream escapes again — so the slide, the
    // `data-value` and the `<desc>` all printed the literal `&amp;gt;100`. The
    // LABEL already went through `plainText`; the value did not.
    const valueText = plainText(String(valueRaw));
    const norm = valueText.replace(/\u2212/g, '-').trim();
    const { value: num, signed: explicit } = cart.signedValue(valueRaw);
    if (!Number.isFinite(num)) continue;
    // Strip the sign wherever `signedValue` found it, not only at index 0 —
    // otherwise `$-0.9M` keeps its minus and `fmtSigned` prepends a second one,
    // painting `−$-0.9M` on the slide and in the description.
    const bare = norm.replace(/^\(\s*/, '').replace(/\s*\)$/, '')
      .replace(/^([^\d]*?)[+-]\s*/, '$1').trim();
    raw.push({
      label: plainText(leadStripped), valueRaw: valueText, num,
      signed: explicit, marker, detail, bare,
    });
  }
  // One bar is not a bridge — it is a number. Two is the floor (open → close).
  if (raw.length < 2) return null;

  const n = raw.length;
  const rows = [];
  let running = 0;
  let arrivedAt = 0;
  const breaks = [];
  raw.forEach((r, i) => {
    // THE CLASSIFICATION, in one place. Explicit marker wins; then the first and
    // last item are levels whatever their sign (so a walk closing in the red
    // still anchors); then the sign decides.
    const kind = r.marker === 'step' ? 'step'
      : r.marker === 'total' ? 'total'
        : (i === 0 || i === n - 1) ? 'total'
          : r.signed ? 'step' : 'total';
    let start, end;
    if (kind === 'total') {
      // A level restates the running total, so the bar is anchored to zero and
      // the walk continues from the AUTHORED figure. `arrivedAt` remembers where
      // the steps actually landed, so a walk that does not reconcile is
      // detectable rather than silently papered over.
      // EVERY total is a reconciliation point. This used to record the arrival
      // level for the LAST row only, so a mid-walk subtotal could restate the
      // running total by any amount at all — 111 becomes 200, 89 units out of
      // nowhere — and `reconciles` still said true, with the `<desc>` reading
      // it out as a clean bridge. A `total` marker is documented FOR the
      // mid-walk subtotal, which made it an unchecked write.
      if (i > 0 && Math.abs(running - r.num) > Math.max(1e-9, Math.abs(r.num) * 1e-9)) {
        breaks.push({ label: r.label, arrived: running, restated: r.num });
      }
      if (i === n - 1) arrivedAt = running;
      start = 0; end = r.num; running = r.num;
    } else {
      start = running; end = running + r.num; running = end;
    }
    // `flat` is a real third outcome for a STEP, not a rounding of `up`. A
    // driver that netted to nothing is a finding — "churn and expansion
    // cancelled" — and painting it green because zero is not negative states
    // the opposite. It gets the neutral ink and no sign on its label.
    const dir = kind === 'total' ? 'total'
      : r.num < 0 ? 'down' : r.num > 0 ? 'up' : 'flat';
    rows.push({ ...r, kind, start, end, dir });
  });

  const edges = rows.flatMap((r) => [r.start, r.end]);
  // The WALK's own range — every level the running total actually visits, which
  // is not the same as the range of the drawn geometry: a total bar's base at
  // zero is a drawing convention, not a level the walk passed through. The
  // `zoom` baseline is derived from this, so a walk that never goes near zero
  // does not have zero forced into its domain by the anchors it is bracketed by.
  const visited = rows.flatMap((r) => (r.kind === 'total' ? [r.end] : [r.start, r.end]));
  // The affix is read off the UNSIGNED text: `parseAffix` rejects an explicit
  // `+`, so a signed series would otherwise lose the author's `$` from the axis.
  const affix = cart.affixOf(rows.map((r) => r.bare));
  const opening = rows[0].end;
  const closing = rows[n - 1].end;
  return {
    rows, affix,
    min: Math.min(...edges), max: Math.max(...edges),
    walkMin: Math.min(...visited), walkMax: Math.max(...visited),
    opening, closing, arrivedAt, breaks,
    // The CLOSING level the geometry actually reaches. A walk that ends on a
    // STEP closes wherever the steps landed, not on `rows[n-1].num` — which is
    // that step's delta. Reading the raw pill made the desc say "Bridge from
    // Opening 12.0M to Cost −0.8M" and report a net change with the wrong sign.
    closingDrawn: rows[n - 1].end,
    net: rows[n - 1].end - opening,
    // The geometric invariant this chart lives on: the steps must land on the
    // level every `total` restates — the closing one and every mid-walk
    // subtotal alike. Compared with a relative tolerance because 12.0 − 1.4 −
    // 0.8 is not exactly 9.8 in binary floating point.
    reconciles: breaks.length === 0
      && (rows[n - 1].kind !== 'total'
        || Math.abs(arrivedAt - closing) <= Math.max(1e-9, Math.abs(closing) * 1e-9)),
  };
}

/**
 * The label a bar prints.
 *
 * The AUTHOR'S OWN TEXT, always — `+1.4M` prints as `+1.4M`, `$0.8M` as
 * `−$0.8M`. The chart never re-formats a figure the author typed; it only
 * guarantees the SIGN is on it, because the sign is one of the three redundant
 * channels carrying direction (with the geometry and the hue) and a step whose
 * label contradicted its bar would be worse than no label.
 *
 * The minus is U+2212 MINUS SIGN, not a hyphen: it is the same width and height
 * as the `+` it pairs with, where a hyphen sits low and short beside tabular
 * figures. It is not a shape glyph under HARD RULE #29 — it is a mathematical
 * operator with a real place in the type family, not a character standing in for
 * a drawing.
 */
function fmtSigned(row) {
  if (row.kind === 'total') return row.valueRaw.replace(/-/g, '\u2212');
  const sign = row.num < 0 ? '\u2212' : row.num > 0 ? '+' : '';
  return `${sign}${row.bare}`;
}

function buildWaterfall(model, ctx = {}) {
  const { rows, affix } = model;
  const n = rows.length;
  const view = cart.viewFor(ctx.orientation);
  const plot = cart.plotBox({ view, gutter: GUTTER });
  // `zoom` — the author's opt-in to a baseline at the walk's own floor. See
  // §THE COMPRESSED WALK below.
  const zoom = (ctx.classTokens || []).includes('zoom');
  const axis = zoom
    ? cart.niceTicks(model.walkMin, model.walkMax, { target: 3, includeZero: false })
    : cart.niceTicks(model.min, model.max, { target: 4, includeZero: true });
  const { step } = axis;
  const [min, max] = padDomain(axis, zoom ? { min: model.walkMin, max: model.walkMax } : model, plot);
  const ticks = axis.ticks.filter((t) => t >= min - 1e-9 && t <= max + 1e-9);
  const y = cart.linearScale([min, max], [plot.y1, plot.y0]);
  const band = cart.bandScale(n, [plot.x0, plot.x1], BAND);

  // Only the two SEMANTIC registers wear the family's canonical wash. A total is
  // painted flat by the stylesheet — see waterfall.styles.css on why the anchor
  // is ground rather than a third gradient.
  const fills = cart.buildFillDefs({ kind: 'state', slots: ['pass', 'fail'], name: 'wf' });
  const slotOf = { up: 'pass', down: 'fail' };

  const parts = [];
  // Chrome first, so every mark paints OVER the grid — the grid stays behind the
  // data (the 10/10 bar's restraint line).
  parts.push(cart.buildGrid({ plot, ticks, scale: y, axis: 'y' }));
  // NOT unconditional. `buildAxisRule` draws at the plot EDGE, which is the zero
  // line only while every value is positive — the substrate's own docblock names
  // a waterfall as the counterexample. On a walk that dips below zero the real
  // zero rule sits mid-plot, and this painted a SECOND, heavier baseline at the
  // floor 40 user units below it, where the eye starts. `buildGrid` already
  // emits zero as `.cart-zero`; draw the edge rule only when it IS zero.
  if (model.min >= 0) parts.push(cart.buildAxisRule({ plot, axis: 'x' }));

  const bars = [];
  const connectors = [];
  const labels = [];

  rows.forEach((r, i) => {
    const x = band.start(i);
    const w = band.width;
    const yA = y(r.start);
    const yB = y(r.end);
    let top = Math.min(yA, yB);
    let h = Math.abs(yB - yA);
    // A zoomed baseline cuts the anchors off: their true base is zero, which is
    // off the domain. The rect is clipped to the plot floor and the cut is DRAWN
    // — see buildClippedBar.
    // BOTH sides. An anchor's true base is zero, and on an all-negative walk
    // zero is off the domain at the TOP, not the bottom — so testing only
    // `< min` left the bar drawn from y(0), 741 user units above a 180-unit
    // viewBox, cut dead flat by the SVG with no tear and no cue. Every cost,
    // spend, deficit and drawdown walk is negative-valued.
    const clippedLow = zoom && r.kind === 'total' && Math.min(r.start, r.end) < min;
    const clippedHigh = zoom && r.kind === 'total' && Math.max(r.start, r.end) > max;
    const clipped = clippedLow || clippedHigh;
    if (clippedLow) { h = plot.y1 - top; }
    if (clippedHigh) { const bottom = top + h; top = plot.y0; h = bottom - plot.y0; }
    if (r.kind === 'step' && r.num !== 0 && h < MIN_BAR) {
      // Grow from the START edge in the direction of travel, so the bar's base
      // stays on the level the previous bar handed it and only its tip moves.
      h = MIN_BAR;
      top = r.num < 0 ? yA : yA - MIN_BAR;
    }
    // `data-s` is the family's SEMANTIC hook (the attribute gantt, kanban and
    // progress carry, and the one the a11y/print texture rules key on). Its
    // values here are NOT from the frozen `CHART_STATUS` vocabulary, because a
    // waterfall's semantics are DIRECTION, not project status: `up` · `down` ·
    // `total`. Nothing else in the family means those three, so they cannot
    // collide with a status rule.
    const common = `class="waterfall-bar" data-mark="${i}" data-s="${r.dir}" data-anima-role="bar"` +
      ` data-label="${escAttr(r.label)}" data-value="${escAttr(r.valueRaw)}"` +
      `${slotOf[r.dir] ? ` fill="${fills.url(slotOf[r.dir])}"` : ''}`;
    // A zero step is a LINE, not a zero-height rect: SVG does not render a rect
    // of zero height at all, so the stroke that was supposed to mark the level
    // painted nothing and the step vanished from the chart while its label
    // stayed — the reader sees a figure hanging in space.
    bars.push(r.dir === 'flat'
      ? `<line ${common} x1="${cart.round2(x)}" y1="${cart.round2(yA)}"` +
        ` x2="${cart.round2(x + w)}" y2="${cart.round2(yA)}"/>`
      : clipped
        ? `<path ${common} data-clipped="1" d="${clippedHigh
            ? clippedBarPath(x, top + h, w, plot.y0, 'top')
            : clippedBarPath(x, top, w, plot.y1)}"/>`
        : `<rect ${common}` +
          ` x="${cart.round2(x)}" y="${cart.round2(top)}" width="${cart.round2(w)}"` +
          ` height="${cart.round2(h)}"/>`);

    // The CONNECTOR — what makes this a bridge rather than a row of floating
    // boxes. Drawn at the TRUE end level, never at the floored bar edge, so it
    // is the running total that is carried across the gap. Quiet by design:
    // gridline weight, dashed, behind nothing and in front of nothing that
    // matters.
    if (i < n - 1) {
      const yEnd = y(r.end);
      // Spans the GAP only — from this bar's right edge to the next bar's left
      // edge. Running it under both bars instead relied on the bars painting
      // over it, which holds until the next bar's top is BELOW the carried
      // level: on a two-bar walk from 12.0M to 9.8M the line then ran straight
      // across the closing bar's empty headroom and out to its right edge.
      connectors.push(
        `<line class="waterfall-connector" x1="${cart.round2(x + w)}" y1="${cart.round2(yEnd)}"` +
        ` x2="${cart.round2(band.start(i + 1))}" y2="${cart.round2(yEnd)}"/>`,
      );
    }

    // The DELTA label — printed on the side the bar GREW TOWARD, which makes
    // direction redundant with the geometry a third time (after the sign in the
    // text and the hue): a reader following a rising line of labels sees a
    // rising walk even in grayscale, where the a11y palettes strip the hue
    // entirely (themes/a11y-achromatopsia.css).
    //
    // It FLIPS to the other side rather than leaving the plot. A falling bar
    // whose bottom sits on the axis floor would print its label straight
    // through the category row — measured on the cross-zero stress case, where
    // `−4.2M` overprinted "Tax settle…". The flipped label still sits against
    // its own bar, so it is never mistaken for another bar's; the direction is
    // still carried by the sign and the geometry.
    const text = fmtSigned(r);
    const cx = x + w / 2;
    const yTop = Math.min(top, y(r.end));
    const yBot = Math.max(top + h, y(r.end));
    let below = r.dir === 'down';
    if (below && yBot + LABEL_ROOM > plot.y1) below = false;
    else if (!below && yTop - LABEL_ROOM < plot.y0) below = true;
    labels.push(cart.buildValueLabel(text, {
      x: cx,
      y: below ? yBot + LABEL_GAP : yTop - LABEL_GAP,
      anchor: 'middle',
      vAlign: below ? 'hanging' : 'bottom',
      // NEVER the band width. `buildValueLabel` ellipsizes past the width it
      // is given, and an ellipsized NUMBER is not a shortened label — it is a
      // different, well-formed, wrong number: `$2,000,000,000` painted as
      // `$2,000,000…` next to an axis reading `$2B`. A figure that crowds its
      // neighbor is visible and self-correcting; a figure that lies is not. So
      // the label is given the whole plot to sit in and is never truncated;
      // `dataShapeGuidance` steers an author with long unabbreviated figures to
      // fewer bars or an abbreviated unit.
      width: plot.w,
      className: r.kind === 'total' ? 'waterfall-total-value' : 'waterfall-delta',
      extra: ` data-s="${r.dir}"`,
    }));
  });

  parts.push(connectors.join(''), bars.join(''), labels.join(''));
  parts.push(cart.buildValueTicks({ plot, ticks, scale: y, step, affix, axis: 'y' }));
  const catWidth = catWidthFor(band.step);
  parts.push(cart.buildCategoryLabels({
    plot, labels: fitCategoryLabels(rows.map((r) => r.label), catWidth),
    center: (i) => band.center(i), width: catWidth, maxLines: 2, axis: 'x',
  }));

  const svg = cart.buildSvgRoot({
    view,
    className: 'cart-svg waterfall-svg',
    title: 'Waterfall chart',
    desc: buildDesc(model, cart.markFormatter({ ticks, step, affix })),
    defs: fills.defs,
    body: parts.join(''),
  });

  const detailWrap = markDetail.detailPayload(rows);
  const note = markDetail.detailNote(rows.map((r) => ({ label: r.label, valueRaw: r.valueRaw, detail: r.detail })));
  return `<div class="waterfall-figure">${svg}${detailWrap}</div>${note}`;
}

/**
 * `role="img"` prunes the whole subtree from the accessibility tree, so this
 * string is the ONLY route to the data for a screen reader.
 *
 * A waterfall exists to show HOW A RUNNING TOTAL MOVED, so listing the step
 * values alone would leave the one thing the chart is for unreachable — the same
 * mistake the funnel's desc made before it started carrying conversion rates.
 * Every step therefore names the level it ARRIVED AT, and the desc opens with
 * the net change, which is the takeaway a sighted reader gets from the two
 * anchor bars at a glance.
 */
function buildDesc(model, fmtIn) {
  const { rows } = model;
  // ONE formatter for the whole description, taken from the AXIS the reader is
  // looking at — so a level spoken aloud and the same level read off a gridline
  // are the same string. Deriving it per value is the `0 · 500k · 1M` defect
  // cartesian.js documents on `axisFormatter`, one surface over.
  // ONE formatter for the whole description, and it is the MARK formatter, not
  // the axis one. The axis's decimals come from its step — on a walk of 0.6M
  // steps against a 5M gridline that rounds every arrived-at level to the same
  // whole million and makes the description useless. `markFormatter` fixes the
  // unit from the axis, so a level spoken aloud and the same level read off a
  // gridline are the same string, and takes the PRECISION from the value.
  const fmt = fmtIn || (() => {
    const t = cart.niceTicks(model.min, model.max, { target: 4, includeZero: true });
    return cart.markFormatter({ ticks: t.ticks, step: t.step, affix: model.affix });
  })();
  // ONE minus sign in the whole description, and it is the same one the chart
  // paints. `axisFormatter` and an author's own pill both use an ASCII hyphen,
  // which a screen reader reads as "dash"; U+2212 is read as "minus". Mixing the
  // two in one sentence is worse than either.
  const minus = (t) => String(t).replace(/-(?=[\d.$£€])/g, '\u2212');
  const lvl = (v) => minus(fmt(v));
  // The DRAWN levels, not the raw pills. A walk that opens or closes on a STEP
  // has a delta in that pill, not a level, so reading it verbatim announced
  // "Bridge from Opening 12.0M to Cost −0.8M, a net change of −0.8M" for a walk
  // that closes at 12.6M — a sentence that contradicts itself, on the only
  // channel a screen reader has (`role="img"` prunes every <text>).
  const last = rows[rows.length - 1];
  // The AUTHOR'S OWN TEXT wherever the endpoint really is a level — that is the
  // contract `fmtSigned` states and the chart keeps everywhere else, and
  // re-formatting it dropped the significant figure the author chose (`12.0M`
  // became `12M`). Only when an endpoint is a STEP is its pill a delta rather
  // than a level, and only then is the computed level the honest thing to say.
  const endpoint = (r, drawn) => (r.kind === 'total' ? minus(r.valueRaw) : lvl(drawn));
  const head = `Bridge from ${rows[0].label} ${endpoint(rows[0], rows[0].end)} to ` +
    `${last.label} ${endpoint(last, model.closingDrawn)}, ` +
    `a net change of ${model.net >= 0 ? '+' : '\u2212'}${fmt(Math.abs(model.net))}`;
  // `;` joins, not `,` — a label may itself contain a comma ("Price, net of
  // rebate"), which makes a comma-joined list ambiguous read aloud.
  const body = rows.slice(1, -1)
    .map((r) => (r.kind === 'total'
      ? `${r.label} restates the total at ${minus(r.valueRaw)}`
      : `${r.label} ${fmtSigned(r)} to ${lvl(r.end)}`))
    .join('; ');
  const tail = model.reconciles ? ''
    : (model.breaks.length
      ? `; ${model.breaks.map((b) => `${b.label} restates the total at ${lvl(b.restated)} `
        + `where the steps landed on ${lvl(b.arrived)}`).join('; ')}, which does not reconcile`
      : `; the steps land on ${lvl(model.arrivedAt)}, which does not reconcile with the closing figure`);
  // PLAIN TEXT — `buildSvgRoot` owns the escaping, so escaping here would
  // double-escape an ampersand in a driver's name.
  return `${head}. ${body}${tail}`;
}

/** The chart-family entrypoint (see the `kernel` block in the manifest). */
function transformSection(html, ctx) {
  return spliceFirstList(html, (ext) => {
    const model = parseWaterfall(ext.inner);
    return model ? buildWaterfall(model, ctx || {}) : null;
  });
}

module.exports = {
  transformSection, parseWaterfall, buildWaterfall, buildDesc, fmtSigned,
  GUTTER, BAND, MIN_BAR, FS, catWidthFor,
};
