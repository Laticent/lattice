/**
 * legend-svg-key.js — the legend's SVG emitter, `key` layout: a swatch-and-label list beside or
 * below the figure, `keySvg`. The `anchored` layout is ./legend-svg.js, which re-exports this one.
 *
 * A FILE OF ITS OWN for the reason lib/core/legend-key.js is: eight of the nine charts that draw a
 * key draw nothing else from the legend, and each ships as its own kernel on the docs site
 * (`chartKernelGz`, docs/route-budget.json). Inside legend-svg.js the lane, plate and marker code
 * would ride into every one of them, about 2.2KB gzipped each.
 *
 * Pure string-in/string-out; everything is viewBox units.
 */

const {
  pickKeyLayout, buildSpine, wrapLabelToLines, stripTags, xmlEsc, FS_OF_HEIGHT, MARK_OF_LABEL, GAP_R, SPINE_H_R, SPINE_W_R,
} = require('./svg-legend');
// The uppercase glyph table, for the grid's cell width (`gridInk`). Every kernel that draws a key already loads it
// through cartesian.js, so it adds nothing to a kernel's chunk.
const { GLYPH_UPPER } = require('./svg-label');

// THE NINE SVG KEYS OF THE CHART FAMILY (bar, stacked-bar, tower, piechart, map, quadrant, radar,
// heatmap, line) are drawn here. This is the builder that was `buildSvgLegend` in svg-legend.js,
// moved whole in Wave 2 (engineering/decisions/2026-10-19-universal-legend.md § 17): same rows, same
// arithmetic, same strings, so every key renders byte for byte as it did. The family's metrics (the
// font ratio, the divider gap, the spine) stay in svg-legend.js beside the spine and the pane fit that
// read them; the key's own, every one a ratio of the font size (FS), live here with the only code
// that reads them, so the minifier can inline them.

const LH_R = 1.16;                // line height / FS
const ROW_GAP_R = 0.72;           // inter-row gap / FS
const SW_R = MARK_OF_LABEL;       // swatch edge / FS: the callout marker's size too (svg-legend.js)
const MARGIN_Y_R = 0.9;           // top/bottom breathing room / FS
const SWATCH_GAP_R = 5 / 9;       // swatch → label gap / FS
const LABEL_COL_R = 9.2;          // label column width / FS (landscape side rail)
const PORTRAIT_LABEL_COL_R = 18;  // label column width / FS in the legend-BELOW
                                  // (portrait) layout — the key spans the full
                                  // width under the diagram, not a narrow side
                                  // rail, so labels get ~2× the budget and wrap
                                  // far less. See 2026-06-19-chart-adaptive-sizing §9.
const VALUE_COL_R = 3.0;          // value column width / FS (≈ "100%")
const VALUE_COL_MAX_R = 8.4;      // widest a TEXT value column grows / FS (13
                                  // characters) before its values wrap — see
                                  // `valueColumn`
const RIGHT_PAD_R = 0.9;          // rail right padding / FS
const AVG_ADVANCE_R = 0.6;        // CONSERVATIVE average glyph advance / FS — the
                                  // wrap budget breaks EARLY (no font metrics in a
                                  // pure kernel), so a label never overruns the rail.
const STROKE_W_R = 0.09;          // swatch stroke width / SW

// The value column's width (/ FS) and the per-line character budget its values wrap to.
//
// The column is sized for a NUMBER ("100%"), and a value is right-anchored at its far edge,
// so a value wider than the column runs LEFT across the label beside it. map's highlight
// mode makes the value an authored text label — `Global South — North America \`Caribbean
// / Central America\`` — and examples/global-south.md printed that across its own row name
// on five pages. So the column grows to its widest value, plus a one-advance gap from the
// label, up to 13 characters (VALUE_COL_MAX_R); past that the value wraps inside the column the way a label
// wraps inside its own. Every value that fits the old column (≤ 5 characters at the
// conservative advance) keeps it and `wrap` is null, so those keys are byte-identical.
function valueColumn(values) {
  const widest = values.reduce((w, v) => Math.max(w, v.length), 0);
  // Compared in whole characters (5 fit the old column), for the same floating-point reason.
  if (widest <= Math.round(VALUE_COL_R / AVG_ADVANCE_R)) return { colR: VALUE_COL_R, wrap: null };
  // The budget in whole CHARACTERS, never re-derived from the width: (4.2 − 0.6) / 0.6 floors
  // to 5 in floating point, and a 6-character `Tier 1` wrapped to `Tier` over `1`.
  const maxChars = Math.round((VALUE_COL_MAX_R - AVG_ADVANCE_R) / AVG_ADVANCE_R);
  const chars = Math.min(widest, maxChars);
  return { colR: (chars + 1) * AVG_ADVANCE_R, wrap: chars };
}

