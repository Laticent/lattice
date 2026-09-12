/**
 * pigment · etching · ground — the three finishes, per the winning design
 * (Track 3, "Reach and Retreat"), rendered on today's members.
 *
 * STATUS: MEASURED AND FOUND SHORT. Read `scoring.md` before using this. As
 * written these three reach FIVE of twenty-one members, because every selector
 * here names `[data-cat]` and only bar, bullet, line, scatter and stacked-bar
 * emit it. `pigment` and `etching` render pixel-identical on 19 of 22 gallery
 * slides. The looks are not the problem; the substrate is. Kept as the record
 * of what the three are meant to be, and re-measurable in one command
 * (`tools/chart-finish-divergence.js`) once a slot contract exists.
 *
 * THE SEPARATION LEVER IS MARK BODY DEPTH — 82 / 30 / 50. It was claimed here
 * to be "present on 20 of 21 members"; measured, it is present on five. The
 * claim came from reading the mark CLASSES off a census that did not report
 * which ATTRIBUTE each mark keys its slot on — the arm that now exists.
 *
 * THE FLOOR — applies under every finish, because it is the correction, not a
 * style: every element that NAMES a mark wears that mark's hue, and every mark
 * carries its hue on its EDGE. Colour is never removed; a finish only moves
 * where its full strength sits.
 *
 * "Ink belongs to whatever owns it." Shared furniture (gridlines, bounds, axis
 * titles) is owned by no group, so it never takes a categorical hue — which is
 * why the neutral ladder does not contradict "colour carries context". A label
 * is owned; a gridline is not.
 *
 * PERCENTAGES SHIP AS -l/-d PAIRS, never inside light-dark(). Measured in
 * Chromium 131: `color-mix(in oklab, red light-dark(52%,62%), white)` is
 * unsupported and paints rgba(0,0,0,0) — a silent, fully transparent mark.
 * light-dark() is defined over two <color>s only.
 */

const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

// Marks that carry a categorical slot.
const SVG_MARKS = ['.wedge', '.funnel-band', '.bar-mark', '.sbar-seg', '.waterfall-bar', '.scatter-dot', '.quadrant-dot', '.map-region', '.gantt-bar'];

/** Selector list for one categorical slot across every SVG mark class. */
const slotSel = (n) => SVG_MARKS.map((m) => `:is(section.chart-frame) ${m}[data-cat="${n - 1}"]`).join(',\n');

/** A body fill at depth `l` on light / `d` on dark, per categorical slot. */
const body = (l, d) => SLOTS.map((n) => `${slotSel(n)}{fill:light-dark(` +
  `color-mix(in oklab,var(--chart-cat-${n}-hue) ${l},var(--chart-cat-base)),` +
  `color-mix(in oklab,var(--chart-cat-${n}-hue) ${d},var(--chart-cat-base)))!important;}`).join('\n');

/** The mark's edge — its hue on the boundary, at width w. */
const edge = (w) => SLOTS.map((n) =>
  `${slotSel(n)}{stroke:var(--chart-cat-${n}-ink)!important;stroke-width:${w}!important;}`).join('\n');

/** The pie keys its wedges by data-mark, not data-cat. */
const wedge = (l, d) => SLOTS.map((n) =>
  `:is(section.piechart) .wedge[data-mark="${n - 1}"]{fill:light-dark(` +
  `color-mix(in oklab,var(--chart-cat-${n}-hue) ${l},var(--chart-cat-base)),` +
  `color-mix(in oklab,var(--chart-cat-${n}-hue) ${d},var(--chart-cat-base)))!important;` +
  `stroke:var(--chart-cat-${n}-ink)!important;}`).join('\n');

/** An HTML mark paints a background rather than a fill. */
const bodyBg = (sel, l, d) => SLOTS.map((n) =>
  `${sel}[data-cat="${n - 1}"]{background:light-dark(` +
  `color-mix(in oklab,var(--chart-cat-${n}-hue) ${l},var(--chart-cat-base)),` +
  `color-mix(in oklab,var(--chart-cat-${n}-hue) ${d},var(--chart-cat-base)))!important;}`).join('\n');

/**
 * The FLOOR. Every finish carries it. This is the colour-brief correction:
 * colour is relocated and re-ranked, never removed.
 */
const FLOOR = `
/* Every NAME wears the hue of what it names. --chart-cat-N-ink is the token for
   exactly this — solved to AA against the canvas in 224 of 224 theme x mode x
   slot combinations, and already used correctly by line, stacked-bar and
   timeline-list. Generalised, not invented. */
${SLOTS.map((n) => `:is(section.chart-frame) .chart-key-label[data-cat="${n - 1}"],
:is(section.chart-frame) .sbar-name[data-cat="${n - 1}"],
:is(section.chart-frame) .cart-series[data-cat="${n - 1}"]{fill:var(--chart-cat-${n}-ink)!important;}`).join('\n')}

/* The pie's key entries carry no data-cat, so they key by position — the same
   0-based order the wedges use. */
${SLOTS.map((n) => `:is(section.piechart) .chart-key-label:nth-of-type(${n}){fill:var(--chart-cat-${n}-ink)!important;}`).join('\n')}

/* The DOME IS DEAD and RADAR KEEPS ITS ALPHA — settled, and no finish reaches
   either. Quadrant zones are reference regions: quiet, so their dots out-rank
   the field they sit in. */
${SLOTS.map((n) => `:is(section.quadrant) .quadrant-tint[data-cell="${n - 1}"]{fill:var(--chart-cat-${n}-fill)!important;fill-opacity:.5!important;}`).join('\n')}

/* Shared furniture is owned by NO group, so it never takes a categorical hue.
   That is the distinction the earlier chrome ladder got wrong: it demoted the
   labels along with the gridlines, when a label is owned and a gridline is not. */
:is(section.chart-frame) :is(.cart-grid,.cart-axis,.cart-zero,.quadrant-bounds,.quadrant-split){
  stroke:color-mix(in oklab,var(--border) 80%,transparent)!important;
}
/* --accent is the emphasis colour and never furniture. gantt painted its ticks
   in it — the loudest token on the quietest text in the figure. */
:is(section.chart-frame) .gantt-tick{fill:var(--text-muted)!important;}
`;

