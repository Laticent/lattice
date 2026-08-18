/**
 * WHERE MERMAID DRAWS EACH GRAPHICAL OBJECT — the one copy.
 *
 * Shared by the gate (`test/unit/palette/diagram-nontext-contrast.test.js`) and
 * the on-demand audit (`tools/audit-diagram-contrast.mjs`), because two copies of
 * a table like this is how the two come apart while both stay green.
 *
 * WHY THIS IS WRITTEN OUT RATHER THAN DERIVED FROM `MERMAID_VAR_MAP`. Same reason
 * `diagram-ink-contrast.test.js` hard-codes its `SITES`: derive the pairing from
 * our own map and a mis-assigned key is simply re-judged against whatever tier it
 * was mis-assigned to, and the gate stays green through the exact mutation it
 * exists to catch. WHERE a thing is drawn is a fact about Mermaid, not about our
 * map, so it has to be stated independently of the map.
 *
 * ── SHAPES ──
 * A shape is judged by DISCERNIBILITY, not by any single pair. A node whose border
 * is invisible but whose fill separates cleanly from the canvas is perfectly
 * legible, and a gate that judged border-vs-fill alone would condemn it. So each
 * shape lists its three candidate edges and clearing 3:1 on ANY ONE of them is
 * enough:
 *
 *   fill vs canvas    the shape reads as a filled region
 *   border vs canvas  the outline reads against the page
 *   border vs fill    the outline reads as an inner edge
 *
 * Failing all three is a shape with no visible boundary at all — which is the
 * defect worth failing a build over.
 *
 * ── LINES ──
 * A line has no fill to fall back on, so it is judged on its single pair. Each row
 * names the surface the line is actually drawn on, which is NOT always the canvas:
 * a quadrant divider and a plotted point sit on a quadrant's own fill.
 *
 * ── THE FLOOR ──
 * WCAG 2.1 SC 1.4.11 Non-text Contrast: 3:1 for a graphical object required to
 * understand the content. Text is not judged here — `diagram-ink-contrast.test.js`
 * owns the 4.5:1 ink tier, and the two gates deliberately do not overlap.
 */

/** @type {[string, [string,string], [string,string], [string,string]][]} */
const SHAPES = [
  ['flowchart node',   ['mainBkg', 'background'],      ['nodeBorder', 'background'],   ['nodeBorder', 'mainBkg']],
  ['gantt task bar',   ['taskBkgColor', 'background'], ['taskBorderColor', 'background'], ['taskBorderColor', 'taskBkgColor']],
  ['pie slice',        ['pie1', 'background'],         ['pieOuterStrokeColor', 'background'], ['pieStrokeColor', 'pie1']],
  ['sequence actor',   ['actorBkg', 'background'],     ['actorBorder', 'background'],  ['actorBorder', 'actorBkg']],
  ['sequence note',    ['noteBkgColor', 'background'], ['noteBorderColor', 'background'], ['noteBorderColor', 'noteBkgColor']],
  ['subgraph cluster', ['clusterBkg', 'background'],   ['clusterBorder', 'background'], ['clusterBorder', 'clusterBkg']],
  // The three gantt LIFECYCLE bars. They are separate shapes from the default bar
  // above — a different fill and a different border key each — and they are the
  // reason discernibility is the rule rather than border-vs-fill. Judged on
  // border-vs-fill alone all three read as ~60/64 broken, because each `-mark`
  // stroke is a single value paired against three differently-hued fills. Judged on
  // whether the bar has ANY visible edge, they are clean: the fill carries it.
  ['gantt active bar',   ['activeTaskBkgColor', 'background'], ['activeTaskBorderColor', 'background'], ['activeTaskBorderColor', 'activeTaskBkgColor']],
  ['gantt done bar',     ['doneTaskBkgColor', 'background'],   ['doneTaskBorderColor', 'background'],   ['doneTaskBorderColor', 'doneTaskBkgColor']],
  ['gantt critical bar', ['critBkgColor', 'background'],       ['critBorderColor', 'background'],       ['critBorderColor', 'critBkgColor']],
];

/** @type {[string, string, string][]} — label, the line's color key, the surface under it */
const LINES = [
  ['flowchart edge',        'lineColor',        'background'],
  ['sequence signal arrow', 'signalColor',      'background'],
  ['sequence lifeline',     'actorLineColor',   'background'],
  ['gantt grid line',       'gridColor',        'background'],
  ['gantt today marker',    'todayLineColor',   'background'],
  ['quadrant frame',        'quadrantExternalBorderStrokeFill', 'background'],
  // The divider and the plotted points sit on the QUADRANT FILLS, not the canvas —
  // all four, which is why each is listed rather than sampling quadrant 1 and
  // calling it covered.
  ['quadrant divider vs Q1', 'quadrantInternalBorderStrokeFill', 'quadrant1Fill'],
  ['quadrant divider vs Q2', 'quadrantInternalBorderStrokeFill', 'quadrant2Fill'],
  ['quadrant divider vs Q3', 'quadrantInternalBorderStrokeFill', 'quadrant3Fill'],
  ['quadrant divider vs Q4', 'quadrantInternalBorderStrokeFill', 'quadrant4Fill'],
  ['quadrant point vs Q1',   'quadrantPointFill', 'quadrant1Fill'],
  ['quadrant point vs Q2',   'quadrantPointFill', 'quadrant2Fill'],
  ['quadrant point vs Q3',   'quadrantPointFill', 'quadrant3Fill'],
  ['quadrant point vs Q4',   'quadrantPointFill', 'quadrant4Fill'],
  // The xy chart paints its own plot canvas, which is not necessarily `--bg`.
  ['xy x-axis rule', 'xyChart.xAxisLineColor', 'xyChart.backgroundColor'],
  ['xy y-axis rule', 'xyChart.yAxisLineColor', 'xyChart.backgroundColor'],
  ['xy x-axis tick', 'xyChart.xAxisTickColor', 'xyChart.backgroundColor'],
  ['xy y-axis tick', 'xyChart.yAxisTickColor', 'xyChart.backgroundColor'],
];

/** WCAG 2.1 SC 1.4.11. */
const NON_TEXT_FLOOR = 3;

module.exports = { SHAPES, LINES, NON_TEXT_FLOOR };
