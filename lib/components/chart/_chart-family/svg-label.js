/**
 * svg-label.js — the shared wrapping `<text>` emitter for IN-DIAGRAM chart
 * labels (funnel stages, radar rim axes, quadrant dots/corners, gantt lanes,
 * state-chart nodes + edges).
 *
 * WHY THIS EXISTS. Native SVG `<text>` does not wrap. Every diagram label used
 * to be a single-line `<text x y>`, so a long label ran straight off the
 * viewBox (the funnel clipped "…Procurement Qualification Review" at the left
 * edge) or straight through its neighbor (quadrant dot labels overprinted each
 * other). The SVG-native legend already solved the same problem for KEY rows —
 * `svg-legend.js` wraps a label to a character budget and emits one `<tspan>`
 * per line. This module lifts that solved mechanism out to the diagram side
 * rather than growing a second wrapper (HARD RULE #15): the greedy line-breaker
 * `wrapLabelToLines` is IMPORTED from svg-legend, not reimplemented here.
 *
 * WHY NOT `<foreignObject>` + CSS flex. It wraps natively, but it loses on all
 * three axes that matter here: it is not "fully SVG", it is unreliable in the
 * Chromium→PDF export path, and — decisively — a `foreignObject` label is an
 * HTML `<div>`, so `chartToScene` (docs/src/lib/chart-anima.ts) would never see
 * it as a `<text>` node and would never animate it. `<tspan>` lines stay inside
 * one `<text>`, which keeps the label a single addressable motion target and a
 * single `[data-mark]` popover target. See
 * engineering/decisions/2026-07-26-svg-chart-labels-motion.md §2.
 *
 * EVERYTHING IS VIEWBOX USER UNITS. Widths, font sizes and line heights are all
 * expressed in the chart's own coordinate space, never device px. That is what
 * makes the result resolution-independent: the same vector drawn at 1280×720
 * and at 8K is the same shape scaled, so a label keeps its proportion to the
 * geometry and stays crisp at any output size. Sizing in px would pin the text
 * to one output resolution and break the moment the SVG scaled.
 *
 * WHO OWNS THE FONT SIZE. The caller does, and it must match what CSS renders,
 * because the line-breaker measures in units of the font size. This follows the
 * legend's precedent exactly: `chart-family.css` deliberately sets NO
 * `font-size` on `.chart-key-label` — the kernel emits it as an attribute, so
 * the wrap math and the painted glyphs can never desync. A chart that wraps a
 * label therefore owns that label's nominal size too.
 *
 * NO FONT METRICS. A pure kernel has no DOM and no font tables, so width is
 * estimated as `chars × ADVANCE × fontSize` with a deliberately CONSERVATIVE
 * average advance (the legend's tuned 0.6). The budget therefore breaks EARLY
 * rather than late: a label may wrap one word sooner than a perfect measurer
 * would, but it never overruns its box. Erring the other way would put us back
 * to clipping, which is the defect this module exists to remove.
 *
 * Pure string-in/string-out — no fs, no DOM — so it runs identically on both
 * render paths (HARD RULE #1) and is safe in every browser bundle.
 */

const { wrapLabelToLines, xmlEsc } = require('./svg-legend');

// Average glyph advance as a fraction of the font size. Shared with the legend
// (svg-legend.js AVG_ADVANCE_R) so a diagram label and a key label break at the
// same visual width — the family reads as one system.
const ADVANCE = 0.6;
// Advance for text CSS paints WIDER than the source string implies. The kernel
// counts characters of the authored, mixed-case label, but a class with
// `text-transform: uppercase` paints capitals and `letter-spacing` adds
// tracking on top, so a line broken to the default budget would overrun the box
// it was measured against. Pass this as `advance` for any label whose CSS
// uppercases or tracks it (the quadrant's corner + cohort labels, the radar's
// sector labels).
//
// MEASURED, not guessed — against the shipped faces in a real browser:
//   uppercase + 0.04em tracking   0.617 … 0.645
//   --font-mono + 0.12em tracking 0.720
//   mixed-case body (the default) 0.461  ← why 0.6 carries ~30% headroom
// Each constant sits just above its measured worst case, keeping the
// break-early property without wrapping text that comfortably fits.
const ADVANCE_UPPER = 0.68;
const ADVANCE_MONO_TRACKED = 0.75;
// Default line height as a ratio of the font size — the legend's LH_R. Diagram
// labels sit against geometry, so lines stay tight.
const LINE_HEIGHT = 1.16;

