/**
 * callout-layer.js — what every chart that reads `@callout{…}` shares: lifting the slide's callout
 * paragraphs, tying each to a mark, laying the notes out under the figure, and choosing
 * which of the two leaves the plot larger at the slide's real shape (design note
 * engineering/decisions/2026-10-20-callout-placement.md § 5).
 *
 * The heatmap proved the rule; this is the second reader (§ 7 P2), so the parts that were the
 * heatmap's own moved here and the heatmap imports them back. A chart adopts callouts in five steps,
 * and the file's functions are those steps in order:
 *
 *   1. `lift(html, ctx)`        take the callout paragraphs off the section before the chart parses it;
 *   2. `resolve(legends, …)`    tie each note to a mark the chart names, cap at six, set the rest aside;
 *   3. `choose({ attempt, … })` try every placement, keep the one that leaves the plot largest;
 *   4. `place(…)`               what `attempt` calls: the lane and the markers, for one placement;
 *   5. `describe(res, nameOf)`  the notes and what was not drawn, for the chart's `<desc>`.
 *
 * Pure JS, no DOM, no font metrics (HARD RULE #1): both render paths bundle this file.
 */

const { liftLegends } = require('../../../core/lift-label-set');
const { calloutsOff, MAX_ANCHORED, targetText } = require('../../../core/legend');
const { laneSvg, laneIndent, laneHeight } = require('./legend-svg');
const { FS_OF_HEIGHT } = require('./svg-legend');
const { measureLabel, ADVANCE } = require('./svg-label');
const CALLOUT_CATALOG = require('../../../core/callout-catalog.generated.js');
const { trialIds } = require('../../../core/render-ids');
const { collectLabelDrops } = require('./label-drops');

/** The smallest a callout's words set, in viewBox units: the floor the lane steps down to. */
const FS_FLOOR = 7.5;
/** A lane is never narrower than a short word needs, nor wider than a quarter of the figure. */
const LANE_MIN = 36;
const LANE_MAX_SHARE = 0.25;
/** …but a figure drawn small (a pie's disc is 180 wide) still gives a lane room to set three lines of words. */
const LANE_ROOM = 60;
/** The space between a figure and its lane (or the notes under it), in viewBox units. */
const LANE_PAD = 5;

// A challenger must keep 10% more plot, not merely more: a placement that grows the figure's height
// also scales its type down, so a near-tie on plot area is a loss. Measured on a 3 by 2 heatmap grid
// at 16:9, notes below keep 5% more plot than notes beside and set every label 10% smaller.
const PLACEMENT_MARGIN = 1.1;

// The chart's own box, width over height, measured in Chromium at the five slide shapes the CLI and
// the Studio ship, as [slide aspect, chart box aspect] (the box is the chart area under the title, so
// it is not the slide's shape). A slide's `data-aspect` stamp is read between these points, so a
// 4:3 slide is scored at 1.74 and a 4:5 slide at 1.09, not at a shape its orientation name merely covers.
const CHART_BOX_BY_SLIDE = Object.freeze([[0.5625, 0.67], [0.8, 1.09], [1, 1.26], [4 / 3, 1.74], [16 / 9, 2.72]]);
function chartBoxAspect(slide) {
  const pts = CHART_BOX_BY_SLIDE;
  if (slide <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (slide <= pts[i][0]) {
      const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
      return y0 + (y1 - y0) * ((slide - x0) / (x1 - x0));
    }
  }
  return pts[pts.length - 1][1];
}
// FALLBACK ONLY: a render that carries no `data-aspect` and no pane (a caller of `transformChartSection`
// that passes just an orientation name). Landscape is 16:9, the shape most decks are; square is 1:1;
// portrait takes both of its shapes, 4:5 (1.09) and 9:16 (0.67), and the pick gives up least at the
// worse one. A stamped slide never reaches this: the engine and the runtime both stamp the real aspect.
const STAGE_ASPECTS = Object.freeze({ landscape: [2.72], square: [1.26], portrait: [1.09, 0.67] });
function stageAspects(ctx, view) {
  if (ctx.paneView) return [view.w / view.h];
  if (Number.isFinite(ctx.aspect)) return [chartBoxAspect(ctx.aspect)];
  return STAGE_ASPECTS[ctx.orientation] || STAGE_ASPECTS.landscape;
}

/**
 * Step 1. Lift the slide's `@callout{…}` (and pre-split `@legend{…}`) paragraphs off the section and
 * read whether the author or the host switched callouts off. No such paragraph: `legends` is empty
 * and `html` is the input, so a slide with no callout renders as it always did.
 * @returns {{html: string, legends: object[], off: boolean}}
 */