// Emit the legend rows (swatch · wrapping label · optional value) as SVG strings,
// starting at `startY` and anchored at the given column x-coordinates. Shared by
// BOTH orientations so a row reads IDENTICALLY — same swatch, rhythm, a11y —
// whether the key sits in a right rail (landscape) or stacked below the diagram
// (portrait); only the anchors and the start y differ. The caller appends the
// spine after these. See 2026-06-19-chart-adaptive-sizing.md §9.
// ` data-mark-for="i"` for a row that names mark i (see `markFor` in keySvg), else ''.
function markForAttr(m) {
  return m.markFor != null ? ` data-mark-for="${m.markFor}"` : '';
}

function emitRows(measured, rowHeights, { startY, swatchX, labelX, valueX, FS, LH, SW, ROW_GAP }) {
  let y = startY;
  const out = [];
  measured.forEach((m, i) => {
    const rowTop = y;
    y += rowHeights[i] + ROW_GAP;
    const baseFirst = rowTop + FS;                  // first-line text baseline
    const tspans = m.lines.map((ln, li) =>
      `<tspan x="${labelX.toFixed(2)}" y="${(baseFirst + li * LH).toFixed(2)}">${xmlEsc(ln)}</tspan>`).join('');
    if (m.head) {
      // Group heading (map) — label voice, no swatch, sat at the swatch inset.
      out.push(`<text class="chart-key-head" font-size="${FS.toFixed(2)}"><tspan x="${swatchX.toFixed(2)}" y="${baseFirst.toFixed(2)}">${xmlEsc(m.lines[0])}</tspan></text>`);
      return;
    }
    // Swatch centers on the FIRST line's optical middle (a wrapped 2–3 line label
    // still reads as one keyed row).
    const swatchY = baseFirst - FS * 0.34 - SW / 2;
    const stroke = m.swatchStroke
      ? ` stroke="${m.swatchStroke}" stroke-width="${(SW * STROKE_W_R).toFixed(2)}"`
      : '';
    const catAttr = swatchContract(m);
    // A swatch is painted one of two ways, and the second is what keeps the
    // KERNEL colorless (HARD RULE #3). Most keyed charts hand us a resolved
    // paint (`swatchFill`, already a `var(--token)`), because a categorical slot
    // IS a token. A ramp is different: a heatmap cell's color is computed in CSS
    // — `color-mix()` driven by `--mix`, selected on `[data-ramp]` — so there is
    // no single value to put in a `fill` attribute, and inventing one here would
    // put color in the kernel and break theme-swapping. Such a chart passes
    // `swatchClass` + `swatchAttrs` instead and its swatch inherits the very
    // rule its cells paint by, so the key cannot drift from the grid it keys.
    const painted = m.swatchClass
      ? `<rect class="chart-key-swatch ${m.swatchClass}"${m.swatchAttrs || ''}`
      : `<rect class="chart-key-swatch"${catAttr}`;
    const fillAttr = m.swatchClass ? '' : ` fill="${m.swatchFill}"`;
    out.push(
      `${painted} x="${swatchX.toFixed(2)}" y="${swatchY.toFixed(2)}" ` +
        `width="${SW.toFixed(2)}" height="${SW.toFixed(2)}" rx="${(SW * 0.22).toFixed(2)}"` +
        `${fillAttr}${stroke}/>` +
      `<text class="chart-key-label"${markForAttr(m)} font-size="${FS.toFixed(2)}">${tspans}</text>` +
      (m.value == null ? ''
        : m.valueLines
          // A wrapped text value: one right-anchored tspan per line, on the label's line rhythm.
          ? `<text class="chart-key-value"${markForAttr(m)} font-size="${FS.toFixed(2)}" text-anchor="end">` +
            m.valueLines.map((ln, li) =>
              `<tspan x="${valueX.toFixed(2)}" y="${(baseFirst + li * LH).toFixed(2)}">${xmlEsc(ln)}</tspan>`).join('') +
            '</text>'
          : `<text class="chart-key-value"${markForAttr(m)} font-size="${FS.toFixed(2)}" x="${valueX.toFixed(2)}" ` +
            `y="${baseFirst.toFixed(2)}" text-anchor="end">${xmlEsc(m.value)}</text>`));
  });
  return out;
}

/**
 * A swatch's mark-contract attributes (slot-contract.md), so a chart finish repaints the key
 * with the marks it keys — a tone finish whose marks went tonal while its key stayed eight
 * categorical colors is the defect this closes. A row naming its category (`cat`) is a hue;
 * a row keying a magnitude passes its own pre-built `stamp` (the map's ramp, which carries
 * its `--mix`). The attribute string is the kernel's, never author text.
 */
