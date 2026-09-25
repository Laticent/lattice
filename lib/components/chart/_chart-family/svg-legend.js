/**
 * svg-legend.js — the shared SVG-native legend + spine builder for the four
 * KEYED chart-family charts (piechart · radar · map · cohort quadrant).
 *
 * Why a shared module (not three copies): the whole point of going SVG-native is
 * that diagram + spine + key live in ONE viewBox and scale as one unit. For the
 * four charts to read as ONE FAMILY (identical key size, swatch, divider, row
 * rhythm) they must emit the SAME geometry — so it lives here once and each
 * kernel calls it. It is the SVG successor to the pure-CSS 70/30 rail that
 * chart-family.css used to key on the figure/legend classes.
 *
 * Pure JS — no DOM, no font metrics — so it runs identically on both render
 * paths (HARD RULE 1): the emulator build and the vscode-preview runtime both
 * bundle this module from the same source.
 *
 * THE FAMILY RULE — font size is a RATIO of the diagram height, never a constant.
 * Each chart's diagram has its own viewBox height (pie 200, radar 300, quadrant
 * 320, map varies). When a figure is sized to fit the body, its viewBox HEIGHT
 * maps to the body height, so a taller viewBox scales DOWN more. A constant key
 * font in user units would therefore render PHYSICALLY SMALLER on radar than on
 * pie. Pinning the font to a fixed fraction of the diagram height
 * (`FS = 0.045 · height`, i.e. pie's tuned FS=9 at height 200) makes the key the
 * same physical size on all four. Every other metric (gaps, swatch, rail width)
 * is then a ratio of that font, so the rail proportion is constant too.
 *
 * See engineering/decisions/2026-06-13-svg-native-legend.md (§2, §4a, §3).
 */

// ── Family constants ────────────────────────────────────────────────────────
// FS is a fraction of the diagram viewBox height (the family rule above); every
// other metric is a ratio of FS. The anchors are the piechart spike's tuned
// values (FS=9 at height 200), so the family inherits the look the pie shipped.
const { nextRenderSeq, renderIdPrefix } = require('../../../core/render-ids');

const FS_OF_HEIGHT = 9 / 200;     // 0.045 — legend font as a fraction of height
const LH_R = 1.16;                // line height / FS
const ROW_GAP_R = 0.72;           // inter-row gap / FS
const SW_R = 1.04;                // swatch edge / FS
const GAP_R = 32 / 9;             // divider gap, each side of the spine / FS
const MARGIN_Y_R = 0.9;           // top/bottom breathing room / FS
const SWATCH_GAP_R = 5 / 9;       // swatch → label gap / FS
const LABEL_COL_R = 9.2;          // label column width / FS (landscape side rail)
const PORTRAIT_LABEL_COL_R = 18;  // label column width / FS in the legend-BELOW
                                  // (portrait) layout — the key spans the full
                                  // width under the diagram, not a narrow side
                                  // rail, so labels get ~2× the budget and wrap
                                  // far less. See 2026-06-19-chart-adaptive-sizing §9.
const VALUE_COL_R = 3.0;          // value column width / FS (≈ "100%")
const RIGHT_PAD_R = 0.9;          // rail right padding / FS
const AVG_ADVANCE_R = 0.6;        // CONSERVATIVE average glyph advance / FS — the
                                  // wrap budget breaks EARLY (no font metrics in a
                                  // pure kernel), so a label never overruns the rail.
const SPINE_H_R = 0.78;           // spine height / viewH
const SPINE_W_R = 1.6 / 9;        // spine width / FS (pie spineW 1.6 at FS 9)
const STROKE_W_R = 0.09;          // swatch stroke width / SW

// Shared unique-id counter for the spine gradient — unique per chart instance so
// two keyed charts on one slide don't collide (the SVG duplicate-id trap). Both
// render paths bundle this module and process charts in the same order, so the
// ids match for the parity tier. Sibling: PIE_GRAD_SEQ in chart-family.js.