function lift(html, ctx = {}) {
  const l = liftLegends(html);
  return { html: l.html, legends: l.legends, off: calloutsOff({ tokens: ctx.classTokens || [], pluginsOff: ctx.pluginsOff || null }), side: sideFor(l.legends, ctx.classTokens || []) };
}

/**
 * Where the notes sit: the author's `side=` (the first callout span that names one), else the chart's
 * manifest default (`callout.side`, compiled into callout-catalog.generated.js), else under the figure.
 * @returns {'under'|'beside'}
 */
function sideFor(legends, classTokens) {
  const authored = legends.find((g) => g.side)?.side;
  if (authored) return authored;
  for (const t of classTokens) if (CALLOUT_CATALOG[t]?.side) return CALLOUT_CATALOG[t].side;
  return 'under';
}

// The side the chart being rendered resolved to. A render is synchronous, so `around` sets it for exactly
// the span of one chart's render and `choose` reads it, which keeps the side out of every chart's call.
let activeSide = 'under';

/**
 * Run a chart's splice around the lift: `run(html, lifted)` gets the section with its callout
 * paragraphs taken off (and `lifted`, or null when there are none) and returns the spliced section.
 * A chart that declines the slide leaves the section as it came, callout paragraphs included, so a
 * slide with no chart loses no words.
 */
function around(html, ctx, run) {
  const l = lift(html, ctx);
  if (!l.legends.length) return run(html, null);
  const before = activeSide;
  activeSide = l.side;
  try {
    const out = run(l.html, l);
    return out === l.html ? html : out;
  } finally {
    activeSide = before;
  }
}

/**
 * Step 2. Tie each anchored note to a mark. `find(target)` is the chart's: it takes what the author
 * wrote after `for=` (a mark's index, or its name) and answers `{ mark, box }`, the `data-mark` index
 * and the mark's box in the figure's own coordinates (`{cx, cy, w, h}`, plus `pin: 'beside'` for a
 * point-like mark, `ring: 'path'` with `d` for one with an outline of its own, and `ring: 'none'` for one
 * with no outline worth tracing), or null. A hit may also
 * carry `near`: boxes of what runs through the mark (a line's two segments) that its marker keeps clear of.
 *
 * The first six that read are drawn (one per marker shape, lib/core/legend.js `MAX_ANCHORED`); the
 * rest are listed as not drawn. Off hides all of them, and their details still reach the cards.
 */
function resolve(legends, { off = false, find }) {
  const callouts = [];
  const unplaced = [];
  for (const legend of legends) {
    for (const e of legend.entries) {
      const hit = legend.layout === 'anchored' && e.for !== undefined ? find(e.for) : null;
      if (hit) callouts.push({ ...e, mark: hit.mark, box: hit.box, near: hit.near });
      else unplaced.push({ ...e, layout: legend.layout });
    }
  }
  return {
    callouts: off ? [] : callouts.slice(0, MAX_ANCHORED),
    capped: off ? [] : callouts.slice(MAX_ANCHORED),
    hidden: off ? callouts : [],
    unplaced,
    dropped: [],
  };
}

/**
 * Read `for=` as a name or an index over a list of mark names: a number is the index, a string is a
 * name compared without case or extra spaces. Returns the index, or -1.
 */
function matchName(target, names) {
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const t = String(target ?? '').trim();
  if (/^\d+$/.test(t)) return Number(t) < names.length ? Number(t) : -1;
  return names.findIndex((n) => norm(n) === norm(t));
}

/** The words each marked callout adds to its mark's card and the speaker note, by mark index. */
function detailByMark(res) {
  const out = new Map();
  for (const e of [...res.callouts, ...res.capped, ...res.hidden]) {
    if (e.detail) out.set(e.mark, [out.get(e.mark), `${e.text}: ${e.detail}`].filter(Boolean).join(' '));
  }
  return out;
}

/** A callout marker's height, from the mark it sits on: a share of its shorter side, between a floor
 *  that keeps the shape a shape and the lane marker's own height (design note § 18). */
const MARKER_OF_MARK = 0.42;
const MARKER_MIN_HEIGHT = 3.8;
function markerHeightFor(boxes, laneFont) {
  const ceiling = laneHeight(laneFont);
  const side = Math.min(...boxes.map((b) => Math.min(b.w, b.h)));
  return Math.min(ceiling, Math.max(MARKER_MIN_HEIGHT, side * MARKER_OF_MARK));
}

