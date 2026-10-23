/**
 * ep-curve chart kernel — an exceedance-probability curve: the loss to expect
 * once every N years, with the return period across on a log scale and the loss
 * up a linear axis from zero. It answers the reinsurance buyer's question, "how
 * big a loss should we plan for once a century?", and it is the curve a program
 * is priced from.
 *
 * Shape (chart-family.docs.md § How a chart is written):
 *   `[{Return period, 10..250}, {Loss}]`
 *
 *   ## A 1-in-100 year costs $410M.
 *
 *   - OEP
 *     - `{10, $120M}`
 *     - `{100, $410M}`
 *   - AEP
 *     - `{10, $150M}`
 *
 * Each point is the family's point record, x first: `{return period, loss}`, read
 * by the model the narrator shares (lib/core/ep-curve-model.js). A series is a
 * top-level item with its points nested under it; a flat list of points is one
 * unnamed curve. Up to four curves (OEP and AEP, gross and net).
 *
 * THE RETURN-PERIOD AXIS IS ALWAYS LOG (cartesian.js § logScale). Return periods
 * run from 1-in-2 to 1-in-1,000 and the interesting ones are multiples of each
 * other; on a linear axis 1-in-10, 1-in-25 and 1-in-50 crowd into the first
 * twentieth of the plot. `log` in the axis line is accepted and changes nothing.
 * The axis is labeled at the return periods the author wrote, `1-in-100`.
 *
 * The kernel emits no color (HARD RULE #3): every curve and dot carries
 * `data-hue`, and ep-curve.styles.css paints it from the family's slot table.
 */

const markDetail = require('../_chart-family/mark-detail');
const cart = require('../_chart-family/cartesian');
const layer = require('../_chart-family/callout-layer');
const { readListLead, spliceFirstList, escAttr } = require('../_chart-family/transform-utils');
const { wrapSvgLabel, measureLabel } = require('../_chart-family/svg-label');
const { parseTopLevelLis } = require('../../../core/html-lists');
const { liftBracketSpans, axisAcceptor } = require('../../../core/lift-bracket-span');
const { parseBracketList } = require('../../../core/bracket-list');
const { readAxisMember } = require('../../../core/axis-member');
const AXIS_CATALOG = require('../../../core/axis-catalog.generated.js');
const { readEpPoint, rpLabel, orderPoints } = require('../../../core/ep-curve-model');

// Nominal sizes in viewBox user units, MIRRORING the cartesian chrome these marks
// reuse (`.cart-tick`, `.cart-value`, `.cart-series`).
const FS = { tick: cart.FS.tick, value: cart.FS.value, series: cart.FS.series };
const MAX_SERIES = 4;
const DOT_R = 2.2;
// The label face's width a glyph and the air between two labels, as `thinEvenly` measures them.
const TICK_ADVANCE = 0.62;
const TICK_GAP = 5;

/**
 * Parse the curve list: a flat list of points is one unnamed curve, and a
 * top-level item with points nested under it is a named curve. Returns null when
 * nothing would draw, so the dispatcher leaves the section untouched.
 */
function parseEpCurve(ulInner) {
  const flat = [];
  const series = [];
  for (const item of parseTopLevelLis(ulInner)) {
    const { lead, detail } = markDetail.splitDetail(item);
    const { label, pills } = readListLead(lead);
    const own = pills.length ? readEpPoint(pills[pills.length - 1]) : null;
    if (own) {
      flat.push(own);
      continue;
    }
    if (!label || !detail) continue;
    const points = [];
    for (const child of parseTopLevelLis(detail)) {
      const { pills: cp } = readListLead(markDetail.splitDetail(child).lead);
      const pt = cp.length ? readEpPoint(cp[cp.length - 1]) : null;
      if (pt) points.push(pt);
    }
    if (points.length) series.push({ name: label, points: orderPoints(points) });
  }
  // A flat list is the one curve; named curves follow it, and past four the
  // rest are left out (the narrator leaves out the same ones).
  const all = (flat.length ? [{ name: '', points: orderPoints(flat) }] : []).concat(series).slice(0, MAX_SERIES);
  return all.length ? { series: all } : null;
}

/** Which return-period labels print: powers of ten first, then the rest, none touching. */
function keepQuoted(rps, xs, texts) {
  const w = (i) => texts[i].length * FS.tick * TICK_ADVANCE;
  const decade = (rp) => Number.isInteger(Math.log10(rp));
  const order = rps.map((_, i) => i).sort((a, b) => Number(!decade(rps[a].rp)) - Number(!decade(rps[b].rp)) || a - b);
  const placed = [];
  const keep = rps.map(() => false);
  for (const i of order) {
    if (placed.every((j) => Math.abs(xs[i] - xs[j]) >= (w(i) + w(j)) / 2 + TICK_GAP)) {
      keep[i] = true;
      placed.push(i);
    }
  }
  return keep;
}