/**
 * How many characters fit on one line of `width` user units at `fontSize`.
 * Floors at 1 so a pathologically narrow box still makes progress (a 0-char
 * budget would make the line-breaker loop forever on a single long token).
 */
function charBudget(width, fontSize, advance = ADVANCE) {
  const per = fontSize * advance;
  if (!(per > 0) || !(width > 0)) return 1;
  return Math.max(1, Math.floor(width / per));
}

/**
 * Break `text` to the given width WITHOUT emitting markup — the measurement
 * half of the emitter, for callers that need a label's box before they can
 * place it (the quadrant's de-collision pass measures every label first, then
 * nudges, then emits).
 *
 * `maxLines` caps the block height where geometry is hard-limited (a funnel
 * band's height, a gantt lane's height). Overflow past the cap ellipsizes the
 * LAST line rather than silently dropping text: a visible "…" is honest about
 * truncation, where a dropped line reads as data that was never there. Callers
 * generally derive maxLines from the space they actually have, so the cap is a
 * backstop, not the common path.
 */
function measureLabel(text, { width, fontSize, maxLines = Infinity, advance = ADVANCE, lineHeight = LINE_HEIGHT }) {
  const budget = charBudget(width, fontSize, advance);
  let lines = wrapLabelToLines(String(text == null ? '' : text), budget);
  if (lines.length > maxLines && maxLines >= 1) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    // Trim to make room for the ellipsis, so the truncated line still fits the
    // budget it was broken to.
    kept[maxLines - 1] = `${last.slice(0, Math.max(0, budget - 1)).trimEnd()}…`;
    lines = kept;
  }
  return {
    lines,
    height: (lines.length - 1) * fontSize * lineHeight + fontSize,
    lineHeight: fontSize * lineHeight,
  };
}

/**
 * Emit one wrapping `<text>` element: a single `<text>` carrying one `<tspan>`
 * per line, each with an explicit `x` + `y` (absolute per-line placement, the
 * legend's convention — more robust than cumulative `dy`, which drifts if a
 * line is ever dropped and re-anchors wrong under `text-anchor`).
 *
 * @param {string} text         the label (tags already stripped by the caller)
 * @param {object} o
 * @param {number} o.x          anchor x, in viewBox user units
 * @param {number} o.y          anchor y — see `vAlign`
 * @param {number} o.width      the width the label may occupy, user units
 * @param {number} o.fontSize   nominal font size, user units (must match CSS)
 * @param {string} [o.anchor]   SVG `text-anchor`: start | middle | end
 * @param {string} [o.vAlign]   where `y` sits on the block:
 *                              'baseline' — y is the FIRST line's baseline (the
 *                                 single-line default; a 1-line label emits at
 *                                 exactly the y it always did);
 *                              'middle'  — the whole block is centered on y, so
 *                                 a label centered against geometry (a funnel
 *                                 band, a quadrant dot) STAYS centered as it
 *                                 grows lines instead of drifting downward;
 *                              'hanging' — y is the block's top edge.
 * @param {number} [o.maxLines] cap; the last line ellipsizes past it
 * @param {string} [o.className] class attribute
 * @param {string} [o.attrs]    extra attributes, pre-escaped by the caller
 *                              (data-mark, data-anima-role, dominant-baseline…)
 * @param {number} [o.lineHeight] line height as a ratio of fontSize
 * @param {boolean} [o.emitFontSize] emit the font-size attribute (default true —
 *                              the kernel owns the size it wrapped to). Pass
 *                              false only where CSS is the sole owner AND the
 *                              caller passed that same size in.
 * @returns {{ svg: string, lines: string[], height: number, top: number, bottom: number }}
 *          `top`/`bottom` are the block's vertical extent in user units — the
 *          caller uses them to grow its geometry or de-collide neighbors.
 */
// Where a `dominant-baseline` puts the GLYPHS relative to the anchor y, as
// multiples of the font size: [above, below]. This is not cosmetic — the
// de-collision pass compares these boxes, so a box computed for the wrong
// baseline guards empty space while the painted text sits somewhere else.
// (Exactly that: corner names are painted `hanging`, whose glyphs sit ENTIRELY
// BELOW y, but were boxed as if they sat above it — so item labels were routed
// around a phantom box and printed straight through "STRATEGIC BETS".)
const BASELINE_EXTENT = {
  auto: [0.78, 0.28],        // alphabetic — glyphs sit above the baseline
  alphabetic: [0.78, 0.28],
  hanging: [0.06, 1.00],     // glyphs hang below y
  middle: [0.53, 0.53],      // centered on y
  central: [0.53, 0.53],
};

