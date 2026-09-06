/**
 * bullet — Stephen Few's bullet graph: a measure bar against a target marker,
 * inside a qualitative range band. Chart-family member; kernel-as-module.
 *
 * THE CLAIM. "Actual against target, inside a qualitative band." That is a
 * different sentence from every neighbor: `progress` says "how far along" with
 * no target and no band; `bar` says "these categories differ in magnitude" with
 * no reference at all; `stats` says "here are some numbers". A board asks this
 * chart by name — are we on plan — and it is the densest honest answer: six
 * KPIs fit where six gauges would not.
 *
 * WHY SVG AND NOT `progress`'s BOXES. Three of the four marks in a row cannot be
 * an HTML box. The target marker is a hairline perpendicular tick whose position
 * is a VALUE on the row's scale; the bands are contiguous zones that tile that
 * same scale; the measure has to sit on top of both, sharing their coordinate
 * system exactly. `progress` gets away with `width: calc(--pct * 1%)` because it
 * has one mark and one implicit 0-100 domain. Here the domain is computed per
 * row (or shared across rows) and three marks read against it, so they belong in
 * one viewBox.
 *
 * Like every Cartesian member this consumes `_chart-family/cartesian.js` for the
 * plot box, the scales, the ticks and the painted chrome, and emits NO color —
 * marks carry classes, a `--i` categorical slot and a `--z` zone index; the
 * palette lives in bullet.styles.css (HARD RULE #3).
 *
 * ONE substrate emitter is deliberately NOT used: `buildFillDefs`. Its gradient
 * stops do not survive the CLI's PDF export faithfully, and the measure is the
 * one mark on this chart whose contrast has to hold in the exported artifact —
 * the measurement, and what is used instead, are on `.bullet-measure` in
 * bullet.styles.css.
 */

const {
  viewFor, plotBox, linearScale, bandScale, niceTicks,
  parseValue, parseAffix, isValuePill, markFormatter,
  buildGrid, buildValueTicks, buildAxisRule, buildSvgRoot,
  round2,
} = require('../_chart-family/cartesian');
const { wrapSvgLabel } = require('../_chart-family/svg-label');
const markDetail = require('../_chart-family/mark-detail');
const { parseTopLevelLis } = require('../../../core/html-lists');
const { plainText, escAttr, stripTrailingPills, spliceFirstList } = require('../_chart-family/transform-utils');

// Nominal label sizes in viewBox user units, MIRRORING bullet.styles.css. The
// kernel must know the same numbers to break lines to the width the glyphs
// really occupy; bullet.test.js reads the stylesheet and fails on drift.
const FS = Object.freeze({
  name: 7.5,    // the KPI name
  value: 8,     // the measure readout
  target: 6.5,  // the "vs 5.0M" line under it
});

// Row geometry, user units.
const ROW = Object.freeze({
  padInner: 0.10,   // share of a row's pitch left as the gap BETWEEN rows. Small,
                    // because the name line already separates one row from the
                    // next; the pitch is better spent on track height.
  padOuter: 0.04,
  measureR: 0.42,   // the measure bar's height as a share of the range track
  nameGap: 4.4,     // air between a row's name baseline and the top of its track
  trackMax: 15,     // ceiling on track height, user units. Portrait hands a row
                    // two-thirds more pitch than landscape; without a ceiling the
                    // track inflates into a slab and the chart stops looking like
                    // the same component in the two orientations.
  tickOver: 1.5,    // the target tick's overshoot past the track, user units.
                    // A fixed length, not a ratio: it has to clear the name line
                    // above it, and that clearance is a fixed number of units.
});

// The plot spans nearly the whole viewBox: the KPI name heads its own line, so
// there is no name column to reserve. That is the composition's whole argument —
// see § "Why the name is above the track" in bullet.styles.css.
const GUT = Object.freeze({ left: 6, right: 6, top: 6, bottom: 6, bottomAxis: 18 });

