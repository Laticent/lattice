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
const { roleU } = require('./chart-roles');

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
 * @param {number} [o.headFs]     a leading `{ head: true }` row's size (default `fs`): it sets across the key's whole
 *                                width above the entries, at weight 600, in either form
 */
function keyTile(opts) {
  const { rows, fs, lh = 1.16, rowGap = 0.5, text = {}, headFs = fs } = opts;
  if (!rows[0]?.head) return keyBody(opts);
  // A HEADING (the bar a key's values read, a map's group) is not an entry: it takes a line of its own across the key,
  // wrapping at spaces, and the entries lay out under it.
  const head = rows[0];
  const body = keyBody({ ...opts, rows: rows.slice(1) });
  const headAt = (w) => {
    const wr = wrapWords(head.label, w, headFs, { ...text, weight: 600 });
    return wr.fits ? { lines: wr.lines, w: wr.widest, h: wr.lines.length * headFs * lh + fs * rowGap } : null;
  };
  const under = (f, hd) => f && hd && {
    ...f, h: f.h + hd.h, w: Math.max(f.w, hd.w),
    placed: [{ ...head, headFs, lines: hd.lines, h: hd.h - fs * rowGap, x: 0, y: 0 }, ...f.placed.map((r) => ({ ...r, y: r.y + hd.h }))],
  };
  return {
    under: (w) => under(body.under(w), headAt(w)),
    beside(h, maxW) {
      const hd = headAt(maxW);
      return hd && under(body.beside(h - hd.h, maxW), hd);
    },
  };
}

function keyBody({ rows, fs, markerW, markerH = 0, maxCols = 3, lh = 1.16, rowGap = 0.5, colGap = 1.6, text = {}, padTop = 0, flow = false }) {
  const n = rows.length;
  const valueW = rows.reduce((m, r) => Math.max(m, r.value != null ? textWidth(String(r.value), fs, { ...text, weight: 700 }) : 0), 0);
  const valueGap = valueW ? fs * 0.8 : 0;
  const LH = fs * lh;
  const GAP = fs * rowGap;
  const CG = fs * colGap;
  const natural = Math.max(...rows.map((r) => textWidth(r.label, fs, text)));
  const widestWordOf = (t) => String(t).trim().split(/\s+/).reduce((m, w) => Math.max(m, textWidth(w, fs, text)), 0);
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
    // Every row's top-left corner in the key's own frame, so one drawer serves every form.
    const placed = [];
    used.forEach((col, ci) => {
      let y = padTop;
      for (const r of col) { placed.push({ ...r, x: ci * (colW + CG), y, textW }); y += r.h + GAP; }
    });
    return { cols: used.length, colW, h, columns: used, placed, textW, rowW: markerW + widest + (valueW ? valueGap + valueW : 0), lh: LH, gap: GAP, colGap: CG, valueW, markerW };
  };
  /** THE RUNNING FORM: entries one after another across width `w`, as words run in a line, wrapping to a new line
   *  where the next entry would not fit. The densest form a key has; null when one entry is wider than the line. */
  const flowAt = (w) => {
    const itemGap = fs * 1.1;
    const rowH = Math.max(LH, markerH);
    const placed = [];
    let x = 0;
    let y = padTop;
    for (const r of rows) {
      const tw = textWidth(r.label, fs, text);
      const iw = markerW + tw + (r.value != null ? valueGap + valueW : 0);
      if (iw > w) return null;
      if (x > 0 && x + iw > w) { x = 0; y += rowH + GAP; }
      placed.push({ ...r, lines: [r.label], h: rowH, x, y, textW: tw + 1 });
      x += iw + itemGap;
    }
    return { cols: 0, colW: w, h: y + rowH, columns: [], placed, textW: w, lh: LH, gap: GAP, colGap: CG, valueW, markerW, flow: true };
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
      if (flow) {
        const f = flowAt(w);
        // The line's width runs to the end of its last value: a width that stops at the name centers the key off by the value.
        if (f && (!best || f.h < best.h - 0.5)) best = { ...f, w: Math.max(...f.placed.map((r) => r.x + markerW + r.textW + (r.value != null ? valueGap + valueW : 0))) };
      }
      if (!best) return null;
      return { ...best, w: best.w ?? best.cols * best.colW + CG * (best.cols - 1) };
    },
    /** Beside the plot, no taller than `h`: the narrowest column set that fits. */
    beside(h, maxW) {
      // The NARROWEST column set no taller than `h`: names wrap at their spaces to get there, never mid-word.
      const least = markerW + valueGap + valueW + Math.max(...rows.map((r) => widestWordOf(r.label))) + 1;
      for (const c of counts) {
        const full = markerW + natural + valueGap + valueW + fs * 0.5;
        const most = Math.min(full, (maxW - CG * (c - 1)) / c);
        for (let colW = Math.min(least, most); colW <= most + 1e-6; colW = Math.min(most, colW + fs * 0.5) + (colW >= most ? 1 : 0)) {
          const f = at(c, colW);
          if (f && f.h <= h) return { ...f, w: c * colW + CG * (c - 1) };
        }
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
    text: { weight: 600 }, padTop: Math.max(0, SW / 2 - fs * 0.32), ...opts,
  });
}