function wrapSvgLabel(text, {
  x, y, width, fontSize,
  anchor = 'start',
  baseline = null,
  vAlign = 'baseline',
  maxLines = Infinity,
  className = '',
  attrs = '',
  lineHeight = LINE_HEIGHT,
  advance = ADVANCE,
  emitFontSize = true,
}) {
  const m = measureLabel(text, { width, fontSize, maxLines, advance, lineHeight });
  const LH = m.lineHeight;
  const ext = BASELINE_EXTENT[baseline] || BASELINE_EXTENT.auto;
  const n = m.lines.length;
  // First-line baseline. 'baseline' keeps a single-line label byte-identical to
  // the un-wrapped emitter it replaces; 'middle' lifts the block by half its
  // extra height so growth is symmetric about y; 'hanging' drops a full
  // font-size so y reads as the top edge.
  let firstBaseline = y;
  if (vAlign === 'middle') firstBaseline = y - ((n - 1) * LH) / 2;
  else if (vAlign === 'hanging') firstBaseline = y + fontSize;
  // 'bottom' — y is the LAST line's baseline, so the block grows UPWARD. This is
  // what a label sitting above the thing it names needs: extra lines must climb
  // away from the mark, never descend onto it. (With vAlign 'baseline' a
  // two-line label above a dot would put its second line on the dot.)
  else if (vAlign === 'bottom') firstBaseline = y - (n - 1) * LH;

  const cls = className ? ` class="${className}"` : '';
  const fs = emitFontSize ? ` font-size="${round(fontSize)}"` : '';
  // The emitter OWNS dominant-baseline when the caller declares one, so the box
  // math below and the painted glyphs cannot disagree.
  const db = baseline ? ` dominant-baseline="${baseline}"` : '';
  const tspans = m.lines
    .map((ln, i) => `<tspan x="${round(x)}" y="${round(firstBaseline + i * LH)}">${xmlEsc(ln)}</tspan>`)
    .join('');
  const svg = `<text${cls}${fs} text-anchor="${anchor}"${db}${attrs}>${tspans}</text>`;

  return {
    svg,
    lines: m.lines,
    height: m.height,
    // Optical extent — the box the DE-COLLISION pass compares, so it brackets
    // the painted glyphs, not the baselines: ascent above the first baseline,
    // descent below the last. For the body faces this engine ships a baseline
    // sits ~0.78em below the ascender top and ~0.28em above the descender
    // bottom, which makes this box slightly TALLER than `height` (a pure
    // baseline-to-baseline + one line measure). That surplus is deliberate:
    // two labels whose optical boxes merely touch would still visually crowd,
    // so the pass separates them a hair before they actually overlap.
    top: firstBaseline - fontSize * ext[0],
    bottom: firstBaseline + (n - 1) * LH + fontSize * ext[1],
    // Horizontal extent, derived from the WIDEST line and the anchor. Two
    // labels only collide if they share horizontal space, so the de-collision
    // pass needs this as well as top/bottom — without it, a label on the left
    // of the chart would shove one on the right. Estimated with the same
    // conservative advance the line-breaker used, so it errs WIDE: the pass
    // separates a borderline pair rather than letting it print through.
    left: anchor === 'middle' ? x - widestOf(m.lines, fontSize, advance) / 2
      : anchor === 'end' ? x - widestOf(m.lines, fontSize, advance) : x,
    right: anchor === 'middle' ? x + widestOf(m.lines, fontSize, advance) / 2
      : anchor === 'end' ? x : x + widestOf(m.lines, fontSize, advance),
  };
}

/** The painted width of the widest line, estimated in user units. */
function widestOf(lines, fontSize, advance) {
  return lines.reduce((w, l) => Math.max(w, l.length), 0) * fontSize * advance;
}

function round(n) {
  return Number(Number(n).toFixed(2)).toString();
}

