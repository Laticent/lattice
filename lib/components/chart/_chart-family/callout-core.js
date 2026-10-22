/**
 * callout-core.js — the half of the callout layer every chart needs, with or without a callout: lifting
 * the slide's callout paragraphs, the side the notes sit on, the placement choice (which also places a
 * key with no callout in sight), the stage's shape, and the boxes a marker must clear.
 *
 * The other half, `callout-place.js`, carries the lane, the markers and the readers, and pulls in
 * `legend-svg.js`. A chart reaches both through `callout-layer.js`, which loads that half only when a
 * slide has a callout (design note engineering/decisions/2026-10-20-callout-placement.md § 10).
 *
 * Pure JS, no DOM, no font metrics (HARD RULE #1): both render paths bundle this file.
 */

const { liftLegends } = require('../../../core/lift-label-set');
const { calloutsOff } = require('../../../core/legend');
const { ADVANCE } = require('./svg-label');
const CALLOUT_CATALOG = require('../../../core/callout-catalog.generated.js');
const { trialIds } = require('../../../core/render-ids');
const { collectLabelDrops } = require('./label-drops');

/** The smallest a callout's words set, in viewBox units: the floor the lane steps down to. */
const FS_FLOOR = 7.5;

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
 * @param {Array<'right'|'below'>} [o.noteSides]  the sides to try for the notes, when the chart is not content
 *        with the slide's one (`activeSide`). The heatmap tries both when the author names none.
 * @param {(place: {callouts: string, key: string}, final: boolean) => object} o.attempt  `final` is true for the one
 *        layout that is drawn for real, false for a trial
 */
function choose({ ctx, view, hasCallouts, hasKey, noteSides, attempt }) {
  const keyDefault = ctx.orientation === 'portrait' ? 'below' : 'right';
  const keyOther = keyDefault === 'right' ? 'below' : 'right';
  const tried = [];
  for (const callouts of hasCallouts ? noteSides ?? [activeSide === 'beside' ? 'right' : 'below'] : ['right']) {
    for (const key of hasKey ? [keyDefault, keyOther] : [keyDefault]) {
      const at = { callouts, key };
      tried.push({ at, ...trialIds(() => collectLabelDrops(() => attempt(at, false)).value) });
    }
  }
  const most = Math.max(...tried.map((t) => t.drawn));
  const drawnMost = tried.filter((t) => t.drawn === most);
  // Of those, the layouts that break the fewest words: a lane too narrow for its words loses to a layout
  // that sets them whole (a heatmap ellipsizes instead, reports no `split`, and so ties on this rule).
  const fewestSplit = Math.min(...drawnMost.map((t) => t.split ?? 0));
  const pool = drawnMost.filter((t) => (t.split ?? 0) === fewestSplit);
  const aspects = stageAspects(ctx, view);
  const kept = (t, aspect) => t.plot * Math.min(aspect / t.w, 1 / t.h) ** 2;
  const bestAt = aspects.map((a) => Math.max(...pool.map((t) => kept(t, a))));
  const share = (t) => Math.min(...aspects.map((a, i) => kept(t, a) / bestAt[i]));
  let best = pool[0];
  for (const t of pool) if (share(t) > share(best) * PLACEMENT_MARGIN) best = t;
  return attempt(best.at, true);
}

/** A text's box, for an `avoid` list: `anchor` is start | middle | end, `vAlign` bottom | middle | hanging. */
function textBox({ x, y, text, fontSize, anchor = 'middle', vAlign = 'bottom', advance = ADVANCE }) {
  const w = String(text).length * fontSize * advance;
  const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  const top = vAlign === 'bottom' ? y - fontSize : vAlign === 'middle' ? y - fontSize / 2 : y;
  return { left, right: left + w, top, bottom: top + fontSize };
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

/** The least a callout marker is tall, in viewBox units: the floor that keeps the shape a shape. */
const MARKER_MIN_HEIGHT = 3.8;

module.exports = {
  sideFor, lift, around, choose, stageAspects, chartBoxAspect, STAGE_ASPECTS, PLACEMENT_MARGIN,
  matchName, detailByMark, mergeDetail, addToDesc,
  textBox, pad, gutterBoxes, lineBoxes, FS_FLOOR, LANE_PAD, MARKER_MIN_HEIGHT,
};