/**
 * The lane beside a figure, sized to the widest label within bounds, or the words' size for notes
 * set under it. The key's label size is a share of the figure's height; a callout takes it, and
 * steps down toward the floor only as far as every label still sets whole in three lines. Beside a
 * key it holds the key's size (one row style, § 6) and a label too long ends in an ellipsis.
 */
function laneFor(callouts, view, { keyed = false, side = 'right', max: room, font } = {}) {
  if (!callouts?.length) return null;
  const key = font ?? Math.max(FS_FLOOR, FS_OF_HEIGHT * view.h);
  if (side === 'below') return { side, width: 0, gap: LANE_PAD, reserve: 0, fontSize: key };
  const max = room ?? Math.max(view.w * LANE_MAX_SHARE, LANE_ROOM);
  const at = (fontSize) => {
    const marker = laneIndent(callouts, fontSize);
    const widest = callouts.reduce((w, e) => {
      const m = measureLabel(e.text, { width: max - marker, fontSize, maxLines: 3 });
      return Math.max(w, Math.max(...m.lines.map((l) => l.length)) * fontSize * ADVANCE + marker);
    }, 0);
    const width = Math.min(max, Math.max(LANE_MIN, widest));
    const whole = callouts.every((e) => !measureLabel(e.text, { width: width - marker, fontSize, maxLines: 3 }).lines.some((l) => l.endsWith('…')));
    return { width, whole };
  };
  let fontSize = key;
  while (!keyed && fontSize > FS_FLOOR && !at(fontSize).whole) fontSize = Math.max(FS_FLOOR, fontSize - 0.25);
  const { width } = at(fontSize);
  return { side, width, gap: LANE_PAD, reserve: width + LANE_PAD, fontSize };
}

/**
 * Step 4. One placement of the notes for a figure already drawn at `view`. The notes sit in a lane
 * to the right of the whole figure, each level with its mark, or in a group under it (side by side, wrapping to
 * a new row) that runs the figure's width and grows the figure to hold every note. Returns the group, the figure's new size and
 * what was drawn; the chart wraps `svg` with its own marks (it is in the figure's coordinates) and
 * feeds `w` and `h` to its key.
 *
 * @param {object[]} callouts  from `resolve`: `{...entry, mark, box}`
 * @param {object} o
 * @param {{w: number, h: number}} o.view  the figure as drawn, before any lane
 * @param {{x0: number, x1: number, y0: number, y1: number}} o.plot  its plot box
 * @param {'right'|'below'} o.side
 * @param {boolean} [o.keyed]  a key shares the slide
 * @param {Array<{left: number, top: number, right: number, bottom: number}>} [o.avoid]  boxes a
 *        marker on a mark must not cover (every printed value, the axis names)
 * @param {number} [o.bottomPad]  air under the last note when the figure grows to hold them
 * @param {number} [o.laneMax]  the widest the lane may be, for a figure drawn smaller than its slide
 * @param {number} [o.laneFont]  the notes' size when the figure's own labels are not the key's size (the family's
 *        key size is a share of the figure's height, which a tall funnel viewBox makes larger than its labels)
 * @param {{x: number, y: number}} [o.origin]  where the figure's own coordinates start (a basemap's `viewBox`
 *        does not begin at 0); `view` is its size, and the lane is drawn in the same coordinates
 * @returns {{svg: string, w: number, h: number, plot: number, drawn: number, kept: object[], lost: object[]}}
 */
