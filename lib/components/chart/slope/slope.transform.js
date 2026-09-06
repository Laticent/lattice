/**
 * slope chart kernel — the SLOPEGRAPH and its `dumbbell` variant, the
 * chart-family member whose claim is *the ranking changed between two points*.
 *
 * WHY IT IS NOT A LINE CHART AT n=2. A slopegraph's whole design is the
 * CROSSING: two entities swap places and the reader sees it as an X. A line
 * chart at two points draws the same two segments and then buries them under
 * furniture a two-point series does not need — a category axis with two ticks,
 * a grid, and a legend the reader must round-trip through to learn which line
 * is whose. Here the entity name sits at its own endpoint, so there is no
 * round trip, and the plot carries almost nothing but the lines.
 *
 * Shape — the NESTED series form, because a slope needs two values per entity:
 *
 *   ## Two of the five swapped places.
 *   - Atlas
 *     - 2024 `12`
 *     - 2026 `19`
 *   - Borealis
 *     - 2024 `18`
 *     - 2026 `14`
 *
 * The GROUPS are the entities; the nested SERIES names are the two column
 * headers, so the author never writes the headers twice. Everything else comes
 * off `_chart-family/cartesian.js` (HARD RULE #1): the viewBox, the plot box,
 * the scale, the ticks, the label emitters, the series DSL.
 *
 * Pure string-in/string-out CommonJS — no fs, no DOM, no color (HARD RULE #3).
 */

const cart = require('../_chart-family/cartesian');
const { wrapSvgLabel, deCollideLabels, placeLabels } = require('../_chart-family/svg-label');
const markDetail = require('../_chart-family/mark-detail');
const { spliceFirstList, escAttr, CHART_STATUS } = require('../_chart-family/transform-utils');

// ── Parse ──────────────────────────────────────────────────────────────────

/**
 * Entities × ordered points. Returns null when there is nothing to draw.
 *
 * The model is a COLUMN GRID: `headers` names the columns and every entity
 * carries a `points` array of the same length, holding `null` where it has no
 * value there. `present`, `first` and `last` are the column indices it does
 * have, which is what every geometry below iterates — so a missing value stays
 * missing instead of shifting its neighbors. Which column a point belongs to is
 * decided by `keyed` (see the comment on it: keyed by series name when every
 * entity agrees, positional when they do not).
 */