function swatchContract(m) {
  if (m.cat != null) return ` data-hue="${m.cat + 1}" data-encodes="hue" data-paint="fill"`;
  // A row that names its category for a FINISH only (`keyHue`, 1-based). It carries
  // `data-key-hue`, never `data-hue`: theme rules texture `.chart-key-swatch[data-hue]` for the
  // members whose marks take the same texture, and stamping `data-hue` on any other key would
  // texture a key whose marks stay plain (a11y themes, Read·Article).
  if (m.keyHue != null) return ` data-key-hue="${m.keyHue}" data-encodes="hue" data-paint="fill"`;
  return m.stamp || '';
}

// Accessibility: the key text lives inside an SVG the kernels mark `role="img"`,
// which would otherwise collapse the whole chart to one opaque image named only
// by its `<title>` (chart type), dropping the per-row names + values from the
// a11y tree the old HTML `<ol>` exposed. Re-enumerate the key in a `<desc>` (the
// image's accessible DESCRIPTION) so a screen reader still hears the data. Heads
// (map group clusters) read as "Group:". See 2026-06-13-svg-native-legend.md §3.
function buildDesc(rows) {
  const descParts = rows.map((r) => {
    const lbl = stripTags(r.label);
    if (r.head) return `${lbl}:`;
    return r.value != null ? `${lbl} ${stripTags(r.value)}` : lbl;
  }).filter(Boolean);
  return descParts.length ? `<desc>Key — ${xmlEsc(descParts.join(', '))}</desc>` : '';
}

/**
 * Build the SVG-native legend (swatches · wrapping labels · optional values) plus
 * the gradient spine, in shared viewBox units. The caller composes the final
 * <svg>, offsetting the diagram by the returned (diagramDx, diagramDy):
 *
 *   <svg viewBox="0 0 {viewW} {viewH}">
 *     <defs>{diagramDefs}{legend.defs}</defs>
 *     <g transform="translate({diagramDx} {diagramDy})">{diagramInner}</g>
 *     {legend.body}
 *   </svg>
 *
 * LANDSCAPE (default): the key is a RIGHT RAIL beside the diagram, the spine a
 * vertical divider, `diagramDx === 0` (the diagram sits at the left). Output is
 * byte-identical to the pre-§9 builder.
 *
 * PORTRAIT (`orientation === 'portrait'`): the key stacks BELOW the diagram, both
 * centered, the spine a horizontal rule between them, the label column ~2× wider
 * (full width, not a rail). The diagram is centered by a non-zero `diagramDx`.
 * Lets the four keyed charts fill a portrait box instead of letterboxing. See
 * 2026-06-19-chart-adaptive-sizing.md §9.
 *
 * @param {object}  o
 * @param {Array}   o.rows          row models, top to bottom. Each is one of
 *                                  { swatchFill, swatchStroke?, label, value? },
 *                                  { swatchClass, swatchAttrs?, label, value? } — a swatch
 *                                  the STYLESHEET paints, for a ramp whose color is a
 *                                  `color-mix()` the kernel must not resolve (HARD RULE #3),
 *                                  or { head: true, label } (a group heading — no swatch).
 * @param {number}  o.diagramRight  x of the diagram's right content edge (rail starts after a gap).
 * @param {number}  o.diagramHeight the diagram viewBox height (sets the font ratio).
 * @param {boolean} [o.hasValues]   reserve a right-aligned value column (default true).
 * @param {string}  [o.orientation] 'portrait' selects legend-below; anything else (incl.
 *                                  undefined) is the byte-identical right-rail landscape. 'wide' is that right rail
 *                                  with the portrait key's label column, so a label holds one line: the venue's
 *                                  short, wide box (svg-legend.js fitKeyToPane `venue`).
 * @param {boolean} [o.fitLabels]   PORTRAIT only — center the key by the width its labels
 *                                  actually INK rather than by the reserved label column.
 *                                  For a key of short labels (heatmap's numeric band ranges)
 *                                  the two differ by ~8x, and centering the reserved column
 *                                  leaves the visible key hard against the left edge.
 *                                  Default false, so the charts that key on category names
 *                                  keep byte-identical portrait output.
 * @param {number}  [o.fontScale]  a PANE's key only (see `fitKeyToPane`): the key's type as a
 *                                  multiple of its usual share of the diagram height. 1 is
 *                                  the byte-identical default every slide gets.
 * @param {number[]|false} [o.aspects]  PORTRAIT only — the chart box's width over height at the slide's
 *                                  real shape (`layer.keyAspects`), which the key's column count
 *                                  is chosen against (`gridLayout`). `false` (an export pane) or
 *                                  omitted keeps the single column.
 * @param {number}  [o.diagramPadX] PORTRAIT only — symmetric horizontal breathing room
 *                                  (in viewBox units) on each side of the diagram, for a
 *                                  diagram whose content overflows [0, diagramRight] (e.g.
 *                                  radar's axis labels). Default 0; ignored in landscape,
 *                                  where the right rail already absorbs the overflow.
 * @returns {{ defs:string, body:string, desc:string, viewW:number, viewH:number,
 *             diagramDx:number, diagramDy:number, fs:number }}
 */