// The DERIVED qualitative range, as fractions of target — the INTERNAL cut
// points, so two of them make three zones. An author who types only a measure
// and a target still gets a real bullet graph, because the range a board
// actually means is "short of plan / nearly there / at or past plan", and 0.60
// and 0.85 are its conventional cut points.
//
// There is deliberately NO top cut point. The last zone runs to the top of the
// row's scale, which is Few's own spec and is also what keeps the track from
// stopping short of the plot edge and reading as a rail that ran out.
const BAND_FRACTIONS = Object.freeze([0.60, 0.85]);
// Past four zones a qualitative range stops being qualitative — it is a
// gradient, and a reader cannot name which zone a bar ended in.
const MAX_ZONES = 4;
// The headroom the scale keeps above the target when nothing overshoots it, so
// "at plan" sits INSIDE the last zone rather than on its edge.
const PLAN_HEADROOM = 1.15;

// Headroom above the largest thing a row has to show, so a bar that runs to the
// domain maximum still has visible track beyond its tip.
const HEADROOM = 1.06;

// Where an EXPLICIT band boundary is named. Deliberately a SMALL vocabulary:
// `parseSeries`'s family rule ("a nested item whose pill is a number is data")
// cannot tell a band boundary from a target from an ordinary detail bullet that
// happens to end in a number, and guessing silently plots the wrong thing.
const KEY_TARGET = /^(?:target|plan|goal)$/i;
const KEY_BAND = /^(?:band|range)$/i;
const KEY_ACTUAL = /^(?:actual|measure)$/i;
const KEY_FLOOR = /^(?:floor|base)$/i;

/**
 * Parse the KPI list.
 *
 * FLAT (the dense form — one line per KPI):
 *   - New ARR `4.2M` `5.0M`          ← measure, target; bands derived
 *
 * NESTED (the explicit form — when the qualitative ranges are real):
 *   - Uptime `99.4%`
 *     - Target `99.9%`                   ← overrides the second pill
 *     - Floor `99.0%`                    ← the scale starts here, not at zero
 *     - Band `99.5%`                     ← one internal cut point
 *     - Held through the June incident   ← no numeric pill → mark detail
 *
 * @returns {null|object} null when there is nothing to draw.
 */