/**
 * THE SPINE — the accent rule that separates a diagram from its key.
 *
 * SVG mirror of the retired CSS `--chart-spine`: an accent fade transparent at
 * both ends so it melts into the canvas (a rule, not a hard divider). SVG fill
 * cannot take a CSS gradient var, hence inline stops.
 *
 * Three callers, one geometry: the landscape key (vertical, beside the diagram),
 * the portrait key (the same rule rotated 90°, between diagram and key), and
 * word-cloud's size key (vertical, like landscape). `axis` picks which way the
 * gradient runs; `x`/`y` are the rule's CENTER, `length` its long edge.
 *
 * Extracted when word-cloud's key converted to SVG — a third inline copy of the
 * same five gradient stops is how a family stops looking like one family.
 */
function buildSpine({ axis = 'vertical', x, y, length, thickness }) {
  const id = `${renderIdPrefix()}chart-spine-${nextRenderSeq('chart-spine')}`;
  const vertical = axis === 'vertical';
  const [x2, y2] = vertical ? [0, 1] : [1, 0];
  const defs =
    `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">` +
      `<stop offset="0%" style="stop-color:transparent"/>` +
      `<stop offset="14%" style="stop-color:color-mix(in oklab, var(--accent) 32%, transparent)"/>` +
      `<stop offset="50%" style="stop-color:color-mix(in oklab, var(--accent) 60%, transparent)"/>` +
      `<stop offset="86%" style="stop-color:color-mix(in oklab, var(--accent) 32%, transparent)"/>` +
      `<stop offset="100%" style="stop-color:transparent"/></linearGradient>`;
  const w = vertical ? thickness : length;
  const h = vertical ? length : thickness;
  const rect =
    `<rect x="${(x - w / 2).toFixed(2)}" y="${(y - h / 2).toFixed(2)}" ` +
      `width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${(thickness / 2).toFixed(2)}" ` +
      `fill="url(#${id})"/>`;
  return { defs, rect };
}

function xmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Strip any HTML tags BEFORE wrapping/escaping, so a label counts by its visible
// length and can never be cut mid-tag nor break the SVG. (Mirror of
// chart-family.js svgText — kept local so this module is self-contained.)
function stripTags(s) {
  return String(s == null ? '' : s).replace(/<[^>]*>/g, '');
}

