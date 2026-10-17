/**
 * risk-matrix chart kernel — a 5 × 5 likelihood × impact grid, each cell shaded
 * by the severity band its score falls in, each risk placed in its cell as a
 * numbered marker, and a key beside the grid that names every number, worst
 * first. The board's question is "which risks are in the red, and are they
 * moving", so the band is the read and the key is the list.
 *
 * Shape:
 *   ## Heading.
 *   - Cyber outage `{4, 5}`
 *   - Hurricane season `{3, 5}` `{3, 3}`
 *
 * Each row is a risk: its name, then a point record `{likelihood, impact}` —
 * the same record quadrant and scatter read (lib/core/chart-point.js), each a
 * whole number from 1 to 5. An optional SECOND record is where the risk is
 * meant to land once mitigated: a dashed marker there, joined by an arrow. A
 * row whose record is not two whole numbers in 1..5 is dropped: the chart
 * cannot place it, and the narrator (which shares lib/core/risk-matrix-model.js)
 * drops it too.
 *
 * THE BANDS, score = likelihood × impact, the convention most risk registers
 * use: 1–4 low, 5–9 medium, 10–14 high, 15–25 critical. They take the family's
 * semantic state hues (pass, warn, fail), with critical the fail hue at full
 * strength, so a theme that tunes its status colors tunes this grid too.
 *
 * The kernel emits no color (HARD RULE #3): a cell carries `data-band`, and
 * risk-matrix.styles.css paints it.
 */

const markDetail = require('../_chart-family/mark-detail');
const cart = require('../_chart-family/cartesian');
const { wrapSvgLabel } = require('../_chart-family/svg-label');
const { readListLead, spliceFirstList, escAttr } = require('../_chart-family/transform-utils');
const { parseTopLevelLis } = require('../../../core/html-lists');
const { N, LIKELIHOOD, IMPACT, BANDS, bandOf, cellOf } = require('../../../core/risk-matrix-model');

// Nominal sizes in viewBox user units, MIRRORING risk-matrix.styles.css (gated
// by risk-matrix.test.js, which reads the stylesheet).
const FS = { tick: 6, axis: 6, marker: 6, key: 7 };

// The largest the grid draws; buildRiskMatrix scales it down to fit a smaller view.
const GRID = { x0: 46, y0: 10, cell: 28 };
const MARKER_R = 5.2;

/**
 * Parse the risk list. Returns null when there is nothing to draw, so the
 * dispatcher leaves the section untouched (the family contract).
 */
function parseRiskMatrix(ulInner) {
  const risks = [];
  for (const item of parseTopLevelLis(ulInner)) {
    const { lead, detail } = markDetail.splitDetail(item);
    const { label, pills } = readListLead(lead);
    const at = cellOf(pills[0]);
    if (!label || !at) continue;
    const to = cellOf(pills[1]);
    const score = at.l * at.i;
    risks.push({ label, at, to, score, band: bandOf(score).key, raw: pills[0], toRaw: to ? pills[1] : '', detail });
  }
  if (!risks.length) return null;
  // Numbered in the order the author wrote them, so `3` on the slide is the
  // third row of the source; the KEY lists them worst first.
  risks.forEach((r, k) => { r.n = k + 1; });
  return { risks };
}

/** A move worth drawing: a target that is not the cell the risk already sits in. */
const moves = (r) => !!r.to && (r.to.l !== r.at.l || r.to.i !== r.at.i);