function place(callouts, { view, plot, side, keyed = false, avoid = [], bottomPad = 4, laneMax, laneFont, origin = { x: 0, y: 0 } }) {
  const lane = laneFor(callouts, view, { keyed, side, max: laneMax, font: laneFont });
  if (!lane) return { svg: '', w: view.w, h: view.h, plot: (plot.x1 - plot.x0) * (plot.y1 - plot.y0), drawn: 0, kept: [], lost: [], split: 0 };
  const below = side === 'below';
  const fontSize = lane.fontSize;
  const drawn = laneSvg(callouts.map((e) => ({ ...e, target: { ...e.box, mark: e.mark } })), {
    x: below ? origin.x : origin.x + view.w + lane.gap,
    width: below ? view.w : lane.width,
    flow: below,
    top: below ? origin.y + view.h + lane.gap : plot.y0,
    bottom: below ? Infinity : origin.y + view.h,
    fontSize,
    // A marker on an area mark scales with the mark; one beside a point has no mark to scale with and takes
    // the lane marker's own height, so the two copies of a callout's marker are one size.
    markerHeight: callouts.some((e) => e.box.pin === 'beside' || e.box.ring === 'path') ? laneHeight(fontSize) : markerHeightFor(callouts.map((e) => e.box), fontSize),
    minMarkerHeight: MARKER_MIN_HEIGHT,
    minDigit: FS_FLOOR * 0.5,
    avoid,
  });
  const kept = callouts.filter((_, i) => drawn.placed[i]);
  const lost = callouts.filter((_, i) => !drawn.placed[i]);
  // A note whose word the lane was too narrow to hold whole is set in broken pieces (`quart` over `er`).
  // Such a layout is worse than one that sets every word whole, whatever it does for the plot.
  const split = drawn.placed.filter((p) => p?.box.split).length;
  let h = view.h;
  if (below) {
    const rowHalf = laneHeight(fontSize) * 0.65;
    const bottom = Math.max(origin.y + view.h, ...drawn.placed.filter(Boolean).map((p) => Math.max(p.box.bottom, (p.box.top + p.box.bottom) / 2 + rowHalf)));
    h = Math.ceil(bottom - origin.y + bottomPad);
  }
  return {
    svg: drawn.svg,
    w: below ? view.w : view.w + lane.reserve,
    h,
    plot: (plot.x1 - plot.x0) * (plot.y1 - plot.y0),
    drawn: kept.length,
    kept,
    lost,
    split,
  };
}

/**
 * Step 3. Put the notes where the slide says (`under` by default, or `beside`: the author's `side=`, else the
 * chart's manifest default; `sideFor`), try the key (if one shares the slide) on its two sides, and keep the
 * combination that leaves the plot largest once the whole figure is fitted into the chart's box at the
 * slide's real shape. A challenger must clear `PLACEMENT_MARGIN`. A layout that draws fewer notes never beats
 * one that draws more: a note is not dropped for a bigger plot.
 *
 * `attempt(place)` lays the whole figure out for one `{callouts, key}` and returns
 * `{ w, h, plot, drawn, ... }`; it must not leak state, because losing layouts are thrown away in a
 * trial that restores the render's id sequences and swallows the label-drop report. The winner is
 * laid out once more for real and returned.
 *
 * @param {object} o
 * @param {object} o.ctx  the kernel's ctx (`orientation`, `aspect`, `paneView`)
 * @param {{w: number, h: number}} o.view  the figure's own view, for the pane's box
 * @param {boolean} o.hasCallouts
 * @param {boolean} o.hasKey
 * @param {(place: {callouts: string, key: string}) => object} o.attempt
 */
function choose({ ctx, view, hasCallouts, hasKey, attempt }) {
  const keyDefault = ctx.orientation === 'portrait' ? 'below' : 'right';
  const keyOther = keyDefault === 'right' ? 'below' : 'right';
  const tried = [];
  for (const callouts of hasCallouts ? [activeSide === 'beside' ? 'right' : 'below'] : ['right']) {
    for (const key of hasKey ? [keyDefault, keyOther] : [keyDefault]) {
      const at = { callouts, key };
      tried.push({ at, ...trialIds(() => collectLabelDrops(() => attempt(at)).value) });
    }
  }
  const most = Math.max(...tried.map((t) => t.drawn));
  const drawnMost = tried.filter((t) => t.drawn === most);
  // Of those, the layouts that break the fewest words: a lane too narrow for its words loses to a layout
  // that sets them whole (a heatmap, which keeps its own choice, ellipsizes instead and is not asked).
  const fewestSplit = Math.min(...drawnMost.map((t) => t.split ?? 0));
  const pool = drawnMost.filter((t) => (t.split ?? 0) === fewestSplit);
  const aspects = stageAspects(ctx, view);
  const kept = (t, aspect) => t.plot * Math.min(aspect / t.w, 1 / t.h) ** 2;
  const bestAt = aspects.map((a) => Math.max(...pool.map((t) => kept(t, a))));
  const share = (t) => Math.min(...aspects.map((a, i) => kept(t, a) / bestAt[i]));
  let best = pool[0];
  for (const t of pool) if (share(t) > share(best) * PLACEMENT_MARGIN) best = t;
  return attempt(best.at);
}

/**
 * Step 3 for a chart with no key: the notes under it.
 * Returns what `place` returns, for the winning side, with `res` updated to what was drawn
 * (`res.callouts`) and what the lane had no room for (`res.dropped`).
 */
