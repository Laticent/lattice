/**
 * chart-form.js — THE CHART FORM KERNEL: a chart is a Lattice. The chart box is carved into cells (the plot, its
 * key, its notes), each piece declares how small it can be drawn with its text at role size and how it reflows,
 * and this one placer arranges them. engineering/decisions/2026-11-10-chart-form.md is the design; § 2.3 is the
 * search this file runs.
 *
 * THE SCALE IS KNOWN BEFORE ANYTHING IS DRAWN. A chart on a phone page draws on a canvas the shape of its box,
 * `formBox()` drawing units across the box's 972 page px, so one unit prints at a fixed number of page px and a
 * role's size in units is known up front (chart-roles.js `roleU`). Every piece is placed INSIDE that canvas, so
 * the drawing never outgrows its box and is never scaled down. That is what retires the dispatch's fixed-point
 * solve for a kind on the kernel: nothing is drawn twice to learn its own size.
 *
 * THE SEARCH (`arrange`). Each tile (a key, a list of notes) may sit UNDER the plot, across the box's width, or
 * BESIDE it, in a column to its right. For every combination the kernel asks each tile for its form at the room
 * it gets (a key: one, two or three columns, names wrapped at spaces), gives the plot what is left, and keeps,
 * in order: an arrangement where every tile fits with every name whole; the largest plot; the fullest box.
 *
 * Pure, no DOM. The state below is set for exactly one chart's drawing (rendering is synchronous).
 */

const { wrapWords, textWidth } = require('./text-measure');
const { emitRows, KEY_METRICS } = require('./legend-svg-key');

const { FORM_W, withForm, formBox, formActive } = require('./chart-form-state');

/**
 * Arrange a plot and its tiles in a box.
 *
 * @param {object} o
 * @param {{w:number,h:number}} o.box       the canvas, drawing units
 * @param {number} [o.gap]                  the space between two cells
 * @param {{minW?:number,minH?:number,aspect?:{min:number,max:number}}} [o.plot]  the plot's floor, and, for a
 *        plot that keeps its shape (a pie, a map, a grid of square cells), the width-over-height range it may take
 * @param {Array<{id:string, sides?:string[], under?:(w:number)=>object|null, beside?:(h:number,maxW:number)=>object|null}>} [o.tiles]
 *        each tile's forms: `under(w)` returns `{h, ...}` for a form across width `w`, `beside(h, maxW)` returns
 *        `{w, h, ...}` for a form no taller than `h`; null when the tile cannot be drawn there with every name whole
 * @param {number} [o.besideMax=0.5]        the widest a column beside the plot may be, a share of the box
 * @returns {null | { plot:{x,y,w,h}, cells:Object<string,{x,y,w,h,side,form}>, w:number, h:number, sides:Object }}
 *          null when no arrangement fits every tile: the kind takes its next form (§ 3 of the design)
 */