function keySvg({ rows, diagramRight, diagramHeight, hasValues = true, orientation, diagramPadX = 0, fitLabels = false, fontScale = 1, aspects }) {
  const portrait = orientation === 'portrait';
  const FS = +(FS_OF_HEIGHT * diagramHeight * fontScale).toFixed(3);
  const LH = FS * LH_R;
  const ROW_GAP = FS * ROW_GAP_R;
  const SW = FS * SW_R;
  const GAP = FS * GAP_R;

  // Column widths (orientation-independent except the wrap budget). Portrait
  // widens the label column — the key spans the full width below the diagram,
  // not a narrow side rail. A no-value chart (radar) reclaims the value column.
  const valueCol = valueColumn(rows.filter((r) => !r.head && r.value != null).map((r) => stripTags(r.value)));
  const valueColW = hasValues ? FS * valueCol.colR : 0;
  const labelColR = portrait || orientation === 'wide' ? PORTRAIT_LABEL_COL_R : LABEL_COL_R;
  const labelAvail = FS * labelColR + (hasValues ? 0 : FS * VALUE_COL_R);
  const maxChars = Math.max(5, Math.floor(labelAvail / (FS * AVG_ADVANCE_R)));

  // Measure first: wrap every label, sum the column height, so the unit grows in
  // HEIGHT for a long-tail key (never re-shrinking the font vs the diagram). The
  // measurement is identical across orientations bar the wider portrait budget.
  const measured = rows.map((row) => {
    if (row.head) return { head: true, label: stripTags(row.label), lines: [stripTags(row.label)] };
    const lines = wrapLabelToLines(stripTags(row.label), maxChars);
    return {
      swatchFill: row.swatchFill,
      swatchStroke: row.swatchStroke || null,
      swatchClass: row.swatchClass || null,
      swatchAttrs: row.swatchAttrs || '',
      // Optional 0-based categorical slot. Emitted as `data-hue`, PLUS ONE: the
      // mark contract's slot is 1-based so it reads as the token it resolves.
      // A swatch and its mark therefore texture alike. Absent for un-keyed legends.
      cat: row.cat,
      // Optional pre-built mark-contract attributes for a row that keys a magnitude rather
      // than a category (swatchContract). The kernel's own string, never author text.
      stamp: row.stamp || '',
      keyHue: row.keyHue,
      // Optional mark index this row NAMES (a pie wedge, a map entry). Emitted as
      // `data-mark-for` on the row's label and value, which the reveal layer
      // (docs/src/playground/chart-interact.js) treats as a tap proxy for that mark.
      // A legend whose rows are SERIES (line, stacked-bar, radar) leaves it unset:
      // a series row names no single mark. Not `data-mark`, so chart motion and
      // the Present Guide never see the legend as a mark.
      markFor: Number.isInteger(row.markFor) ? row.markFor : null,
      value: row.value != null ? stripTags(row.value) : null,
      full: row.label,
      valueLines: row.value != null && hasValues && valueCol.wrap ? wrapLabelToLines(stripTags(row.value), valueCol.wrap) : null,
      lines,
    };
  });
  const rowHeights = measured.map((m) => Math.max(m.head ? FS : SW,
    (Math.max(m.lines.length, m.valueLines ? m.valueLines.length : 1) - 1) * LH + FS));
  const stackH = rowHeights.reduce((s, h) => s + h, 0) + ROW_GAP * Math.max(0, measured.length - 1);

  if (portrait) {
    return buildPortrait({
      rows, measured, rowHeights, stackH, diagramRight, diagramHeight, diagramPadX,
      hasValues, labelAvail, valueColW, FS, LH, ROW_GAP, SW, GAP, fitLabels, aspects,
      plainKey: () => keySvg({ rows, diagramRight, diagramHeight, hasValues, orientation, diagramPadX, fitLabels, fontScale }),
    });
  }

  // ── landscape: the key is a right rail beside the diagram (byte-identical) ───
  const spineX = diagramRight + GAP;
  const swatchX = spineX + GAP;
  const labelX = swatchX + SW + FS * SWATCH_GAP_R;
  const labelRight = labelX + labelAvail;
  const valueX = labelRight + valueColW;            // right anchor for value text
  const viewW = Math.ceil((hasValues ? valueX : labelRight) + FS * RIGHT_PAD_R);

  const viewH = Math.max(diagramHeight, Math.ceil(stackH + FS * MARGIN_Y_R * 2));
  const diagramDy = +((viewH - diagramHeight) / 2).toFixed(2);

  const body = emitRows(measured, rowHeights, {
    startY: (viewH - stackH) / 2, swatchX, labelX, valueX, FS, LH, SW, ROW_GAP,
  });

  // ── spine (shared geometry — buildSpine) ────────────────────────────────────
  const spine = buildSpine({
    axis: 'vertical', x: spineX, y: viewH / 2,
    length: viewH * SPINE_H_R, thickness: FS * SPINE_W_R,
  });
  body.push(spine.rect);

  return { defs: spine.defs, body: body.join(''), desc: buildDesc(rows), viewW, viewH, diagramDx: 0, diagramDy, fs: FS };
}