function parseSlope(ulInner) {
  const s = cart.parseSeries(ulInner, { maxSeries: 6 });
  if (!s || s.flat) return null;              // flat = one value per entity: no slope

  const raw = s.groups
    .filter((g) => g.points.length)
    .map((g) => ({
      label: g.label,
      // A non-numeric pill on the ENTITY's own lead is the author saying "this
      // is the line I am talking about". `parseSeries` already keeps it as
      // `totalRaw` when nested points win, so the marker costs no new syntax —
      // and it is checked against the family's frozen CHART_STATUS vocabulary,
      // so `- Northwind `fail`` paints from --state-fail-* exactly as a gantt
      // bar with the same tag does. Anything else is ignored rather than
      // invented into a status.
      status: g.totalRaw && CHART_STATUS.includes(String(g.totalRaw).trim())
        ? String(g.totalRaw).trim() : '',
      // A point past the substrate's 6-series cap has no column to sit in —
      // `series.indexOf` would return -1 and the value would vanish into the
      // domain without a mark. Dropped explicitly and counted, because a slope
      // past six columns is a `line` chart wearing the wrong component.
      pts: g.points.filter((p) => !p.over)
        .map((p) => ({ name: p.series, raw: p.raw, num: p.num })),
      over: g.points.filter((p) => p.over).length,
      detail: g.detail.length ? `<li>${g.detail.join('</li><li>')}</li>` : '',
    }));
  if (!raw.length) return null;

  // ── Which column does a point belong to? ────────────────────────────────
  //
  // KEYED BY SERIES NAME whenever every entity names its points the same way,
  // and POSITIONAL when they do not. The two rules disagree on exactly one
  // input each, and each input breaks the other rule:
  //
  //   · One entity's point is unparseable (`FY24 `n/a``), so `parseSeries`
  //     drops it and that entity arrives with ONE point. Read positionally,
  //     its FY26 value lands in the FY24 column — the chart silently moves
  //     data a year. Keyed, it lands in FY26 with a hole before it, which is
  //     what the author wrote.
  //   · Two entities name their points differently (`FY24` under one, `2024`
  //     under the rest). Keyed, that mints FOUR columns with half the cells
  //     empty. Positional, it draws the two-column chart the author meant and
  //     reports the disagreement as `headerMismatch`.
  //
  // The test that separates them is whether the distinct series names outnumber
  // the widest entity: they cannot, if everyone is naming the same points.
  const widest = raw.reduce((m, e) => Math.max(m, e.pts.length), 0);
  const keyed = s.series.length <= widest;
  const cols = keyed ? s.series.length : widest;
  const headers = keyed
    ? s.series.slice()
    : Array.from({ length: cols }, (_, j) => {
      const found = raw.find((e) => e.pts[j]);
      return found ? found.pts[j].name : '';
    });

  const entities = raw.map((e) => {
    const points = new Array(cols).fill(null);
    e.pts.forEach((p, j) => {
      const at = keyed ? s.series.indexOf(p.name) : j;
      if (at >= 0 && at < cols) points[at] = p;
    });
    const present = points.map((p, j) => (p ? j : -1)).filter((j) => j >= 0);
    return {
      label: e.label,
      status: e.status,
      detail: e.detail,
      points,
      present,
      first: present.length ? present[0] : -1,
      last: present.length ? present[present.length - 1] : -1,
    };
  }).filter((e) => e.present.length);
  if (!entities.length) return null;

  const headerMismatch = !keyed;
  // An author who nests one entity and leaves another flat (`- Atlas \`12\``)
  // has written an entity with no second point. `parseSeries` reports it; a
  // slope cannot place a value with no column, so the entity is not drawn —
  // recorded here rather than dropped in silence.
  const mixedDepth = Boolean(s.mixedDepth);
  const pointsOverflow = raw.reduce((n, e) => n + e.over, 0);

  // Rank per column: 1 = the highest value in that column. This is what the
  // chart is FOR, so it is computed here and carried into the <desc> — a screen
  // reader gets the rank change, not just two numbers to subtract.
  const ranks = headers.map((_, j) => {
    const present = entities
      .map((e, i) => ({ i, num: e.points[j] ? e.points[j].num : NaN }))
      .filter((r) => Number.isFinite(r.num))
      .sort((a, b) => b.num - a.num);
    const out = new Map();
    present.forEach((r, k) => { out.set(r.i, { rank: k + 1, of: present.length }); });
    return out;
  });

  const nums = entities.flatMap((e) => e.present.map((j) => e.points[j].num))
    .filter(Number.isFinite);
  if (!nums.length) return null;

  return {
    entities,
    headers,
    cols,
    headerMismatch,
    mixedDepth,
    pointsOverflow,
    ranks,
    affix: s.affix,
    min: Math.min(...nums),
    max: Math.max(...nums),
  };
}

// ── Build ──────────────────────────────────────────────────────────────────

function esc(s) {
  return escAttr(s);
}

/**
 * How a value PRINTS at an endpoint.
 *
 * `markFormatter` rather than the raw authored pill, and rather than
 * `formatTick`: the raw pill leaves `1200000` as `1200000` beside a `900000`,
 * and a per-value `formatTick` speaks three magnitudes on one chart
 * (`1.2M | 900k | 5M`). The mark formatter fixes ONE unit from the axis the
 * data would have had and takes its precision from the value, so a slope reads
 * `1.2M | 0.9M | 5M`. For the ordinary boardroom case — `31%`, `12`, `15.4` —
 * it is byte-identical to the authored pill.
 *
 * The slopegraph draws no axis, so the ticks exist only to fix that unit.
 */
function slopeTicks(model) {
  // `tight` keeps the ladder's step but lets the DOMAIN be the data plus a
  // small pad, drawing only the ticks inside it. That is exactly what a
  // before/after chart needs: snapping the domain out to whole steps widens
  // 9…20 to 5…20, which costs a quarter of the vertical range on the
  // slopegraph — a quarter of every slope angle — and a quarter of every bar
  // length on the dumbbell. `includeZero: false` for the same reason: a zero
  // baseline flattens a 60→75 slope to nothing.
  return cart.niceTicks(model.min, model.max, { target: 4, includeZero: false, tight: true });
}

function valueFormatter(model) {
  const t = slopeTicks(model);
  return cart.markFormatter({ ticks: t.ticks, step: t.step, affix: model.affix });
}