// Word-wrap a legend label to a character budget — FULLY, never clipping and
// never ellipsizing (the original HTML key's "labels wrap, no clip — if users go
// crazy" guarantee). The SVG-native key keeps the promise because more lines just
// grow the unit HEIGHT (which scales the whole unit down), never overflow. A
// single over-long token hard-breaks across lines (matching CSS overflow-wrap).
// See engineering/decisions/2026-06-13-svg-native-legend.md §4(a).
function wrapLabelToLines(label, maxChars) {
  const words = String(label).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let cur = '';
  const flush = () => { if (cur) { lines.push(cur); cur = ''; } };
  for (let word of words) {
    while (word.length > maxChars) {
      flush();
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    const trial = cur ? `${cur} ${word}` : word;
    if (trial.length <= maxChars) cur = trial;
    else { flush(); cur = word; }
  }
  flush();
  return lines.length ? lines : [''];
}

// Emit the legend rows (swatch · wrapping label · optional value) as SVG strings,
// starting at `startY` and anchored at the given column x-coordinates. Shared by
// BOTH orientations so a row reads IDENTICALLY — same swatch, rhythm, a11y —
// whether the key sits in a right rail (landscape) or stacked below the diagram
// (portrait); only the anchors and the start y differ. The caller appends the
// spine after these. See 2026-06-19-chart-adaptive-sizing.md §9.
// ` data-mark-for="i"` for a row that names mark i (see `markFor` in buildSvgLegend), else ''.
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
    const catAttr = m.cat != null ? ` data-hue="${m.cat + 1}"` : '';
    // A swatch is painted one of two ways, and the second is what keeps the
    // KERNEL colorless (HARD RULE #3). Most keyed charts hand us a resolved
    // paint (`swatchFill`, already a `var(--token)`), because a categorical slot
    // IS a token. A ramp is different: a heatmap cell's color is computed in CSS
    // — `color-mix()` driven by `--mix`, selected on `[data-step]` — so there is
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
      (m.value != null
        ? `<text class="chart-key-value"${markForAttr(m)} font-size="${FS.toFixed(2)}" x="${valueX.toFixed(2)}" ` +
          `y="${baseFirst.toFixed(2)}" text-anchor="end">${xmlEsc(m.value)}</text>`
        : ''));
  });
  return out;
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
 *                                  undefined) is the byte-identical right-rail landscape.
 * @param {boolean} [o.fitLabels]   PORTRAIT only — center the key by the width its labels
 *                                  actually INK rather than by the reserved label column.
 *                                  For a key of short labels (heatmap's numeric band ranges)
 *                                  the two differ by ~8x, and centering the reserved column
 *                                  leaves the visible key hard against the left edge.
 *                                  Default false, so the charts that key on category names
 *                                  keep byte-identical portrait output.
 * @param {number}  [o.diagramPadX] PORTRAIT only — symmetric horizontal breathing room
 *                                  (in viewBox units) on each side of the diagram, for a
 *                                  diagram whose content overflows [0, diagramRight] (e.g.
 *                                  radar's axis labels). Default 0; ignored in landscape,
 *                                  where the right rail already absorbs the overflow.
 * @returns {{ defs:string, body:string, desc:string, viewW:number, viewH:number,
 *             diagramDx:number, diagramDy:number, fs:number }}
 */
function buildSvgLegend({ rows, diagramRight, diagramHeight, hasValues = true, orientation, diagramPadX = 0, fitLabels = false }) {
  const portrait = orientation === 'portrait';
  const FS = +(FS_OF_HEIGHT * diagramHeight).toFixed(3);
  const LH = FS * LH_R;
  const ROW_GAP = FS * ROW_GAP_R;
  const SW = FS * SW_R;
  const GAP = FS * GAP_R;

  // Column widths (orientation-independent except the wrap budget). Portrait
  // widens the label column — the key spans the full width below the diagram,
  // not a narrow side rail. A no-value chart (radar) reclaims the value column.
  const valueColW = hasValues ? FS * VALUE_COL_R : 0;
  const labelColR = portrait ? PORTRAIT_LABEL_COL_R : LABEL_COL_R;
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
      // Optional mark index this row NAMES (a pie wedge, a map entry). Emitted as
      // `data-mark-for` on the row's label and value, which the reveal layer
      // (docs/src/playground/chart-interact.js) treats as a tap proxy for that mark.
      // A legend whose rows are SERIES (line, stacked-bar, radar) leaves it unset:
      // a series row names no single mark. Not `data-mark`, so chart motion and
      // the Present Guide never see the legend as a mark.
      markFor: Number.isInteger(row.markFor) ? row.markFor : null,
      value: row.value != null ? stripTags(row.value) : null,
      lines,
    };
  });
  const rowHeights = measured.map((m) => Math.max(m.head ? FS : SW, (m.lines.length - 1) * LH + FS));
  const stackH = rowHeights.reduce((s, h) => s + h, 0) + ROW_GAP * Math.max(0, measured.length - 1);

  if (portrait) {
    return buildPortrait({
      rows, measured, rowHeights, stackH, diagramRight, diagramHeight, diagramPadX,
      hasValues, labelAvail, valueColW, FS, LH, ROW_GAP, SW, GAP, fitLabels,
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
// 2026-06-19-chart-adaptive-sizing.md §9.
/**
 * Pack single-line key entries into a CENTERED, WRAPPING BAND — the SVG twin of
 * what `roadmap` gets from CSS.
 *
 * `roadmap` puts its status key under the grid as
 * `display:flex; flex-wrap:wrap; justify-content:center; gap:…`, and its own
 * docblock calls bottom-center "the best-practice spot for a wide, full-width
 * chart". That is the house answer for a key beneath a wide diagram, and a
 * portrait heatmap is exactly that situation — but `buildSvgLegend` only knows
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
        : `<rect class="chart-key-swatch"${m.cat != null ? ` data-hue="${m.cat + 1}"` : ''}`;
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
  hasValues, labelAvail, valueColW, FS, LH, ROW_GAP, SW, GAP, fitLabels = false }) {
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

  // THE BAND: a centered, wrapping row of entries under the diagram, which is what
  // `roadmap` gets from flex-wrap and what a key beneath a wide chart wants. Taken
  // only when every entry is a single line and the pack actually saves rows —
  // otherwise the column below is the better answer and this steps aside.
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

module.exports = {
  buildSvgLegend, buildSpine, wrapLabelToLines, stripTags, xmlEsc,
  FS_OF_HEIGHT, SPINE_W_R, SPINE_H_R,
};
