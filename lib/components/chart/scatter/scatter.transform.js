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
const { liftBracketSpans } = require('../../../core/lift-bracket-span');
const { parseBracketList } = require('../../../core/bracket-list');
const AXIS_CATALOG = require('../../../core/axis-catalog.generated.js');
const cart = require('../_chart-family/cartesian');
const { placeLabels, wrapSvgLabel, upperAdvance, leaderLine } = require('../_chart-family/svg-label');
const { noteHiddenLabels } = require('../_chart-family/label-drops');
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
// 56, not the 44 of the first cut: the rail also has to carry the measure's
// NAME, and at 44 the caption's box was 38 units — narrower than `HEADCOUNT`,
// `EMPLOYEES` or any other realistic measure at the family's smallest type, so
// the caption either ellipsized or broke mid-word. 12 units of plot width buys
// a key whose caption is readable, which is the whole reason the key is here.
const KEY_RAIL = 56;

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
      // `.map(plainText)` on the pills too. The lead is entity-decoded and the
      // pills were not, so a name carrying `R&D` printed `R&amp;D` on the slide
      // and `R&amp;amp;D` in `data-label` and the `<desc>` — every sink escapes
      // again, and text that skipped the decode is escaped twice.
      label: [plainText(leadStripped), ...pills.slice(0, first).map(plainText)]
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
function readAxisTitles(html) {
  // POSITION IS THE AUTHORITY (lib/core/lift-bracket-span.js). The captions are
  // ONE bracketed list above the chart body — x, then y, then an optional third
  // naming the bubble size measure.
  //
  // WHAT THIS RETIRES, and it is worth saying because this file paid for both.
  // The old form was two or three separate code spans discriminated BY COUNT,
  // which made a one-span paragraph mean "ordinary eyebrow" and a two-span one
  // mean "axis" — a rule no author could infer from a slide. And the regex that
  // read it had already been narrowed twice: once for CodeQL polynomial-ReDoS
  // (three lazy any-char runs behind literal prefixes), and once to search only
  // BEFORE the list, because an unanchored scan ate a loose list item's own `<p>`
  // wrapper and the manifest's trailing coda. That second fix is exactly the
  // boundary the shared lift now computes for every component, so this file
  // stops carrying a private copy of it (HARD RULE #1).
  //
  // `keyBelow: false` in the manifest because a scatter has no label set and
  // DOES declare a coda — without it, a trailing paragraph that happened to be
  // bracketed would be consumed as a key this chart never draws.
  //
  // THE DECLARATION IS REQUIRED, NOT PREFERRED. Reading it through `?.` meant a
  // missing catalog entry produced `undefined !== false` — TRUE — which
  // re-enabled the below slot and DELETED the coda. A silent content deletion,
  // reintroduced by the very commit that removed one. An absent declaration is
  // a broken build, so it throws.
  const decl = AXIS_CATALOG.scatter;
  if (!decl) throw new Error('scatter: no axisSet entry — run build-stage-catalog.');
  const lifted = liftBracketSpans(html, { below: decl.keyBelow !== false, bodyTags: decl.bodyTags });
  const parts = lifted.above ? parseBracketList(lifted.above) : null;
  if (!parts) return { x: '', y: '', size: '', html };
  return {
    x: parts[0]?.[0] || '',
    y: parts[1]?.[0] || '',
    size: parts[2]?.[0] || '',
    html: lifted.html,
  };
}

// ── Domain ─────────────────────────────────────────────────────────────────

/**
 * The padded data domain for one axis.
 *
 * THE ALGORITHM MOVED TO THE SUBSTRATE (HARD RULE #1). It used to live here in
 * full, and `slope` carried a thinner second answer to the same question —
 * `niceTicks({ tight: true })`, which gets the shape right and lacks the target
 * sweep, the tick ceiling, the zero wall and the snap-out. Both docblocks
 * justified themselves with the same anecdote, which is what a duplicate looks
 * like from the inside. `cartesian.js § niceDomain` is now the one copy and
 * carries the reasoning; this is the values-to-range adapter, because a scatter
 * holds points and the substrate takes a range.
 */