/** The axis line above the heading: the return-period axis, then the loss axis. */
function readAxes(html) {
  const decl = AXIS_CATALOG['ep-curve'];
  if (!decl) throw new Error('ep-curve: no axisSet entry — run build-stage-catalog.');
  const lifted = liftBracketSpans(html, {
    below: decl.keyBelow !== false, bodyTags: decl.bodyTags, acceptAbove: axisAcceptor(decl, { maxParts: 4 }),
  });
  const members = lifted.above ? parseBracketList(lifted.above, { maxParts: 4 }) : null;
  return {
    x: readAxisMember(members?.[0], { scales: true }),
    y: readAxisMember(members?.[1]),
    html: lifted.html,
  };
}

const EMPTY_AXIS = { name: '', range: null, threshold: null, scale: 'log', ignored: [] };

function buildEpCurve(model, ctx = {}, axes = {}) {
  const { series } = model;
  const ax = axes.x || EMPTY_AXIS;
  const ay = axes.y || EMPTY_AXIS;
  const view = cart.viewFor(ctx.orientation, ctx.paneView);
  const all = series.flatMap((s) => s.points);
  const named = series.some((s) => s.name);

  // The loss axis: from zero (or the lowest loss, if one is negative) to a nice
  // ceiling, its ticks in the author's own affix.
  const lossMax = Math.max(...all.map((p) => p.loss), ay.range ? ay.range.max : 0);
  const lossMin = Math.min(0, ...all.map((p) => p.loss));
  const t = cart.niceTicks(lossMin, lossMax, { target: 4, includeZero: true });
  const affix = cart.affixOf(all.map((p) => p.lossRaw));
  const left = cart.tickGutter({ ticks: t.ticks, step: t.step, affix }) + (ay.name ? 13 : 0);
  // A named curve's name sits at its right end, so the plot leaves room for it.
  // Up to a quarter of the view; a longer name wraps onto a second line.
  const right = named ? Math.min(view.w * 0.25, 8 + Math.max(...series.map((s) => s.name.length)) * FS.series * 0.6) : 12;
  const plot = cart.plotBox({ view, gutter: { left, right, top: 12, bottom: 30 } });

  // The return-period axis, always log. One point still needs a span, so it
  // gets a factor of two either side.
  let lo = Math.min(...all.map((p) => p.rp));
  let hi = Math.max(...all.map((p) => p.rp));
  if (ax.range && ax.range.min >= 1) { lo = Math.min(lo, ax.range.min); hi = Math.max(hi, ax.range.max); }
  if (hi <= lo) { lo /= 2; hi *= 2; }
  const x = cart.logScale([lo, hi], [plot.x0, plot.x1]);
  const y = cart.linearScale([t.min, t.max], [plot.y1, plot.y0]);

  const parts = [];
  parts.push(cart.buildGrid({ plot, ticks: t.ticks, scale: y }));
  parts.push(cart.buildValueTicks({ plot, ticks: t.ticks, scale: y, step: t.step, affix }));
  // The axis rule is the plot's bottom edge, which is zero only when no loss is
  // negative; below zero the grid's own zero rule (`.cart-zero`) is the baseline,
  // and a second rule at the edge would read as a false one (cartesian.js § buildAxisRule).
  if (t.min >= 0) parts.push(cart.buildAxisRule({ plot }));

  // The return periods the author wrote, each once, labeled `1-in-N`. When the
  // labels would touch, the ones a market quotes win the room: the powers of ten
  // first (1-in-10, 1-in-100, 1-in-1,000), then the rest in order, each placed
  // only where it clears every label already placed. Even thinning dropped
  // 1-in-100, the one number every EP slide is about.
  const rps = orderPoints(all);
  const rpX = rps.map((p) => x(p.rp));
  const rpText = rps.map(rpLabel);
  const keep = keepQuoted(rps, rpX, rpText);
  rps.forEach((p, i) => {
    parts.push(`<line class="cart-grid ep-rp-grid" x1="${cart.round2(rpX[i])}" y1="${cart.round2(plot.y0)}" x2="${cart.round2(rpX[i])}" y2="${cart.round2(plot.y1)}"/>`);
    if (keep[i]) {
      parts.push(`<text class="cart-tick ep-rp" x="${cart.round2(rpX[i])}" y="${cart.round2(plot.y1 + 8)}" text-anchor="middle">${escAttr(rpText[i])}</text>`);
    }
  });

  // The curves, then the dots over them. Each dot names its return period and
  // says its loss, the way `line` names a category: the narration reads a curve
  // point by point ("1-in-100, $410M"), and the Guide finds the dot whose return
  // period opens the sentence and whose loss it says.
  const lines = [];
  const dots = [];
  const values = [];
  const valueBoxes = [];
  const ends = [];
  const dotList = []; // every dot, for a callout to name: its mark index, name, curve and place
  let k = 0;
  series.forEach((s, si) => {
    const hue = si + 1;
    const pts = s.points.map((p) => ({ p, px: x(p.rp), py: y(p.loss) }));
    const d = pts.map((q, i) => `${i ? 'L' : 'M'}${cart.round2(q.px)} ${cart.round2(q.py)}`).join(' ');
    const label = s.name ? ` data-label="${escAttr(s.name)}"` : '';
    lines.push(`<path class="ep-path" data-hue="${hue}" data-series="${si}" data-anima-role="line"${label} d="${d}"/>`);
    pts.forEach((q) => {
      dotList.push({ k, label: rpLabel(q.p), rp: q.p.rp, series: s.name || '', si, x: q.px, y: q.py, lossRaw: q.p.lossRaw, near: pts });
      dots.push(`<circle class="ep-dot" data-mark="${k}" data-hue="${hue}" data-series="${si}" data-encodes="hue" data-paint="fill"` +
        ` data-anima-role="point" data-label="${escAttr(rpLabel(q.p))}" data-value="${escAttr(q.p.lossRaw)}"` +
        ` cx="${cart.round2(q.px)}" cy="${cart.round2(q.py)}" r="${DOT_R}"/>`);
      // One curve prints its losses over the dots; two or more leave them to the
      // ticks, the hover card and the narration, because labels from two curves
      // at one return period stack on each other.
      if (series.length === 1) {
        // Up and to the LEFT of its dot: the curve climbs to the right, so the
        // segment leaving a dot runs through the space above it and to its right.
        // The first dot has the axis on its left, so its label hangs below and to
        // the right, under the climbing segment.
        const first = q === pts[0];
        valueBoxes.push(first
          ? layer.textBox({ x: q.px + DOT_R + 1, y: q.py + DOT_R + FS.value + 2, text: q.p.lossRaw, fontSize: FS.value, anchor: 'start', vAlign: 'bottom' })
          : layer.textBox({ x: q.px - DOT_R - 1, y: q.py - DOT_R - 1, text: q.p.lossRaw, fontSize: FS.value, anchor: 'end', vAlign: 'bottom' }));
        values.push(cart.buildValueLabel(q.p.lossRaw, first
          ? { x: q.px + DOT_R + 1, y: q.py + DOT_R + FS.value + 2, anchor: 'start', width: 40, extra: ` data-mark-for="${k}"` }
          : { x: q.px - DOT_R - 1, y: q.py - DOT_R - 1, anchor: 'end', width: 40, extra: ` data-mark-for="${k}"` }));
      }
      k++;
    });
    if (s.name) ends.push({ name: s.name, hue, si, x: pts[pts.length - 1].px, y: pts[pts.length - 1].py });
  });
  parts.push(lines.join(''), dots.join(''), values.join(''));

  // Each curve's name at its right end, wrapped to two lines inside the gutter and
  // nudged apart so two names never touch: a name drawn past the frame was cut off
  // in portrait.
  const nameW = Math.max(16, view.w - (plot.x1 + DOT_R + 3) - 2);
  const laid = ends.sort((a, b) => a.y - b.y).map((e) => ({
    e, m: measureLabel(e.name, { width: nameW, fontSize: FS.series, maxLines: 2 }),
  }));
  for (let i = 1; i < laid.length; i++) {
    const prev = laid[i - 1];
    const gap = ((prev.m.lines.length + laid[i].m.lines.length) / 2) * FS.series * 1.16 + 1;
    laid[i].e.y = Math.max(laid[i].e.y, prev.e.y + gap);
  }
  for (const { e } of laid) {
    parts.push(wrapSvgLabel(e.name, {
      x: e.x + DOT_R + 3, y: e.y, width: nameW, fontSize: FS.series, anchor: 'start', vAlign: 'middle',
      maxLines: 2, baseline: 'central', className: 'cart-series ep-series', emitFontSize: false,
      // `data-series-for`, as `line` writes it: `data-series` would make the name one of the curve's shapes.
      attrs: ` data-hue="${e.hue}" data-series-for="${e.si}"`,
    }).svg);
  }

  parts.push(cart.buildAxisTitle(ax.name || 'Return period', { x: (plot.x0 + plot.x1) / 2, y: view.h - 10, width: plot.w }));
  if (ay.name) {
    parts.push(cart.buildAxisTitle(ay.name, { x: 5, y: (plot.y0 + plot.y1) / 2, width: plot.h, rotate: -90 }));
  }

  // AUTHORED CALLOUTS (callout-layer.js): a note names a point on a curve by its return period
  // (`for=1-in-100`, or `1-in-100/Gross` where several curves share one); it is ringed and marked, and
  // its words sit beside the chart or under it, whichever leaves the plot larger.
  const co = ctx.callouts
    ? { res: layer.resolve(ctx.callouts.legends, { off: ctx.callouts.off, find: dotTarget(dotList) }) }
    : null;
  let size = view;
  if (co?.res.callouts.length) {
    const avoid = [
      ...layer.gutterBoxes(plot),
      ...valueBoxes.map((b) => layer.pad(b, 0.5)),
      ...co.res.callouts.flatMap((e) => e.near || []),
    ];
    const won = layer.placeUnkeyed({ ctx, view, plot, res: co.res, avoid });
    parts.push(won.svg);
    size = { w: won.w, h: won.h };
  }
  const svg = cart.buildSvgRoot({
    view: size,
    className: 'ep-curve-svg',
    title: 'Exceedance probability curve',
    desc: buildDesc(model) + (co ? layer.describe(co.res, (i) => dotList[i].label, { kind: 'point' }) : ''),
    body: parts.join(''),
  });
  // A callout's detail rides on the dot it names: the card and the speaker note, as on the other charts.
  const marks = dotList.map((d) => ({ label: d.label, valueRaw: d.lossRaw, detail: '' }));
  const payload = co ? layer.mergeDetail(marks, co.res, escAttr) : marks;
  return `<div class="ep-curve-figure">${svg}${markDetail.detailPayload(payload)}</div>${markDetail.detailNote(payload)}`;
}

