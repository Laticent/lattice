/**
 * SUPERSEDED — folio / plate / relief / survey. Kept as the record of a failure
 * worth not repeating, and nothing here ships.
 *
 * Three things were wrong with it, and the third is why it is here rather than
 * deleted:
 *
 *   1. It varied furniture OPACITY and CORNER RADIUS. Nobody can see that. Only
 *      `plate` was distinguishable, and only because it had a ground — so on a
 *      member with no gradient, three of the four were one finish wearing four
 *      names.
 *   2. Its correctness layer STRIPPED colour where the rule said to MOVE it,
 *      taking matrix-grid's six categorical row hues to grey and leaving a
 *      filled cell and an empty one distinguishable only by their text.
 *   3. Its chrome ladder resolved every naming role toward neutral, which is
 *      right about rank and wrong about hue.
 *
 * The replacement — pigment / etching / ground, in finishes.spec.js — separates
 * on MARK BODY DEPTH (82 / 30 / 50), which is present on 20 of 21 members and
 * needs no gradient, no furniture and no frame. See colour-brief.md for the
 * principle all three of the above violated.
 */

/**
 * The four chart finishes — folio, plate, relief, survey — as they would ship.
 *
 * A SPECIFICATION, NOT ENGINE CODE. Nothing requires this file; it is the
 * executable form of the design in taxonomy.md § Who decides, kept because it
 * is what the prototype at
 * <https://claude.ai/code/artifact/4221feb6-efb8-4104-b7b2-8bcceaae70cc>
 * was rendered from, and because re-deriving four token blocks and a
 * correctness layer from prose is exactly the tax this note exists to avoid.
 * Implementation moves TOKENS into the members and deletes ADAPTER.
 *
 * ARCHITECTURE — this is the part that has to survive contact with new charts.
 * A preset is a block of TOKEN declarations on the section. It contains no
 * per-member selector at all. A future chart that uses the shared classes
 * inherits all four finishes for free — it pays nothing unless it introduces a
 * taxonomy cell none of these tokens can express (a genuinely new occlusion
 * class, say), which is the only kind of "novel" that should cost anything.
 *
 * Below, TOKENS is that shipping block. ADAPTER is the scaffolding that maps the
 * tokens onto today's members, which still hard-code their own paint; shipping
 * the language deletes the adapter by making each member read the tokens
 * directly. It is kept separate here so the size difference is visible rather
 * than claimed: the tokens are ~10 lines per preset, the adapter is shared.
 *
 * CORRECTNESS is constant across all four. Those are the measured defects —
 * the radial dome, the chrome ladder, colour spent on the wrong axis — and a
 * preset may not reach them. That is the line: a preset changes how a chart
 * LOOKS, never whether it can be READ.
 */

const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

// ── CONSTANT: the correctness layer ────────────────────────────────────────
// Identical under every preset. If a chart reads differently between two
// finishes because of something in here, that is a bug, not a style.
const CORRECTNESS = `
/* The dome dies. Pie wedges take the flat 82% their own legend swatch already
   paints, so the key finally matches the mark it names. */
${SLOTS.map((n) => `section.piechart .wedge[data-mark="${n - 1}"]{fill:color-mix(in oklab,var(--chart-cat-${n}-hue) 82%,var(--chart-cat-base))!important;}`).join('\n')}

/* Quadrant zones are REFERENCE REGIONS, not data. They drop to the quiet tint
   quadrant.styles.css already declares, so the dots out-rank their own field. */
${SLOTS.map((n) => `section.quadrant .quadrant-tint[data-cell="${n - 1}"]{fill:var(--chart-cat-${n}-fill)!important;fill-opacity:.55!important;}`).join('\n')}

/* Radar is UNTOUCHED. It is the family's only layered member, so its alpha ramp
   is the mechanism that lets three series be read through each other — not
   decoration. Rule N1. */

/* The chrome ladder: one rule colour, one tick ink, and never --accent on
   furniture. Today bar paints its zero rule in --text-body (a reference line
   out-ranking the labels it sits behind) and gantt paints its ticks in
   --accent (the emphasis colour, on the quietest text in the figure). */
:is(section.chart-frame) :is(.cart-zero,.cart-axis,.cart-grid){stroke:var(--chart-rule-ink)!important;}
:is(section.chart-frame) .gantt-tick{fill:var(--chart-tick-ink)!important;}
:is(section.chart-frame) .cart-tick{fill:var(--chart-tick-ink)!important;}
:is(section.chart-frame) :is(.cart-cat,.quadrant-label){fill:var(--chart-label-ink)!important;}
:is(section.chart-frame) :is(.cart-axis-title,.quadrant-axis-name){fill:var(--chart-title-ink)!important;}

/* Colour is spent on the axis the reader DECIDES from. matrix-grid spent six
   categorical hues on its ROW LABELS — the axis a reader decides least from,
   and the exact defect the kanban redesign already fixed once.

   Rows go neutral AND the colour MOVES to the cells — the half an over-eager
   neutralisation gets wrong. Neutralising the rows alone leaves a filled cell
   and an empty one distinguishable only by their text, which is a worse chart
   than the one we started with. matrix-grid's filled cells are not six
   categories; they are ONE highlighted path ("your level"), so they take one
   categorical slot and finally read as the marked thing. */
:is(section.matrix-grid) .matrix-grid-figure tbody tr{
  --row-hue:var(--chart-rule-ink)!important;
  --row-ink:var(--chart-label-ink)!important;
  --row-fill:color-mix(in oklab,var(--text-muted) 7%,var(--bg))!important;
}
:is(section.matrix-grid) .matrix-grid-figure td .cell.cell-filled{
  background:color-mix(in oklab,var(--chart-cat-1-hue) 26%,var(--bg))!important;
  border-color:color-mix(in oklab,var(--chart-cat-1-hue) 70%,var(--border))!important;
}
`;