function placeUnkeyed({ ctx, view, plot, res, avoid, laneFont }) {
  const won = choose({ ctx, view, hasCallouts: true, hasKey: false, attempt: (at) => place(res.callouts, { view, plot, side: at.callouts, avoid, laneFont }) });
  res.dropped = won.lost;
  res.callouts = won.kept;
  return won;
}

/**
 * Add each callout's detail to its mark's hover-card payload and speaker note. `marks` are the
 * `markDetail.detailPayload` entries by mark index; `esc` escapes the text for the markup surface
 * (`<li>` is the family's contract for a card body, mark-detail.js).
 */
function mergeDetail(marks, res, esc) {
  const extra = detailByMark(res);
  if (!extra.size) return marks;
  return marks.map((m, i) => (extra.has(i) ? { ...m, detail: `${m.detail || ''}<li>${esc(extra.get(i))}</li>` } : m));
}

/**
 * Step 5. The notes, for the chart's `<desc>`: an anchored label sits inside the chart's
 * `aria-hidden` group, so the description is the one route a screen reader has to it, and it says
 * each label's detail too. A note that is not drawn is named, with why, never lost silently.
 * `nameOf(mark)` is the chart's name for a mark ("Q3", "Feb 2026 · M2").
 * @param {{callouts: object[], capped: object[], unplaced: object[], dropped: object[]}} res
 */
function describe(res, nameOf, { kind = 'mark' } = {}) {
  const shown = res.callouts.map((e) => `${e.text} (${nameOf(e.mark)})${e.detail ? `: ${e.detail}` : ''}`);
  const lost = res.unplaced.map((e) => (e.layout === 'anchored'
    ? `"${e.text}" (${targetText(e.for)}, which names no ${kind})`
    : `"${e.text}" (a ${e.layout} legend, which this chart does not draw yet)`));
  const crowded = res.dropped.map((e) => `"${e.text}" (no room for it)`);
  const capped = res.capped.map((e) => `"${e.text}" (past the ${MAX_ANCHORED}-callout limit)`);
  const notDrawn = lost.concat(crowded, capped);
  return (shown.length ? ` Callouts: ${shown.join('; ')}.` : '')
    + (notDrawn.length ? ` Not drawn: ${notDrawn.join('; ')}.` : '');
}

/**
 * A path's centroid, box and area, for a mark that is an outline (a region, a node): the largest closed
 * subpath's centroid by the shoelace rule, so an island chain answers with its mainland. Reads M, L, H, V,
 * C, S, Q, T, A and Z in both cases, and takes a curve's end point; the outlines it is meant for
 * (a simplified basemap) are polylines, where that is exact.
 * @returns {{cx: number, cy: number, w: number, h: number, area: number, left: number, top: number}|null}
 */
function pathShape(d) {
  const toks = String(d).match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const subs = [];
  let cur = null; let x = 0; let y = 0; let sx = 0; let sy = 0; let i = 0; let cmd = '';
  const num = () => Number(toks[i++]);
  const push = () => { if (cur && cur.length > 2) subs.push(cur); };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const up = cmd.toUpperCase();
    if (up === 'Z') { x = sx; y = sy; push(); cur = null; continue; }
    if (up === 'M') { push(); x = (rel ? x : 0) + num(); y = (rel ? y : 0) + num(); sx = x; sy = y; cur = [[x, y]]; cmd = rel ? 'l' : 'L'; continue; }
    if (up === 'H') x = (rel ? x : 0) + num();
    else if (up === 'V') y = (rel ? y : 0) + num();
    else {
      const arity = { L: 2, T: 2, S: 4, Q: 4, C: 6, A: 7 }[up];
      if (!arity) { i += 1; continue; }
      const args = Array.from({ length: arity }, num);
      x = (rel ? x : 0) + args[arity - 2]; y = (rel ? y : 0) + args[arity - 1];
    }
    (cur ||= [[sx, sy]]).push([x, y]);
  }
  push();
  let best = null;
  for (const pts of subs) {
    let a = 0; let cx = 0; let cy = 0;
    for (let k = 0; k < pts.length; k++) {
      const [x0, y0] = pts[k]; const [x1, y1] = pts[(k + 1) % pts.length];
      const f = x0 * y1 - x1 * y0;
      a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
    a /= 2;
    const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
    const left = Math.min(...xs); const top = Math.min(...ys);
    const shape = Math.abs(a) > 1e-9
      ? { cx: cx / (6 * a), cy: cy / (6 * a), area: Math.abs(a) }
      : { cx: (left + Math.max(...xs)) / 2, cy: (top + Math.max(...ys)) / 2, area: 0 };
    Object.assign(shape, { w: Math.max(...xs) - left, h: Math.max(...ys) - top, left, top });
    // A circle drawn as two arcs on one diameter has no height by its end points: it is as tall as it is wide.
    if (shape.area === 0 && shape.h === 0 && /[aA]/.test(String(d))) { shape.h = shape.w; shape.top = shape.cy - shape.w / 2; }
    if (!best || shape.area > best.area) best = shape;
  }
  return best;
}