function buildRiskMatrix(model, ctx = {}) {
  const { risks } = model;
  const view = cart.viewFor(ctx.orientation, ctx.paneView);
  // THE GEOMETRY FOLLOWS THE VIEW. Fixed constants drew a 140 × 72 pane's grid out
  // to x 186 and its key at 204, over the neighboring pane. The cell is the largest
  // that leaves room for the tick column, the axis rows and a key column, capped at
  // GRID.cell; the block is centered in whatever height is left.
  const keyMin = Math.min(110, view.w * 0.34);
  const cell = Math.max(8, Math.min(GRID.cell, (view.h - 40) / N, (view.w - GRID.x0 - keyMin - 18) / N));
  const x0 = GRID.x0;
  const y0 = Math.max(GRID.y0, (view.h - (N * cell + 30)) / 2);
  const keyX = x0 + N * cell + 18;
  const markerR = Math.min(MARKER_R, cell * 0.19);
  // Impact climbs UP the grid, the way every register draws it: row 0 is impact 5.
  const cx = (l) => x0 + (l - 0.5) * cell;
  const cy = (i) => y0 + (N - i + 0.5) * cell;
  const parts = [];

  // The cells, each shaded by its band.
  for (let i = N; i >= 1; i--) {
    for (let l = 1; l <= N; l++) {
      const band = bandOf(l * i).key;
      parts.push(`<rect class="risk-cell" data-band="${band}" data-l="${l}" data-i="${i}"` +
        ` x="${cart.round2(x0 + (l - 1) * cell)}" y="${cart.round2(y0 + (N - i) * cell)}"` +
        ` width="${cart.round2(cell)}" height="${cart.round2(cell)}"/>`);
    }
  }

  // Axis ticks: impact names up the left, likelihood names along the bottom.
  for (let i = 1; i <= N; i++) {
    parts.push(wrapSvgLabel(IMPACT[i - 1], {
      x: x0 - 4, y: cy(i), width: x0 - 8, fontSize: FS.tick, anchor: 'end', vAlign: 'middle',
      maxLines: 2, baseline: 'central', className: 'risk-tick', emitFontSize: false,
    }).svg);
  }
  for (let l = 1; l <= N; l++) {
    parts.push(wrapSvgLabel(LIKELIHOOD[l - 1], {
      // The cell's width plus a little of each neighbor's: a narrower column broke
      // `Unlikely` and `Possible` mid-word.
      x: cx(l), y: y0 + N * cell + 4, width: cell + 6, fontSize: FS.tick, anchor: 'middle', vAlign: 'top',
      maxLines: 2, baseline: 'hanging', className: 'risk-tick risk-tick-x', emitFontSize: false,
    }).svg);
  }
  parts.push(wrapSvgLabel('Likelihood', {
    x: x0 + (N * cell) / 2, y: y0 + N * cell + 22, width: N * cell, fontSize: FS.axis, anchor: 'middle',
    vAlign: 'top', maxLines: 1, baseline: 'hanging', className: 'risk-axis', emitFontSize: false,
  }).svg);
  parts.push(`<text class="risk-axis" transform="translate(6 ${cart.round2(y0 + (N * cell) / 2)}) rotate(-90)"` +
    ' text-anchor="middle" dominant-baseline="hanging">Impact</text>');

  // THE PACKING. Every occupant of a cell — a risk's marker, and the dashed ring
  // of any risk whose mitigation lands there — takes a slot in one centered grid
  // per cell, three to a row. A ring drawn at the bare cell center used to sit
  // exactly under another risk's marker and vanish. The radius shrinks until the
  // whole grid fits inside the cell, however many share it.
  const occupants = {};
  const slotOf = new Map();
  const add = (c, key) => {
    const k = `${c.l},${c.i}`;
    (occupants[k] = occupants[k] || []).push(key);
  };
  risks.forEach((r, idx) => { add(r.at, `m${idx}`); });
  risks.forEach((r, idx) => { if (moves(r)) add(r.to, `t${idx}`); });
  for (const [k, list] of Object.entries(occupants)) {
    const [l, i] = k.split(',').map(Number);
    const count = list.length;
    const cols = Math.min(3, count);
    const rows = Math.ceil(count / 3);
    const r = Math.min(markerR, ((cell - 4) / Math.max(cols, rows) - 1) / 2);
    const step = r * 2 + 1;
    list.forEach((key, n) => {
      const row = Math.floor(n / 3);
      const inRow = Math.min(3, count - row * 3);
      slotOf.set(key, {
        x: cx(l) + ((n % 3) - (inRow - 1) / 2) * step,
        y: cy(i) + (row - (rows - 1) / 2) * step,
        r,
      });
    });
  }

  // A number shrinks with the disk it sits on, in the grid and in the key.
  const numberStyle = (r) => (r < MARKER_R ? ` style="font-size:${cart.round2(FS.marker * (r / MARKER_R))}px"` : '');

  const marks = [];
  const arrows = [];
  risks.forEach((r, idx) => {
    const p = slotOf.get(`m${idx}`);
    if (moves(r)) {
      const q = slotOf.get(`t${idx}`);
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const h = Math.max(2, 3.2 * (q.r / MARKER_R));
      const a = { x: p.x + ux * (p.r + 1), y: p.y + uy * (p.r + 1) };
      const b = { x: q.x - ux * (q.r + 1.3 + h), y: q.y - uy * (q.r + 1.3 + h) };
      // The head is DRAWN, not an SVG `<marker>`: the vector PDF writer and the PPTX
      // export do not carry markers, and the arrow vanished from the PDF without one.
      const tip = { x: b.x + ux * h, y: b.y + uy * h };
      const head = [tip, { x: b.x - uy * h * 0.6, y: b.y + ux * h * 0.6 }, { x: b.x + uy * h * 0.6, y: b.y - ux * h * 0.6 }]
        .map((pt) => `${cart.round2(pt.x)},${cart.round2(pt.y)}`).join(' ');
      arrows.push(`<line class="risk-path" data-mark-for="${idx}" x1="${cart.round2(a.x)}" y1="${cart.round2(a.y)}"` +
        ` x2="${cart.round2(b.x)}" y2="${cart.round2(b.y)}"/>` +
        `<polygon class="risk-arrowhead" data-mark-for="${idx}" points="${head}"/>`);
      marks.push(`<circle class="risk-target" data-mark-for="${idx}" cx="${cart.round2(q.x)}" cy="${cart.round2(q.y)}" r="${cart.round2(q.r)}"/>`);
    }
    marks.push(`<circle class="risk-marker" data-mark="${idx}" data-anima-role="dot" data-band="${r.band}"` +
      ` data-label="${escAttr(r.label)}" data-value="${escAttr(`likelihood ${r.at.l}, impact ${r.at.i}`)}"` +
      ` cx="${cart.round2(p.x)}" cy="${cart.round2(p.y)}" r="${cart.round2(p.r)}"/>`);
    marks.push(`<text class="risk-number" data-mark-for="${idx}" x="${cart.round2(p.x)}" y="${cart.round2(p.y)}"` +
      ` text-anchor="middle" dominant-baseline="central"${numberStyle(p.r)}>${r.n}</text>`);
  });
  parts.push(arrows.join(''), marks.join(''));

  // The key: worst first, ties in the author's order, each row its number and
  // name. It is the list a board reads down, so it is never folded.
  const ordered = risks.map((r, idx) => ({ r, idx })).sort((a, b) => b.r.score - a.r.score || a.r.n - b.r.n);
  const keyW = Math.max(0, view.w - keyX - 4);
  // Fourteen units a row while they fit beside the grid; a longer register
  // tightens the rows and, past ten risks, the type with them.
  const rowH = Math.min(14, (N * cell) / Math.max(1, ordered.length));
  const keyFs = Math.min(FS.key, rowH * 0.62);
  const shrunk = keyFs < FS.key ? ` style="font-size:${cart.round2(keyFs)}px"` : '';
  const keyR = Math.min(markerR, rowH * 0.4);
  ordered.forEach(({ r, idx }, k) => {
    const y = y0 + k * rowH + rowH / 2;
    parts.push(`<circle class="risk-key-marker" data-band="${r.band}" data-mark-for="${idx}"` +
      ` cx="${cart.round2(keyX)}" cy="${cart.round2(y)}" r="${cart.round2(keyR)}"/>`);
    parts.push(`<text class="risk-key-number" data-mark-for="${idx}" x="${cart.round2(keyX)}" y="${cart.round2(y)}"` +
      ` text-anchor="middle" dominant-baseline="central"${numberStyle(keyR)}>${r.n}</text>`);
    if (keyW > keyR + 12) {
      parts.push(wrapSvgLabel(r.label, {
        x: keyX + keyR + 4, y, width: keyW - keyR - 4, fontSize: keyFs, anchor: 'start', vAlign: 'middle',
        maxLines: 1, baseline: 'central', className: 'risk-key-label', emitFontSize: false,
        attrs: ` data-mark-for="${idx}"${shrunk}`,
      }).svg);
    }
  });

  const svg = cart.buildSvgRoot({
    view,
    className: 'risk-matrix-svg',
    title: 'Risk matrix',
    desc: buildDesc(model),
    body: parts.join(''),
  });

  const detailMarks = risks.map((r) => ({ label: r.label, valueRaw: r.raw, detail: r.detail || '' }));
  return `<div class="risk-matrix-figure">${svg}${markDetail.detailPayload(detailMarks)}</div>${markDetail.detailNote(detailMarks)}`;
}

