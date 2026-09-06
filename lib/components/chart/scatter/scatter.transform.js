/**
 * Scatter chart — kernel for the `scatter` chart-family member.
 *
 * THE CLAIM: *these two measures are related.* Both axes carry real numbers,
 * real ticks and a real unit, so a reader can take a value off the chart and
 * see the shape of the relationship at the same time.
 *
 * WHY THIS IS NOT `quadrant`. The family already scatters dots, and the
 * difference is the SCALE, not the geometry. A quadrant scores entities on a
 * unitless 2x2: it paints four named zones, prints only the two axis extremes,
 * draws no tick ladder and no grid, and its reading is categorical — WHICH BOX
 * is this in. A scatter prints a nice-number tick ladder on both axes, carries
 * the author's own affix onto them (`$0M / $2M / $4M`), and its reading is
 * continuous — HOW MUCH, and does one measure track the other. Ask "which
 * quadrant?" and you want `quadrant`; ask "what is the relationship, and what
 * are the numbers?" and you want this.
 *
 * Pure string-in/string-out CommonJS: no fs, no DOM, no color (HARD RULE #3).
 * The plot substrate is `_chart-family/cartesian.js` — ticks, scales, the plot
 * box, the grid, the axis rule, the tick labels and the axis captions all come
 * from there, so a scatter slide and a bar slide share one visual language.
 */

const {
  spliceFirstList, escAttr, plainText, stripTrailingPills,
} = require('../_chart-family/transform-utils');
const { parseTopLevelLis } = require('../../../core/html-lists');
const cart = require('../_chart-family/cartesian');
const { placeLabels, wrapSvgLabel } = require('../_chart-family/svg-label');
const { buildSpine } = require('../_chart-family/svg-legend');
const markDetail = require('../_chart-family/mark-detail');

const SCATTER_MODIFIERS = ['bubble', 'trend'];

// Nominal label sizes in viewBox user units, MIRRORING scatter.styles.css.
// CSS owns what is painted; the kernel needs the same numbers to break lines
// and place labels against the width the glyphs really occupy.
// scatter.test.js reads the stylesheet and fails when the two drift.
const FS = Object.freeze({
  point: 7.5,   // .scatter-label — an entity name beside its dot
  size: 6.5,    // .scatter-size-value — a bubble's third measure, in the key
});

// The width one point name may claim, in user units.
const LABEL_W = 54;
// Three, matching the quadrant's finding for the same label at the same job: a
// realistic entity name needs three lines at this width, and capping at two
// ellipsized text that had room to render. Past three the block stands far
// enough from its dot that the association starts to break down.
const LABEL_MAX_LINES = 3;

// Dot radii, user units.
const DOT_R = 3.8;
const BUBBLE = Object.freeze({ rMin: 2.6, rMax: 12 });

// Gutters. Wider on the left and bottom than the family default because BOTH
// axes carry a caption here — an unlabeled axis makes a scatter unreadable in
// a way it does not make a bar chart unreadable, so the captions are mandatory
// and the room for them is reserved, not borrowed.
const GUTTER = Object.freeze({ left: 36, right: 14, top: 10, bottom: 24 });

// Under `bubble` the right gutter widens to carry the size key. A bubble chart
// without one asks the reader to compare areas with no reference, which is the
// encoding's known weakness, not an acceptable cost.
const KEY_RAIL = 44;

// A least-squares line under this many points is not a trend, it is a line
// drawn through a cloud — the fit is nearly interpolation and the reader is
// invited to believe a relationship the data cannot support. `scatter trend`
// below the floor renders as a plain scatter rather than as a false claim.
const TREND_MIN_POINTS = 5;

// ── Source parsing ─────────────────────────────────────────────────────────