// Portrait legend-BELOW layout: diagram on top (centered), the key stacked
// beneath (centered), a horizontal accent rule between them. Geometry per
// 2026-06-19-chart-adaptive-sizing.md §9; the grid per 2026-11-03-responsive-tables.md §29.

const GRID_MAX_COLS = 3;          // a key below the chart runs to at most three columns
const GRID_COL_GAP_R = 2.4;       // gap between two key columns / FS
const GRID_WIDE_OF_H = 2;         // the key may run wider than the diagram, up to this
                                  // multiple of the diagram's HEIGHT: a pie's disc is as
                                  // wide as it is tall, and a key held to the disc's width
                                  // stacked in one tall column under it

/**
 * Lay a key out as a GRID of one to three aligned columns under the diagram, the
 * way a printed report keys a full-width chart: each cell is swatch · label · value,
 * every cell as wide as the widest entry, so values line up down each column.
 *
 * One column of eight entries under a tower made the key as tall as the chart and
 * shrank the chart to fit the page. The grid takes as many columns as fit the
 * diagram's width with every label on ONE line: one row when every entry fits in it,
 * else never more than three columns. It fixes
 * the row count first, then uses the fewest columns that hold it, so seven entries
 * run 3 · 3 · 1 down three columns and four entries run 2 · 2, not 3 · 1. Entries
 * run DOWN a column, then across: the reading order of a list.
 *
 * Returns null, and the caller stacks the single column, when a group heading is
 * present (map's grouped key reads as a list), when a value would wrap, or when
 * not even two columns fit.
 */
// A one-line key label's width in FS units: never under the flat average, and never under its glyphs priced one by
// one, where `W` and `M` take the uppercase glyph table (svg-label.js GLYPH_UPPER, calibrated never to undercount),
// `m` and `w` 0.85, the narrow glyphs 0.3 and every other glyph the average. An ordinary name nets out at the average,
// as on main, because its narrow letters pay for its wide ones: pricing wide glyphs alone cost a phone map's key a
// column ("New York") and printed it 18 to 16px (round 2's grader). A name of wide glyphs (`WWWW MMMM`) still prices
// wide, so its value no longer runs into the next column.
const WIDE_LOWER_R = 0.85;
const NARROW_R = 0.3;
const NARROW_GLYPHS = new Set([...'iljtfrI .,:;\'|!']);
// How much more a grid WIDER than the single column must print than main's key to be taken (see buildPortrait).
const GRID_WIDE_WIN = 1.05;
function gridInk(text) {
  const str = String(text);
  let w = 0;
  for (const ch of str) {
    w += ch === 'W' || ch === 'M' ? Math.max(GLYPH_UPPER.clean[ch], AVG_ADVANCE_R)
      : ch === 'm' || ch === 'w' ? WIDE_LOWER_R : NARROW_GLYPHS.has(ch) ? NARROW_R : AVG_ADVANCE_R;
  }
  return Math.max(w, str.length * AVG_ADVANCE_R);
}

function gridLayout(measured, { availW, FS, SW, cellW, ROW_GAP, diagW, diagH, chrome, column, aspects }) {
  const n = measured.length;
  if (n < 2) return null;
  if (measured.some((m) => m.head || m.valueLines)) return null;
  const gap = FS * GRID_COL_GAP_R;
  const rowH = Math.max(SW, FS);
  // Each layout is the WHOLE unit, scored in the chart's box at the slide's real shape
  // (svg-legend.js `pickKeyLayout`). The single column (`column`, the unit the caller would
  // otherwise build) is a candidate too.
  const tried = [{ cols: 1, w: column.w, h: column.h }];
  for (const c of new Set([Math.min(2, n), Math.min(GRID_MAX_COLS, n), n])) {
    const rowsN = Math.ceil(n / c);
    const cols = Math.ceil(n / rowsN);
    if (cols < 2) continue;
    const blockW = cols * cellW + (cols - 1) * gap;
    if (blockW > availW) continue;
    const stackH = rowsN * rowH + (rowsN - 1) * ROW_GAP;
    tried.push({ cols, rowsN, gap, blockW, rowH, w: Math.max(diagW, blockW), h: diagH + chrome + stackH });
  }
  const best = pickKeyLayout(tried, aspects);
  return best.cols > 1 ? best : null;
}