/** Draw a swatch key's form (from `swatchKeyTile`) with its top-left at the origin. */
function drawSwatchKey(form, fs) {
  const SW = fs * KEY_METRICS.SW_R;
  const LH = fs * KEY_METRICS.LH_R;
  const out = [];
  for (const r of form.placed) {
    if (r.head) {
      // The heading, at the heading role (chart-roles.js), across the key's width: every line it wrapped to.
      const HF = r.headFs;
      out.push(...emitRows([r], [r.h], { startY: r.y, swatchX: r.x, labelX: r.x, valueX: r.x, FS: HF, LH: HF * KEY_METRICS.LH_R, SW, ROW_GAP: 0 }));
      continue;
    }
    out.push(...emitRows([r], [r.h], {
      startY: r.y, swatchX: r.x, labelX: r.x + SW + fs * KEY_METRICS.SWATCH_GAP_R,
      valueX: form.flow ? r.x + SW + fs * KEY_METRICS.SWATCH_GAP_R + r.textW + fs * 0.8 + form.valueW : r.x + form.colW,
      FS: fs, LH, SW, ROW_GAP: form.gap,
    }));
  }
  // The size the kernel laid the key out at is the size it paints: the stylesheet sizes a key's text by
  // `--chart-fs-key` (chart-family.styles.css § THE PHONE LADDER), which a key stepped toward the floor sets here.
  return `<g style="--chart-fs-key:${+fs.toFixed(3)}px">${out.join('')}</g>`;
}

/**
 * A PLOT AND ITS SWATCH KEY, the arrangement four kinds share (tower, pie, radar, map). The key tries the key role (13pt),
 * then 12pt, then the floor (11pt); while no arrangement holds the box at the floor, the box grows in 5% steps to 2.5
 * times its height and the drawing is over capacity, scaled by the page (`data-chart-form="over"`).
 * @param {object} o
 * @param {object[]} o.rows   key rows, as `swatchKeyTile` takes them (an empty list arranges the plot alone)
 * @param {object} o.plot     the plot's constraints, as `arrange` takes them
 * @param {boolean} [o.flow=true]  whether the key may run as a line
 * @param {(fs:number)=>number} [o.gap]  the gap between the plot and the key at a key size (default: the key size)
 * @param {{w:number,h:number}} [o.box]  the canvas (default: the kernel's box)
 * @returns {{ layout: object, fs: number, over: boolean, keySvg: (r2?: (n:number)=>number) => string }|null}
 */
function arrangeKeyed({ rows, plot, flow = true, gap = (fs) => fs, box = formBox() }) {
  const keyRows = rows.map((r, i) => ({ ...r, i }));
  const tryAt = (fs, room) => arrange({
    box: room, gap: gap(fs), plot,
    tiles: keyRows.length ? [{ id: 'key', ...swatchKeyTile(keyRows, fs, { flow, headFs: roleU('heading', 9) }) }] : [],
  });
  let layout = null;
  let fs = roleU('key', 9);
  let over = false;
  for (const f of [roleU('key', 9), roleU('key', 9) * (12 / 13), roleU('category', 9)]) {
    layout = tryAt(f, box);
    fs = f;
    if (layout) break;
  }
  for (let k = 1.05; !layout && k <= 2.5; k += 0.05) { layout = tryAt(fs, { w: box.w, h: box.h * k }); over = !!layout; }
  if (!layout) return null;
  /** The key, drawn where the arrangement put it: centered under the plot, or at the top of its column beside it. */
  const keySvg = (r2 = (n) => Number(n.toFixed(2))) => {
    if (!keyRows.length) return '';
    const kc = layout.cells.key;
    const kf = { ...kc.form, placed: kc.form.placed.map((r) => ({ ...r, ...keyRows[r.i], lines: r.lines })) };
    const kx = kc.x + (kc.side === 'under' ? (kc.w - kf.w) / 2 : 0);
    return `<g transform="translate(${r2(kx)} ${r2(kc.y)})">${drawSwatchKey(kf, fs)}</g>`;
  };
  return { layout, fs, over, keySvg };
}

module.exports = { FORM_W, withForm, formBox, formActive, arrange, keyTile, drawKey, swatchKeyTile, drawSwatchKey, arrangeKeyed };