function domainFor(values, { pad = 0.08 } = {}) {
  const finite = values.filter(Number.isFinite);
  return cart.niceDomain(Math.min(...finite), Math.max(...finite), { pad });
}

// ── The relationship ───────────────────────────────────────────────────────

/**
 * Pearson's r over the plotted points.
 *
 * This is not analysis for its own sake: it is what the `<desc>` has to carry.
 * The marks ride in an `aria-hidden` group (cartesian.js § ariaHiddenMarks), so the desc
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

/**
 * WHAT THE DESCRIPTION SAYS ABOUT THE FIT — and what it deliberately does not.
 *
 * This used to read "The two measures move strongly together (r = 0.82)", and
 * it said it on every scatter, from three points up, whether or not a trend
 * line was drawn. Three things were wrong with that, and each was measured:
 *
 * 1. `r` cannot tell a line from a parabola from a line-plus-outlier.
 *    Anscombe's quartet — four famous datasets with visibly different shapes —
 *    all return r = 0.82, so all four got the identical sentence.
 * 2. One large account manufactures it. Five entities with no relationship,
 *    plus one whale — the commonest shape on a customer-mix slide — reads
 *    r = 1.00.
 * 3. It was the ONE claim in this family that the engine made rather than
 *    restated. Every sibling's desc is arithmetic on the author's own numbers;
 *    this was an inference about a population, told exclusively to the reader
 *    who cannot see the cloud and check it, while the same kernel refused to
 *    DRAW the line below five points on the ground that it "asserts a rigor
 *    the data has not got".
 *
 * So the desc states the fit as a FACT ABOUT THE DRAWING — a line is on the
 * slide, over this many points, and it is a straight-line least-squares fit —
 * and only when the line is actually there. Both surfaces now say the same
 * thing, and the reader forms their own read from the points, which the desc
 * lists in the author's own units.
 */