const FINISHES = [
  {
    id: 'pigment',
    name: 'Pigment',
    tagline: 'Full strength in the body.',
    lever: 'body 82%',
    properties: [
      'The mark body carries the hue at full strength — 82%.',
      'A single-weight edge in the category ink.',
      'Every name wears its mark\'s colour; values stay on the neutral ladder.',
      'No ground, no figure frame.',
    ],
    forWhat: 'The default, and the smallest move from what ships. The mark is the statement and the denominator is not drawn.',
    css: `
${body('82%', '82%')}
${wedge('82%', '82%')}
${edge(1)}
${bodyBg(':is(section.matrix-grid) .cell-filled', '26%', '34%')}
`,
  },
  {
    id: 'etching',
    name: 'Etching',
    tagline: 'Full strength in the line and the letter.',
    lever: 'body 30% · edge 2×',
    properties: [
      'The body retreats to a whisper — 30% light, 40% dark.',
      'A doubled edge in the category ink carries the identity.',
      'Values, category labels and ticks all move to their mark\'s colour.',
      'Filled marks become drawn ones: a scatter dot goes hollow, a funnel band an outline.',
    ],
    forWhat: 'The drafted sheet. Identity moves out of the area and into the boundary and the words — which is where the family\'s most contrast-solved tier already lives.',
    css: `
${body('30%', '40%')}
${wedge('30%', '40%')}
${edge(2)}
/* THE LETTER TAKES FULL STRENGTH.
   Multi-group members need their naming elements to carry data-cat, which they
   do not today — .cart-value and .cart-cat emit none. That is the design's F4
   (one emitter contract) and it is a TRANSFORM change, not a CSS one; it is
   costed, not hidden. What IS safe without it: a chart whose marks are all one
   group. Its names can belong to nothing else, so they take that group's ink by
   rule rather than by attribute. bar, waterfall and funnel are that case. */
:is(section.bar, section.waterfall, section.funnel) :is(.cart-value, .funnel-value, .waterfall-delta, .waterfall-total-value){
  fill:var(--chart-cat-1-ink)!important;
}
/* the letter takes full strength: values, category labels and the mark's own ticks */
${SLOTS.map((n) => `:is(section.chart-frame) .cart-value[data-cat="${n - 1}"],
:is(section.chart-frame) .cart-cat[data-cat="${n - 1}"]{fill:var(--chart-cat-${n}-ink)!important;}`).join('\n')}
:is(section.chart-frame) :is(.cart-value,.funnel-value,.sbar-total,.waterfall-delta){font-weight:700!important;}
${bodyBg(':is(section.matrix-grid) .cell-filled', '12%', '18%')}
${SLOTS.map((n) => `:is(section.matrix-grid) .cell-filled[data-cat="${n - 1}"]{border-color:var(--chart-cat-${n}-ink)!important;border-width:2px!important;}`).join('\n')}
`,
  },
  {
    id: 'ground',
    name: 'Ground',
    tagline: 'Full strength in the field.',
    lever: 'body 50% · ground drawn',
    properties: [
      'The body drops to 50% to pay for the field it sits in.',
      'Each group is read against a drawn ground — the denominator made visible.',
      'Values wear their mark\'s colour; the figure declares its own ground and edge.',
      'A single-weight edge, as Pigment.',
    ],
    forWhat: 'The denominator matters: a bar\'s track is its headroom, a funnel\'s is the intake. Generalises to the family what bullet, quadrant and progress already have — and it is the finish an export can bake a ground from.',
    css: `
${body('50%', '50%')}
${wedge('50%', '50%')}
${edge(1)}
/* the value wears its group's colour */
${SLOTS.map((n) => `:is(section.chart-frame) .cart-value[data-cat="${n - 1}"]{fill:var(--chart-cat-${n}-ink)!important;}`).join('\n')}
/* the figure declares its own ground and edge — a translucent overlay, so it
   composites over a deck background image rather than mismatching --bg */
:is(section.chart-frame) .chart-body{
  background:color-mix(in oklab,var(--text-muted) 6%,transparent)!important;
  border:1px solid color-mix(in oklab,var(--border) 40%,transparent)!important;
  border-radius:3px!important;
}
${bodyBg(':is(section.matrix-grid) .cell-filled', '20%', '28%')}
`,
  },
];

const css = (f) => `${f.css}\n${FLOOR}`;

module.exports = { FINISHES, css, FLOOR };