/** The widest value pill, in user units — the value column both sides share. */
function valueColWidth(model, fmt) {
  const widest = model.entities.reduce((w, e) => e.present.reduce(
    (x, j) => Math.max(x, fmt(e.points[j].num).length), w), 0);
  return Math.min(42, Math.max(17, widest * cart.FS.value * 0.6 + 5));
}

function direction(e) {
  if (e.first < 0 || e.first === e.last) return 'flat';
  const a = e.points[e.first];
  const b = e.points[e.last];
  return b.num > a.num ? 'up' : b.num < a.num ? 'down' : 'flat';
}

/**
 * THREE emphasis registers, and the default makes no claim.
 *   quiet   — every line the same ink; the geometry is the whole story.
 *   marked  — one or more entities carry a status pill, so the rest recede.
 *             The author says which line the slide is about; nothing is
 *             inferred. This is the ONLY register that survives a metric where
 *             UP IS BAD — unit cost, churn, cycle time, defect count.
 *   signal  — `_class: slope signal`: rising reads pass, falling reads fail.
 *             Opt-in for exactly that reason.
 * Stamped on the SVG ROOT, not taken off the section's class list, because
 * Read·Article re-hosts the bare `<svg>` into `<figure class="lp-figure
 * chart-frame">` (prose-projection.mjs §projectMedia) and carries no variant
 * token with it — a `section.slope.signal` selector would look right on the
 * slide and silently lose its paint in the article.
 */
function emphasisOf(model, tokens) {
  if (tokens.includes('signal')) return 'signal';
  return model.entities.some((e) => e.status) ? 'marked' : 'quiet';
}

/** Per-mark attributes every mark of an entity shares. */
function markAttrs(e, slot) {
  return ` data-dir="${direction(e)}" data-series="${slot}"` +
    (e.status ? ` data-s="${esc(e.status)}"` : '');
}

// The LEADER RUN: how far outside the plot the value column sits, in user
// units. It is not just air — it is the horizontal budget a leader line has to
// bridge a de-collided label back to the dot it names. At 4 units a label
// nudged 8 units vertically had nowhere to draw the connection from, and the
// reader could not tell which name belonged to which dot in a tight cluster.
// 10 gives a leader that reads as a diagonal rather than as a tick.
const LEAD = 10;

// ── The slopegraph (default) ───────────────────────────────────────────────