/** The read a sighted viewer gets: each risk worst first, with its band and any planned move. */
function buildDesc(model) {
  const ordered = model.risks.slice().sort((a, b) => b.score - a.score || a.n - b.n);
  const where = (c) => `likelihood ${LIKELIHOOD[c.l - 1].toLowerCase()}, impact ${IMPACT[c.i - 1].toLowerCase()}`;
  const lines = ordered.map((r) => {
    const band = BANDS.find((b) => b.key === r.band).label.toLowerCase();
    const at = `${r.n}. ${r.label}: ${where(r.at)}, rated ${band}`;
    if (!moves(r)) return at;
    return `${at}, moving to ${where(r.to)}, ${bandOf(r.to.l * r.to.i).label.toLowerCase()}`;
  });
  return `Five by five risk matrix, likelihood across, impact up; worst first. ${lines.join('; ')}.`;
}

/** The chart-family entrypoint (see the `kernel` block in risk-matrix.manifest.json). */
function transformSection(html, ctx) {
  return spliceFirstList(html, (ext) => {
    const model = parseRiskMatrix(ext.inner);
    return model ? buildRiskMatrix(model, ctx) : null;
  });
}

module.exports = {
  transformSection, parseRiskMatrix, buildRiskMatrix, buildDesc, bandOf, FS, LIKELIHOOD, IMPACT, BANDS,
};