function arrange({ box, gap = 8, plot = {}, tiles = [], besideMax = 0.5 }) {
  const minW = plot.minW || 0;
  const minH = plot.minH || 0;
  const combos = [[]];
  for (const t of tiles) {
    const sides = (t.sides || ['under', 'beside']).filter((s) => (s === 'under' ? t.under : t.beside));
    const next = [];
    for (const c of combos) for (const s of sides) next.push([...c, s]);
    combos.splice(0, combos.length, ...next);
  }
  let best = null;
  for (const combo of combos) {
    const forms = {};
    let ok = true;
    // UNDER: stacked under the plot, each across the whole width.
    let underH = 0;
    tiles.forEach((t, i) => {
      if (!ok || combo[i] !== 'under') return;
      const f = t.under(box.w);
      if (!f) { ok = false; return; }
      forms[t.id] = { ...f, side: 'under' };
      underH += f.h + gap;
    });
    if (!ok) continue;
    const regionH = box.h - underH;
    // BESIDE: one column at the plot's right, as tall as the plot region.
    let colW = 0;
    let left = regionH;
    tiles.forEach((t, i) => {
      if (!ok || combo[i] !== 'beside') return;
      const f = t.beside(left, box.w * besideMax);
      if (!f) { ok = false; return; }
      forms[t.id] = { ...f, side: 'beside' };
      colW = Math.max(colW, f.w);
      left -= f.h + gap;
    });
    if (!ok) continue;
    const regionW = box.w - (colW ? colW + gap : 0);
    if (regionW < minW || regionH < minH) continue;
    let pw = regionW;
    let ph = regionH;
    // A plot that sizes itself (a grid of cells with a crowding floor): `fit(w, h)` returns the box it draws in, no
    // bigger than the region, or null when it cannot be drawn there.
    if (plot.fit) {
      const f = plot.fit(pw, ph);
      if (!f) continue;
      pw = Math.min(pw, f.w);
      ph = Math.min(ph, f.h);
    }
    if (plot.aspect) {
      const r = pw / ph;
      if (r > plot.aspect.max) pw = ph * plot.aspect.max;
      else if (r < plot.aspect.min) ph = pw / plot.aspect.min;
    }
    // A plot height cap (a chart that reads worse stretched, such as a bar chart's rows) is the kind's to set.
    if (plot.maxH && ph > plot.maxH) ph = plot.maxH;
    const area = pw * ph;
    const filled = area + Object.values(forms).reduce((s, f) => s + (f.w || box.w) * f.h, 0);
    const cand = { combo, forms, pw, ph, colW, area, filled };
    // The largest plot; within 3%, the fuller box.
    if (!best || area > best.area * 1.03 || (area >= best.area * 0.97 && filled > best.filled)) best = cand;
  }
  if (!best) return null;
  const { forms, pw, ph, colW } = best;
  // Place: the plot and its side column centered as a row; the under tiles stacked straight under the plot.
  const rowW = pw + (colW ? gap + colW : 0);
  const x0 = Math.max(0, (box.w - rowW) / 2);
  const cells = {};
  let besideY = 0;
  let bottom = ph;
  for (const t of tiles) {
    const f = forms[t.id];
    if (f.side !== 'beside') continue;
    cells[t.id] = { x: x0 + pw + gap, y: besideY, w: f.w, h: f.h, side: 'beside', form: f };
    besideY += f.h + gap;
    bottom = Math.max(bottom, besideY - gap);
  }
  let y = bottom;
  for (const t of tiles) {
    const f = forms[t.id];
    if (f.side !== 'under') continue;
    y += gap;
    cells[t.id] = { x: 0, y, w: box.w, h: f.h, side: 'under', form: f };
    y += f.h;
  }
  return {
    plot: { x: x0, y: 0, w: pw, h: ph },
    cells,
    w: box.w,
    h: Math.min(box.h, y),
    sides: Object.fromEntries(tiles.map((t) => [t.id, forms[t.id].side])),
  };
}

/**
 * A KEY tile: a list of rows (a marker, a name, an optional value), laid out in one to `maxCols` columns, names
 * wrapped at spaces and never mid-word. Shared by every kind on the kernel, so a key reads one way everywhere.
 *
 * @param {object} o
 * @param {Array<{label:string, value?:string}>} o.rows   in reading order; columns fill top to bottom
 * @param {number} o.fs           the key role's size, drawing units
 * @param {number} o.markerW      the marker's width plus its gap to the name
 * @param {number} [o.markerH=0]  the marker's height, when it is taller than one line (a numbered circle)
 * @param {number} [o.maxCols=3]
 * @param {number} [o.lh=1.16]    line height / fs
 * @param {number} [o.rowGap=0.5] space between rows / fs
 * @param {number} [o.colGap=1.6] space between columns / fs
 * @param {object} [o.text]       textWidth options for the names (weight, face)
 */