function parseBullet(ulInner) {
  const items = parseTopLevelLis(ulInner);
  if (!items.length) return null;

  const rows = items.map((item) => {
    const { lead: rawLead, detail: detailInner } = markDetail.splitDetail(item);
    const lead = String(rawLead).replace(/<\/?p>/g, '').trim();
    const { leadStripped, pills } = stripTrailingPills(lead);
    const label = plainText(leadStripped);

    // `isValuePill` (the substrate's test), not "does parseValue return a
    // number": parseValue takes the first numeric run, so a ticket id `PROJ-42`
    // would parse as -42 and be plotted. A pill has to be WHOLLY a number.
    let measureRaw = isValuePill(pills[0]) ? pills[0] : null;
    let targetRaw = isValuePill(pills[1]) ? pills[1] : null;
    const bandRaw = [];
    let floorRaw = null;
    const detail = [];

    // The nested sublist carries BOTH structural values and mark detail. A child
    // is structural only when it is KEYWORD + numeric pill; everything else —
    // including a numeric pill under an unrecognized name — stays detail, so a
    // bullet that lists "Organic `60%`" as context never becomes a phantom band.
    for (const child of parseTopLevelLis(detailInner)) {
      const flat = String(child).replace(/<\/?p>/g, '').trim();
      const m = flat.match(/^([\s\S]*?)\s*<code>([^<]*)<\/code>\s*$/);
      const key = m ? plainText(m[1]).trim() : '';
      const raw = m ? m[2].trim() : '';
      const numeric = m != null && isValuePill(raw);
      if (numeric && KEY_TARGET.test(key)) targetRaw = raw;
      else if (numeric && KEY_BAND.test(key)) bandRaw.push(raw);
      else if (numeric && KEY_ACTUAL.test(key)) measureRaw = raw;
      else if (numeric && KEY_FLOOR.test(key)) floorRaw = raw;
      else detail.push(child);
    }

    const measure = measureRaw == null ? NaN : parseValue(measureRaw);
    const target = targetRaw == null ? NaN : parseValue(targetRaw);
    const bands = bandRaw.map(parseValue).filter(Number.isFinite).sort((a, b) => a - b);
    const floor = floorRaw == null ? 0 : parseValue(floorRaw);
    return {
      label,
      measureRaw, measure,
      targetRaw, target,
      bandRaw, bands,
      floorRaw, floor: Number.isFinite(floor) ? floor : 0,
      detail: detail.length ? detail.map((d) => `<li>${d}</li>`).join('') : '',
      affix: parseAffix(measureRaw) || { prefix: '', suffix: '' },
    };
  }).filter((r) => r.label || Number.isFinite(r.measure));

  const drawable = rows.filter((r) => Number.isFinite(r.measure));
  if (!drawable.length) return null;

  // ONE normalization constant for the whole chart, not one per row.
  //
  // When the rows do not share a value axis each is scaled to its own domain,
  // and the obvious choice — "as far as this row needs to go" — puts every
  // target marker at a DIFFERENT fraction of the track, which throws away the
  // one comparison a reader of mixed-unit KPIs can actually make. Scaling every
  // row to `K x its own target` instead lands every marker on the same x: the
  // plan becomes a straight line down the chart, each bar's tip is read against
  // it, and the derived zones line up into clean columns behind them. K is the
  // largest overshoot on the chart (never below the top of the derived band),
  // so the runaway row still fits and every other row is drawn to the same rule.
  const ratios = rows
    .filter((r) => Number.isFinite(r.measure) && Number.isFinite(r.target) && r.target > 0)
    .map((r) => ((r.measure - r.floor) / (r.target - r.floor)) * HEADROOM);
  const k = Math.max(PLAN_HEADROOM, ...ratios.filter((x) => Number.isFinite(x) && x > 0));
  for (const r of rows) {
    r.cuts = cutsFor(r);
    const cutTop = r.cuts.length ? r.cuts[r.cuts.length - 1] : r.floor;
    // `extent` is how far this row actually reaches on its OWN units; `domainTop`
    // is how far its normalized track runs. They differ, and the two axis modes
    // want different ones — see the axis block in buildBullet.
    r.extent = Math.max(
      Number.isFinite(r.measure) ? r.floor + (r.measure - r.floor) * HEADROOM : r.floor,
      Number.isFinite(r.target) ? r.floor + (r.target - r.floor) * HEADROOM : r.floor,
      cutTop,
    );
    const planTop = Number.isFinite(r.target) && r.target > r.floor
      ? r.floor + k * (r.target - r.floor)
      : r.extent;
    r.domainTop = Math.max(planTop, cutTop, r.floor + 1e-9);
  }

  // A row that declares a scale FLOOR cannot share an axis with one that starts
  // at zero — the two are not the same ruler — so one floored row puts the whole
  // chart on per-row scales.
  const floored = rows.some((r) => r.floor !== 0);
  return { rows, k, floored, shared: !floored && sharedDomain(rows) };
}

/**
 * The INTERNAL cut points of a row's qualitative range, ascending.
 *
 * N cuts make N+1 zones, because the last zone runs to the top of the row's
 * scale rather than stopping at a cut of its own. That is Few's spec, and it is
 * also what stops the range reading as a rail that ran out: a track whose
 * shading stops two thirds of the way across looks like a rendering fault, not
 * like a scale.
 */
function cutsFor(r) {
  const inner = r.bands.length
    ? r.bands.filter((b) => b > r.floor)
    : (Number.isFinite(r.target) && r.target > r.floor
      ? BAND_FRACTIONS.map((f) => round6(r.floor + f * (r.target - r.floor)))
      : []);
  return inner.slice(0, MAX_ZONES - 1);
}

function round6(n) {
  return Number(n.toFixed(6));
}