/** Tie a callout's `for=` to a dot: its return period as printed (`1-in-100`) or as a number (`100`), after a
 *  slash the curve's name, or its mark index. A curve's first dot answers a bare period. */
function dotTarget(dots) {
  const norm = (v) => String(v).toLowerCase().replace(/\s+/g, ' ').trim();
  return (target) => {
    const t = String(target ?? '').trim();
    let hit = null;
    if (/^\d+$/.test(t) && !dots.some((d) => String(d.rp) === t)) hit = dots[Number(t)] || null;
    else {
      const cut = t.lastIndexOf('/');
      const [rp, name] = cut > 0 ? [t.slice(0, cut), t.slice(cut + 1)] : [t, null];
      hit = dots.find((d) => (norm(d.label) === norm(rp) || String(d.rp) === rp.trim()) && (name === null || norm(d.series) === norm(name))) || null;
    }
    if (!hit) return null;
    const at = hit.near.findIndex((q) => q.px === hit.x && q.py === hit.y);
    const near = [hit.near[at - 1], hit.near[at + 1]].filter(Boolean)
      .flatMap((q) => layer.lineBoxes({ x: hit.x, y: hit.y }, { x: q.px, y: q.py }));
    return { mark: hit.k, box: { cx: hit.x, cy: hit.y, w: DOT_R * 2, h: DOT_R * 2, pin: 'beside' }, near };
  };
}

/** The read a sighted viewer gets: each curve, point by point. */
function buildDesc(model) {
  const curves = model.series.map((s) => {
    const pts = s.points.map((p) => `${rpLabel(p)} ${p.lossRaw}`).join(', ');
    return s.name ? `${s.name}: ${pts}` : pts;
  });
  return `Exceedance probability curve, return period across on a log scale, loss up. ${curves.join('; ')}.`;
}

/** The chart-family entrypoint (see the `kernel` block in ep-curve.manifest.json). */
function transformSection(html, ctx) {
  return layer.around(html, ctx, (h, lifted) => {
    const axes = readAxes(h);
    let built = false;
    const out = spliceFirstList(axes.html, (ext) => {
      const model = parseEpCurve(ext.inner);
      if (!model) return null;
      built = true;
      return buildEpCurve(model, lifted ? { ...ctx, callouts: lifted } : ctx, axes);
    });
    return built ? out : h;
  });
}

module.exports = { transformSection, parseEpCurve, buildEpCurve, buildDesc, readAxes, FS, MAX_SERIES };