function trendNote(n) {
  return `A straight-line least-squares fit is drawn over the ${n} points`;
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

/**
 * Bubble radius: AREA — never radius — carries the magnitude, on a linear
 * scale from a minimum visible size.
 *
 * The map interpolates the AREA and takes the square root, not the other way
 * round. Interpolating the RADIUS between `rMin` and `rMax` and calling it
 * sqrt-scaled is the near-miss every bubble chart makes: with a non-zero floor
 * the radius is affine in `sqrt(v)`, so the AREA is not affine in `v` at all —
 * measured, a 4x value read as 2.7x the ink, a 32% understatement that gets
 * worse the smaller the value. Interpolating the area instead makes the ink
 * exactly `areaMin + (v / vmax) x (areaMax - areaMin)`, which is what the docs,
 * the manifest and the key all claim it is.
 *
 * `rMin` is a VISIBILITY FLOOR, not zero: a bubble for the smallest real value
 * still has to be a circle a reader can see and click. So a value of 0 draws
 * the floor rather than nothing — stated in the docs rather than hidden.
 *
 * A point with NO third pill is not a small bubble. `DOT_R` (3.8) sits inside
 * the bubble range, so an unsized point read back through the key decoded to a
 * magnitude nobody typed — the picture said "tiny" where the truth was
 * "unknown", and the `<desc>` (correctly) listed no third value beside it. It
 * takes `rMin` and is flagged `data-size="none"` so the stylesheet can draw it
 * hollow: an outline is visibly not a measured area.
 */
function bubbleRadius(size, maxSize) {
  if (!(maxSize > 0)) return DOT_R;
  if (!Number.isFinite(size)) return BUBBLE.rMin;
  const t = Math.min(1, Math.max(0, size) / maxSize);
  const a0 = BUBBLE.rMin ** 2;
  const a1 = BUBBLE.rMax ** 2;
  return Math.sqrt(a0 + t * (a1 - a0));
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
  // The cull is LABEL-AWARE rather than a flat clearance. A flat 8 units was
  // measured deleting the ORIGIN tick — `$0`, two characters wide, colliding
  // with nothing — from the `$0 · $100k · $200k` axis the docs promise by name,
  // while `$400k` at the same distance genuinely does reach into the y row.
  // The y tick labels are anchored `end` at `plot.x0 - 4`, so the test is
  // simply whether this label's own box would cross that edge.
  const xFmt = cart.axisFormatter({ ticks: xt.ticks, step: xt.step, affix: model.xAffix });
  const xTicks = xt.ticks.filter((t) => {
    const half = (String(xFmt(t)).length * cart.FS.tick * 0.6) / 2;
    return sx(t) - half >= plot.x0 - 4;
  });
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
    // `data-hue="1" data-paint="fill"` — every dot takes the SAME categorical
    // slot, because a scatter's encoding is position, not hue. The attribute is
    // still emitted so the a11y/print grayscale rules can reach the mark through
    // the family's one convention rather than a per-component selector.
    //
    // `data-encodes` SPLITS WITH THE CLASS, and it used to not. A dot is opaque
    // and encodes its identity in the fill; a BUBBLE is
    // `color-mix(… var(--chart-cat-1-ink) 42%, transparent)` on purpose — "two
    // overlapping bubbles deepen where they cross, which is the one place a
    // scatter WANTS the overlap visible". That is the `layered` encoding, and a
    // finish reads it as the instruction not to hand a translucent mark a
    // gradient: a gradient under a second translucent mark reads as a third
    // color where they cross. Both marks stamped `hue` until the manifest
    // declaration disagreed with the render and said so.
    const unsized = bubbles && !Number.isFinite(p.size);
    marks += `<circle class="${cls}" data-hue="1" data-encodes="${bubbles ? 'layered' : 'hue'}" data-paint="fill" data-anima-role="point" data-mark="${p.mark}"` +
      `${unsized ? ' data-size="none"' : ''}` +
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

  // THE KEY RAIL IS NOT AVAILABLE CANVAS. Under `bubble` the right gutter is
  // widened to `KEY_RAIL` for the size key — and the label pass was still told
  // it could run to `view.w - 2`, so entity names printed across the key's
  // spine and over its reference rings. The one obstacle `placeLabels` was
  // never told about.
  // `noteHiddenLabels` REPORTS what this pass declined to paint and returns the
  // array untouched (#2171) — the placement decision is unchanged, and must be:
  // a hidden name is still the right answer, it was only ever the silence that
  // was wrong. Wrapped on the final result, not inside the pass.
  const placed = noteHiddenLabels(placeLabels(labelItems, {
    bounds: { x0: plot.x0, y0: 2, x1: bubbles ? plot.x1 + 2 : view.w - 2, y1: plot.y1 },
    gap: 2.4, minGap: 1.2,
  }));
  // The leader is the family's, not this kernel's: `quadrant` has the same
  // problem and now draws the same hairline from the same emitter (HARD RULE
  // #1). See svg-label.js § leaderLine.
  //
  // What the corridor must not cross: every OTHER name's box and every other
  // dot. A hairline through a neighbor's letterforms points the reader at the
  // wrong entity, which is worse than no hairline at all.
  const markBox = (a) => ({ left: a.cx - a.r, right: a.cx + a.r, top: a.cy - a.r, bottom: a.cy + a.r });
  const leaders = placed.map((res, i) => leaderLine(anchors[i], res, {
    avoid: placed.filter((q, j) => j !== i && q.svg).map((q) => q.box)
      .concat(anchors.filter((_, j) => j !== i).map(markBox)),
  })).join('');
  const labels = placed.map((r) => r.svg).join('');

  const sizeKey = bubbles
    ? buildSizeKey({ view, plot, maxSize, model, caption: axes.size })
    : { defs: '', body: '' };

  const svg = cart.buildSvgRoot({
    view,
    className: 'cart-svg scatter-svg',
    title: scatterTitle(axes, variant),
    desc: scatterDesc(model, axes, Boolean(trend)),
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
 * chart without a key asks for a judgment it has given no reference for.
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

  // THE RAIL'S CENTER, not `plot.x1 + 8 + rMax`. The rings are 24 units across
  // in a 50-unit rail, so hanging them off the plot edge left 22 units of dead
  // canvas on the right and gave the caption — centered on the same axis — a
  // 32-unit budget it could not fit `HEADCOUNT` into. Centered, the caption has
  // the whole rail and the key reads as one column.
  const railX0 = plot.x1 + 4;
  const railX1 = view.w - 2;
  const cx = (railX0 + railX1) / 2;
  // THE CAPTION'S BUDGET IS THE RAIL, NOT THE HALF-RAIL. It used to be
  // `view.w - cx` — the distance from the ring CENTER to the right edge —
  // while the label is anchored `middle`, so the real budget was half of what
  // was passed and every realistic measure name ellipsized: `Seats` printed
  // `SEA…` on the committed gallery PDF, and the docs tell the author to name
  // the measure there. Centered on the rail, over the whole rail, two lines.
  // Centered on `cx`, like the rings and their values — a caption centered on
  // the RAIL instead sat nine units off its own column, and a key that reads as
  // two columns which do not line up is not a key. The budget is therefore the
  // symmetric width available around `cx`, not the whole rail. `cart.FS
  // .axisTitle`, not `FS.size`: this is a `.cart-axis-title` element, and
  // `FS.size` mirrors `.scatter-size-value` — they agree today by coincidence.
  // ONE spec, measured then emitted. The pair used to be two hand-written
  // copies of the same six lines, so a drift between them would have mis-sized
  // the block with nothing visible changing.
  const capSpec = {
    x: cx, width: railX1 - railX0,
    fontSize: cart.FS.axisTitle,
    advance: upperAdvance(String(caption || ''), { tracking: 0.12 }),
    anchor: 'middle', vAlign: 'baseline', maxLines: 2,
    className: 'cart-axis-title', emitFontSize: false,
  };
  const cap = caption ? wrapSvgLabel(String(caption), { ...capSpec, y: 0 }) : null;
  const capLines = cap ? cap.lines.length : 0;
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
  const capH = capLines * (cart.FS.axisTitle + 1) + (capLines ? 3 : 0);
  const blockH = rows.length * rowH + capH;
  let y = (plot.y0 + plot.y1) / 2 - blockH / 2;
  if (cap) {
    out += wrapSvgLabel(String(caption), { ...capSpec, y: y + cart.FS.axisTitle }).svg;
    y += capH;
  }
  for (const row of rows) {
    const r = bubbleRadius(row.v, maxSize);
    // `data-hue="1" data-paint="fill"`, like the marks: the a11y and print
    // grayscale rules reach the key through the family's one convention, so the
    // reference rings wear the same texture as the bubbles they are a reference
    // FOR — and those are the two modes where judging an area by eye is hardest.
    //
    // `data-encodes="layered"` FOR THE SAME REASON, and it is the reason that
    // makes it load-bearing: this ring is the bubble's own legend, painted from
    // the same translucent recipe (`--chart-cat-1-ink` at 26%, against the
    // bubble's 42%). A legend that declares a different encoding from the mark
    // it names is the worst version of the drift this contract exists to stop —
    // the legend IS the binding. The ring said `hue` while the bubble said
    // `layered` for exactly as long as nobody walked emitted→declared.
    out += `<circle class="scatter-size-ring" data-hue="1" data-encodes="layered" data-paint="fill" cx="${cart.round2(cx)}" ` +
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

function scatterDesc(model, axes, trendDrawn) {
  const xl = axes.x || 'x';
  const yl = axes.y || 'y';
  const parts = [`Axes — ${xl} horizontal, ${yl} vertical`];
  if (trendDrawn) parts.push(trendNote(model.points.length));
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
  readAxisTitles, domainFor, pearson, trendNote, leastSquares,
  bubbleRadius, pickVariant, clipToPlot, buildSizeKey,
  TREND_MIN_POINTS, KEY_RAIL, niceFloor,
  SCATTER_MODIFIERS, FS, GUTTER, DOT_R, BUBBLE, LABEL_W,
};