function buildSlopegraph(model, view) {
  const { entities, headers, cols } = model;
  const fmt = valueFormatter(model);
  const valW = valueColWidth(model, fmt);
  const left = 100;
  const right = 100;
  const plot = cart.plotBox({ view, gutter: { left, right, top: 18, bottom: 8 } });

  // NO VALUE AXIS, and NOT zero-based — both are decisions, and both were
  // rendered before they were made. A zero baseline flattens a 60→75 slope to
  // nothing, which erases the one thing this chart draws. And a nice-number
  // axis widens 9…20 to 5…20, so calibration costs a quarter of the vertical
  // range — i.e. a quarter of every slope angle — plus a gridline through the
  // crowded band and the two label columns the tick column displaces. The
  // values are printed at BOTH endpoints instead, which calibrates the chart
  // exactly rather than by interpolation. What is genuinely lost: a reader
  // cannot judge a gap against zero. That belongs in the heading, and
  // `dataShapeGuidance` says so.
  const span = (model.max - model.min) || Math.abs(model.max) || 1;
  const pad = span * 0.05;
  const y = cart.linearScale([model.min - pad, model.max + pad], [plot.y1, plot.y0]);
  // The family's point scale — a slopegraph IS a two-point scale. `inset: 0` is
  // deliberate: the columns sit ON the plot edges because the names and values
  // live in the gutters outside them, so there is nothing at the edge to crowd.
  const col = cart.pointScale(cols, [plot.x0, plot.x1], { inset: 0 });
  const colX = (j) => col.at(j);

  const marks = [];
  const heads = [];
  const labels = [];

  headers.forEach((h, j) => {
    if (!h) return;
    heads.push(cart.buildAxisTitle(h, {
      x: colX(j), y: plot.y0 - 7, anchor: 'middle', vAlign: 'bottom', width: 120,
    }));
  });

  entities.forEach((e, i) => {
    const slot = i % 6;
    // The polyline joins the columns the entity actually HAS. A column it is
    // missing (an unparseable value) is skipped, not collapsed leftward — the
    // line simply spans the gap, which is the honest read of a missing point.
    const pts = e.present.map((j) => `${cart.round2(colX(j))},${cart.round2(y(e.points[j].num))}`);
    if (pts.length > 1) {
      marks.push(`<polyline class="slope-line" data-mark="${i}" data-anima-role="bar"` +
        `${markAttrs(e, slot)} data-label="${esc(e.label)}" style="--i:${slot}"` +
        ` points="${pts.join(' ')}"/>`);
    }
    e.present.forEach((j) => {
      marks.push(`<circle class="slope-dot"${markAttrs(e, slot)}` +
        `${pts.length > 1 ? '' : ` data-mark="${i}" data-label="${esc(e.label)}"`}` +
        ` style="--i:${slot}"` +
        ` cx="${cart.round2(colX(j))}" cy="${cart.round2(y(e.points[j].num))}" r="1.6"/>`);
    });
  });

  // INTERIOR values — only reachable at three or more columns, where the middle
  // points sit inside the plot with no gutter to print into. They go through
  // `placeLabels` rather than a fixed offset: it tries eight positions around
  // each point, and where a set genuinely cannot be laid out it HIDES the label
  // instead of printing it through its neighbor. The number is never lost — it
  // rides the `<desc>` and the speaker note either way. (Two columns is the
  // designed case and produces none of these.)
  const interior = [];
  entities.forEach((e, i) => {
    const slot = i % 6;
    for (const j of e.present.slice(1, -1)) {
      interior.push({
        text: fmt(e.points[j].num), cx: colX(j), cy: y(e.points[j].num), r: 2.4,
        spec: {
          width: 30, fontSize: cart.FS.value, maxLines: 1,
          className: 'cart-value slope-value',
          attrs: `${markAttrs(e, slot)} data-anima-role="label"`,
          emitFontSize: false,
        },
      });
    }
  });
  const interiorSvg = interior.length
    ? placeLabels(interior, {
      bounds: { x0: plot.x0 - 6, y0: plot.y0, x1: plot.x1 + 6, y1: plot.y1 },
      gap: 3.2, minGap: 1.2,
    }).map((r) => r.svg).join('')
    : '';

  const centerY = (plot.y0 + plot.y1) / 2;
  entities.forEach((e, i) => {
    const slot = i % 6;
    // Which SIDE a label sits on follows the column it names, not the loop
    // index: a lone point in the last column is labeled on the right.
    const half = (model.cols - 1) / 2;
    const ends = e.first === e.last
      ? [{ j: e.first, right: e.first > half }]
      : [{ j: e.first, right: false }, { j: e.last, right: true }];
    for (const end of ends) {
      const p = e.points[end.j];
      if (!p) continue;
      const py = y(p.num);
      const vx = end.right ? plot.x1 + LEAD : plot.x0 - LEAD;
      const nx = end.right ? plot.x1 + LEAD + valW : plot.x0 - LEAD - valW;
      const anchor = end.right ? 'start' : 'end';
      const nameW = (end.right ? right : left) - LEAD - valW - 2;
      const name = wrapSvgLabel(e.label, {
        x: nx, y: py, width: nameW, fontSize: cart.FS.series, anchor,
        vAlign: 'middle', baseline: 'central', maxLines: 2,
        className: 'cart-series slope-name',
        attrs: `${markAttrs(e, slot)} data-anima-role="label"`,
        emitFontSize: false,
      });
      const value = wrapSvgLabel(fmt(p.num), {
        x: vx, y: py, width: valW, fontSize: cart.FS.value, anchor,
        vAlign: 'middle', baseline: 'central', maxLines: 1,
        className: 'cart-value slope-value',
        attrs: `${markAttrs(e, slot)} data-anima-role="label"`,
        emitFontSize: false,
      });
      labels.push({
        svg: name.svg + value.svg,
        left: Math.min(name.left, value.left),
        right: Math.max(name.right, value.right),
        top: Math.min(name.top, value.top),
        bottom: Math.max(name.bottom, value.bottom),
        anchorY: py,
        stem: end.right ? colX(end.j) + 2.6 : colX(end.j) - 2.6,
        inner: end.right ? plot.x1 + LEAD - 1 : plot.x0 - LEAD + 1,
      });
    }
  });

  // Two entities within a few percent print their names on top of each other —
  // this is THE failure mode of a slopegraph, and `deCollideLabels` is the
  // family's answer to it. The ORDER it is fed is the design decision here:
  // processed from the vertical CENTER outward, each box pushed AWAY from the
  // center, so a crowded pair opens symmetrically. Feeding it top-to-bottom
  // slides the whole column one way and walks the bottom label off the plot.
  // Center-outward is also ORDER-PRESERVING — a label never crosses its
  // neighbor — which is what keeps the name-to-dot mapping deducible at all.
  const order = labels.map((_, i) => i).sort((a, b) =>
    Math.abs(labels[a].anchorY - centerY) - Math.abs(labels[b].anchorY - centerY));
  const boxes = order.map((i) => ({ ...labels[i], dir: labels[i].anchorY < centerY ? -1 : 1 }));
  const shifts = deCollideLabels(boxes, { minGap: 1.2, maxShift: 20 });
  order.forEach((i, k) => { labels[i].dy = shifts[k]; });

  // CLAMP to the viewBox. `deCollideLabels` knows about its neighbors and not
  // about the box it is inside, so a crowded band near the top or bottom pushes
  // the outermost label straight out of the frame — and an SVG crops at its
  // viewBox, so the name is CUT before anything in the DOM could measure it
  // (caught by `npm run check:chart-fit` on the six-entity tight-band fixture,
  // 2.4 user units past the bottom edge). A slightly tighter gap is a legible
  // chart; a clipped name is a missing entity.
  const LABEL_INSET = 1.5;
  for (const l of labels) {
    const top = l.top + l.dy;
    const bottom = l.bottom + l.dy;
    if (top < LABEL_INSET) l.dy += LABEL_INSET - top;
    else if (bottom > view.h - LABEL_INSET) l.dy -= bottom - (view.h - LABEL_INSET);
  }

  // A LEADER for every label the pass actually moved. Without one, a name
  // nudged clear of its neighbor floats between two dots and belongs to
  // neither — the same defect as an overprint, only quieter. Drawn only where
  // there is a shift to explain, so an uncrowded chart carries none.
  const leaders = labels.filter((l) => Math.abs(l.dy) >= 1).map((l) =>
    `<line class="slope-leader" x1="${cart.round2(l.stem)}" y1="${cart.round2(l.anchorY)}"` +
    ` x2="${cart.round2(l.inner)}" y2="${cart.round2(l.anchorY + l.dy)}"/>`).join('');

  const body = labels.map((l) => (l.dy
    ? `<g transform="translate(0 ${cart.round2(l.dy)})">${l.svg}</g>`
    : l.svg)).join('');

  return leaders + marks.join('') + heads.join('') + interiorSvg + body;
}