/**
 * Push overlapping labels apart — the placement half of the problem.
 *
 * Wrapping fixes a label that is too WIDE for its box. It does nothing for two
 * labels that simply land on top of each other, which is a placement problem:
 * on a scatter chart, two points plotted close together carry two labels that
 * overprint no matter how narrow each one is. (Verified on the quadrant: two
 * dots in the same corner printed their names straight through each other, and
 * through the corner's own quadrant label.) So after wrapping, boxes get nudged.
 *
 * The pass is DETERMINISTIC and runs at build time — same input, same output,
 * every render path, and identical in the exported PDF. A runtime reflow would
 * diverge from the export and fight the anima clone.
 *
 * Greedy in the order given, so pass boxes in PRIORITY order: an earlier box
 * holds its place and later ones move around it. A box marked `fixed` never
 * moves at all — that is how a chart pins its structural labels (the quadrant's
 * corner names, an axis title) and lets only the data labels shift.
 *
 * Each box moves along its OWN `dir` (-1 = up, +1 = down), which is the
 * direction that carries it AWAY from the mark it names — a label sitting above
 * its dot moves further up, never down through the dot.
 *
 * @param {Array<{left:number,right:number,top:number,bottom:number,dir?:number,fixed?:boolean}>} boxes
 * @param {object} [o]
 * @param {number} [o.minGap]   clear space to keep between two boxes, user units
 * @param {number} [o.maxShift] give up past this much travel and leave the box
 *                              where it started: a label dragged half the chart
 *                              away from its own dot is worse than one that
 *                              slightly overlaps, because it now reads as
 *                              labelling something else.
 * @returns {number[]} the dy to apply to each input box, in the same order.
 */
function deCollideLabels(boxes, { minGap = 1.5, maxShift = 24 } = {}) {
  const shifts = new Array(boxes.length).fill(0);
  const placed = [];

  // Slide `b` along `dir` until it clears everything already placed. Re-scans
  // after each nudge, because moving clear of one box can slide it into
  // another. Bounded so a pathological cluster can't spin.
  const settle = (b, dir) => {
    let top = b.top;
    let bottom = b.bottom;
    let shift = 0;
    let guard = 0;
    let moved = true;
    while (moved && guard++ < 64) {
      moved = false;
      for (const q of placed) {
        const hits = b.left < q.right && b.right > q.left && top < q.bottom + minGap && bottom > q.top - minGap;
        if (!hits) continue;
        const delta = dir === 1 ? q.bottom + minGap - top : q.top - minGap - bottom;
        top += delta; bottom += delta; shift += delta;
        moved = true;
      }
    }
    return { top, bottom, shift, clear: !moved };
  };

  boxes.forEach((b, i) => {
    if (b.fixed) { placed.push({ ...b }); return; }
    const dir = b.dir === -1 ? -1 : 1;
    // The PREFERRED direction wins whenever it works. `dir` is not a hint, it
    // is the direction that carries the label away from the mark it names — a
    // label above its dot must climb, because descending would land it ON the
    // dot. Taking merely the SHORTER of the two would do exactly that.
    //
    // The opposite direction is a FALLBACK, used only when the preferred one
    // cannot succeed inside maxShift. That case is real: a dot near the top of
    // the plot wants its label above it, which is precisely where the
    // quadrant's corner name sits, so climbing would have to clear the whole
    // corner label and end up outside the plot. Dropping the label just below
    // its dot still reads as that dot's label; hovering it off in the margin
    // does not.
    const fwd = settle(b, dir);
    let pick = fwd;
    if (Math.abs(fwd.shift) > maxShift) {
      const back = settle(b, -dir);
      if (Math.abs(back.shift) <= maxShift) pick = back;
    }
    if (Math.abs(pick.shift) > maxShift) {
      // Both ways are too far to still read as this mark's label — leave it put
      // and accept the overlap. Recorded as 0 rather than clamped, so the label
      // stays anchored to its own dot instead of hovering at an arbitrary
      // distance from it.
      placed.push({ ...b });
      return;
    }
    shifts[i] = pick.shift;
    placed.push({ ...b, top: pick.top, bottom: pick.bottom });
  });
  return shifts;
}

/**
 * Where a label may sit relative to the mark it names. Eight anchors around the
 * dot, each carrying the anchor/baseline/vAlign that makes the block grow AWAY
 * from the mark — so a second line never descends onto the dot it labels.
 *
 * `cost` is the preference, and VERTICAL WINS. A name centered over or under its
 * point reads as that point's caption at a glance; a name off to one side reads
 * as a row in a list that happens to sit near a dot. So above and below come
 * first, the diagonals next (still mostly vertical), and pure left/right last —
 * and the gap is wide enough that a vertical position on a FURTHER ring beats a
 * horizontal one on the nearest (see RING_COST). A side placement is what you
 * fall back to when the column above and below a point is genuinely full.
 */
