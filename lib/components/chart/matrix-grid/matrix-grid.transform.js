/**
 * matrix-grid — a verb/depth × reach grid. Chart-family member;
 * kernel-as-module.
 *
 * The one chart whose cells are tagged at PARSE time (the `matrixGridCells`
 * markdown-it plugin), so this kernel only re-homes the axis eyebrow, wraps the
 * table as the figure body, and pre-wraps the legend. The family dispatches
 * here through the `kernel` block in matrix-grid.manifest.json.
 */

const { escAttr, plainText } = require('../_chart-family/transform-utils');
const { derivedFrom, labelSetFor, resolveLabelSet } = require('../../../core/label-set');
const { liftLabelSet } = require('../../../core/lift-label-set');
const { buildHtmlLegend } = require('../../../core/html-legend');
const { SHAPES } = require('../../../core/matrix-grid-cells');

const LABEL_SET = labelSetFor('matrix-grid');
if (!LABEL_SET) {
  throw new Error(
    '[matrix-grid] no `labelSet` row in lib/core/label-set-catalog.generated.js. The catalog is '
    + 'generated from matrix-grid.manifest.json — run `node tools/build-stage-catalog.js` and commit it.',
  );
}

// Marker → the shape class the parse-time plugin stamps, from the one kernel
// that decides it (`SHAPES` in matrix-grid-cells.js). A second copy of this
// mapping is a second thing to keep true.
const MARKER_SHAPE = Object.freeze(Object.fromEntries(
  Object.entries(SHAPES).map(([marker, shape]) => [`[${marker}]`, shape]),
));

/**
 * The cell key — what the hollow and the faint boxes mean.
 *
 * TWO ROWS AT MOST, AND `[x]` IS DELIBERATELY NOT ONE OF THEM. A filled cell's
 * own trailing text is its label (`[x] Senior`), so the shape has no general
 * name; a row reading "filled" would repeat on every slide what the cell
 * already says better. The manifest declares that refusal in `labelSet.unkeyed`
 * with its reason, so `lint:deck` can tell an author who keys `[x]` WHY it is
 * not keyable instead of calling the key unknown.
 *
 * THE SWATCH IS NEUTRAL, and that is this component's own rule rather than an
 * oversight. A matrix-grid cell is colored by its ROW's category, not by its
 * state — `docs.md` says so outright: "the row hue carries category, not
 * state". So a key swatch cannot borrow a cell's color without asserting a row,
 * and the only thing it can honestly carry is the SHAPE. (obligation-matrix's
 * key does the opposite and reuses the cell's exact disc, because there the
 * color IS the semantic.)
 */
function buildCellKey(sectionHtml, authored) {
  const present = Object.keys(MARKER_SHAPE).filter((key) =>
    new RegExp(`class="cell ${MARKER_SHAPE[key]}\\b`).test(sectionHtml));
  const rows = resolveLabelSet(derivedFrom('matrix-grid', present), authored).map((m) => ({
    stateClass: MARKER_SHAPE[m.key],
    label: m.label,
    detail: m.detail,
  }));
  return buildHtmlLegend({
    listClass: 'matrix-grid-key',
    itemClass: 'matrix-grid-key-item',
    markClass: 'matrix-grid-key-mark',
    labelClass: 'matrix-grid-key-label',
    rows,
    ariaLabel: LABEL_SET.aria,
  });
}