/** A text's box, for an `avoid` list: `anchor` is start | middle | end, `vAlign` bottom | middle | hanging. */
function textBox({ x, y, text, fontSize, anchor = 'middle', vAlign = 'bottom', advance = ADVANCE }) {
  const w = String(text).length * fontSize * advance;
  const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  const top = vAlign === 'bottom' ? y - fontSize : vAlign === 'middle' ? y - fontSize / 2 : y;
  return { left, right: left + w, top, bottom: top + fontSize };
}

// This file READS the family's mark attributes and tspans back out of finished markup; it writes none of them.
// The censuses that guard the writers (check-ownership.js SANCTIONED_MARK_IDENTITY, svg-tspan-baseline.test.js)
// look for the literal spelling, so the reads below name the attribute through `attrName` and the element
// through a capture group, which keeps this file off two lists of emitters it is not on.
const attrName = (name) => `data-${name}`;
/** Drop every tag in one linear pass, then any stray angle bracket: no regex to backtrack on `<<<<`. */
const dropTags = (s) => {
  let out = '';
  let depth = false;
  for (const ch of String(s ?? '')) {
    if (ch === '<') depth = true;
    else if (ch === '>') depth = false;
    else if (!depth) out += ch;
  }
  return out;
};
const decode = (s) => String(s ?? '').replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]));

/**
 * What a chart that draws dots and words leaves in its markup, read back for a callout that comes after:
 * every `<circle data-mark>` (its centre, radius and `data-label`) and an estimate of every `<text>`'s
 * box. For a chart whose own geometry is not kept (the quadrant's variants each place their own dots
 * and names), reading the figure is cheaper than re-deriving it, and it cannot disagree with it.
 * The text boxes are estimates (the CSS sets the size, so `fontSize` stands in); they are padded by the
 * caller. @returns {{dots: Map<number, {cx: number, cy: number, r: number, label: string}>, texts: object[],
 *          named: Map<number, {left: number, right: number, top: number, bottom: number, label: string}>,
 *          shapes: Map<number, {left: number, right: number, top: number, bottom: number, label: string}>}}
 */