const LABEL_ANCHORS = [
  { key: 'above', dx: 0, dy: -1, cost: 0, anchor: 'middle', baseline: 'auto', vAlign: 'bottom' },
  { key: 'below', dx: 0, dy: 1, cost: 1, anchor: 'middle', baseline: 'hanging', vAlign: 'baseline' },
  { key: 'above-right', dx: 1, dy: -1, cost: 6, anchor: 'start', baseline: 'auto', vAlign: 'bottom' },
  { key: 'above-left', dx: -1, dy: -1, cost: 7, anchor: 'end', baseline: 'auto', vAlign: 'bottom' },
  { key: 'below-right', dx: 1, dy: 1, cost: 8, anchor: 'start', baseline: 'hanging', vAlign: 'baseline' },
  { key: 'below-left', dx: -1, dy: 1, cost: 9, anchor: 'end', baseline: 'hanging', vAlign: 'baseline' },
  { key: 'right', dx: 1, dy: 0, cost: 14, anchor: 'start', baseline: 'middle', vAlign: 'middle' },
  { key: 'left', dx: -1, dy: 0, cost: 15, anchor: 'end', baseline: 'middle', vAlign: 'middle' },
];

// What one extra ring of distance costs, in the same units as an anchor's
// `cost`. At 2, `above` on the THIRD ring (0 + 4) still beats `right` on the
// first (14) — which is the intent: a caption a little further above its point
// is read correctly, one beside it is read as a neighbor.
const RING_COST = 2;

function overlapArea(a, b, gap) {
  const w = Math.min(a.right, b.right + gap) - Math.max(a.left, b.left - gap);
  const h = Math.min(a.bottom, b.bottom + gap) - Math.max(a.top, b.top - gap);
  return w > 0 && h > 0 ? w * h : 0;
}

function escapesBounds(box, bounds) {
  if (!bounds) return 0;
  return Math.max(0, bounds.x0 - box.left) + Math.max(0, box.right - bounds.x1)
    + Math.max(0, bounds.y0 - box.top) + Math.max(0, box.bottom - bounds.y1);
}

/**
 * Place a set of scatter labels next to the marks they name.
 *
 * THE PROBLEM THIS REPLACES. Placement used to be one guess plus a slide along
 * one axis: a zone heuristic picked above/below/beside per dot, then
 * `deCollideLabels` pushed the box until it cleared. Two things followed, both
 * visible on a real deck. A label that started in a crowded spot slid a long way
 * from its dot — up to `maxShift`, a fifth of the plot — and read as labelling
 * something else. And every label in a cluster slid the SAME direction, so three
 * names stacked into a column while their three dots stayed where they were.
 *
 * A slide cannot fix that, because the problem is not that the label is in the
 * wrong PLACE; it is that there is only one place on offer. So this pass offers
 * eight (`LABEL_ANCHORS`) and picks per label:
 *
 *   - reject a position that overlaps an already-placed label, any mark, any
 *     fixed obstacle, or that leaves `bounds`;
 *   - among what survives, take the most preferred (above > below > sides >
 *     diagonals);
 *   - if NOTHING survives, take the position with the least overlap and nudge it
 *     a little (bounded by `nudge`, not by half the chart).
 *
 * The property that matters: a label is always ADJACENT to its own mark. The
 * distance is bounded by the mark's radius plus `gap`, never by a travel budget.
 * Two dots close together get different SIDES rather than a stack.
 *
 * Greedy in the order given and fully deterministic — same input, same output,
 * every render path, identical in the exported PDF.
 *
 * @param {Array<{text:string, cx:number, cy:number, r:number, spec:object}>} items
 *        `spec` is the wrap spec minus placement (width, fontSize, maxLines,
 *        className, attrs, advance, emitFontSize).
 * @param {object} [o]
 * @param {Array} [o.obstacles] fixed boxes {left,right,top,bottom} to avoid
 * @param {object} [o.bounds]   {x0,y0,x1,y1} the label must stay inside
 * @param {number} [o.gap]      clear space between a mark and its label
 * @param {number} [o.minGap]   clear space between two labels
 * @param {number} [o.nudge]    max travel for the no-feasible-position fallback
 * @returns {Array<{svg:string, box:object, anchorKey:string}>} in input order
 */