// ── The dumbbell variant ───────────────────────────────────────────────────

/**
 * The same before/after model drawn as a ROW per entity: two dots joined by a
 * bar, on a shared horizontal value axis.
 *
 * WHY IT IS A VARIANT AND NOT A SECOND COMPONENT. Identical model, identical
 * parse, identical claim vocabulary — only the question changes. A slopegraph
 * answers *who overtook whom*, because rank is the vertical position and a swap
 * is a visible X. A dumbbell answers *how big is each gap*, because the gap is
 * a length on one axis and lengths on a common baseline are the most precisely
 * comparable encoding there is. Past about six entities the slopegraph's
 * crossings become spaghetti while the dumbbell's rows stay flat and readable,
 * which is the practical rule an author needs.
 *
 * DIRECTION WITHOUT COLOR: the first point is a HOLLOW dot and the last is
 * FILLED, so before/after survives a grayscale palette and a black-and-white
 * print with nothing to strip (HARD RULE #29's concern, one register over).
 */
// The row-name column: how far left of the plot it is anchored, and how wide
// it may run. `buildCategoryLabels` derives its emitted width from
// `gutter.left - gap`, so the two are stated here once and both passed in —
// measuring at one width and painting at another mis-derives the line count.
const NAME_GUTTER = 104;
const NAME_GAP = 28;
const NAME_W = NAME_GUTTER - NAME_GAP;

/**
 * How many lines a row name may take, derived from the BAND PITCH.
 *
 * `buildCategoryLabels` culls a y-axis label whose block would collide with the
 * previous survivor, and a culled label is a row that renders with NO NAME —
 * data silently gone. Measured: ten rows of two-line names lost five of them.
 * Capping the line count at what the pitch actually holds makes the cull
 * unreachable by construction: a long name ellipsizes, which is visible and
 * honest, rather than disappearing. Same reasoning as the funnel's side labels,
 * and the same 0.92 factor to keep visible air between two adjacent blocks.
 */