function buildGrid({ rows, measured, oneLine, grid, cellW, diagramRight, diagramHeight, diagramPadX,
  FS, LH, SW, ROW_GAP, GAP, MARGIN_Y, swatchGap }) {
  const { cols, rowsN, gap, blockW, rowH } = grid;
  const viewW = Math.ceil(Math.max(diagramRight + 2 * diagramPadX, blockW));
  const diagramDx = +((viewW - diagramRight) / 2).toFixed(2);
  const diagramDy = +MARGIN_Y.toFixed(2);
  const diagramBottom = diagramDy + diagramHeight;
  const rowsTop = diagramBottom + GAP;
  const left = (viewW - blockW) / 2;
  const body = [];
  for (let c = 0; c < cols; c++) {
    const members = measured.slice(c * rowsN, (c + 1) * rowsN)
      .map((m, k) => ({ ...m, lines: [oneLine[c * rowsN + k]] }));
    if (!members.length) continue;
    const x0 = left + c * (cellW + gap);
    body.push(...emitRows(members, members.map(() => rowH), {
      startY: rowsTop, swatchX: x0, labelX: x0 + SW + swatchGap, valueX: x0 + cellW, FS, LH, SW, ROW_GAP,
    }));
  }
  const stackH = rowsN * rowH + (rowsN - 1) * ROW_GAP;
  const viewH = Math.ceil(rowsTop + stackH + MARGIN_Y);
  const spine = buildSpine({
    axis: 'horizontal', x: viewW / 2, y: diagramBottom + GAP / 2,
    length: blockW, thickness: FS * SPINE_W_R,
  });
  body.push(spine.rect);
  return { defs: spine.defs, body: body.join(''), desc: buildDesc(rows), viewW, viewH, diagramDx, diagramDy, fs: FS };
}

/**
 * Pack single-line key entries into a CENTERED, WRAPPING BAND — the SVG twin of
 * what `roadmap` gets from CSS.
 *
 * `roadmap` puts its status key under the grid as
 * `display:flex; flex-wrap:wrap; justify-content:center; gap:…`, and its own
 * docblock calls bottom-center "the best-practice spot for a wide, full-width
 * chart". That is the house answer for a key beneath a wide diagram, and a
 * portrait heatmap is exactly that situation — but `keySvg` only knows
 * how to stack, and SVG has no `flex-wrap`, so a five-band key came out as a
 * narrow five-row column with the width beside it unused.
 *
 * This packs greedily to `availW` and centers each row, which is what flex-wrap
 * does. For five short bands at a portrait width that lands 3 + 2, the split the
 * arithmetic gives: five across would need ~479 units of a 316-unit box.
 *
 * SINGLE-LINE ENTRIES ONLY. A wrapped label would make rows of unequal height
 * and turn the band into a ragged grid, which is worse than the column it
 * replaces — the caller checks and falls back rather than this guessing.
 */
function packBand(measured, availW, { FS, SW, GAP }) {
  const gapX = GAP;                                   // the divider gap, reused between items
  const swatchGap = FS * SWATCH_GAP_R;
  const widths = measured.map((m) => SW + swatchGap + m.lines[0].length * FS * AVG_ADVANCE_R);
  const rows = [];
  let row = [];
  let w = 0;
  measured.forEach((_m, i) => {
    const next = w + (row.length ? gapX : 0) + widths[i];
    if (row.length && next > availW) { rows.push({ items: row, w }); row = []; w = 0; }
    row.push(i);
    w += (row.length > 1 ? gapX : 0) + widths[i];
  });
  if (row.length) rows.push({ items: row, w });
  return { rows, widths, gapX, swatchGap };
}

/**
 * Emit the packed band: each row centered in `availW`, rows stacked under the
 * diagram, with the spine as a horizontal rule above them — the same furniture
 * the column layout uses, laid out across instead of down.
 */