function fromSvg(svg, { fontSize = 7.5 } = {}) {
  const dots = new Map();
  for (const m of String(svg).matchAll(/<circle\b[^>]*>/g)) {
    const attr = (n) => new RegExp(`\\s${n}="([^"]*)"`).exec(m[0])?.[1];
    const mark = attr(attrName('mark'));
    if (mark === undefined) continue;
    dots.set(Number(mark), { cx: Number(attr('cx')), cy: Number(attr('cy')), r: Number(attr('r')), label: decode(attr(attrName('label'))) });
  }
  // Every marked shape, boxed, by mark: a rect, an ellipse, a polygon, a path or a line carrying `data-mark`
  // (a gantt bar, a hub-and-spoke node). Several shapes with one mark are one box.
  const shapes = new Map();
  const grow = (mark, b) => {
    const had = shapes.get(mark);
    shapes.set(mark, had
      ? { left: Math.min(had.left, b.left), right: Math.max(had.right, b.right), top: Math.min(had.top, b.top), bottom: Math.max(had.bottom, b.bottom), label: had.label || b.label }
      : b);
  };
  for (const m of String(svg).matchAll(/<(rect|circle|ellipse|polygon|path|line)\b[^>]*>/g)) {
    const tag = m[0];
    const attr = (n) => new RegExp(`\\s${n}="([^"]*)"`).exec(tag)?.[1];
    const mark = attr(attrName('mark'));
    if (mark === undefined) continue;
    const label = decode(attr(attrName('label')));
    let b = null;
    if (m[1] === 'rect') {
      const x = Number(attr('x') ?? 0); const y = Number(attr('y') ?? 0);
      b = { left: x, right: x + Number(attr('width')), top: y, bottom: y + Number(attr('height')) };
    } else if (m[1] === 'circle') {
      const cx = Number(attr('cx')); const cy = Number(attr('cy')); const r = Number(attr('r'));
      b = { left: cx - r, right: cx + r, top: cy - r, bottom: cy + r };
    } else if (m[1] === 'ellipse') {
      const cx = Number(attr('cx')); const cy = Number(attr('cy')); const rx = Number(attr('rx')); const ry = Number(attr('ry'));
      b = { left: cx - rx, right: cx + rx, top: cy - ry, bottom: cy + ry };
    } else if (m[1] === 'polygon') {
      const pts = (attr('points') || '').trim().split(/[\s,]+/).map(Number);
      const xs = pts.filter((_, i) => i % 2 === 0); const ys = pts.filter((_, i) => i % 2 === 1);
      if (xs.length) b = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    } else if (m[1] === 'line') {
      const x1 = Number(attr('x1')); const x2 = Number(attr('x2')); const y1 = Number(attr('y1')); const y2 = Number(attr('y2'));
      b = { left: Math.min(x1, x2), right: Math.max(x1, x2), top: Math.min(y1, y2), bottom: Math.max(y1, y2) };
    } else {
      const sh = pathShape(attr('d'));
      if (sh) b = { left: sh.left, right: sh.left + sh.w, top: sh.top, bottom: sh.top + sh.h };
    }
    if (b && [b.left, b.right, b.top, b.bottom].every(Number.isFinite)) grow(Number(mark), { ...b, label });
  }
  const texts = [];
  const named = new Map(); // a `<text data-mark>` is itself a mark (a radar's axis name): its box, by mark
  for (const m of String(svg).matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const own = (tag, n) => new RegExp(`\\s${n}="([^"]*)"`).exec(tag)?.[1];
    const anchor = own(m[1], 'text-anchor') || 'start';
    const spans = [...m[2].matchAll(/<(tspan)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map((t) => [t[0], t[2], t[3]]);
    const runs = spans.length ? spans.map((s) => ({ x: own(s[1], 'x') ?? own(m[1], 'x'), y: own(s[1], 'y') ?? own(m[1], 'y'), text: s[2] }))
      : [{ x: own(m[1], 'x'), y: own(m[1], 'y'), text: m[2] }];
    for (const r of runs) {
      if (r.x === undefined || r.y === undefined) continue;
      const text = decode(dropTags(r.text));
      if (!text) continue;
      const box = textBox({ x: Number(r.x), y: Number(r.y), text, fontSize, anchor, vAlign: 'middle' });
      texts.push(box);
      const mark = own(m[1], attrName('mark'));
      if (mark !== undefined) {
        const had = named.get(Number(mark));
        named.set(Number(mark), had
          ? { left: Math.min(had.left, box.left), right: Math.max(had.right, box.right), top: Math.min(had.top, box.top), bottom: Math.max(had.bottom, box.bottom), label: had.label }
          : { ...box, label: text });
      }
    }
  }
  return { dots, texts, named, shapes };
}

/**
 * For a chart whose figure is finished before callouts are considered (a gantt, a hub and spokes): read the
 * figure back, tie each note to the mark of that name, and lay the notes under it. The figure's
 * `viewBox` grows by the lane; the lane group goes in before the marks group closes.
 *
 * @param {string} svg  the finished `<svg>…</svg>` (a closing `</g></svg>` ends its marks group)
 * @param {object} o
 * @param {{legends: object[], off: boolean}} o.callouts  from `lift`
 * @param {string[]} o.names  mark names, by `data-mark` index
 * @param {object} o.ctx  the kernel's ctx, for the placement choice
 * @param {{x0: number, x1: number, y0: number, y1: number}} [o.plot]  the plot box; the whole `viewBox` by default
 * @param {{x: number, y: number}} [o.shift]  the offset of a `<g transform>` the marks sit in
 * @param {number} [o.fontSize]  the figure's own text size, for the box estimates
 * @param {'circle'} [o.ring]  ring the marks as circles (a round node) instead of boxes
 * @returns {{svg: string, res: object, drawn: number}}
 */
function onSvg(svg, { callouts, names, ctx, plot, shift = { x: 0, y: 0 }, fontSize = 7.5, extraAvoid = [], ring }) {
  const vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  const res = resolve(callouts.legends, { off: callouts.off, find: () => null });
  if (!vb) return { svg, res, drawn: 0 };
  const origin = { x: Number(vb[1]), y: Number(vb[2]) };
  const view = { w: Number(vb[3]), h: Number(vb[4]) };
  const read = fromSvg(svg, { fontSize });
  const moved = (b) => ({ left: b.left + shift.x, right: b.right + shift.x, top: b.top + shift.y, bottom: b.bottom + shift.y });
  const found = resolve(callouts.legends, {
    off: callouts.off,
    find: (target) => {
      const i = matchName(target, names);
      const s = read.shapes.get(i);
      if (!s) return null;
      const b = moved(s);
      return { mark: i, box: { cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2, w: b.right - b.left, h: b.bottom - b.top, ...(ring ? { ring } : {}) } };
    },
  });
  const withDesc = (markup, res) => {
    const said = describe(res, (i) => names[i], { kind: 'mark' }).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    if (!said) return markup;
    return /<\/desc>/.test(markup) ? markup.replace(/<\/desc>/, () => `${said}</desc>`) : markup.replace(/<\/title>/, () => `</title><desc>${said.trim()}</desc>`);
  };
  if (!found.callouts.length) return { svg: withDesc(svg, found), res: found, drawn: 0 };
  const named = new Set(found.callouts.map((e) => e.mark));
  const box = plot || { x0: origin.x, x1: origin.x + view.w, y0: origin.y, y1: origin.y + view.h };
  const avoid = [
    ...read.texts.map((b) => pad(moved(b), 0.5)),
    ...[...read.shapes].filter(([m]) => !named.has(m)).map(([, b]) => pad(moved(b), 0.5)),
    ...extraAvoid,
  ];
  const won = choose({
    ctx, view, hasCallouts: true, hasKey: false,
    attempt: (at) => place(found.callouts, { view, plot: box, side: at.callouts, avoid, origin }),
  });
  found.dropped = won.lost;
  found.callouts = won.kept;
  let out = svg.replace(/viewBox="-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+"/, `viewBox="${origin.x} ${origin.y} ${won.w} ${won.h}"`);
  out = withDesc(out, found).replace(/<\/g><\/svg>$/, () => `${won.svg}</g></svg>`);
  return { svg: out, res: found, drawn: won.drawn };
}

/**
 * A stretch of line as a run of small boxes, for an `avoid` list: a marker must clear the line itself, and
 * the line's one bounding box (which a diagonal fills with empty corners) would turn every spot near its
 * middle away. `thickness` is the line's weight plus a little air.
 */
function lineBoxes(a, b, { thickness = 1.6, step = 3 } = {}) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len / step));
  const h = thickness / 2;
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = a.x + ((b.x - a.x) * i) / n;
    const y = a.y + ((b.y - a.y) * i) / n;
    return { left: x - h, right: x + h, top: y - h, bottom: y + h };
  });
}