function keyTile({ rows, fs, markerW, markerH = 0, maxCols = 3, lh = 1.16, rowGap = 0.5, colGap = 1.6, text = {}, padTop = 0 }) {
  const n = rows.length;
  const valueW = rows.reduce((m, r) => Math.max(m, r.value != null ? textWidth(String(r.value), fs, { ...text, weight: 700 }) : 0), 0);
  const valueGap = valueW ? fs * 0.8 : 0;
  const LH = fs * lh;
  const GAP = fs * rowGap;
  const CG = fs * colGap;
  const natural = Math.max(...rows.map((r) => textWidth(r.label, fs, text)));
  /** The key at `cols` columns of width `colW`: each row's lines, each column's height. Null when a word cannot fit. */
  const at = (cols, colW) => {
    const textW = colW - markerW - valueW - valueGap;
    if (textW <= fs) return null;
    const laid = [];
    for (const r of rows) {
      const wr = wrapWords(r.label, textW, fs, text);
      if (!wr.fits) return null;
      laid.push({ ...r, lines: wr.lines, h: Math.max(wr.lines.length * LH, markerH) });
    }
    const per = Math.ceil(n / cols);
    const colsOut = [];
    for (let c = 0; c < cols; c++) colsOut.push(laid.slice(c * per, (c + 1) * per));
    const used = colsOut.filter((c) => c.length);
    const h = padTop + Math.max(...used.map((c) => c.reduce((s, r) => s + r.h, 0) + GAP * (c.length - 1)));
    const widest = Math.max(...laid.map((r) => textWidth(r.lines.reduce((a, b) => (textWidth(b, fs, text) > textWidth(a, fs, text) ? b : a), ''), fs, text)));
    return { cols: used.length, colW, h, columns: used, textW, rowW: markerW + widest + (valueW ? valueGap + valueW : 0), lh: LH, gap: GAP, colGap: CG, valueW };
  };
  const counts = [];
  for (let c = 1; c <= Math.min(maxCols, n); c++) if (!counts.includes(Math.ceil(n / Math.ceil(n / c)))) counts.push(Math.ceil(n / Math.ceil(n / c)));
  const tile = {
    /** Across width `w`: the column count that takes the least height. */
    under(w) {
      let best = null;
      for (const c of counts) {
        const colW = Math.min((w - CG * (c - 1)) / c, markerW + natural + valueGap + valueW + fs);
        const f = at(c, colW);
        if (f && (!best || f.h < best.h - 0.5)) best = f;
      }
      if (!best) return null;
      return { ...best, w: best.cols * best.colW + CG * (best.cols - 1) };
    },
    /** Beside the plot, no taller than `h`: the narrowest column set that fits. */
    beside(h, maxW) {
      for (const c of counts) {
        const full = markerW + natural + valueGap + valueW + fs * 0.5;
        const colW = Math.min(full, (maxW - CG * (c - 1)) / c);
        const f = at(c, colW);
        if (f && f.h <= h) return { ...f, w: c * colW + CG * (c - 1) };
      }
      return null;
    },
  };
  return tile;
}

/**
 * Lay a key's rows into a cell: calls `row(r, x, y)` for each row with its top-left corner, columns side by side.
 * The cell's own x is applied by the caller's translate. Returns the joined markup.
 */
function drawKey(form, row) {
  const out = [];
  form.columns.forEach((col, ci) => {
    const x = ci * (form.colW + form.colGap);
    let y = 0;
    for (const r of col) {
      out.push(row(r, x, y));
      y += r.h + (form.gap ?? 0);
    }
  });
  return out.join('');
}

/**
 * The family's SWATCH key (a colored square, a name, an optional value) as a kernel tile: the same rows, the same
 * markup and classes as `keySvg` (legend-svg-key.js `emitRows`), so a theme, a finish and the a11y textures paint
 * it exactly as they paint every key.
 * @param {Array<object>} rows  keySvg's rows: { label, swatchFill | swatchClass, cat?, value?, markFor? }
 * @param {number} fs           the key role's size, drawing units
 */
function swatchKeyTile(rows, fs, opts = {}) {
  const SW = fs * KEY_METRICS.SW_R;
  return keyTile({
    rows, fs, markerW: SW + fs * KEY_METRICS.SWATCH_GAP_R, markerH: SW, lh: KEY_METRICS.LH_R, rowGap: KEY_METRICS.ROW_GAP_R,
    text: { weight: 500 }, padTop: Math.max(0, SW / 2 - fs * 0.32), ...opts,
  });
}

/** Draw a swatch key's form (from `swatchKeyTile`) with its top-left at the origin. */
function drawSwatchKey(form, fs) {
  const SW = fs * KEY_METRICS.SW_R;
  const LH = fs * KEY_METRICS.LH_R;
  const out = [];
  form.columns.forEach((col, ci) => {
    const x = ci * (form.colW + form.colGap);
    // The swatch centers on the first line, a little above its text: start a row low enough that it clears 0.
    out.push(...emitRows(col, col.map((r) => r.h), {
      startY: Math.max(0, SW / 2 - fs * 0.32), swatchX: x, labelX: x + SW + fs * KEY_METRICS.SWATCH_GAP_R, valueX: x + form.colW,
      FS: fs, LH, SW, ROW_GAP: form.gap,
    }));
  });
  return out.join('');
}

module.exports = { FORM_W, withForm, formBox, formActive, arrange, keyTile, drawKey, swatchKeyTile, drawSwatchKey };