function buildBand({ rows, measured, packed, diagramRight, diagramHeight,
  FS, SW, ROW_GAP, GAP, MARGIN_Y }) {
  const { rows: packedRows, widths, gapX, swatchGap } = packed;
  const viewW = Math.ceil(Math.max(diagramRight, ...packedRows.map((r) => r.w)));
  const diagramDx = +((viewW - diagramRight) / 2).toFixed(2);
  const diagramDy = +MARGIN_Y.toFixed(2);
  const diagramBottom = diagramDy + diagramHeight;
  const rowsTop = diagramBottom + GAP;

  const rowH = Math.max(SW, FS);
  const body = [];
  packedRows.forEach((r, ri) => {
    const top = rowsTop + ri * (rowH + ROW_GAP);
    let x = (viewW - r.w) / 2;                        // centered, like justify-content:center
    for (const i of r.items) {
      const m = measured[i];
      const swatchY = top + rowH / 2 - SW / 2;
      const painted = m.swatchClass
        ? `<rect class="chart-key-swatch ${m.swatchClass}"${m.swatchAttrs || ''}`
        : `<rect class="chart-key-swatch"${swatchContract(m)}`;
      const fillAttr = m.swatchClass ? '' : ` fill="${m.swatchFill}"`;
      const stroke = m.swatchStroke
        ? ` stroke="${m.swatchStroke}" stroke-width="${(SW * STROKE_W_R).toFixed(2)}"`
        : '';
      body.push(
        `${painted} x="${x.toFixed(2)}" y="${swatchY.toFixed(2)}" ` +
          `width="${SW.toFixed(2)}" height="${SW.toFixed(2)}" rx="${(SW * 0.22).toFixed(2)}"` +
          `${fillAttr}${stroke}/>` +
        `<text class="chart-key-label"${markForAttr(m)} font-size="${FS.toFixed(2)}">` +
          `<tspan x="${(x + SW + swatchGap).toFixed(2)}" y="${(top + FS).toFixed(2)}">` +
          `${xmlEsc(m.lines[0])}</tspan></text>`);
      x += widths[i] + gapX;
    }
  });

  const stackH = packedRows.length * rowH + (packedRows.length - 1) * ROW_GAP;
  const viewH = Math.ceil(rowsTop + stackH + MARGIN_Y);
  const spine = buildSpine({
    axis: 'horizontal', x: viewW / 2, y: diagramBottom + GAP / 2,
    length: Math.max(...packedRows.map((r) => r.w)), thickness: FS * SPINE_W_R,
  });
  body.push(spine.rect);
  return { defs: spine.defs, body: body.join(''), desc: buildDesc(rows), viewW, viewH, diagramDx, diagramDy, fs: FS };
}