/**
 * Does ONE value axis honestly describe every row?
 *
 * Two conditions, and both are needed. (1) The rows agree on their AFFIX — a
 * `%` row and a `$M` row on one axis makes the axis a lie, and the affix is the
 * only thing in the DSL that says what a number is. (2) Their magnitudes are
 * within 4x — a shared axis is what a reader wants when the rows are comparable,
 * but "New ARR 5.0M" beside "Support cost 0.25M" compresses the second row into
 * an unreadable stub at the origin, which is the classic small-multiple failure
 * a bullet graph exists to avoid.
 *
 * Failing either, every row is normalized to its OWN domain — Few's original
 * design, where each bullet is a self-contained gauge — and no shared axis is
 * drawn, because there is none to draw.
 */
const MAGNITUDE_SPREAD = 4;

function sharedDomain(rows) {
  const live = rows.filter((r) => Number.isFinite(r.measure));
  if (live.length < 2) return false;
  const first = live[0].affix;
  if (!live.every((r) => r.affix.prefix === first.prefix && r.affix.suffix === first.suffix)) return false;
  const tops = live.map((r) => r.extent);
  return Math.max(...tops) <= Math.min(...tops) * MAGNITUDE_SPREAD;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function buildBullet(model, ctx = {}) {
  const { rows } = model;
  const tokens = ctx.classTokens || [];
  const shared = tokens.includes('own-axis') ? false
    : tokens.includes('shared-axis') ? true
      : model.shared;

  const view = viewFor(ctx.orientation);
  const plot = plotBox({ view, gutter: { ...GUT, bottom: shared ? GUT.bottomAxis : GUT.bottom } });
  const n = rows.length;
  // `maxWidth` caps the ROW BLOCK, not the pitch: three KPIs in a landscape
  // plot would otherwise take a third of the box each and paint three slabs.
  // Capped, the surplus goes to the gaps and `start(i)` re-centers each block,
  // so a portrait deck's roomier pitch spaces the rows out instead of inflating
  // every track — the chart looks like the same component in both boxes.
  const band = bandScale(n, [plot.y0, plot.y1], {
    padInner: ROW.padInner, padOuter: ROW.padOuter,
    maxWidth: FS.name + ROW.nameGap + ROW.trackMax,
  });

  // A row is NAME LINE + air + RANGE TRACK. The track takes whatever the capped
  // block has left after the name line.
  const trackH = Math.max(3, band.width - FS.name - ROW.nameGap);

  // The value axis. ONE domain over every row, ticks in the bottom gutter — and
  // only when the rows can honestly share it (see `sharedDomain`). Its extent is
  // each row's OWN reach, not the normalized `domainTop` the per-row mode uses:
  // scaling a shared axis to `k x the largest target` would pad the top of the
  // plot with empty track on every row at once.
  const axis = shared
    ? niceTicks(0, Math.max(...rows.map((r) => r.extent)), { target: 4, includeZero: true })
    : null;
  const affix = shared ? (rows.find((r) => Number.isFinite(r.measure)) || rows[0]).affix : null;
  const axisScale = axis ? linearScale([axis.min, axis.max], [plot.x0, plot.x1]) : null;

  // The values PRINTED on a row go through the substrate's `markFormatter`, not
  // out of the author's raw pill. One chart authored `900k` on one row and
  // `1.2M` on the next prints two magnitudes for one quantity, and a reader
  // re-scales their eye between the measure and the target it is being compared
  // with. Shared mode takes one formatter off the axis, so the whole chart
  // speaks one unit; per-row mode gives each row its own, because with mixed
  // units there IS no chart-wide unit — only a per-row one.
  // The per-row formatter takes its step from `niceTicks`, not from the row's
  // extent divided by four. `axisUnit` steps DOWN a magnitude rung whenever the
  // step would need more than two decimals under it, and a raw extent/4 almost
  // never lands on a round number — a 5.3M row stepping by 1.325M was billed as
  // needing three decimals under `M` and printed `$4200k` for a value the author
  // wrote as `$4.2M`. A nice step is what that gate was written against.
  const sharedFmt = axis ? markFormatter({ ticks: axis.ticks, step: axis.step, affix }) : null;
  const fmtFor = (r) => {
    if (sharedFmt) return sharedFmt;
    const t = niceTicks(r.floor, r.extent, { target: 4, includeZero: r.floor === 0 });
    return markFormatter({ ticks: t.ticks, step: t.step, affix: r.affix });
  };
  const scaleFor = (r) => axisScale || linearScale([r.floor, r.domainTop], [plot.x0, plot.x1]);

  const parts = [];

  if (axis) parts.push(buildGrid({ plot, ticks: axis.ticks, scale: axisScale, axis: 'x' }));

  rows.forEach((r, i) => {
    const nameY = band.start(i) + FS.name;
    const y = nameY + ROW.nameGap;
    const scale = scaleFor(r);

    // ── the qualitative range: contiguous zones, darkest at the origin. The
    // last one runs to the top of the row's scale (cutsFor), so the track never
    // stops short of the plot edge and read as a rail that ran out.
    const edges = r.cuts.length
      ? [...r.cuts, axis ? axis.max : r.domainTop]
      : [];
    let prev = r.floor;
    edges.forEach((edge, z) => {
      const xa = round2(Math.max(scale(prev), plot.x0));
      const xb = round2(Math.min(scale(edge), plot.x1));
      prev = edge;
      if (xb <= xa) return;
      parts.push(`<rect class="bullet-band bullet-zone-${z}" data-anima-role="region" data-zone="${z}"` +
        ` style="--z:${z}" x="${xa}" y="${round2(y)}" width="${round2(xb - xa)}" height="${round2(trackH)}"/>`);
    });

    // ── the measure. Sits ON the bands, centered in the track.
    if (Number.isFinite(r.measure)) {
      const mh = round2(trackH * ROW.measureR);
      const my = round2(y + (trackH - mh) / 2);
      const mx = round2(Math.max(plot.x0, Math.min(scale(r.measure), plot.x1)));
      const over = Number.isFinite(r.target) && r.measure > r.target;
      // `data-cat="0"` is the family's categorical-slot attribute (the shared
      // legend's swatches already carry it), so the a11y and print GRAYSCALE
      // textures hook a mark and its key entry with one rule. It does not
      // paint — the rendered PDF is byte-identical with and without it.
      parts.push(`<rect class="bullet-measure" data-mark="${i}" data-cat="0" data-anima-role="bar"` +
        ' style="--i:0"' +
        ` data-label="${esc(r.label)}"${r.measureRaw ? ` data-value="${escAttr(r.measureRaw)}"` : ''}` +
        `${over ? ' data-over="1"' : ''}` +
        ` x="${round2(plot.x0)}" y="${my}" width="${round2(Math.max(0, mx - plot.x0))}" height="${mh}"/>`);
    }

    // ── the scale FLOOR. A row that starts above zero has a bar whose LENGTH is
    // no longer proportional to its value, and nothing else on the row says so.
    // Few's answer — the qualitative range makes the scale explicit — is only
    // half of it, so the origin edge is drawn: a hairline the track visibly
    // starts against, which reads as "the scale begins here", not as zero.
    if (r.floor !== 0) {
      parts.push(`<line class="bullet-floor" data-marker="floor" x1="${round2(plot.x0)}"` +
        ` y1="${round2(y)}" x2="${round2(plot.x0)}" y2="${round2(y + trackH)}"/>`);
    }

    // ── the target: a PERPENDICULAR TICK, never a dot. A dot reads as a
    // datapoint on the same footing as the measure; a tick crossing the whole
    // track reads as the threshold the bar is measured against.
    //
    // The overshoot is BOUNDED BY THE CLEARANCE, not chosen freely: the name and
    // the readout sit on a baseline `nameGap` above the track, and a tick that
    // happens to land under a long name would otherwise strike straight through
    // it — which it did, through the `118%` readout, at seven rows.
    if (Number.isFinite(r.target) && r.target > r.floor) {
      const tx = round2(scale(r.target));
      const lift = Math.min(ROW.tickOver, ROW.nameGap - FS.name * 0.34);
      parts.push(`<line class="bullet-target" data-marker="target" data-anima-role="point"` +
        ` x1="${tx}" y1="${round2(y - lift)}" x2="${tx}" y2="${round2(y + trackH + lift)}"/>`);
    }

    // ── the readout, right-aligned on the name line: `4.2M vs 5.0M` reads as
    // one figure with its reference rather than as two numbers of equal rank.
    const fmt = fmtFor(r);
    let valueRight = plot.x1;
    if (r.targetRaw) {
      const planBox = wrapSvgLabel(`vs ${fmt(r.target)}`, {
        x: round2(plot.x1), y: round2(nameY), width: 46,
        fontSize: FS.target, anchor: 'end', vAlign: 'baseline', maxLines: 1,
        className: 'bullet-plan', attrs: ' data-anima-role="label"', emitFontSize: false,
      });
      parts.push(planBox.svg);
      valueRight = planBox.left - 2.5;
    }
    if (r.measureRaw) {
      const valueBox = wrapSvgLabel(fmt(r.measure), {
        x: round2(valueRight), y: round2(nameY), width: 46,
        fontSize: FS.value, anchor: 'end', vAlign: 'baseline', maxLines: 1,
        className: 'cart-value bullet-value', attrs: ' data-anima-role="label"',
        emitFontSize: false,
      });
      parts.push(valueBox.svg);
      valueRight = valueBox.left;
    }

    // ── the KPI name. Its own full line, so a real KPI name ("Net revenue
    // retention, enterprise segment") fits without wrapping or ellipsizing —
    // which a left-hand name column at this viewBox cannot do.
    if (r.label) {
      parts.push(wrapSvgLabel(r.label, {
        x: round2(plot.x0), y: round2(nameY), width: Math.max(20, valueRight - 4 - plot.x0),
        fontSize: FS.name, anchor: 'start', vAlign: 'baseline', maxLines: 1,
        className: 'cart-cat bullet-name', attrs: ' data-anima-role="label"',
        emitFontSize: false,
      }).svg);
    }
  });

  if (axis) {
    parts.push(buildAxisRule({ plot, axis: 'x' }));
    parts.push(buildValueTicks({
      plot, ticks: axis.ticks, scale: axisScale, step: axis.step, affix, axis: 'x',
    }));
  }

  // `role="img"` prunes the whole subtree, so this <desc> is the ONLY route a
  // screen reader has to the chart. It therefore carries the RELATIONSHIP the
  // chart is for — attainment against target — and not merely the two numbers:
  // a bullet graph exists to say whether the bar cleared the tick.
  const descText = rows.map((r) => {
    const fmt = fmtFor(r);
    const head = r.measureRaw ? `${r.label} ${fmt(r.measure)}` : r.label;
    if (!Number.isFinite(r.target) || !Number.isFinite(r.measure) || r.target <= 0) return head;
    const pct = Math.round((r.measure / r.target) * 100);
    const verdict = r.measure >= r.target ? 'at or above' : 'below';
    const base = r.floorRaw ? `, on a scale from ${fmt(r.floor)}` : '';
    return `${head}, ${pct}% of the ${fmt(r.target)} target — ${verdict} plan${base}`;
  }).filter(Boolean).join('; ');

  const svg = buildSvgRoot({
    view, className: 'bullet-svg cart-svg',
    title: 'Bullet graph — actual against target',
    desc: descText, body: parts.join(''),
  });

  const marks = rows.map((r) => ({ label: r.label, valueRaw: r.measureRaw, detail: r.detail }));
  const detailWrap = markDetail.detailPayload(marks);
  const note = markDetail.detailNote(marks);
  return `<div class="bullet-figure" style="--bullet-rows:${n}">${svg}${detailWrap}</div>${note}`;
}

/** The chart-family entrypoint (see the `kernel` block in bullet.manifest.json). */
function transformSection(html, ctx) {
  return spliceFirstList(html, (ext) => {
    const model = parseBullet(ext.inner);
    return model ? buildBullet(model, ctx || {}) : null;
  });
}

module.exports = {
  transformSection, parseBullet, buildBullet,
  FS, ROW, GUT, BAND_FRACTIONS, MAX_ZONES, PLAN_HEADROOM, HEADROOM, MAGNITUDE_SPREAD,
};