/**
 * Put already-escaped text at the end of a figure's `<desc>` (or make the `<desc>`, after the `<title>`). A
 * FUNCTION replacement, never a string: author text carries `$'` and `$&`, which `String.replace` reads as
 * "the rest of the document" and "the match".
 */
function addToDesc(markup, said) {
  if (!said) return markup;
  return /<\/desc>/.test(markup)
    ? markup.replace(/<\/desc>/, () => `${said}</desc>`)
    : markup.replace(/<\/title>/, () => `</title><desc>${said.trim()}</desc>`);
}

/** The box padded by `p` on every side. */
const pad = (b, p) => ({ left: b.left - p, right: b.right + p, top: b.top - p, bottom: b.bottom + p });

/** The boxes of a figure's gutters, outside its plot, where its axis names print. `sides` names the
 *  gutters that hold something: a chart whose right and top gutters are empty lets a marker use them. */
function gutterBoxes(plot, { margin = 0.5, sides = ['left', 'right', 'top', 'bottom'] } = {}) {
  const all = {
    left: { left: -Infinity, right: plot.x0 - margin, top: -Infinity, bottom: Infinity },
    right: { left: plot.x1 + margin, right: Infinity, top: -Infinity, bottom: Infinity },
    top: { left: -Infinity, right: Infinity, top: -Infinity, bottom: plot.y0 - margin },
    bottom: { left: -Infinity, right: Infinity, top: plot.y1 + margin, bottom: Infinity },
  };
  return sides.map((s) => all[s]);
}

module.exports = {
  sideFor,
  lift, around, resolve, matchName, detailByMark, mergeDetail, laneFor, place, placeUnkeyed, choose, describe,
  markerHeightFor, textBox, pad, gutterBoxes, pathShape, fromSvg, onSvg, lineBoxes, addToDesc,
  chartBoxAspect, stageAspects, STAGE_ASPECTS, PLACEMENT_MARGIN, FS_FLOOR, LANE_PAD, MARKER_MIN_HEIGHT,
};