// matrix-grid — verb/depth × reach grid (table), cells already tagged
// `<span class="cell cell-filled|cell-outlined|cell-empty">` by the
// matrixGridCells markdown-it plugin (lib/integrations/markdown-it/plugins.js,
// registered once in lib/engine/index.js's LATTICE_PLUGINS) — that runs at
// parse time, before this HTML-string stage ever sees the section, so there
// is no marker-tagging left to do here. This builder does three things:
// (1) splits the two-part eyebrow ("column axis · row axis") so the row-axis
// half can render as a rotated side label instead of running through the
// generic single-line eyebrow lift, (2) wraps the table in
// `.matrix-grid-figure` so the div-based chart-frame body matcher catches it
// (same reason roadmap wraps its table — see the comment above `roadmap`),
// and (3) wraps the trailing legend paragraph's inner content in one <span>.
// The shared `.chart-caption` rule (chart-family.css) is `display:flex;
// flex-direction:column` — fine for plain caption text, but every ELEMENT
// child (and every text run between elements) becomes its own flex item, so
// matrix-grid's swatch legend (`<strong>…</strong> · <em>…</em> — caveat`)
// would tear into four stacked lines instead of reading as one sentence.
// Pre-wrapping it in a span here means liftChartCaption (generic; runs after
// this builder) lifts ONE child into `.chart-caption`, so normal inline flow
// resumes inside it — the fix is local to matrix-grid, no shared-kernel change.
// A trailing directional glyph on an axis label — matrix-grid's col/row axis
// captions ("Wider reach →", "Deeper cognition ↑") — is normalized to a
// SOLID triangle (▶▲◀▼), never left as whatever thin arrow character the
// author typed. Two reasons, both found by rendering the real output and
// looking, not by reasoning from the Unicode spec: (1) a thin arrow stroke
// (→) doesn't carry the bold weight of the all-caps tracked label it sits
// next to — it reads as a stray mark, not a designed part of the label; a
// solid triangle is a filled shape, so it reads at the same visual weight
// regardless of font. (2) The row axis renders through `writing-mode:
// vertical-rl; transform:rotate(180deg)` (matrix-grid.styles.css) to lay the
// label along the gutter — arrow characters (Unicode "rotated" class) pick
// up vertical-rl's own 90° glyph rotation on TOP of that 180°, so an
// authored "↑" renders pointing LEFT, not up (confirmed by rendering it).
// Geometric-shape characters (▲▼) are "upright" class — vertical-rl does not
// additionally rotate them, so only the explicit 180° applies. The map below
// exploits that: a row-axis glyph is emitted PRE-FLIPPED (author "up" → emit
// ▼) so the 180° transform lands it the right way up, while the col axis
// (never rotated) emits the glyph for its true final direction.
// Axis arrows are GENERATED, never authored. The author writes the axis NAME
// (`Wider reach`); the direction glyph is this component's own chrome, so it
// cannot drift between the two axes or get typed in the wrong direction.
// Column axis points right (▶). Row axis is emitted PRE-FLIPPED (▼): the CSS
// rotates the rotated label 180°, so ▼ is what reads as ▲ on screen. Solid
// triangles rather than stroke arrows (→↑) because a filled shape holds the
// label's own bold weight, and because geometric shapes are Unicode "upright"
// class — unlike arrows they do NOT pick up vertical-rl's extra 90° rotation.
const AXIS_ARROW = { col: '▶', row: '▼' };
// Any arrow the author typed anyway is stripped before ours is appended, so a
// hand-written `Wider reach →` cannot end up as `Wider reach → ▶`.
const AUTHORED_ARROW_RE = /\s*[→←↑↓▶◀▲▼➔➤]\s*$/;

function axisLabel(text, axis) {
  const bare = text.replace(AUTHORED_ARROW_RE, '').trim();
  return bare ? `${bare} ${AXIS_ARROW[axis]}` : '';
}