function nameLines(pitch) {
  const lh = cart.FS.cat * 1.16;
  return Math.max(1, Math.min(2, Math.floor((pitch * 0.92) / lh)));
}

function buildDumbbell(model, view) {
  const { entities, headers } = model;
  const plot = cart.plotBox({ view, gutter: { left: NAME_GUTTER, right: 30, top: 18, bottom: 22 } });

  // The domain is the data's, the ticks the nice ones inside it — `slopeTicks`
  // carries the reasoning, and it is the same derivation the slopegraph's
  // printed values use, so the two shapes speak one magnitude.
  const ticks = slopeTicks(model);
  const x = cart.linearScale([ticks.min, ticks.max], [plot.x0, plot.x1]);
  const band = cart.bandScale(entities.length, [plot.y0, plot.y1], { padInner: 0.45, padOuter: 0.18 });

  const chrome = cart.buildGrid({ plot, ticks: ticks.ticks, scale: x, axis: 'x' })
    + cart.buildAxisRule({ plot, axis: 'x' })
    + cart.buildValueTicks({ plot, ticks: ticks.ticks, scale: x, step: ticks.step, affix: model.affix, axis: 'x' })
    + cart.buildCategoryLabels({
      plot, labels: entities.map((e) => e.label), center: (i) => band.center(i),
      width: NAME_W, axis: 'y', gap: NAME_GAP, maxLines: nameLines(band.step),
    });

  const fmt = cart.markFormatter({ ticks: ticks.ticks, step: ticks.step, affix: model.affix });
  const marks = [];
  const values = [];
  entities.forEach((e, i) => {
    const slot = i % 6;
    const yc = band.center(i);
    const a = e.points[e.first];
    const b = e.points[e.last];
    const xa = x(a.num);
    const xb = x(b.num);
    marks.push(`<line class="slope-bar" data-mark="${i}" data-anima-role="bar"` +
      `${markAttrs(e, slot)} data-label="${esc(e.label)}" style="--i:${slot}"` +
      ` x1="${cart.round2(xa)}" y1="${cart.round2(yc)}" x2="${cart.round2(xb)}" y2="${cart.round2(yc)}"/>`);
    e.present.forEach((j) => {
      const isFirst = j === e.first;
      const isLast = j === e.last;
      const cls = isFirst ? 'slope-dot slope-dot-from'
        : isLast ? 'slope-dot slope-dot-to' : 'slope-dot slope-dot-via';
      marks.push(`<circle class="${cls}"${markAttrs(e, slot)} style="--i:${slot}"` +
        ` cx="${cart.round2(x(e.points[j].num))}" cy="${cart.round2(yc)}"` +
        ` r="${isFirst || isLast ? 2.4 : 1.5}"/>`);
    });
    // Each value sits on the side AWAY from the other dot, so a gap of any size
    // — including zero — can never print one value through the other.
    const rising = xb >= xa;
    const ends = e.first === e.last ? [[a, xa, 1]]
      : [[a, xa, rising ? -1 : 1], [b, xb, rising ? 1 : -1]];
    for (const [p, px, outward] of ends) {
      if (!p) continue;
      values.push(wrapSvgLabel(fmt(p.num), {
        x: px + outward * 4.5, y: yc, width: 30, fontSize: cart.FS.value,
        anchor: outward < 0 ? 'end' : 'start', vAlign: 'middle', baseline: 'central',
        maxLines: 1, className: 'cart-value slope-value',
        attrs: `${markAttrs(e, slot)} data-anima-role="label"`, emitFontSize: false,
      }).svg);
    }
  });

  // The two dot styles need naming once. Direct labeling does not fit here —
  // the top row's own two dots may sit a hair apart — so this is a two-entry
  // inline key in the top gutter, drawn in the same coordinate system rather
  // than composed through `buildSvgLegend` (which exists for the harder
  // color-categorical case and would buy a second viewBox for two dots).
  const keyGap = 46;
  const kx = plot.x0 + 2;
  const key = headers.slice(0, 1).concat(headers.slice(-1)).map((h, k) => {
    if (!h) return '';
    const cx = kx + k * keyGap;
    return `<circle class="slope-dot ${k ? 'slope-dot-to' : 'slope-dot-from'}"` +
      ` cx="${cart.round2(cx)}" cy="${cart.round2(plot.y0 - 8)}" r="2.4"/>` +
      cart.buildAxisTitle(h, {
        x: cx + 5, y: plot.y0 - 8, anchor: 'start', vAlign: 'middle', width: keyGap - 8,
      });
  }).join('');

  return chrome + marks.join('') + key + values.join('');
}