/**
 * Parse the point list.
 *
 * A POINT IS A SHAPE THE SUBSTRATE'S DSL CANNOT EXPRESS, which is why this is
 * the one thing the kernel parses itself. `parseSeries` reads ONE trailing pill
 * per item: a value per category (flat) or a value per series within a category
 * (nested). A scatter point is two or three numbers that belong to ONE entity
 * and to DIFFERENT axes, each with its own unit — there is no category to hang
 * them on. The nested shape can be bent to fit (`- Atlas` / `- Cost `$4.2M`` /
 * `- Adoption `62%``) and was built and rendered against this one; it lost on
 * the markdown source, which is the only place the two differ. Three lines and
 * two repeated axis names per entity turn a six-row table into nineteen lines
 * where no column can be scanned. Everything else — `parseValue`, `affixOf`,
 * the ticks, the scales, the chrome — is the substrate's.
 *
 * So the lead carries the numbers as consecutive value pills:
 *
 *     - Atlas `$4.2M` `62%`
 *     - Borealis `$2.1M` `38%` `140`      <- the third pill sizes a bubble
 *       - Renewed early, twice            <- detail (a nested sublist)
 */
function parseScatter(ulInner) {
  const items = parseTopLevelLis(ulInner);
  if (!items.length) return null;
  const points = [];
  for (const item of items) {
    const { lead, detail } = markDetail.splitDetail(item);
    const { leadStripped, pills } = stripTrailingPills(String(lead).replace(/<\/?p>/g, '').trim());
    // The coordinates are the maximal NUMERIC suffix of the pill run, not the
    // first two pills. `isValuePill` is the family's data-vs-prose test, and it
    // is stricter than "does this parse as a number": `parseValue` reads the
    // first numeric run, so a ticket id `PROJ-42` or a code name `Q3-2024`
    // parses as −42 and −2024 and would drag the axis to meet it. Anything
    // ahead of the numeric run is prose the author pilled — a region, a code —
    // so it goes back on the label instead of being thrown away.
    let first = pills.length;
    while (first > 0 && cart.isValuePill(pills[first - 1])) first -= 1;
    const nums = pills.slice(first);
    if (nums.length < 2) continue;
    const [xRaw, yRaw, sizeRaw = ''] = nums;
    const x = cart.parseValue(xRaw);
    const y = cart.parseValue(yRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({
      label: [plainText(leadStripped), ...pills.slice(0, first)]
        .map((t) => String(t).trim()).filter(Boolean).join(' '),
      x, y,
      size: sizeRaw ? cart.parseValue(sizeRaw) : NaN,
      xRaw, yRaw, sizeRaw,
      detail,
    });
  }
  if (!points.length) return null;
  points.forEach((p, i) => { p.mark = i; });
  return {
    points,
    xAffix: cart.affixOf(points.map((p) => p.xRaw)),
    yAffix: cart.affixOf(points.map((p) => p.yRaw)),
    hasSize: points.some((p) => Number.isFinite(p.size)),
  };
}

/**
 * The two axis captions, authored as TWO inline-code spans in one paragraph —
 * x first, then y. This is `matrix-grid`'s precedent, and it is here for the
 * same reason: an axis NAME is not an eyebrow. It is a part of the chart, it
 * belongs inside the plot next to the axis it names, and printing it twice —
 * once as a masthead eyebrow and once on the axis — is the defect. So the
 * paragraph is CONSUMED.
 *
 * Two codes is the discriminator: a ONE-code paragraph is the ordinary chart
 * eyebrow and is left completely alone, so a slide can carry both.
 */
// EVERY run here is bounded by a character it cannot contain. A tag body holds
// no `<` or `>`, and `markdown-it` escapes the text inside `<code>`, so it holds
// no `<` either. The first cut used `[^>]*` and `[\s\S]*?` — three lazy any-char
// runs chained behind literal prefixes, which backtracks polynomially on author
// markdown, and author markdown is exactly the uncontrolled input a deck brings
// (CodeQL js/polynomial-redos; the same class it raised on this branch's tests).
const AXIS_PARA_RE =
  /<p[^<>]*>\s*<code[^<>]*>([^<]*)<\/code>\s*<code[^<>]*>([^<]*)<\/code>\s*(?:<code[^<>]*>([^<]*)<\/code>\s*)?<\/p>\s*/;

function readAxisTitles(html) {
  const m = String(html).match(AXIS_PARA_RE);
  if (!m) return { x: '', y: '', size: '', html };
  return {
    x: plainText(m[1]),
    y: plainText(m[2]),
    size: m[3] ? plainText(m[3]) : '',
    html: html.slice(0, m.index) + html.slice(m.index + m[0].length),
  };
}

// ── Domain ─────────────────────────────────────────────────────────────────

/**
 * A PADDED DATA DOMAIN, not a zero-based one.
 *
 * `includeZero` is the right default for a bar (a bar whose baseline is not
 * zero lies about its own magnitude), and the wrong one here. A bar encodes
 * magnitude by LENGTH from a baseline; a scatter encodes two positions, and
 * neither is measured from an origin. Two measures with narrow ranges — margin
 * 38-44%, NPS 51-58 — forced to include zero collapse into one corner of the
 * box and the relationship they were drawn to show disappears.
 *
 * So the domain is the data's own range plus ~8% of air at each end, then
 * widened to whole nice steps. The one exception is the zero WALL: padding a
 * non-negative series below zero would print a negative tick for a quantity
 * that cannot be negative, so the pad stops at 0.
 */
function domainFor(values, { pad = 0.08 } = {}) {
  const finite = values.filter(Number.isFinite);
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  const span = max - min;
  if (span > 0) {
    const air = span * pad;
    max += air;
    min = min >= 0 ? Math.max(0, min - air) : min - air;
  }
  // A single point — or several at the same value — has no range to pad. Give
  // it a symmetric window a quarter of its own magnitude wide and then treat it
  // like any other domain, so it gets the same tick ceiling: `niceTicks`' own
  // flat-series answer is zero-anchored and returned SIX gridlines for one dot.
  if (!(max > min)) {
    const v = min;
    const half = Math.max(Math.abs(v) * 0.25, 0.5);
    min = v >= 0 ? Math.max(0, v - half) : v - half;
    max = v + half;
  }

  // The ticks fall INSIDE the domain; the domain is not widened out to reach
  // them. `niceTicks` does the opposite — it snaps the domain out to whole
  // steps — which is right for a bar (the axis should end on a round number
  // you can read a length against) and wrong here: it handed a $60k-$420k
  // series a $0-$600k axis and spent the right third of the plot on nothing.
  // So the substrate still chooses the STEP (one nice-number ladder for the
  // whole family), and this picks which of its ticks the domain actually
  // contains. The `target` sweep exists because the ladder is coarse: at
  // target 4 the same series takes a 200k step and keeps two ticks, at 5 it
  // takes 100k and keeps four. Aim for FOUR — the family default — and treat
  // five as the hard ceiling: a scatter grids BOTH axes, so five a side is ten
  // lines behind the data, which is where a plot starts reading as a table.
  let best = null;
  for (const target of [3, 4, 5, 6, 7]) {
    const nice = cart.niceTicks(min, max, { target, includeZero: false });
    const ticks = nice.ticks.filter((t) => t >= min - 1e-9 && t <= max + 1e-9);
    // Distance from the ideal, with a wall at the ceiling and at "too few to
    // read a value against".
    const n = ticks.length;
    const score = -(Math.abs(n - 4) + (n > 5 ? 20 : 0) + (n < 2 ? 10 : 0));
    // Ties go to the SMALLER step: 20/40/60 is a more familiar ladder than
    // 25/50/75 at the same tick count, and the finer step is the one the
    // snap-out below can still reach a round end tick from.
    if (!best || score > best.score || (score === best.score && nice.step < best.step)) {
      best = { score, step: nice.step, ticks, all: nice.ticks };
    }
  }
  // SNAP OUT WHEN IT IS NEARLY FREE. A domain that stops just short of a tick
  // leaves the outermost point floating past the last gridline with nothing to
  // read it against — the round-2 render put a 74% dot above a 60% top tick.
  // Extending to the next tick fixes that; extending a LOT would undo the whole
  // point of a padded domain, so a quarter of one step is the price cap.
  // …and never past the ceiling: a snap that ADDS a sixth gridline has traded
  // one small unlabeled gap for a grid that competes with the data.
  const snap = best.step * 0.25;
  const above = best.all.filter((t) => t > max);
  const below = best.all.filter((t) => t < min);
  const hi = above.length ? Math.min(...above) : null;
  const lo = below.length ? Math.max(...below) : null;
  const ticks = best.ticks.slice();
  if (hi != null && hi - max <= snap && ticks.length < 5) { max = hi; ticks.push(hi); }
  if (lo != null && min - lo <= snap && ticks.length < 5 && !(min === 0 && lo < 0)) {
    min = lo; ticks.unshift(lo);
  }
  return { min, max, step: best.step, ticks };
}

// ── The relationship ───────────────────────────────────────────────────────

/**
 * Pearson's r over the plotted points.
 *
 * This is not analysis for its own sake: it is what the `<desc>` has to carry.
 * `role="img"` prunes every `<text>` from the accessibility tree, so the desc
 * is the ONLY route to this chart, and a list of coordinates is not what a
 * scatter is FOR — the funnel's desc lists conversion rates because drop-off
 * is what a funnel is, and the relationship is what a scatter is.
 */
function pearson(points) {
  const n = points.length;
  if (n < 3) return NaN;
  let sx = 0, sy = 0;
  for (const p of points) { sx += p.x; sy += p.y; }
  const mx = sx / n, my = sy / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (const p of points) {
    const a = p.x - mx, b = p.y - my;
    num += a * b; dx2 += a * a; dy2 += b * b;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den > 0 ? num / den : NaN;
}

function relationshipPhrase(r) {
  if (!Number.isFinite(r)) return '';
  const a = Math.abs(r);
  const strength = a >= 0.8 ? 'strongly' : a >= 0.5 ? 'moderately' : a >= 0.25 ? 'weakly' : '';
  const dir = r >= 0 ? 'together' : 'in opposite directions';
  if (!strength) return 'The two measures show little relationship';
  return `The two measures move ${strength} ${dir} (r = ${r.toFixed(2)})`;
}

/** Least-squares fit y = a + bx over the plotted points. */
function leastSquares(points) {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0;
  for (const p of points) { sx += p.x; sy += p.y; }
  const mx = sx / n, my = sy / n;
  let num = 0, den = 0;
  for (const p of points) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  if (!(den > 0)) return null;
  const b = num / den;
  return { a: my - b * mx, b };
}

// ── Build ──────────────────────────────────────────────────────────────────

function pickVariant(tokens) {
  for (const mod of SCATTER_MODIFIERS) if (tokens.includes(mod)) return mod;
  return 'default';
}

/** Bubble radius: sqrt-scaled so AREA — never radius — encodes the magnitude. */
function bubbleRadius(size, maxSize) {
  if (!Number.isFinite(size) || !(maxSize > 0)) return DOT_R;
  const t = Math.sqrt(Math.max(0, size) / maxSize);
  return BUBBLE.rMin + t * (BUBBLE.rMax - BUBBLE.rMin);
}

function buildScatter(model, ctx, axes) {
  const variant = pickVariant(ctx.classTokens || []);
  const view = cart.viewFor(ctx.orientation);
  const maxSize = model.points.reduce(
    (m, p) => (Number.isFinite(p.size) && p.size > m ? p.size : m), 0);
  const bubbles = variant === 'bubble' && maxSize > 0;
  const plot = cart.plotBox({
    view,
    gutter: bubbles ? { ...GUTTER, right: KEY_RAIL } : GUTTER,
  });

  // A bubble is a mark with EXTENT, so the padded domain has to hold its
  // radius as well as its center — at the default 8% the largest bubble on an
  // extreme point crossed the axis rule and read as clipped.
  const pad = bubbles ? 0.14 : 0.08;
  const xt = domainFor(model.points.map((p) => p.x), { pad });
  const yt = domainFor(model.points.map((p) => p.y), { pad });
  const sx = cart.linearScale([xt.min, xt.max], [plot.x0, plot.x1]);
  const sy = cart.linearScale([yt.min, yt.max], [plot.y1, plot.y0]);


  // ── chrome, from the substrate ──
  //
  // CULL AN X TICK THAT LANDS ON THE Y AXIS. With a padded domain the first
  // tick can fall a unit or two inside the plot, where its gridline duplicates
  // the axis rule and its LABEL prints on top of the y axis' own bottom tick —
  // a negative x domain put `-0.5M` straight through a `0`. This is the same
  // call `buildCategoryLabels` makes about colliding category labels: culling
  // keeps every surviving label legible, overprinting loses both.
  //
  // ONLY THE X SIDE. The two label runs share exactly one piece of canvas — the
  // bottom-left corner — and the x row is the one that reaches into it. Culling
  // the symmetric y tick as well deleted the `0` from a chart whose whole point
  // was a point sitting AT zero, which is a worse defect than the one being
  // fixed: the y labels live in the left gutter and collide with nothing else.
  const AXIS_CLEAR = 8;
  const xTicks = xt.ticks.filter((t) => sx(t) - plot.x0 > AXIS_CLEAR);
  const yTicks = yt.ticks;

  let chrome = '';
  chrome += cart.buildGrid({ plot, ticks: yTicks, scale: sy, axis: 'y' });
  chrome += cart.buildGrid({ plot, ticks: xTicks, scale: sx, axis: 'x' });
  chrome += cart.buildAxisRule({ plot, axis: 'x' });
  chrome += cart.buildAxisRule({ plot, axis: 'y' });
  chrome += cart.buildValueTicks({ plot, ticks: yTicks, scale: sy, step: yt.step, affix: model.yAffix, axis: 'y' });
  chrome += cart.buildValueTicks({ plot, ticks: xTicks, scale: sx, step: xt.step, affix: model.xAffix, axis: 'x' });
  // The captions are CENTERED on the axes they name, the y one rotated. The
  // alternative — both reading horizontally at the ends of their axes — was
  // built and rendered, and lost twice: the x caption landed on the same
  // baseline as the last tick and read as a fifth tick, and a horizontal
  // caption above the plot sits exactly where a chart subtitle sits, so it
  // stopped reading as an axis name at all. A rotated caption is harder to
  // read and unmistakably belongs to its axis; that trade is the right way
  // round for the one label a scatter cannot do without.
  if (axes.x) {
    chrome += cart.buildAxisTitle(axes.x, {
      x: (plot.x0 + plot.x1) / 2, y: view.h - 3, anchor: 'middle', vAlign: 'baseline', width: plot.w,
    });
  }
  if (axes.y) {
    chrome += cart.buildAxisTitle(axes.y, {
      x: 6, y: (plot.y0 + plot.y1) / 2, anchor: 'middle', vAlign: 'baseline', width: plot.h, rotate: -90,
    });
  }

  // ── the trend line ──
  let trend = '';
  if (variant === 'trend' && model.points.length >= TREND_MIN_POINTS) {
    const fit = leastSquares(model.points);
    if (fit) {
      const seg = clipToPlot(
        sx(xt.min), sy(fit.a + fit.b * xt.min),
        sx(xt.max), sy(fit.a + fit.b * xt.max), plot);
      if (seg) {
        trend = `<line class="scatter-trend" data-series="0" ` +
          `x1="${cart.round2(seg.x1)}" y1="${cart.round2(seg.y1)}" ` +
          `x2="${cart.round2(seg.x2)}" y2="${cart.round2(seg.y2)}"/>`;
      }
    }
  }

  // ── the marks ──
  const cls = bubbles ? 'scatter-bubble' : 'scatter-dot';
  let marks = '';
  const labelItems = [];
  const anchors = [];
  for (const p of model.points) {
    const cx = sx(p.x), cy = sy(p.y);
    const r = bubbles ? bubbleRadius(p.size, maxSize) : DOT_R;
    // `data-cat="0"` — every dot takes the SAME categorical slot, because a
    // scatter's encoding is position, not hue. The attribute is still emitted
    // so the a11y/print grayscale rules can reach the mark through the family's
    // one convention rather than a per-component selector.
    marks += `<circle class="${cls}" data-cat="0" data-anima-role="point" data-mark="${p.mark}"` +
      `${p.label ? ` data-label="${escAttr(p.label)}"` : ''} ` +
      `cx="${cart.round2(cx)}" cy="${cart.round2(cy)}" r="${cart.round2(r)}"/>`;
    if (p.label) {
      anchors.push({ cx, cy, r });
      labelItems.push({
        text: p.label, cx, cy, r,
        spec: {
          width: LABEL_W, fontSize: FS.point, maxLines: LABEL_MAX_LINES,
          className: 'cart-series scatter-label', emitFontSize: false,
        },
      });
    }
  }

  const placed = placeLabels(labelItems, {
    bounds: { x0: plot.x0, y0: 2, x1: view.w - 2, y1: plot.y1 },
    gap: 2.4, minGap: 1.2,
  });
  const leaders = placed.map((res, i) => leaderLine(anchors[i], res)).join('');
  const labels = placed.map((r) => r.svg).join('');

  const sizeKey = bubbles
    ? buildSizeKey({ view, plot, maxSize, model, caption: axes.size })
    : { defs: '', body: '' };

  const svg = cart.buildSvgRoot({
    view,
    className: 'cart-svg scatter-svg',
    title: scatterTitle(axes, variant),
    desc: scatterDesc(model, axes),
    defs: sizeKey.defs,
    body:
      `<g class="scatter-chrome" aria-hidden="true">${chrome}</g>` +
      trend +
      `<g class="scatter-plot">${leaders}${marks}${labels}</g>` +
      sizeKey.body,
  });

  const detailWrap = markDetail.detailPayload(model.points);
  const note = markDetail.detailNote(model.points.map((p) => ({
    label: p.label, valueRaw: `${p.xRaw}, ${p.yRaw}`, detail: p.detail,
  })));
  return `<div class="scatter-figure" data-variant="${variant}" ` +
    `data-points="${model.points.length}"` +
    `${axes.x ? ` data-x-axis="${escAttr(axes.x)}"` : ''}` +
    `${axes.y ? ` data-y-axis="${escAttr(axes.y)}"` : ''}` +
    `>${svg}${detailWrap}</div>${note}`;
}

/**
 * A hairline from a dot to a label that could not sit against it.
 *
 * THE DEFECT THIS FIXES, seen on a real render. `placeLabels` searches three
 * rings out from a mark, and on a tight cluster the labels that lose the first
 * ring end up a line-height or two away — far enough that a reader cannot tell
 * which of four adjacent dots a name belongs to. Four names hovered over four
 * dots in the round-1 stress render with nothing joining them, which is not a
 * placement problem the pass can solve: there is genuinely nowhere adjacent
 * left to put them.
 *
 * So the label keeps the position the pass found and a leader states the
 * ownership. Drawn only when it is NEEDED — a label already touching its dot
 * gets none, because a connector between two things that are visibly together
 * is noise. Below the family's own de-collision minimum gap there is nothing
 * to connect.
 */
// Below this the label is already touching its dot, and a connector between two
// things that are visibly together is noise — a 2-unit stub reads as a speck of
// dirt, not as a leader.
const LEADER_MIN_GAP = 5;

function leaderLine(anchor, res) {
  if (!anchor || !res?.svg || !res.box) return '';
  const { cx, cy, r } = anchor;
  const b = res.box;
  // The point on the label's box nearest the dot — where a reader's eye would
  // draw the line themselves.
  const nx = Math.min(Math.max(cx, b.left), b.right);
  const ny = Math.min(Math.max(cy, b.top), b.bottom);
  const dx = nx - cx, dy = ny - cy;
  const dist = Math.hypot(dx, dy);
  if (!(dist > r + LEADER_MIN_GAP)) return '';
  const ux = dx / dist, uy = dy / dist;
  const x1 = cx + ux * (r + 0.9);
  const y1 = cy + uy * (r + 0.9);
  const x2 = nx - ux * 1.2;
  const y2 = ny - uy * 1.2;
  return `<line class="scatter-leader" x1="${cart.round2(x1)}" y1="${cart.round2(y1)}" ` +
    `x2="${cart.round2(x2)}" y2="${cart.round2(y2)}"/>`;
}

/**
 * Clip a fitted line to the plot rectangle.
 *
 * The fit is evaluated at the axis ends, and a steep slope puts one of those
 * ends well outside the box — a line running off into the tick gutter reads as
 * a mark that escaped, not as a trend. The x ends are already the plot edges,
 * so only y can overrun; solve for the parameter range that keeps y inside and
 * return null when none of the segment is visible.
 */
function clipToPlot(x1, y1, x2, y2, plot) {
  const dy = y2 - y1;
  let t0 = 0, t1 = 1;
  if (Math.abs(dy) < 1e-9) {
    if (y1 < plot.y0 || y1 > plot.y1) return null;
  } else {
    const ta = (plot.y0 - y1) / dy;
    const tb = (plot.y1 - y1) / dy;
    t0 = Math.max(0, Math.min(ta, tb));
    t1 = Math.min(1, Math.max(ta, tb));
    if (t1 <= t0) return null;
  }
  return {
    x1: x1 + (x2 - x1) * t0, y1: y1 + dy * t0,
    x2: x1 + (x2 - x1) * t1, y2: y1 + dy * t1,
  };
}

/**
 * The SIZE KEY — bubble only.
 *
 * Area is the one encoding a reader cannot quantify by looking, so a bubble
 * chart without a key asks for a judgement it has given no reference for.
 * Two rings — the largest authored value and a round fraction of it — sit in a
 * rail beside the plot with their values beneath, and the rings wear the marks'
 * own treatment so the key and the data are visibly the same object.
 *
 * The rings are sized through `bubbleRadius`, the SAME function the marks use,
 * so a key that disagreed with the plot would be a bug rather than a drift.
 */
function buildSizeKey({ view, plot, maxSize, model, caption }) {
  const affix = cart.affixOf(model.points.map((p) => p.sizeRaw).filter(Boolean));
  // A quarter of the maximum is HALF the radius under a sqrt-area scale, which
  // is the most legible second ring: visibly smaller, still clearly a circle.
  const mid = niceFloor(maxSize / 4);
  const rows = [{ v: maxSize }, { v: mid }].filter((row, i, a) =>
    i === 0 || (row.v > 0 && row.v < a[0].v * 0.9));

  const cx = plot.x1 + 8 + BUBBLE.rMax;
  // The family's own divider — the accent rule that separates a diagram from
  // its key, transparent at both ends so it melts into the canvas. word-cloud's
  // size key uses the same helper, which is why the two read as one system.
  const spine = buildSpine({
    axis: 'vertical', x: plot.x1 + 4, y: (plot.y0 + plot.y1) / 2,
    length: plot.h * 0.78, thickness: 1.4,
  });
  // A MARK formatter, not an axis one: these two numbers are values printed
  // beside a mark, so each keeps its own significant figures. `axisFormatter`
  // takes its decimals from the axis step and would round a real 400 000 to
  // `0M`; `markFormatter` prints `1.2M` and `250k` side by side.
  const fmt = cart.markFormatter({ ticks: [maxSize], step: mid || 1, affix });
  let out = `<g class="scatter-size-key" aria-hidden="true">${spine.rect}`;

  // The block is centered on the plot, so the key reads as a peer of the chart
  // rather than as something parked at one end of it.
  const rowH = BUBBLE.rMax * 2 + FS.size + 4;
  const blockH = rows.length * rowH + (caption ? FS.size + 4 : 0);
  let y = (plot.y0 + plot.y1) / 2 - blockH / 2;
  if (caption) {
    out += cart.buildAxisTitle(caption, {
      x: cx, y: y + FS.size, anchor: 'middle', vAlign: 'baseline', width: view.w - cx,
    });
    y += FS.size + 4;
  }
  for (const row of rows) {
    const r = bubbleRadius(row.v, maxSize);
    out += `<circle class="scatter-size-ring" cx="${cart.round2(cx)}" ` +
      `cy="${cart.round2(y + BUBBLE.rMax)}" r="${cart.round2(r)}"/>`;
    out += wrapSvgLabel(fmt(row.v), {
      x: cx, y: y + BUBBLE.rMax * 2 + 2, width: BUBBLE.rMax * 2 + 12,
      fontSize: FS.size, anchor: 'middle', vAlign: 'hanging', maxLines: 1,
      className: 'scatter-size-value', emitFontSize: false,
    }).svg;
    y += rowH;
  }
  return { defs: spine.defs, body: `${out}</g>` };
}

/** The largest number on the nice ladder that is NOT above `v` — a round
 *  second ring for the size key, where `niceStep` would round up past it. */
function niceFloor(v) {
  if (!(v > 0) || !Number.isFinite(v)) return 0;
  const pow = 10 ** Math.floor(Math.log10(v));
  const f = v / pow;
  const nice = f >= 10 ? 10 : f >= 5 ? 5 : f >= 2.5 ? 2.5 : f >= 2 ? 2 : 1;
  return nice * pow;
}

function scatterTitle(axes, variant) {
  const kind = variant === 'bubble' ? 'Bubble chart' : 'Scatter chart';
  return axes.x && axes.y ? `${kind} — ${axes.y} against ${axes.x}` : kind;
}

function scatterDesc(model, axes) {
  const xl = axes.x || 'x';
  const yl = axes.y || 'y';
  const parts = [`Axes — ${xl} horizontal, ${yl} vertical`];
  const rel = relationshipPhrase(pearson(model.points));
  if (rel) parts.push(rel);
  const rows = model.points.map((p) => {
    const size = p.sizeRaw ? `, ${p.sizeRaw}` : '';
    return `${p.label || 'unnamed'} ${p.xRaw}, ${p.yRaw}${size}`;
  });
  parts.push(`Points — ${rows.join('; ')}`);
  // Plain text: `buildSvgRoot` owns the <desc> element and its escaping.
  return parts.join('. ');
}

// ── Dispatch ───────────────────────────────────────────────────────────────

function transformSection(html, ctx) {
  const axes = readAxisTitles(html);
  let built = false;
  const out = spliceFirstList(axes.html, (ext) => {
    const model = parseScatter(ext.inner);
    if (!model) return null;
    built = true;
    return buildScatter(model, ctx, axes);
  });
  // Only consume the axis paragraph when a chart was actually drawn — a
  // section with no list must come back byte-identical.
  return built ? out : html;
}

module.exports = {
  transformSection, parseScatter, buildScatter,
  readAxisTitles, domainFor, pearson, relationshipPhrase, leastSquares,
  bubbleRadius, pickVariant, leaderLine, clipToPlot, buildSizeKey,
  TREND_MIN_POINTS, KEY_RAIL, niceFloor,
  SCATTER_MODIFIERS, FS, GUTTER, DOT_R, BUBBLE, LABEL_W,
};
