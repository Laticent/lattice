/**
 * callout-choose.js — the placement choice and what it reads: the slide's shape, the side the notes sit on, and
 * `choose`, which tries every placement and keeps the one that leaves the plot largest. A key with no callout
 * uses it too. It sits apart from `callout-core.js` (which lifts callout paragraphs through the Segno reader)
 * so the export's browser placer can carry `choose` without that reader.
 *
 * Pure JS, no DOM, no font metrics (HARD RULE #1): both render paths bundle this file.
 */

const CALLOUT_CATALOG = require('../../../core/callout-catalog.generated.js');
const { trialIds } = require('../../../core/render-ids');
const { collectLabelDrops } = require('./label-drops');

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

/** The side the chart being rendered resolved to; `around` (callout-core.js) sets it for the span of one render. */
const getSide = () => activeSide;
const setSide = (side) => {
  activeSide = side;
};

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

module.exports = {
  sideFor, choose, stageAspects, chartBoxAspect, STAGE_ASPECTS, PLACEMENT_MARGIN, getSide, setSide,
};