// ── The figure ─────────────────────────────────────────────────────────────

function buildSlope(model, ctx = {}) {
  const view = cart.viewFor(ctx.orientation);
  const tokens = ctx.classTokens || [];
  const dumbbell = tokens.includes('dumbbell');
  const emphasis = emphasisOf(model, tokens);
  const inner = dumbbell
    ? buildDumbbell(model, view)
    : buildSlopegraph(model, view);

  // The root comes from the substrate, so the viewBox / preserveAspectRatio /
  // role contract and the escaped title+desc are one implementation for all
  // seven members. The shape and emphasis registers ride the CLASS rather than
  // a data attribute for the same reason the emphasis is on the root at all:
  // `buildSvgRoot` takes a className, and Read·Article re-hosts this very
  // element, so a class on it survives where a `section.slope.signal` selector
  // would not.
  const svg = cart.buildSvgRoot({
    view,
    className: `cart-svg slope-svg slope-${dumbbell ? 'dumbbell' : 'slopegraph'} slope-${emphasis}`,
    title: dumbbell ? 'Dumbbell chart' : 'Slopegraph',
    desc: descText(model),
    body: inner,
  });

  const detailWrap = markDetail.detailPayload(model.entities);
  const note = markDetail.detailNote(model.entities.map((e) => ({
    label: e.label, valueRaw: e.present.map((j) => e.points[j].raw).join(' to '), detail: e.detail,
  })));
  return `<div class="slope-figure" style="--slope-entities:${model.entities.length}">` +
    `${svg}${detailWrap}</div>${note}`;
}

/**
 * `role="img"` prunes the whole subtree from the accessibility tree, so every
 * `<text>` drawn above is unreachable and this string is the ONLY route to the
 * data. It therefore carries what the CHART IS FOR, not just the numbers: the
 * change AND the rank at both ends. A slopegraph exists to show who overtook
 * whom, and a desc listing eight pairs of numbers leaves that unreachable by
 * any route — the same standard the funnel's desc sets by carrying its
 * conversion rates rather than its stage values. Entities are joined with `;`
 * because a label may itself contain a comma.
 */
function descText(model) {
  const { entities, headers, ranks } = model;
  // The SAME formatter the marks use. A desc that reads "up 2200000" beside a
  // chart printing "$2.2M" is two vocabularies for one number, and this string
  // is the only route to the data for a screen reader.
  const fmt = valueFormatter(model);
  const first = headers[0] || 'the first point';
  const last = headers[headers.length - 1] || 'the second point';
  const rows = entities.map((e, i) => {
    const a = e.points[e.first];
    const b = e.points[e.last];
    if (!a) return '';
    if (e.first === e.last) return `${e.label} ${fmt(a.num)} at ${headers[e.first] || 'one point'} only`;
    const d = b.num - a.num;
    const word = d > 0 ? 'up' : d < 0 ? 'down' : 'unchanged';
    const mag = d ? ` ${fmt(Math.abs(d))}` : '';
    const ra = ranks[e.first] && ranks[e.first].get(i);
    const rb = ranks[e.last] && ranks[e.last].get(i);
    const rank = ra && rb
      ? ra.rank === rb.rank
        ? `, held rank ${ra.rank} of ${ra.of}`
        : `, rank ${ra.rank} to ${rb.rank} of ${rb.of}`
      : '';
    return `${e.label} ${fmt(a.num)} to ${fmt(b.num)}, ${word}${mag}${rank}`;
  }).filter(Boolean);
  return `Slope from ${first} to ${last} — ${rows.join('; ')}`;
}

/** The `<desc>` element, as `buildSvgRoot` emits it — the shape tests read. */
function buildDesc(model) {
  return `<desc>${esc(descText(model))}</desc>`;
}

/** The chart-family entrypoint (see the `kernel` block in slope.manifest.json). */
function transformSection(html, ctx) {
  return spliceFirstList(html, (ext) => {
    const model = parseSlope(ext.inner);
    return model ? buildSlope(model, ctx) : null;
  });
}

module.exports = { transformSection, parseSlope, buildSlope, buildDesc, descText, LEAD };