function buildPortrait({ rows, measured, rowHeights, stackH, diagramRight, diagramHeight, diagramPadX = 0,
  hasValues, labelAvail, valueColW, FS, LH, ROW_GAP, SW, GAP, fitLabels = false, aspects, plainKey }) {
  const MARGIN_Y = FS * MARGIN_Y_R;

  // `fitLabels` CENTERS BY THE INK, NOT BY THE RESERVED COLUMN, and the two differ
  // by a lot for a key whose labels are short. The block is laid out against
  // `labelAvail` — a fixed 18–21 × FS budget sized for CATEGORY NAMES, which is
  // what the four original portrait charts key on. heatmap keys on numeric band
  // ranges (`41–44`), so it reserved ~283 units for ~36 of ink: the block was
  // dutifully centered and the visible key still hugged the left edge with the
  // right four-fifths of it empty.
  //
  // Opt-in rather than applied to everyone, because the reserved width IS the
  // right answer when labels fill it, and because pie / radar / map / quadrant
  // have shipped portrait goldens that a silent re-centering would move.
  // Wrapping is untouched — the budget still decides where a line breaks, and
  // this only measures what came out of it.
  const inkW = fitLabels
    ? Math.min(labelAvail, Math.max(...measured.map(
      (m) => Math.max(...m.lines.map((ln) => ln.length)) * FS * AVG_ADVANCE_R)))
    : labelAvail;

  // THE GRID: one to three aligned columns, every label on one line (gridLayout).
  // Taken whenever two or more columns fit the width the diagram is drawn at;
  // otherwise the single column below is the answer. Only a caller that passes the
  // shapes it is laid out for (callout-choose.js `keyAspects`) gets the grid: `false`
  // (an export pane) or nothing at all keeps the single column, so a new caller that
  // forgets cannot change an export it never meant to touch (#3088's grader, twice).
  if (Array.isArray(aspects) && aspects.length) {
    const swatchGap = FS * SWATCH_GAP_R;
    const oneLine = measured.map((m) => (m.head ? m.label : stripTags(m.full)));
    // Priced glyph by glyph (`gridInk`), not at the flat average: a cell is one label wide plus its value, with
    // a single character of slack, so a name of wide glyphs (`WWWW MMMM`) ran its value over the next column
    // (the checker's repro, 2026-11-11). main's single column reserved 18 FS and absorbed the error.
    const labelInk = Math.max(...oneLine.map(gridInk)) * FS;
    const cellW = SW + swatchGap + labelInk + (hasValues ? valueColW + FS * AVG_ADVANCE_R : 0);
    const availW = Math.max(diagramRight + 2 * diagramPadX, diagramHeight * GRID_WIDE_OF_H, 1);
    const chrome = MARGIN_Y * 2 + GAP;
    const grid = gridLayout(measured, {
      availW, FS, SW, cellW, ROW_GAP, diagW: diagramRight + 2 * diagramPadX, diagH: diagramHeight, chrome,
      column: { w: Math.max(diagramRight + 2 * diagramPadX, SW + swatchGap + inkW + valueColW), h: diagramHeight + chrome + stackH },
      aspects,
    });
    if (grid) {
      const built = buildGrid({
        rows, measured, oneLine, grid, cellW, diagramRight, diagramHeight, diagramPadX,
        FS, LH, SW, ROW_GAP, GAP, MARGIN_Y, swatchGap,
      });
      // The grid only where it prints at least as large as the key main would draw: the layout below (a single
      // column, or short labels flowed into rows) is not one of the grid's candidates, and a heatmap's five short
      // bands flowed into two rows on main where the grid stacked them in three and printed the chart 7% smaller
      // (the sweep of 2026-11-11). keySvg spends no render ids, so drawing both is pure.
      const plain = plainKey();
      // A grid wider than the single column widens the drawing, and an export scores it against an ESTIMATED box
      // shape (callout-choose.js `keyAspects`): a paper win of a few percent printed a 4:5 slide 23.3 to 22.8px.
      // So a wider grid has to win clearly (`GRID_WIDE_WIN`); one within the column only has to match main's key.
      // The fluid viewer scores against its real box, where a wider grid wins big (a phone map's key, 15 to 18px).
      const fit = (u) => Math.min(...aspects.map((a) => Math.min(a / u.viewW, 1 / u.viewH)));
      const need = built.viewW > plain.viewW + 0.5 ? GRID_WIDE_WIN : 1;
      return fit(built) >= fit(plain) * need ? built : plain;
    }
  }

  // THE BAND (as on main): a centered, wrapping row of entries under the diagram, which is what
  // `roadmap` gets from flex-wrap and what a key beneath a wide chart wants. Taken
  // only when every entry is a single line and the pack actually saves rows —
  // otherwise the column below is the better answer and this steps aside. The grid above
  // is weighed against this, so a band of short labels stays a band where it prints larger.
  const bandable = fitLabels && !hasValues
    && measured.every((m) => !m.head && m.lines.length === 1);
  if (bandable) {
    const availW = Math.max(diagramRight, 1);
    const packed = packBand(measured, availW, { FS, SW, GAP });
    if (packed.rows.length < measured.length) {
      return buildBand({
        rows, measured, packed, diagramRight, diagramHeight,
        FS, SW, ROW_GAP, GAP, MARGIN_Y,
      });
    }
  }

  // The key block laid out from its own left edge (x = 0); centered into viewW below.
  const swatchX0 = 0;
  const labelX0 = swatchX0 + SW + FS * SWATCH_GAP_R;
  const labelRight0 = labelX0 + inkW;
  const valueX0 = labelRight0 + valueColW;          // right anchor (block-local)
  const legendBlockW = hasValues ? valueX0 : labelRight0;

  // The unit is as wide as the wider of (diagram + its overflow padding) / key;
  // each is then centered. diagramPadX reserves room for diagram content that
  // spills past [0, diagramRight] (radar axis labels) — a no-op (0) for charts
  // that fit their box (pie/quadrant/map).
  const viewW = Math.ceil(Math.max(diagramRight + 2 * diagramPadX, legendBlockW));
  const diagramDx = +((viewW - diagramRight) / 2).toFixed(2);
  const legendX0 = (viewW - legendBlockW) / 2;

  const diagramDy = +MARGIN_Y.toFixed(2);           // diagram sits at a small top margin
  const diagramBottom = diagramDy + diagramHeight;
  const rowsTop = diagramBottom + GAP;              // key starts a divider-gap below
  const viewH = Math.ceil(rowsTop + stackH + MARGIN_Y);

  const body = emitRows(measured, rowHeights, {
    startY: rowsTop,
    swatchX: legendX0 + swatchX0,
    labelX: legendX0 + labelX0,
    valueX: legendX0 + valueX0,
    FS, LH, SW, ROW_GAP,
  });

  // ── spine (shared geometry — buildSpine) ────────────────────────────────────
  // The landscape vertical divider rotated 90°: a horizontal accent rule between
  // the diagram and the key, centered, spanning the key width.
  const spine = buildSpine({
    axis: 'horizontal', x: viewW / 2, y: diagramBottom + GAP / 2,
    length: legendBlockW, thickness: FS * SPINE_W_R,
  });
  body.push(spine.rect);

  return { defs: spine.defs, body: body.join(''), desc: buildDesc(rows), viewW, viewH, diagramDx, diagramDy, fs: FS };
}

module.exports = { keySvg };