// ── The adapter: tokens → today's members. Shipping deletes this. ──────────
const ADAPTER = `
/* figure ground + edge */
:is(section.chart-frame) .chart-body{
  background:var(--chart-frame-bg);
  border:var(--chart-frame-border);
  border-radius:var(--chart-frame-radius);
}
/* furniture presence */
:is(section.chart-frame) :is(.cart-grid,.quadrant-bounds,.quadrant-split,.radar-web,.radar-ring,.radar-spoke){
  opacity:var(--chart-furniture-presence);
}
/* a BARE mark's finish. --chart-shade-depth 0 collapses the wash to one flat
   value; any positive depth keeps the member's own cross-axis ramp. */
${SLOTS.map((n) => `section.bar .bar-mark[data-cat="${n - 1}"]{fill:var(--chart-mark-fill-${n});}`).join('\n')}
`;

const flatSlots = SLOTS.map(
  (n) => `  --chart-mark-fill-${n}: color-mix(in oklab, var(--chart-cat-${n}-hue) 82%, var(--chart-cat-base));`,
).join('\n');
// `initial` lets the member's own inline gradient win — the wash survives.
const shadedSlots = SLOTS.map((n) => `  --chart-mark-fill-${n}: initial;`).join('\n');

/** The chrome ladder, shared by every preset — one rung per role, in order. */
const LADDER = `
  --chart-rule-ink:  color-mix(in oklab, var(--border) 82%, transparent);
  --chart-tick-ink:  var(--text-muted);
  --chart-label-ink: var(--text-body);
  --chart-title-ink: var(--text-muted);`;

const PRESETS = [
  {
    id: 'folio',
    name: 'Folio',
    tagline: 'The newspaper page.',
    properties: [
      'Marks flat — one colour, one value.',
      'No ground, no edge. The chart sits directly on the slide.',
      'Furniture at half presence: a rule only where a magnitude must be compared.',
      'Square corners.',
    ],
    forWhat:
      'The boardroom default, and what the FT, the Economist and Datawrapper all do. Nothing between the reader and the data.',
    tokens: `${LADDER}
  --chart-frame-bg: transparent;
  --chart-frame-border: none;
  --chart-frame-radius: 0;
  --chart-furniture-presence: .55;
${flatSlots}`,
  },
  {
    id: 'plate',
    name: 'Plate',
    tagline: 'The illustration plate, bounded and set apart.',
    properties: [
      'Marks flat — identical to Folio.',
      'The figure declares a ground and draws a hairline edge.',
      'Furniture at half presence.',
      'A small corner radius, because the figure is now an object.',
    ],
    forWhat:
      'A chart among dense prose, a chart over a background image, a board pack where the figure has to read as a separate thing. Also the finish whose ground an export can bake.',
    tokens: `${LADDER}
  --chart-frame-bg: color-mix(in oklab, var(--text-muted) 5%, var(--bg));
  --chart-frame-border: 1px solid color-mix(in oklab, var(--border) 45%, transparent);
  --chart-frame-radius: 3px;
  --chart-furniture-presence: .55;
${flatSlots}`,
  },
  {
    id: 'relief',
    name: 'Relief',
    tagline: 'Material, with depth across the mark — never along it.',
    properties: [
      'A bare mark keeps its cross-axis shading.',
      'No ground, no edge.',
      'Furniture at half presence.',
      'A small corner radius.',
    ],
    forWhat:
      "Closest to what ships today. The shading is measured harmless — it runs across a bar's thickness, never along the length you read the number from, and the mark is identified by its edge at 5.34–11.93:1.",
    tokens: `${LADDER}
  --chart-frame-bg: transparent;
  --chart-frame-border: none;
  --chart-frame-radius: 3px;
  --chart-furniture-presence: .55;
${shadedSlots}`,
  },
  {
    id: 'survey',
    name: 'Survey',
    tagline: "The surveyor's sheet — every reference line present.",
    properties: [
      'Marks flat — identical to Folio.',
      'No ground; the grid does the framing.',
      'Furniture at full presence: every gridline, bound and split line drawn.',
      'Square corners.',
    ],
    forWhat:
      'Dense analytical decks where the reader takes values off the chart rather than reading a shape. The one finish that spends ink on reference rather than removing it.',
    tokens: `${LADDER}
  --chart-frame-bg: transparent;
  --chart-frame-border: none;
  --chart-frame-radius: 0;
  --chart-furniture-presence: 1;
${flatSlots}`,
  },
];

/** The full stylesheet for one preset, as a deck-level <style>. */
function css(preset) {
  return `section.chart-frame{\n${preset.tokens}\n}\n${ADAPTER}\n${CORRECTNESS}`;
}

module.exports = { PRESETS, css, CORRECTNESS, ADAPTER };