function placeLabels(items, { obstacles = [], bounds = null, gap = 4, minGap = 1.5, nudge = 12 } = {}) {
  // Every mark is an obstacle for every label — including its OWN, which is why
  // each anchor starts a radius away. A label over a data point hides the value
  // it is naming, which is worse than a label over another label.
  const marks = items.map((it) => ({
    left: it.cx - it.r, right: it.cx + it.r, top: it.cy - it.r, bottom: it.cy + it.r,
  }));
  const blocked = obstacles.concat(marks);
  const placed = [];
  const out = [];

  for (const it of items) {
    let best = null;
    let leastOverlap = null;
    // Eight anchors at three distances. One ring is not enough for a real
    // cluster — four dots inside ~15 units leave no clear spot at a single
    // reach, and the whole point of this pass is that the answer to "no room"
    // is another POSITION, not a long slide. A further ring costs a little
    // adjacency, which is why it is scored, but the label is still unmistakably
    // that dot's.
    //
    // Every clear position is scored and the CHEAPEST wins — not the first one
    // found. Taking the first would make the ring loop the outer preference and
    // put a label beside its point rather than one line further above it, which
    // is the weaker read (see LABEL_ANCHORS).
    const step = (it.spec.fontSize || 8.5) * LINE_HEIGHT;
    for (let ring = 0; ring < 3; ring++) {
      const ringCost = ring * RING_COST;
      // Nothing on a further ring can beat what we already have.
      if (best && ringCost >= best.cost) break;
      for (const a of LABEL_ANCHORS) {
        const cost = ringCost + a.cost;
        if (best && cost >= best.cost) continue;
        const reach = it.r + gap + ring * step;
        const cand = wrapSvgLabel(it.text, {
          ...it.spec,
          x: it.cx + a.dx * reach,
          y: it.cy + a.dy * reach,
          anchor: a.anchor, baseline: a.baseline, vAlign: a.vAlign,
        });
        // A label over a MARK hides the value it names, which is strictly worse
        // than a label over another label — so it is weighted far heavier, and
        // leaving the plot heavier still.
        const onMark = blocked.reduce((s, b) => s + overlapArea(cand, b, 0), 0);
        const onLabel = placed.reduce((s, b) => s + overlapArea(cand, b, minGap), 0);
        const score = onMark * 1000 + onLabel + escapesBounds(cand, bounds) * 5000;
        if (score === 0) { best = { cand, a, cost }; continue; }
        // Ring and preference only break ties between equally-bad spots; they
        // must never outweigh an actual collision.
        const ranked = score + cost * 0.01;
        // Carry the REACH: the least-bad candidate may have come from ring 1 or
        // 2, and the fallback below re-emits it. Re-deriving the reach from ring
        // 0 there would move the label to a position that was never scored.
        if (!leastOverlap || ranked < leastOverlap.score) leastOverlap = { cand, a, reach, score: ranked };
      }
    }

    let chosen = best;
    if (!chosen) {
      // Nothing clears. Keep the least-bad position — still beside its own mark
      // — and nudge it a little along the direction that leads away from the
      // mark. A small nudge is a tidy-up; a long one is the old defect.
      //
      // Re-emitted at the reach it was SCORED at, not at ring 0: the least-bad
      // candidate can come from any ring, and rebuilding it at a different
      // distance would place the label somewhere the pass never evaluated —
      // possibly straight back into an overlap it had just avoided.
      const { cand, a, reach } = leastOverlap;
      const dir = a.dy === 0 ? 1 : a.dy;
      const [dy] = deCollideLabels(
        blocked.concat(placed).map((b) => ({ ...b, fixed: true })).concat([{ ...cand, dir }]),
        { minGap, maxShift: nudge },
      ).slice(-1);
      chosen = dy
        ? {
          a,
          cand: wrapSvgLabel(it.text, {
            ...it.spec,
            x: it.cx + a.dx * reach,
            y: it.cy + a.dy * reach + dy,
            anchor: a.anchor, baseline: a.baseline, vAlign: a.vAlign,
          }),
        }
        : { cand, a };
    }
    placed.push(chosen.cand);
    out.push({ svg: chosen.cand.svg, box: chosen.cand, anchorKey: chosen.a.key });
  }
  return out;
}

module.exports = {
  wrapSvgLabel, measureLabel, charBudget, deCollideLabels, placeLabels,
  LABEL_ANCHORS,
  ADVANCE, ADVANCE_UPPER, ADVANCE_MONO_TRACKED, LINE_HEIGHT, BASELINE_EXTENT,
};