function buildMatrixGridSection(html, ctx) {
  // Scope the eyebrow split to the paragraph immediately before the <h2>,
  // anchored at the end (`\s*$`) exactly like liftChartEyebrow — an unanchored
  // scan over the WHOLE section would also catch a code-only SUBTITLE (after
  // the h2) or a code-only LEGEND, silently shredding either and stealing half
  // of it into the rotated axis label.
  // The two axis names are authored as TWO separate inline-code spans in one
  // paragraph — `Wider reach`  `Deeper cognition` — placed with the rest of the
  // slide's framing text, not as a masthead eyebrow. Two codes in a paragraph is
  // the discriminator: a ONE-code paragraph is an ordinary chart eyebrow,
  // subtitle or legend and is left completely alone, which is also what keeps a
  // code-only subtitle/legend from being shredded into axis labels. No such
  // paragraph means no axis labels at all — the grid simply renders without them.
  // Lift the author's label set BEFORE the axis scan. The two grammars do not
  // collide by construction — the axis eyebrow is discriminated by holding TWO
  // code spans and a label set is a ONE-code paragraph — but the lift must still
  // run first so the set's paragraph never reaches the legend match below and
  // print as a caption. `liftLabelSet` passes a non-set one-code paragraph
  // through untouched, which is what keeps an ordinary eyebrow or subtitle safe.
  const lifted = liftLabelSet(html);
  html = lifted.html;
  let rowAxis = '';
  let colAxis = '';
  const AXIS_PARA_RE =
    /<p[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/p>/;
  const axisMatch = html.match(AXIS_PARA_RE);
  let body = html;
  if (axisMatch) {
    colAxis = axisLabel(plainText(axisMatch[1]), 'col');
    rowAxis = axisLabel(plainText(axisMatch[2]), 'row');
    body = html.slice(0, axisMatch.index) + html.slice(axisMatch.index + axisMatch[0].length);
  }
  const eyebrowHtml = body;
  const tableMatch = eyebrowHtml.match(/<table\b[^>]*>[\s\S]*?<\/table>/);
  if (!tableMatch) return { html: eyebrowHtml, cls: ctx.cls };
  // rowAxis/colAxis came out of markdown-it's already-escaped HTML (the
  // <code> text content), so plainText() above decoded them back to raw
  // text — escAttr() here is the ONE escaping pass for their new home in
  // an HTML attribute. Escaping a second time on top of the pre-escaped
  // text would turn a literal "&" into "&amp;amp;" once the browser
  // decodes the attribute.
  const rowAxisAttr = rowAxis ? ` data-row-axis="${escAttr(rowAxis)}"` : '';
  const colAxisAttr = colAxis ? ` data-col-axis="${escAttr(colAxis)}"` : '';
  const figureOpen = `<div class="matrix-grid-figure"${rowAxisAttr}${colAxisAttr}>`;
  // Function replacers throughout: a table cell or legend authored with a
  // literal `$&`, `` $` ``, `$'`, or `$$` would otherwise be reinterpreted as
  // a String.replace special replacement pattern against the SURROUNDING
  // html — splicing unrelated content into the table or the caption. A
  // function's return value is inserted verbatim, never re-scanned.
  // The key goes INSIDE the figure, directly under the grid — the same place
  // roadmap puts its status key, and for a reason that is not cosmetic: the
  // generic `liftChartCaption` runs AFTER this kernel and re-homes the trailing
  // paragraph into `.chart-caption` at the figure's own position, so a key left
  // as the figure's SIBLING ends up printed BELOW the author's caption, reading
  // as a footnote to the prose instead of as the grid's key. Measured on the
  // shipped gallery, not reasoned about.
  const cellKey = buildCellKey(eyebrowHtml, lifted.set);
  const wrapped = eyebrowHtml.replace(tableMatch[0],
    () => figureOpen + tableMatch[0] + cellKey + '</div>');
  const figureEnd = wrapped.indexOf(tableMatch[0]) + tableMatch[0].length
    + cellKey.length + '</div>'.length;
  const head = wrapped.slice(0, figureEnd);
  const tail = wrapped.slice(figureEnd);
  const legendMatch = tail.match(/<p([^>]*)>([\s\S]*?)<\/p>/);
  if (!legendMatch) return { html: head + tail, cls: ctx.cls };
  const legendOpenAttrs = legendMatch[1];
  const legendInner = legendMatch[2];
  const rewrappedTail = tail.replace(
    legendMatch[0],
    () => `<p${legendOpenAttrs}><span class="matrix-grid-legend">${legendInner}</span></p>`,
  );
  return { html: head + rewrappedTail, cls: ctx.cls };
}

module.exports = { transformSection: buildMatrixGridSection, buildMatrixGridSection };
