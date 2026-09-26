/**
 * hub-spoke — one hub, its satellites, and what flows between them. Chart-family
 * member; kernel-as-module (the family dispatches here through the `kernel` block in
 * hub-spoke.manifest.json).
 *
 * WHAT THIS FILE DECIDES, AND WHAT IT DOES NOT. The reading of the slide — the pill
 * grammar, the channel rule, the flow classes, the hub's text fit and every lint — is
 * `lib/core/hub-spoke-model.js`, shared with the linter and the voice (HARD RULE #7).
 * This file owns the GEOMETRY: where the discs sit, how wide the connectors are, where
 * each label lands so it touches nothing, and the SVG that draws it. It emits no color:
 * every paint is a token in hub-spoke.styles.css (HARD RULE #3).
 *
 * THE LOOK ("Bold Hub"). A neutral heavy hub disc — its own body, never a categorical
 * slot, the heaviest mark on the slide — joined to solid satellite discs by
 * constant-width filled connectors. The figure spreads to the stage's width, and the
 * viewBox is 200 units tall on a landscape stage, the piechart's DIAGRAM_H, so a name
 * here prints at the size a pie key prints. Satellites are NEUTRAL unless the author
 * groups them; a status pill paints its own spoke and nothing else.
 *
 * GEOMETRY INVARIANTS (asserted in test/unit/components/hub-spoke.test.js):
 *   · the hub stays inside the stage and outside every satellite;
 *   · every connector shows at least MIN_NECK units between the discs (plus a head's
 *     length for each arrowhead), so the figure never collapses into a molecule; a
 *     tiered figure keeps TIER_NECK hub → branch and TWIG_NECK branch → leaf, at its
 *     narrower bands, and no two of its discs overlap;
 *   · a floor the solver cannot keep is reported in `meta.bad`, and the model's
 *     `crowding()` predicts every such slide, so a broken floor never ships with a
 *     clean lint;
 *   · hub radius : largest satellite radius stays within [1.6, 3.0];
 *   · no label touches a disc, a connector, a halo, another label or the stage edge —
 *     the placer reports anything it cannot place as `unresolved`, and the kernel
 *     retries with narrower names and a label column before accepting one.
 */

const { parseTopLevelLis } = require('../../../core/html-lists');
const { escAttr, plainText, stripTrailingPills, spliceFirstList } = require('../_chart-family/transform-utils');
const { ariaHiddenMarks } = require('../_chart-family/cartesian');
const markDetail = require('../_chart-family/mark-detail');
const { arrowheadPath } = require('../_chart-family/arrowhead');
const HS = require('../../../core/hub-spoke-model');

const PAD = 4;
const FS = 10;              // satellite name — the pie key is 9 (19.06px); 10 prints at 21.2px
const FV = 10.4;            // satellite value
const FSS = 9.5;            // status word
const TALL_SMALL = 10;      // status word and key on a tall (portrait / square) stage
const EMPH = 1.35;          // an alarm spoke's value scale
const LH = 1.2;
const MIN_NECK = 24;        // visible connector floor, user units
// Tiered floors. A branch connector is 7 units wide and a twig 4, against the flat
// band's 10, so their floors scale with the band: each still shows a connector about
// two and a half widths long between the discs — a spoke, never a molecule.
const TIER_NECK = 18;       // hub → branch
const TWIG_NECK = 8;        // branch → leaf
const FLOW_W = [6, 9, 12, 15];
const NECK_W = 10;          // the default connector width (no flow channel)
const SET_BACK = 0.6;       // arrow tip → target body
const HALO_GAP = 2.4;
const HALO_W = 2.0;

// The stage in user units, per orientation. Landscape locks the height to the pie's
// DIAGRAM_H and takes its width from the measured chart body (1152 × 424 CSS px on the
// 1280 × 720 frame = 2.72). A tall or square box gets a narrower, taller viewBox so the
// type keeps its size against the box instead of shrinking to fit a landscape spread.
const STAGES = {
  landscape: { W: 544, H: 200 },
  square: { W: 400, H: 250 },
  portrait: { W: 380, H: 350 },
};

const f2 = (v) => Number(Number(v).toFixed(2));
const P = (x, y) => `${f2(x)},${f2(y)}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Reading the HTML list (the production path) ──────────────────────────────
const unwrapP = (s) => String(s).replace(/<\/?p>/g, '').trim();

/** A list item → `{ label, pills, childrenHtml }`: label plain, pills decoded. */
function readItem(liInner) {
  const { lead, detail } = markDetail.splitDetail(liInner);
  const { leadStripped, pills } = stripTrailingPills(unwrapP(lead));
  return { label: plainText(leadStripped), pills: pills.map((p) => plainText(p)), childrenHtml: detail };
}

/**
 * The slide's list as the model's tree. Flat: a satellite's sublist is its DETAIL
 * (mark-detail, level 3). Tiered: a satellite's sublist is its LEAVES, and a leaf's
 * sublist is the leaf's detail (level 4).
 */
function htmlTree(ulInner, tiered) {
  return parseTopLevelLis(ulInner).map((li) => {
    const hub = readItem(li);
    const children = hub.childrenHtml ? parseTopLevelLis(hub.childrenHtml).map((c) => {
      const sat = readItem(c);
      if (!tiered) return { label: sat.label, pills: sat.pills, children: [], detail: sat.childrenHtml };
      const leaves = sat.childrenHtml ? parseTopLevelLis(sat.childrenHtml).map((g) => {
        const leaf = readItem(g);
        return { label: leaf.label, pills: leaf.pills, children: [], detail: leaf.childrenHtml };
      }) : [];
      return { label: sat.label, pills: sat.pills, children: leaves, detail: '' };
    }) : [];
    return { label: hub.label, pills: hub.pills, children };
  });
}

// ── Shapes ───────────────────────────────────────────────────────────────────
const circle = (cx, cy, r) => `M${P(cx - r, cy)}A${f2(r)},${f2(r)} 0 1 1 ${P(cx + r, cy)}A${f2(r)},${f2(r)} 0 1 1 ${P(cx - r, cy)}Z`;
const ring = (cx, cy, r0, r1) => `${circle(cx, cy, r1)}M${P(cx - r0, cy)}A${f2(r0)},${f2(r0)} 0 1 0 ${P(cx + r0, cy)}A${f2(r0)},${f2(r0)} 0 1 0 ${P(cx - r0, cy)}Z`;

/** A constant-width band from disc to disc, running 0.6 of each radius inside both,
 *  so each disc's own edge crops the joint. */
function neckPath(x0, y0, r0, x1, y1, r1, w) {
  const L = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / L;
  const uy = (y1 - y0) / L;
  const vx = -uy * w / 2;
  const vy = ux * w / 2;
  const a0 = r0 * 0.6;
  const a1 = L - r1 * 0.6;
  const p = (s, o) => P(x0 + ux * s + vx * o, y0 + uy * s + vy * o);
  return `M${p(a0, 1)}L${p(a1, 1)}L${p(a1, -1)}L${p(a0, -1)}Z`;
}

const headLen = (w) => Math.max(w * 1.25, 8);

/** Arrowheads for one connector. The tip sits SET_BACK off the TARGET body — past the
 *  halo when the target carries one — and the base is 0.9 × the band, so a head never
 *  widens the connector. */
function arrowsFor(x0, y0, r0, x1, y1, r1, w, dir) {
  const L = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / L;
  const uy = (y1 - y0) / L;
  const length = headLen(w);
  const base = w * 0.9;
  const out = [];
  if (dir === 'out' || dir === 'both') {
    const s = L - r1 - SET_BACK;
    out.push({ d: arrowheadPath({ tipX: x0 + ux * s, tipY: y0 + uy * s, ux, uy, length, base }), to: 'satellite' });
  }
  if (dir === 'in' || dir === 'both') {
    const s = r0 + SET_BACK;
    out.push({ d: arrowheadPath({ tipX: x0 + ux * s, tipY: y0 + uy * s, ux: -ux, uy: -uy, length, base }), to: 'hub' });
  }
  return out;
}

// ── Label blocks ────────────────────────────────────────────────────────────
/**
 * The rows a spoke's label prints: its name (wrapped, never ellipsized), its value,
 * and its status word. `compact` — the fallback for a crowded wing — folds the value
 * and the status onto the name's last line, so a label costs one row less.
 */
function labelBlock(s, maxW, { hand, alarm, compact = false, fs = FS, fss = FSS }) {
  const nameOpts = { hand, bold: alarm };
  const longest = Math.max(0, ...String(s.label).split(/\s+/).map((w) => HS.textWidth(w, fs, nameOpts)));
  const wrapW = Math.max(maxW, Math.min(longest, maxW * 1.5));
  const rows = HS.wrapText(s.label, wrapW, fs, nameOpts).map((t) => ({ kind: 'name', t, fs, tails: [] }));
  const status = s.status ? HS.spokenStatus(s.status) : '';
  const fv = alarm ? FV * EMPH : FV;
  const tails = [];
  if (s.value) tails.push({ kind: 'value', t: s.value, fs: fv });
  if (status) tails.push({ kind: 'status', t: status, fs: fss });
  const bold = { hand, bold: true };
  const rowW = (r) => HS.textWidth(r.t, r.fs, { hand, bold: r.kind !== 'name' || alarm }) +
    r.tails.reduce((a, t) => a + HS.textWidth(` ${t.t}`, t.fs, bold), 0);
  if (compact && tails.length && rows.length) {
    const last = rows[rows.length - 1];
    const trial = { ...last, tails };
    if (rowW(trial) <= wrapW * 1.25) rows[rows.length - 1] = trial;
    else rows.push({ ...tails[0], tails: tails.slice(1) });
  } else {
    for (const t of tails) rows.push({ ...t, tails: [] });
  }
  if (!rows.length) rows.push({ kind: 'name', t: '', fs, tails: [] });
  const hs = rows.map((r) => Math.max(r.fs, ...r.tails.map((t) => t.fs)) * LH);
  return { rows, hs, h: hs.reduce((a, b) => a + b, 0), w: Math.max(...rows.map(rowW)) };
}

function emitLabel(lb, x, yTop, anchor, attrs) {
  let y = yTop;
  return lb.rows.map((r, i) => {
    const b = y + lb.hs[i] * 0.8;
    y += lb.hs[i];
    const tails = r.tails.map((t) => `<tspan class="hub-spoke-${t.kind}" font-size="${f2(t.fs)}"> ${esc(t.t)}</tspan>`).join('');
    return `<text class="hub-spoke-${r.kind}"${attrs} x="${f2(x)}" y="${f2(b)}" text-anchor="${anchor}" font-size="${f2(r.fs)}">${esc(r.t)}${tails}</text>`;
  }).join('');
}

// ── Collision geometry (user units) ─────────────────────────────────────────
const rectOf = (x, y, w, h) => ({ l: x, r: x + w, t: y, b: y + h });
function rectHitsCircle(R, c, m = 1.5) {
  const nx = Math.max(R.l, Math.min(c.x, R.r));
  const ny = Math.max(R.t, Math.min(c.y, R.b));
  return Math.hypot(nx - c.x, ny - c.y) < c.r + m;
}
function segDist(px, py, s) {
  const dx = s.x1 - s.x0;
  const dy = s.y1 - s.y0;
  const L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - s.x0) * dx + (py - s.y0) * dy) / L2));
  return Math.hypot(px - (s.x0 + t * dx), py - (s.y0 + t * dy));
}
function rectHitsSeg(R, s, m = 1.5) {
  const L = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
  const k = Math.max(2, Math.ceil(L / 1.5));
  // Only the samples inside the rectangle grown by the band's half-width and the margin
  // can hit it, so clip the sample range to that box first (one sample of slack each
  // side, so float rounding at the boundary can never drop a sample that would hit).
  // The samples tested are exactly the ones the full scan tests; it just skips the rest.
  const g = s.w / 2 + m;
  let t0 = 0;
  let t1 = 1;
  for (const [p0, d, lo, hi] of [[s.x0, s.x1 - s.x0, R.l - g, R.r + g], [s.y0, s.y1 - s.y0, R.t - g, R.b + g]]) {
    if (Math.abs(d) < 1e-12) {
      if (p0 < lo || p0 > hi) return false;
      continue;
    }
    const a = (lo - p0) / d;
    const b = (hi - p0) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (t0 > t1 + 1 / k) return false;
  const i0 = Math.max(0, Math.floor(t0 * k) - 1);
  const i1 = Math.min(k, Math.ceil(t1 * k) + 1);
  for (let i = i0; i <= i1; i++) {
    const x = s.x0 + (s.x1 - s.x0) * i / k;
    const y = s.y0 + (s.y1 - s.y0) * i / k;
    if (rectHitsCircle(R, { x, y, r: s.w / 2 }, m)) return true;
  }
  return false;
}
const rectHitsRect = (A, B, m = 2) => A.l < B.r + m && B.l < A.r + m && A.t < B.b + m && B.t < A.b + m;
const outside = (R, st) => R.l < st.l || R.r > st.r || R.t < st.t || R.b > st.b;

/**
 * Each obstacle's reach: the box outside which it cannot touch a label rectangle, at the
 * margins the hit tests use (circle 1.5, band 1.5, rect 1). A rectangle clear of the box
 * is clear of the obstacle, so the exact test runs only for the few that overlap it —
 * the cheap reject that took the tiered search from seconds to milliseconds.
 */
function obstacleBox(o) {
  if (o.kind === 'circle') { const g = o.r + 1.5; return { l: o.x - g, r: o.x + g, t: o.y - g, b: o.y + g }; }
  if (o.kind === 'seg') {
    const g = o.w / 2 + 1.5;
    return { l: Math.min(o.x0, o.x1) - g, r: Math.max(o.x0, o.x1) + g, t: Math.min(o.y0, o.y1) - g, b: Math.max(o.y0, o.y1) + g };
  }
  return { l: o.R.l - 1, r: o.R.r + 1, t: o.R.t - 1, b: o.R.b + 1 };
}
const boxClear = (R, B) => R.r < B.l || R.l > B.r || R.b < B.t || R.t > B.b;

/** One obstacle's hit on a label rectangle, the exact test behind the box reject. */
function obstacleHits(R, o, box, id) {
  if (o.self === id || boxClear(R, box)) return false;
  if (o.kind === 'circle') return rectHitsCircle(R, o);
  if (o.kind === 'seg') return o.self2 !== id && rectHitsSeg(R, o);
  return o.kind === 'rect' && rectHitsRect(R, o.R, 1);
}

/**
 * Greedy candidate placement, highest priority first (alarms, then distance from the
 * horizontal midline). Candidates, cheapest first: beside the node outboard; beside,
 * nudged up or down; over or under; centered over or under; the rim COLUMN outboard of
 * every node on that side. The first zero-hit candidate wins. A side left with a hit
 * becomes a whole column (labels in node order, stacked, each reached by a leader).
 */
function placeLabels(items, obstacles, stage) {
  const boxes = obstacles.map(obstacleBox);
  const placed = [];
  const pre = stage.prePlaced || [];
  // A priority carries a `|y|`, so the two halves of a mirrored layout tie up to the last
  // bits of sin/cos, and those bits differ between V8 builds. The sort compares at a fixed
  // precision, so a tie keeps the authored order in every engine rather than falling to
  // whichever side an engine rounded up. The sort is stable.
  const key = (it) => Math.round(it.prio * 1e6);
  const order = [...items].sort((a, b) => key(b) - key(a));
  for (const it of order) {
    const { lb } = it;
    const gap = 4;
    const cands = [];
    const beside = (dy) => {
      const x = it.side > 0 ? it.cx + it.r + gap : it.cx - it.r - gap - lb.w;
      return { R: rectOf(x, it.cy - lb.h / 2 + dy, lb.w, lb.h), anchor: it.side > 0 ? 'start' : 'end', ax: it.side > 0 ? x : x + lb.w, dy };
    };
    cands.push(beside(0));
    for (let k = 1; k <= 16; k++) for (const s of [-1, 1]) cands.push(beside(s * k * 3));
    const vert = (up) => {
      const y = up ? it.cy - it.r - gap - lb.h : it.cy + it.r + gap;
      const x = it.side > 0 ? it.cx - it.r * 0.3 : it.cx + it.r * 0.3 - lb.w;
      return { R: rectOf(x, y, lb.w, lb.h), anchor: it.side > 0 ? 'start' : 'end', ax: it.side > 0 ? x : x + lb.w, dy: 0, vert: true };
    };
    cands.push(vert(it.cy < 0), vert(it.cy >= 0));
    if (it.branch) {
      // A branch sits among its own twigs, so its name gets many more lanes: sixteen
      // compass points at two distances, and either side of its own neck.
      for (const d of [3, 9]) {
        for (let a = 0; a < 16; a++) {
          const t = a * Math.PI / 8;
          const ux = Math.cos(t);
          const uy = Math.sin(t);
          const px = it.cx + ux * (it.r + d);
          const py = it.cy + uy * (it.r + d);
          const x = ux > 0.3 ? px : ux < -0.3 ? px - lb.w : px - lb.w / 2;
          const y = uy > 0.3 ? py : uy < -0.3 ? py - lb.h : py - lb.h / 2;
          cands.push({ R: rectOf(x, y, lb.w, lb.h), anchor: 'start', ax: x, dy: 0, vert: true, pen: 5 + d });
        }
      }
      if (it.neck) {
        const { x0, y0 } = it.neck;
        for (const f of [0.35, 0.45, 0.55, 0.65, 0.75, 0.85]) {
          const mx = x0 + (it.cx - x0) * f;
          const my = y0 + (it.cy - y0) * f;
          for (const o of [-1, 1]) {
            for (const g of [5, 10]) {
              cands.push({ R: rectOf(mx - lb.w / 2, o < 0 ? my - g - lb.h : my + g, lb.w, lb.h), anchor: 'middle', ax: mx, dy: 0, vert: true, pen: Math.abs(f - 0.6) * 10 + g });
            }
          }
        }
      }
    }
    for (const up of [false, true]) {
      for (const dx of [0, -8, 8, -16, 16]) {
        const y = up ? it.cy - it.r - 2 - lb.h : it.cy + it.r + 2;
        cands.push({ R: rectOf(it.cx - lb.w / 2 + dx, y, lb.w, lb.h), anchor: 'middle', ax: it.cx + dx, dy: 0, vert: true, pen: it.branch ? -15 : 25 + Math.abs(dx) });
      }
    }
    if (stage.colR != null) {
      const col = (dy) => {
        const x = it.side > 0 ? stage.colR : stage.colL - lb.w;
        return { R: rectOf(x, it.cy - lb.h / 2 + dy, lb.w, lb.h), anchor: it.side > 0 ? 'start' : 'end', ax: it.side > 0 ? x : x + lb.w, dy, col: true };
      };
      for (let k = 0; k <= 24; k++) for (const s of k ? [-1, 1] : [1]) cands.push(col(s * k * 2.5));
    }
    // Cheapest first. A candidate's cost is 1000 per hit plus its BASE (offset, lane
    // and penalty, always under 1000), so walking the candidates in base order — stably,
    // so equal bases keep their authored order — the first one with no hit is the one
    // the full scan would have picked, and the walk stops there. A candidate that cannot
    // beat the best so far stops counting its hits early. Same choice, far fewer tests.
    const bases = cands.map((c) => Math.abs(c.dy) + (c.vert ? 20 : 0) + (c.col ? 12 : 0) + (c.pen || 0));
    const order = cands.map((_c, k) => k).sort((a, b) => bases[a] - bases[b] || a - b);
    let best = null;
    for (const k of order) {
      const c = cands[k];
      const b = bases[k];
      const limit = best ? best.cost - b : Infinity;
      let hits = outside(c.R, stage) ? 10 : 0;
      for (let q = 0; q < obstacles.length && hits * 1000 < limit; q++) {
        if (obstacleHits(c.R, obstacles[q], boxes[q], it.id)) hits++;
      }
      for (const p of placed) if (rectHitsRect(c.R, p.R)) hits++;
      for (const p of pre) if (rectHitsRect(c.R, p.R)) hits++;
      if (!hits && (c.col || c.vert || c.dy)) {
        const lead = leaderGeom({ it, R: c.R }, obstacles);
        if (lead && leaderBlocked(lead, it, obstacles)) hits++;
      }
      const cost = hits * 1000 + b;
      if (!best || cost < best.cost) best = { c, cost, hits };
      if (hits === 0) break;
    }
    placed.push({ it, ...best.c, cost: best.cost, hits: best.hits });
  }
  let unresolved = placed.filter((p) => p.hits).length;
  if (unresolved && stage.colR != null) {
    for (const side of [1, -1]) {
      const mine = placed.filter((p) => p.it.side === side);
      if (!mine.some((p) => p.hits)) continue;
      // The column sits outboard of every disc on its side, so a label wider than the
      // room left between the column and the stage edge would run off the stage. Such a
      // label is re-wrapped to that room first (a label that knows how, `it.rewrap`),
      // and only then is the column stacked, with the taller blocks.
      const room = side > 0 ? stage.r - stage.colR : stage.colL - stage.l;
      for (const p of mine) {
        if (p.it.rewrap && p.it.lb.w > room) {
          const lb = p.it.rewrap(room);
          if (lb.w < p.it.lb.w) p.it.lb = lb;
        }
      }
      const total = mine.reduce((a, p) => a + p.it.lb.h + 3, -3);
      if (total > stage.b - stage.t) continue;
      mine.sort((a, b) => a.it.cy - b.it.cy);
      const ys = mine.map((p) => p.it.cy - p.it.lb.h / 2);
      for (let pass = 0; pass < 200; pass++) {
        let moved = false;
        for (let i = 1; i < ys.length; i++) {
          const need = ys[i - 1] + mine[i - 1].it.lb.h + 3;
          if (ys[i] < need - 1e-6) { const d = (need - ys[i]) / 2; ys[i - 1] -= d; ys[i] += d; moved = true; }
        }
        if (ys[0] < stage.t) { ys[0] = stage.t; moved = true; }
        const L = ys.length - 1;
        if (ys[L] + mine[L].it.lb.h > stage.b) { ys[L] = stage.b - mine[L].it.lb.h; moved = true; }
        if (!moved) break;
      }
      mine.forEach((p, i) => {
        const w = p.it.lb.w;
        const x = side > 0 ? stage.colR : stage.colL - w;
        Object.assign(p, { R: rectOf(x, ys[i], w, p.it.lb.h), anchor: side > 0 ? 'start' : 'end', ax: side > 0 ? x : x + w, dy: 0, col: true, vert: false, hits: 0 });
      });
    }
    // Re-score everything after the column pass; a column can still meet the stage edge.
    for (const p of placed) p.hits = scorePlaced(p, placed, obstacles, stage);
    unresolved = placed.filter((p) => p.hits).length;
  }
  return { placed, unresolved };
}

function scorePlaced(p, placed, obstacles, stage) {
  let hits = outside(p.R, stage) ? 1 : 0;
  for (const o of obstacles) {
    if (o.self === p.it.id) continue;
    if (o.kind === 'circle' && rectHitsCircle(p.R, o)) hits++;
    else if (o.kind === 'seg' && o.self2 !== p.it.id && rectHitsSeg(p.R, o)) hits++;
    else if (o.kind === 'rect' && rectHitsRect(p.R, o.R, 1)) hits++;
  }
  for (const q of placed) if (q !== p && rectHitsRect(p.R, q.R)) hits++;
  const lead = leaderGeom(p, obstacles);
  if (lead && leaderBlocked(lead, p.it, obstacles)) hits++;
  return hits;
}

/**
 * A family `.chart-leader` from the node to a label that sits away from it, as a list
 * of points. Straight when the straight line clears every other disc; otherwise an
 * ELBOW that first runs out along the spoke's own direction (which no other disc on
 * the ring can sit across) and then turns to the label. The prototype drew only the
 * straight form, and its long column leaders grazed the discs they passed.
 */
function leaderGeom(p, obstacles) {
  const { it, R } = p;
  const nx = Math.max(R.l, Math.min(it.cx, R.r));
  const ny = Math.max(R.t, Math.min(it.cy, R.b));
  if (Math.hypot(nx - it.cx, ny - it.cy) - it.r <= 6) return null;
  const inside = it.cx > R.l && it.cx < R.r;
  const ty = inside ? (it.cy < R.t ? R.t - 1.2 : R.b + 1.2) : Math.max(R.t + 3, Math.min(it.cy, R.b - 3));
  const tx = inside ? it.cx : (it.cx < R.l ? R.l - 1.2 : R.r + 1.2);
  const ang = Math.atan2(ty - it.cy, tx - it.cx);
  const straight = [[it.cx + Math.cos(ang) * (it.r + 0.9), it.cy + Math.sin(ang) * (it.r + 0.9)], [tx, ty]];
  if (!obstacles || !leaderBlocked(straight, it, obstacles)) return straight;
  const ox = it.ox || 0;
  const oy = it.oy || 0;
  const L = Math.hypot(it.cx - ox, it.cy - oy) || 1;
  const ux = (it.cx - ox) / L;
  const uy = (it.cy - oy) / L;
  const e = [it.cx + ux * (it.r + 7), it.cy + uy * (it.r + 7)];
  const ey = inside ? ty : Math.max(R.t + 3, Math.min(e[1], R.b - 3));
  return [[it.cx + ux * (it.r + 0.9), it.cy + uy * (it.r + 0.9)], e, [tx, ey]];
}

/** A leader may not graze another disc or the hub (its own disc is where it starts). */
function leaderBlocked(pts, it, obstacles) {
  for (let i = 1; i < pts.length; i++) {
    const seg = { x0: pts[i - 1][0], y0: pts[i - 1][1], x1: pts[i][0], y1: pts[i][1] };
    for (const o of obstacles) {
      if (o.kind !== 'circle' || o.self === it.id || o.node === it.id) continue;
      if (segDist(o.x, o.y, seg) < o.r + 1) return true;
    }
  }
  return false;
}

const leaderSvg = (pts) => (pts.length === 2
  ? `<line class="chart-leader" x1="${f2(pts[0][0])}" y1="${f2(pts[0][1])}" x2="${f2(pts[1][0])}" y2="${f2(pts[1][1])}"/>`
  : `<polyline class="chart-leader" points="${pts.map((q) => P(q[0], q[1])).join(' ')}"/>`);

// ── Ellipse wings ────────────────────────────────────────────────────────────
// Points spaced by ARC LENGTH along an ellipse wing, clockwise from 12 o'clock.
function ellipseWing(m, ex, RX, RY, base) {
  const N = 240;
  const t0 = base + ex;
  const t1 = base + Math.PI - ex;
  const pts = [];
  const cum = [0];
  for (let i = 0; i <= N; i++) {
    const t = t0 + (t1 - t0) * i / N;
    pts.push([RX * Math.sin(t), -RY * Math.cos(t)]);
    if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const T = cum[N];
  // The pick allows for rounding. With an odd `m`, the middle spoke wants exactly T/2.
  // By symmetry cum[N/2] equals that too, apart from the last bits of sin/cos/hypot, and
  // those bits differ between V8 builds (Node's and Chromium's disagree). Without the slack,
  // the middle spoke landed one sample off center in one engine and on center in the other,
  // so the code package and the in-repo render drew different charts.
  const slack = T * 1e-9;
  return Array.from({ length: m }, (_, j) => {
    const want = T * (j + 0.5) / m;
    let i = cum.findIndex((c) => c >= want - slack);
    if (i < 0) i = N;
    return pts[i];
  });
}

/**
 * Arc-length parameterization of an ellipse wing: maps a slot position `x` in [0, T]
 * to the angle whose point lies that fraction of the way along the wing's length.
 */
function arcParam(RX, RY, t0, t1, T) {
  const N = 240;
  const cum = [0];
  let px = RX * Math.sin(t0);
  let py = -RY * Math.cos(t0);
  for (let i = 1; i <= N; i++) {
    const t = t0 + (t1 - t0) * i / N;
    const x = RX * Math.sin(t);
    const y = -RY * Math.cos(t);
    cum.push(cum[i - 1] + Math.hypot(x - px, y - py));
    px = x;
    py = y;
  }
  const L = cum[N];
  return (x) => {
    const want = L * Math.min(1, Math.max(0, x / T));
    let lo = 0;
    let hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < want) lo = mid; else hi = mid; }
    const f = cum[hi] > cum[lo] ? (want - cum[lo]) / (cum[hi] - cum[lo]) : 0;
    return t0 + (t1 - t0) * (lo + f) / N;
  };
}

/** The base clear cone at 12 and 6 o'clock, by count: wide for few spokes, narrow for many. */
const baseCone = (n) => (n <= 4 ? 0.55 : n <= 6 ? 0.42 : n <= 8 ? 0.3 : n <= 10 ? 0.18 : 0.28);
/**
 * The cones a layout tries, first choice first. Past ten spokes on a WIDE stage the first
 * try opens the cone to 0.46, so the spokes nearest 12 and 6 o'clock take a label beside
 * their disc rather than a long elbow leader to the label column; it falls back to 0.28
 * (itself wider than the 0.18 it replaced) whenever the wide cone does not come out clean.
 * On the demo's twelve-region slide that took the leaders from six (four of them elbows)
 * to two straight ones, and over the seeded fuzz it cost no collision. A tall stage draws
 * no leaders past ten spokes and began to fail at wider cones, so it keeps 0.18.
 */
const conesFor = (n, tall) => (n <= 10 ? [baseCone(n)] : tall ? [0.18] : [0.46, 0.28]);

function positions(n, RX, RY, ex = baseCone(n), reach3 = 0.8) {
  if (ex == null) ex = baseCone(n);
  if (n === 1) return [[RX, 0]];
  if (n === 2) return [[RX, 0], [-RX, 0]];
  if (n === 3 && reach3 === 'upright') {
    // The Y stood upright: the pair at 2 and 10 o'clock, the lone spoke at 6. A tall
    // stage has the height for it, and the lone spoke's label then needs no width.
    const A = [Math.PI / 3 + 0.12, Math.PI, Math.PI * 5 / 3 - 0.12];
    return A.map((t) => [RX * Math.sin(t) * 0.9, -RY * Math.cos(t) * (Math.abs(t - Math.PI) < 1e-9 ? 0.9 : 1)]);
  }
  if (n === 3) {
    // A sideways Y: 3 o'clock, then 7 and 11, balanced left and right. The lone spoke
    // at 3 o'clock sits in at `reach3` of the spread; a big hub pushes it back out.
    const A = [Math.PI / 2, Math.PI * 7 / 6 + 0.12, Math.PI * 11 / 6 - 0.12];
    return A.map((t, i) => [RX * Math.sin(t) * (i === 0 ? reach3 : 0.9), -RY * Math.cos(t)]);
  }
  const nr = Math.ceil(n / 2);
  const nl = n - nr;
  return [...ellipseWing(nr, ex, RX, RY, 0), ...ellipseWing(nl, ex, RX, RY, Math.PI)];
}

/** The model's name for the stage shape: landscape, or a tall one. */
function stageName(orientation) {
  return STAGES[orientation] ? orientation : 'landscape';
}

function stageFor(orientation) {
  return STAGES[orientation] || STAGES.landscape;
}

// ═══════════════ single tier ═══════════════
function layoutFlat(model, opts) {
  const { hand } = opts;
  const { W, H } = stageFor(opts.orientation);
  const tall = W / H < 2;
  const spokes = model.spokes;
  const n = spokes.length;
  const mods = model.mods;
  const C = HS.channelOf(model);
  const groups = HS.groupsOf(model);
  const useGroups = groups.length >= 1 && groups.length <= HS.LIMITS.groups;
  // A tall stage prints the small voices (status word, key) a step larger, so on a
  // portrait deck they still clear the family floor (11px × --canvas-scale).
  const small = tall ? TALL_SMALL : undefined;
  const key = keyLayout(useGroups ? groups : [], W, hand, small);
  const KH = key.KH;
  const half = (H - KH) / 2 - PAD;
  const [, RH0, RS0] = HS.ladderFor(n);
  const rs0 = C.channel === 'size' ? HS.sizedRadiusMax(n) : RS0;
  // The hub's ceiling: the model's (shared with the linter, so a hub the linter passes
  // is a hub that fits), scaled up when a taller stage has the room.
  const hubCap = Math.min(HS.hubCeiling(n, { sized: C.channel === 'size', stage: stageName(opts.orientation) }), half - 8);
  let ht = HS.fitHubText(model.hub.label, model.hub.value, hubCap, { hand });
  let rsMin = Math.max(9, ht.r / HS.HUB_RATIO_MAX);
  const flowCls = C.flowCls;
  const dirs = spokes.map((s) => HS.directionOf(s, mods));
  // Past eight spokes the connectors thin a step, so twelve bands and their heads still
  // clear each other at the hub.
  const thin = n > 8 ? 0.8 : 1;
  const widthAt = (i, band) => (C.channel === 'flow' ? FLOW_W[flowCls[i] - 1] : NECK_W) * thin * band;

  const radiiAt = (rsMax) => {
    if (C.channel !== 'size') return spokes.map(() => ({ r: rsMax, clamped: false }));
    return HS.sizedDiscs(spokes.map((s) => s.num), rsMax);
  };
  const hubAt = (rsMax) => Math.min(HS.HUB_RATIO_MAX * rsMax, half - 2,
    Math.max(HS.HUB_RATIO_MIN * rsMax, ht.r, RH0 * rsMax / rs0));

  const attempt = (nameW, compact, band, coneAt) => {
    const widthOf = (i) => widthAt(i, band);
    const lbs = spokes.map((s) => labelBlock(s, nameW, { hand, alarm: s.alarm, compact, fss: small }));
    const halo = (s) => (s.alarm ? HALO_GAP + HALO_W : 0);
    const check = (pts, r, Rh, overOk = false) => {
      const bad = [];
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < r[i] + r[j] + halo(spokes[i]) + halo(spokes[j]) + 10) bad.push('crowd');
        }
      }
      spokes.forEach((s, i) => {
        const heads = !dirs[i] ? 0 : dirs[i] === 'both' ? 2 : 1;
        // The floor is the connector a reader sees between the discs; an arrowhead needs
        // its own length plus a stub of band behind it, or the head swallows the spoke.
        const need = Math.max(MIN_NECK, heads * headLen(widthOf(i)) + 10) + halo(s);
        if (Math.hypot(pts[i][0], pts[i][1]) - Rh - r[i] < need) bad.push('neck');
        if (Math.abs(pts[i][1]) + r[i] + halo(s) > half + 0.01) bad.push('tall');
      });
      spokes.forEach((s, i) => {
        const beside = Math.abs(pts[i][0]) + r[i] + halo(s) + 4 + lbs[i].w;
        // `overOk`: the label may sit over or under its disc instead (the placer's
        // vertical lanes), which needs the label's width from 0.3 r inside the disc.
        const over = Math.abs(pts[i][0]) - r[i] * 0.3 + lbs[i].w;
        if ((overOk ? Math.min(beside, over) : beside) > W / 2 - PAD) bad.push('width');
      });
      return bad;
    };
    let rsMax = rs0;
    let T = null;
    let bad = null;
    let Rh = 0;
    for (let k = 0; k < 120; k++) {
      Rh = hubAt(rsMax);
      const rr = radiiAt(rsMax);
      const r = rr.map((x) => x.r);
      const RY = half - rsMax - (spokes.some((s) => s.alarm) ? HALO_GAP + HALO_W : 0);
      // The widest spread whose labels still fit the stage: the width test is monotonic
      // in RX, so a bisection finds the edge.
      const RXmax = W / 2 - PAD - rsMax;
      const RXmin = Math.max(Rh + rsMax + MIN_NECK, RY * 0.35);
      // Past eight spokes a wing may need its labels as a column outboard of every disc,
      // so leave room for that column when the stage allows it; when it does not, fall
      // back to room for beside-the-disc labels only.
      const colFits = (pts) => {
        for (const side of [1, -1]) {
          const idx = spokes.map((_, i) => i).filter((i) => Math.sign(pts[i][0] || (i < Math.ceil(n / 2) ? 1 : -1)) === side);
          if (!idx.length) continue;
          const edge = Math.max(...idx.map((i) => Math.abs(pts[i][0]) + r[i] + halo(spokes[i]))) + 6;
          if (edge + Math.max(...idx.map((i) => lbs[i].w)) > W / 2 - PAD) return false;
        }
        return true;
      };
      const cone = coneAt;
      const besideFits = (RX) => !check(positions(n, RX, RY, cone), r, Rh).includes('width');
      const bisect = (ok) => {
        if (ok(RXmax)) return RXmax;
        if (!ok(RXmin)) return null;
        let lo = RXmin;
        let hi = RXmax;
        for (let it = 0; it < 12; it++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
        return lo;
      };
      let RX = n > 8 ? bisect((x) => besideFits(x) && colFits(positions(n, x, RY, cone))) : null;
      if (RX == null) RX = bisect(besideFits) ?? RXmin;
      // A big hub (a long name, a wide value) crowds the spokes nearest 12 and 6 o'clock:
      // widen the clear cone until every connector keeps its floor, before shrinking discs.
      let pts = positions(n, RX, RY, cone);
      bad = check(pts, r, Rh);
      // On a wide stage the tight spokes are the ones nearest 12 and 6 o'clock, so the cone
      // widens; on a tall stage they are the ones at 3 and 9, so it narrows. Try both, nearest
      // the base first.
      if (n === 3 && bad.includes('neck') && !bad.includes('crowd')) {
        // The Y's lone spoke is the short one: move it out toward the full spread.
        for (const reach of tall ? [0.85, 0.9, 0.95, 1, 'upright'] : [0.85, 0.9, 0.95, 1]) {
          // Upright, each spoke of the pair has a free lane above or below its disc and
          // the pair spreads to the width the stage has for it.
          const up = reach === 'upright';
          const upAt = (x) => positions(n, x, RY, undefined, 'upright');
          const RXu = up ? bisect((x) => !check(upAt(x), r, Rh, true).includes('width')) : null;
          if (up && RXu == null) continue;
          const alt = up ? upAt(RXu) : positions(n, RX, RY, undefined, reach);
          const altBad = check(alt, r, Rh, up);
          if (!altBad.length) { pts = alt; bad = altBad; break; }
        }
      }
      if (n > 3 && bad.includes('neck') && !bad.includes('crowd')) {
        const tries = [];
        for (let k = 1; k <= 26; k++) for (const sgn of tall ? [-1, 1] : [1, -1]) tries.push(cone + sgn * 0.04 * k);
        for (const ex of tries) {
          if (ex < 0.04 || ex > 1.1) continue;
          const alt = positions(n, RX, RY, ex);
          const altBad = check(alt, r, Rh);
          if (!altBad.length) { pts = alt; bad = altBad; break; }
        }
      }
      T = { pts, r, rr, RY };
      if (!bad.length || rsMax <= rsMin) break;
      rsMax = Math.max(rsMin, rsMax - 0.5);
    }
    // Grow the hub into spare room, never past its ceiling.
    const ceilRh = Math.min(HS.HUB_RATIO_MAX * Math.max(...T.r), half - 2, RH0 + 6);
    for (let g = 0; g < 30; g++) {
      if (Rh + 1 > ceilRh) break;
      if (check(T.pts, T.r, Rh + 1).length) break;
      Rh += 1;
    }

    // Place the labels.
    const obstacles = [{ kind: 'circle', x: 0, y: 0, r: Rh, self: 'hub' }];
    const items = [];
    spokes.forEach((s, i) => {
      const [x, y] = T.pts[i];
      const id = `s${i}`;
      const w = widthOf(i);
      obstacles.push({ kind: 'seg', x0: 0, y0: 0, x1: x, y1: y, w, self2: id });
      const rr = T.r[i] + halo(s);
      obstacles.push({ kind: 'circle', x, y, r: rr, node: id });
      items.push({ id, cx: x, cy: y, r: rr, side: x > 0.5 ? 1 : x < -0.5 ? -1 : (i < Math.ceil(n / 2) ? 1 : -1), lb: lbs[i], prio: (s.alarm ? 1000 : 0) + Math.abs(y), s, i,
        rewrap: (w) => labelBlock(s, w / 1.5, { hand, alarm: s.alarm, compact, fss: small }) });
    });
    const keyShift = KH / 2;
    const stage = { l: -W / 2 + PAD / 2, r: W / 2 - PAD / 2, t: -H / 2 + 1 + keyShift, b: H / 2 - 1 - KH + keyShift };
    stage.colR = Math.max(...items.filter((it) => it.side > 0).map((it) => it.cx + it.r), 0) + 6;
    stage.colL = Math.min(...items.filter((it) => it.side < 0).map((it) => it.cx - it.r), 0) - 6;
    const { placed, unresolved } = placeLabels(items, obstacles, stage);
    return { lbs, T, Rh, rsMax, bad, placed, unresolved, obstacles, stage, nameW, compact, ht, band };
  };

  // Fallbacks, in order: the full name budget; narrower budgets; value and status on one row.
  const budgetsWide = useGroups ? [104, 120, 92, 80, 68] : n <= 8 ? [120, 104, 92, 80, 68] : [116, 132, 100, 88, 76, 64];
  const budgets = tall ? [96, 80, 68, 56] : budgetsWide;
  let best = null;
  const ht0 = ht;
  // Last resorts before accepting a broken floor, in order: set the hub's text a step
  // smaller, so the disc can give way — but never past the size the text still fits at;
  // then, when an ARROWHEAD is what the connector cannot hold (two heads on a short
  // spoke, the "bow-tie"), step every band thinner, which shortens every head with it.
  // The flow classes keep their steps; only the scale moves.
  const heady = dirs.some(Boolean);
  outer: for (const band of [1, 0.8, 0.68]) {
    if (band < 1 && !(heady && best.bad.includes('neck'))) break;
    ht = ht0;
    rsMin = Math.max(9, ht.r / HS.HUB_RATIO_MAX);
    for (const hubScale of [1, 0.9, 0.8]) {
      if (hubScale < 1) {
        const smaller = HS.fitHubText(model.hub.label, model.hub.value, hubCap * hubScale, { hand });
        if (smaller.overflow) break;
        ht = smaller;
        rsMin = Math.max(9, ht.r / HS.HUB_RATIO_MAX);
      }
      for (const compact of [false, true]) {
        for (const nameW of budgets) {
          for (const coneAt of conesFor(n, tall)) {
            const a = attempt(nameW, compact, band, coneAt);
            // Broken geometry (discs too close, a connector under its floor) is worse than
            // any label that needs a leader, so it scores first.
            const score = a.bad.length * 1000 + a.unresolved * 100;
            if (!best || score < best.score) best = { ...a, score };
            if (!a.unresolved && !a.bad.length) break outer;
          }
        }
      }
    }
  }
  const widthOf = (i) => widthAt(i, best.band);
  return { ...best, W, H, KH, key, n, C, groups, useGroups, dirs, widthOf, hubCap };
}

function hueOf(s, groups, useGroups) {
  if (!useGroups || !s.group) return 0;
  return groups.indexOf(s.group) + 1;
}

function statusAttr(status) {
  return status ? ` data-s="${escAttr(status)}"` : '';
}

/** The slot attributes a filled mark carries: a group hue, or a status, or nothing. */
function paintAttrs(hue, status, encodes) {
  if (status) return `${statusAttr(status)} data-paint="fill" data-encodes="${encodes}"`;
  if (hue) return ` data-hue="${hue}" data-paint="fill" data-encodes="${encodes}"`;
  return '';
}

function buildFlat(model, opts) {
  const L = layoutFlat(model, opts);
  const { W, H, KH, C, groups, useGroups, T, Rh, ht, placed } = L;
  const spokes = model.spokes;
  const necks = [];
  const arrows = [];
  const halos = [];
  const marks = [];
  spokes.forEach((s, i) => {
    const [x, y] = T.pts[i];
    const r = T.r[i];
    const hue = hueOf(s, groups, useGroups);
    const w = L.widthOf(i);
    const emph = s.alarm ? ' data-emph="true"' : '';
    const flow = C.channel === 'flow' ? ` data-flow="${C.flowCls[i]}"` : '';
    // The connector keeps its group hue; a status belongs to the node, not the flow.
    necks.push(`<path class="hub-spoke-neck"${paintAttrs(hue, '', 'presence')}${flow} d="${neckPath(0, 0, Rh, x, y, r, w)}"/>`);
    const dir = L.dirs[i];
    const haloOut = s.alarm && C.channel !== 'size' && a0(dir) ? HALO_GAP + HALO_W : 0;
    for (const a of arrowsFor(0, 0, Rh, x, y, r + haloOut, w, dir)) {
      arrows.push(`<path class="hub-spoke-arrow"${hue ? ` data-hue="${hue}"` : ''}${s.alarm ? statusAttr(s.status) : ''} data-dir="${dir}" data-to="${a.to}" d="${a.d}"/>`);
    }
    if (s.alarm) {
      // In `sized`, an outer halo would make a flagged disc look bigger, which is the
      // one thing the size channel must not do — so the ring sits INSIDE the disc there.
      const inner = C.channel === 'size';
      const r0 = inner ? Math.max(1, r - HALO_GAP - HALO_W) : r + HALO_GAP;
      const r1 = inner ? Math.max(2, r - HALO_GAP) : r + HALO_GAP + HALO_W;
      halos.push(`<path class="hub-spoke-halo${inner ? ' hub-spoke-halo--inner' : ''}"${statusAttr(s.status)} fill-rule="evenodd" d="${ring(x, y, r0, r1)}"/>`);
    }
    const clamped = C.channel === 'size' && T.rr[i].clamped ? ' data-clamped="true"' : '';
    const size = C.channel === 'size' ? ` data-size="${f2(r / L.rsMax)}"` : '';
    marks.push(`<path class="hub-spoke-node" data-mark="${i}"${paintAttrs(hue, s.status, 'hue')}${emph} data-label="${escAttr(s.label)}"${s.value ? ` data-value="${escAttr(s.value)}"` : ''}${size}${clamped} data-anima-role="node" d="${circle(x, y, r)}"/>`);
  });
  // An inner halo paints over its own disc, so it has to follow the discs.
  const innerHalo = C.channel === 'size';
  const hub = emitHub(0, 0, Rh, ht, model);
  const texts = [];
  const leaders = [];
  for (const p of placed) {
    const s = p.it.s;
    const hue = hueOf(s, groups, useGroups);
    const attrs = `${hue ? ` data-hue="${hue}"` : ''}${statusAttr(s.status)}${s.alarm ? ' data-emph="true"' : ''}`;
    texts.push(`<g class="hub-spoke-label" data-mark-for="${p.it.i}">${emitLabel(p.it.lb, p.ax, p.R.t, p.anchor, attrs)}</g>`);
    const l = leaderGeom(p, L.obstacles);
    if (l) leaders.push(leaderSvg(l));
  }
  let body = `<g class="hub-spoke-necks">${necks.join('')}</g>` +
    `<g class="hub-spoke-arrows">${arrows.join('')}</g>` +
    (innerHalo ? '' : `<g class="hub-spoke-halos">${halos.join('')}</g>`) +
    `<g class="hub-spoke-nodes">${marks.join('')}${hub.mark}</g>` +
    (innerHalo ? `<g class="hub-spoke-halos">${halos.join('')}</g>` : '') +
    `<g class="hub-spoke-leaders">${leaders.join('')}</g>` +
    `<g class="hub-spoke-labels">${hub.text}${texts.join('')}</g>`;
  if (useGroups) {
    body = `<g transform="translate(0 ${f2(-KH / 2)})">${body}</g>${keyBand(L.key, H)}`;
  }
  return { body, W, H, meta: layoutMeta(L, model) };
}

function a0(dir) { return dir === 'out' || dir === 'both'; }

// The key band: rows of pie-key swatches under the figure, inside the viewBox. It costs
// the figure height but never shrinks the type, which a side rail did (it took 197 of
// 544 units of width and dropped the satellites to r = 9). It wraps to a second row
// rather than overrunning the stage.
const KFS = 9;
const KSW = 9;
const KGAP = 16;
const KROW = 14;
function keyLayout(labels, W, hand, kfs = KFS) {
  if (!labels.length) return { KH: 0, rows: [], kfs };
  const widths = labels.map((g) => KSW + 5 + HS.textWidth(g, kfs, { hand }));
  const rows = [[]];
  let used = 0;
  labels.forEach((g, k) => {
    const need = (rows[rows.length - 1].length ? KGAP : 0) + widths[k];
    if (rows[rows.length - 1].length && used + need > W - 2 * PAD) { rows.push([]); used = 0; }
    rows[rows.length - 1].push({ g, k, w: widths[k] });
    used += (rows[rows.length - 1].length > 1 ? KGAP : 0) + widths[k];
  });
  return { KH: rows.length * (KROW + kfs - KFS) + 4, rows, kfs };
}
function keyBand(key, H) {
  const out = [];
  key.rows.forEach((row, ri) => {
    const total = row.reduce((a, c) => a + c.w, 0) + KGAP * (row.length - 1);
    let x = -total / 2;
    const rowH = KROW + key.kfs - KFS;
    const y = H / 2 - key.KH + 2 + rowH * ri + rowH / 2;
    for (const c of row) {
      out.push(`<rect class="chart-key-swatch" data-hue="${c.k + 1}" data-paint="fill" data-encodes="hue" x="${f2(x)}" y="${f2(y - KSW / 2)}" width="${KSW}" height="${KSW}" rx="1.5"/>` +
        `<text class="chart-key-label" x="${f2(x + KSW + 5)}" y="${f2(y + key.kfs * 0.36)}" font-size="${key.kfs}">${esc(c.g)}</text>`);
      x += c.w + KGAP;
    }
  });
  return `<g class="hub-spoke-key">${out.join('')}</g>`;
}

function emitHub(cx, cy, Rh, ht, model) {
  const value = model.hub.value;
  const mark = `<path class="hub-spoke-hub" data-label="${escAttr(model.hub.label)}"${value ? ` data-value="${escAttr(value)}"` : ''} data-anima-role="node" d="${circle(cx, cy, Rh)}"/>`;
  // The type grows into a roomier disc (never past 1.3×), and never shrinks below the fit.
  const k = ht.overflow ? 1 : Math.min(1.3, Math.max(1, (Rh - 4) / Math.max(1, ht.r - 4)));
  const fsN = ht.fsN * k;
  const ft = ht.ft * Math.min(1.45, k * 1.1);
  const blockH = ht.lines.length * fsN * LH + (value ? ft * 1.05 : 0);
  let y = cy - blockH / 2;
  const name = ht.lines.map((l) => {
    const b = y + fsN * 0.9;
    y += fsN * LH;
    return `<text class="hub-spoke-hub-name" x="${f2(cx)}" y="${f2(b)}" text-anchor="middle" font-size="${f2(fsN)}">${esc(l)}</text>`;
  }).join('');
  const tot = value ? `<text class="hub-spoke-hub-value" x="${f2(cx)}" y="${f2(y + ft * 0.86)}" text-anchor="middle" font-size="${f2(ft)}">${esc(value)}</text>` : '';
  return { mark, text: name + tot };
}

function layoutMeta(L, model) {
  const r = L.T.r;
  const minNeck = Math.min(...L.T.pts.map((p, i) => Math.hypot(p[0], p[1]) - L.Rh - r[i]));
  return {
    tier: 'flat', n: L.n, channel: L.C.channel, Rh: L.Rh, rMax: Math.max(...r), rMin: Math.min(...r),
    ratio: L.Rh / Math.max(...r), minNeck, bad: L.bad, unresolved: L.unresolved, W: L.W, H: L.H,
    hubOverflow: L.ht.overflow, placed: L.placed, obstacles: L.obstacles, stage: L.stage,
    nodes: L.T.pts.map((p, i) => ({ x: p[0], y: p[1], r: r[i], halo: model.spokes[i].alarm ? HALO_GAP + HALO_W : 0 })),
    labelSizes: L.lbs.flatMap((lb) => lb.rows.flatMap((row) => [row.fs, ...row.tails.map((t) => t.fs)])),
    nameW: L.nameW, compact: L.compact, keyShift: L.KH / 2,
  };
}

// ═══════════════ two tiers ═══════════════
/** A branch's key-band text: its name, its value, and its status word. */
function branchKeyText(b) {
  return [b.label, b.value, b.status ? HS.spokenStatus(b.status) : ''].filter(Boolean).join(' ');
}

/** Does this label's name break a word across lines? */
function cutsWord(it) {
  const names = it.lb.rows.filter((r) => r.kind === 'name').map((r) => r.t);
  return names.length > 1 && names.join(' ') !== String(it.s.label || '').trim().split(/\s+/).join(' ');
}

// The branch ring as a fraction of the leaf ring, [x, y]: the usual proportion first.
const BRANCH_RINGS = [[0.52, 0.62], [0.58, 0.66], [0.64, 0.7], [0.7, 0.74]];

function layoutTiered(model, opts, keyed = false, prefer = null) {
  const { hand } = opts;
  const { W, H } = stageFor(opts.orientation);
  const br = model.spokes;
  const nb = br.length;
  const mods = model.mods;
  // Keyed: the branch names move into a key band under the figure (the branch IS the
  // group), the fallback when a crowded figure leaves no lane beside a branch disc.
  const small = W / H < 2 ? TALL_SMALL : undefined;
  const key = keyLayout(keyed ? model.spokes.map(branchKeyText) : [], W, hand, small);
  const KH = key.KH;
  const half = (H - KH) / 2 - PAD;
  const rb = HS.TIER_BRANCH_R;
  const rl = 7;
  const wb = 7;
  const wl = 4;
  const hubCap = Math.min(HS.hubCeiling(nb, { tiered: true, stage: stageName(opts.orientation) }), half - 8);
  const haloL = HALO_GAP * 0.75 + HALO_W * 0.8;
  const haloB = (b) => (b.alarm ? HALO_GAP + HALO_W : 0);
  const SPACINGS = W / H < 2 ? ['angle', 'arc'] : ['arc', 'angle'];
  // The arc-length table for a wing depends on the ring and the cone only, and every hub
  // rung and branch ring probes the same ones, so each is built once.
  const arcs = new Map();
  const arcFor = (RX, RY, t0, t1, T) => {
    const k = `${RX}|${RY}|${t0}|${T}`;
    if (!arcs.has(k)) arcs.set(k, arcParam(RX, RY, t0, t1, T));
    return arcs.get(k);
  };
  const keyable = !keyed && nb <= HS.LIMITS.groups;
  const heads = (dir) => (!dir ? 0 : dir === 'both' ? 2 : 1);
  // The floors each connector must keep, arrowheads and halos included — the flat rule
  // (a head needs its own length plus a stub of band behind it), at the tiered widths.
  const needB = br.map((b) => Math.max(TIER_NECK, heads(HS.directionOf(b, mods)) * headLen(wb) + 10) + haloB(b));
  const needL = br.map((b) => b.leaves.map((l) => Math.max(TWIG_NECK, heads(l.dir) * headLen(wl) + 6) + (l.alarm ? haloL : 0) + haloB(b)));
  // The hub ladder, largest first: the preferred disc for this text; the same text in
  // the smallest disc it fits (never under HUB_RATIO_MIN × the branch); then the text a
  // step smaller, while it still fits without cutting. The first rung whose connectors
  // all keep their floors wins, so the hub gives way before a branch touches it.
  const hubLadder = [];
  const wholeWords = (t) => t.lines.join(' ') === String(model.hub.label || '').trim().split(/\s+/).join(' ');
  const hubWhole = wholeWords(HS.fitHubText(model.hub.label, model.hub.value, hubCap, { hand }));
  for (const scale of [1, 0.9, 0.8]) {
    const t = HS.fitHubText(model.hub.label, model.hub.value, hubCap * scale, { hand });
    // A smaller disc is never bought by cutting the hub's name mid-word ("networ / k").
    if (scale < 1 && (t.overflow || (hubWhole && !wholeWords(t)))) break;
    const floor = Math.max(HS.HUB_RATIO_MIN * rb, t.r);
    const top = Math.min(HS.HUB_RATIO_MAX * rb, Math.max(floor, 34));
    for (const k of [0, 0.5, 1]) {
      const Rh = top - (top - floor) * k;
      if (!hubLadder.some((h) => Math.abs(h.Rh - Rh) < 0.25)) hubLadder.push({ Rh, ht: t });
    }
  }
  // Leaves take global slots in two wings; a gap separates branches; cones at 12 and 6.
  const GAPS = 1.2;
  const w8 = br.map((b) => Math.max(1, b.leaves.length) + GAPS);
  const tot = w8.reduce((a, b) => a + b, 0);
  let acc = 0;
  let cut = 0;
  for (let i = 0; i < nb; i++) {
    if (Math.abs(acc + w8[i] - tot / 2) <= Math.abs(acc - tot / 2)) { acc += w8[i]; cut = i + 1; } else break;
  }
  if (cut === 0 && nb) cut = 1;

  /** Where every disc sits for one cone, leaf ring and hub, and which floors break. */
  const geometry = (EXT, RXo, RYo, Rh, [kx, ky], spacing) => {
    const ang = br.map((b) => ({ t: 0, leaves: b.leaves.map(() => 0) }));
    const wing = (list, base0) => {
      const T = list.reduce((a, i) => a + w8[i], 0);
      // Slots are spaced by ARC LENGTH along the leaf ring (as the flat wings are), or by
      // equal steps of the angle. Equal angles bunch the leaves where a WIDE ellipse runs
      // steep (3 and 9 o'clock), which is where the old layout drew leaf discs over each
      // other; on a tall stage they keep the leaves clear of the sides, where the ring is
      // pinned wider than a label beside it can fit. The disc check decides.
      const at = spacing === 'arc'
        ? arcFor(RXo, RYo, base0 + EXT, base0 + Math.PI - EXT, T)
        : (x) => base0 + EXT + (Math.PI - 2 * EXT) * x / T;
      let u = 0;
      list.forEach((i) => {
        br[i].leaves.forEach((_, j) => { ang[i].leaves[j] = at(u + GAPS / 2 + j + 0.5); });
        ang[i].t = at(u + w8[i] / 2);
        u += w8[i];
      });
    };
    wing([...Array(cut).keys()], 0);
    wing([...Array(nb - cut).keys()].map((j) => cut + j), Math.PI);
    const RYi = RYo * ky;
    const RXi = RXo * kx;
    const geo = br.map((b, i) => {
      let bx = RXi * Math.sin(ang[i].t);
      let by = -RYi * Math.cos(ang[i].t);
      // The branch ring is an ellipse, so a branch near 12 or 6 o'clock sits closest to
      // the hub. Push any branch that would crowd the hub out along its own ray until its
      // connector keeps the floor.
      const d = Math.hypot(bx, by);
      const dmin = Rh + rb + needB[i];
      if (d < dmin) { bx *= dmin / d; by *= dmin / d; }
      const leaves = b.leaves.map((_, j) => ({ x: RXo * Math.sin(ang[i].leaves[j]), y: -RYo * Math.cos(ang[i].leaves[j]) }));
      return { x: bx, y: by, leaves };
    });
    const bad = [];
    const discs = [];
    geo.forEach((g, i) => {
      if (Math.hypot(g.x, g.y) - Rh - rb < needB[i] - 0.01) bad.push('neck');
      discs.push({ x: g.x, y: g.y, r: rb + haloB(br[i]), gap: 6 });
      g.leaves.forEach((q, j) => {
        if (Math.hypot(q.x - g.x, q.y - g.y) - rb - rl < needL[i][j] - 0.01) bad.push('twig');
        discs.push({ x: q.x, y: q.y, r: rl + (br[i].leaves[j].alarm ? haloL : 0), gap: 2 });
      });
    });
    for (let a = 0; a < discs.length; a++) {
      for (let c = a + 1; c < discs.length; c++) {
        const A = discs[a];
        const B = discs[c];
        if (Math.hypot(A.x - B.x, A.y - B.y) < A.r + B.r + Math.min(A.gap, B.gap)) bad.push('crowd');
      }
    }
    return { geo, bad };
  };

  // The arrangement and the leaf labels depend on the leaf budget, the fold and the cone
  // only — the branch budget touches nothing but the branch names — so each is solved
  // once per (leafW, compact, EXT) and reused across the branch budgets.
  const arrangements = new Map();
  const arrangementFor = (leafW, compact, EXT) => {
    const k = `${leafW}|${compact}|${EXT}`;
    if (arrangements.has(k)) return arrangements.get(k);
    const lbl = br.map((b) => b.leaves.map((l) => labelBlock(l, leafW, { hand, alarm: l.alarm, compact, fss: small })));
    const maxLw = Math.max(0, ...lbl.flat().map((l) => l.w));
    const RYo = half - rl - haloL - 1;
    const RXo = Math.max(RYo * 0.9, Math.min(RYo * 2.3, W / 2 - PAD - rl - haloL - 5 - maxLw));
    // The branch ring at its usual proportion of the leaf ring and the largest hub whose
    // connectors all keep their floors; then the same ring with the hub stepping down;
    // then a wider branch ring (branches crowding each other in a short wing, the keyed
    // figure's usual trouble), which shortens the twigs. Failing all of them, the
    // arrangement that breaks the fewest floors — reported in meta.bad.
    let G = null;
    let lean = null;
    search: for (const spacing of SPACINGS) {
      for (const ring of BRANCH_RINGS) {
        for (const h of hubLadder) {
          const g = geometry(EXT, RXo, RYo, h.Rh, ring, spacing);
          if (!G || g.bad.length < G.bad.length) G = { ...g, ...h };
          if (!g.bad.length) {
            // Also keep this ring's smallest clean hub: the one retry a crowded label
            // search gets is a smaller hub, which frees the lanes beside the branches.
            for (const q of hubLadder.slice(hubLadder.indexOf(h) + 1).reverse()) {
              const g2 = geometry(EXT, RXo, RYo, q.Rh, ring, spacing);
              if (!g2.bad.length) { lean = { ...g2, ...q }; break; }
            }
            break search;
          }
        }
      }
    }
    const out = { lbl, G, lean, leaves: new Map() };
    arrangements.set(k, out);
    return out;
  };

  // `bound` is the best score so far: an attempt that provably cannot beat it (broken
  // floors against a clean best, or more leaf misses than the best has in all) stops
  // there, which changes no choice — it only skips work whose result would be discarded.
  const attempt = (leafW, compact, EXT, branchW, bound) => {
    const A = arrangementFor(leafW, compact, EXT);
    const first = place(A, A.G, compact, branchW, bound);
    if (!first.unresolved || !A.lean) return { ...first, leafW, compact, EXT, branchW };
    const second = place(A, A.lean, compact, branchW, Math.min(bound, first.score));
    return { ...(second.score < first.score ? second : first), leafW, compact, EXT, branchW };
  };

  /** Place every label on one arrangement, leaves first, and score it. */
  const place = (A, G, compact, branchW, bound) => {
    const { geo, Rh, ht, bad } = G;
    if (bad.length * 1000 >= bound) return { score: Infinity };
    const lbl = A.lbl;
    const obstacles = [{ kind: 'circle', x: 0, y: 0, r: Rh, self: 'hub' }];
    const items = [];
    br.forEach((b, i) => {
      const { x: bx, y: by } = geo[i];
      const bid = `b${i}`;
      const bh = haloB(b);
      obstacles.push({ kind: 'seg', x0: 0, y0: 0, x1: bx, y1: by, w: wb, self2: `${bid}n` });
      obstacles.push({ kind: 'circle', x: bx, y: by, r: rb + bh, node: bid });
      b.leaves.forEach((l, j) => {
        const { x: lx, y: ly } = geo[i].leaves[j];
        const lid = `l${i}-${j}`;
        const lh = l.alarm ? haloL : 0;
        obstacles.push({ kind: 'seg', x0: bx, y0: by, x1: lx, y1: ly, w: wl, self2: lid });
        obstacles.push({ kind: 'circle', x: lx, y: ly, r: rl + lh, node: lid });
        items.push({ id: lid, cx: lx, cy: ly, ox: bx, oy: by, r: rl + lh, side: lx >= 0 ? 1 : -1, lb: lbl[i][j], prio: (l.alarm ? 1000 : 50) + Math.abs(ly), s: l, bi: i, li: j, tier: 'leaf' });
      });
      const lb = labelBlock(b, branchW, { hand, alarm: b.alarm, compact, fss: small });
      items.push({ id: bid, cx: bx, cy: by, r: rb + bh, side: bx >= 0 ? 1 : -1, lb, prio: 10, s: b, bi: i, tier: 'branch', branch: true, neck: { x0: 0, y0: 0 } });
    });
    const stage = { l: -W / 2 + PAD / 2, r: W / 2 - PAD / 2, t: -H / 2 + 1 + KH / 2, b: H / 2 - 1 - KH / 2 };
    const leafItems = items.filter((it) => !it.branch);
    stage.colR = leafItems.some((it) => it.side > 0) ? Math.max(...leafItems.filter((it) => it.side > 0).map((it) => it.cx + it.r)) + 6 : 0;
    stage.colL = leafItems.some((it) => it.side < 0) ? Math.min(...leafItems.filter((it) => it.side < 0).map((it) => it.cx - it.r)) - 6 : 0;
    // Leaves first (they own the rim); then branch names into whatever lane is left. The
    // leaf pass does not depend on the branch budget, so it is placed once per arrangement
    // (copied, because the final re-score below writes each label's hits).
    if (!A.leaves.has(G)) A.leaves.set(G, placeLabels(leafItems, obstacles, stage));
    const p1c = A.leaves.get(G);
    const p1 = { placed: p1c.placed.map((q) => ({ ...q, it: leafItems.find((it) => it.id === q.it.id) })) };
    // A leaf that collides here still collides once the branch names are placed (every
    // hit it counted is still there, and more labels only add hits), so its misses are a
    // floor under this attempt's score.
    const leafMiss = p1.placed.filter((q) => q.hits).length;
    if (bad.length * 1000 + leafMiss * 100 >= bound) return { score: Infinity };
    const branchObs = obstacles.concat(p1.placed.map((q) => ({ kind: 'rect', R: q.R })));
    const p2 = keyed ? { placed: [] } : placeLabels(items.filter((it) => it.branch), branchObs, { ...stage, colR: null, prePlaced: p1.placed });
    const placed = p1.placed.concat(p2.placed);
    for (const q of placed) q.hits = scorePlaced(q, placed, obstacles, stage);
    const unresolved = placed.filter((q) => q.hits).length;
    // A branch name that finds no lane is the one miss the key band can still fix (the
    // keyed retry in buildTiered), so it costs less than a leaf label that does not fit.
    const branchMiss = placed.filter((q) => q.hits && q.it.branch).length;
    // A name cut mid-word ("Distributio / n") is legal but ugly, so it costs more than a
    // branch name the key band can take, and a layout that keeps every word whole wins.
    const cut = placed.filter((q) => cutsWord(q.it)).length;
    const score = bad.length * 1000 + (unresolved - branchMiss) * 100 + branchMiss * (keyable ? 10 : 100) + cut * 30;
    return { geo, placed, unresolved, obstacles, stage, bad, Rh, ht, score };
  };
  // Fallbacks, in order: full leaf budget with value and status folded onto the name's
  // line; wider and narrower budgets; a different cone at 12 and 6 o'clock; unfolded rows.
  // `prefer` (the keyed retry) tries the unkeyed search's best settings first, so a key
  // band that fixes the branch names usually costs one attempt, not the whole search.
  const tries = [];
  for (const EXT of [0.5, 0.36, 0.64]) {
    for (const compact of [true, false]) {
      for (const [leafW, branchW] of [[84, 70], [84, 50], [100, 60], [72, 44]]) tries.push([leafW, compact, EXT, branchW]);
    }
  }
  // Last, a narrower leaf budget (names wrap to two lines): the room it frees beside the
  // leaves widens the leaf ring, which is what a tall stage runs out of when a flagged
  // branch needs its halo on both sides of its disc.
  for (const EXT of [0.5, 0.36, 0.64]) for (const [leafW, branchW] of [[60, 44], [48, 40]]) tries.push([leafW, true, EXT, branchW]);
  if (prefer) tries.unshift([prefer.leafW, prefer.compact, prefer.EXT, prefer.branchW]);
  let best = null;
  let tried = 0;
  for (const t of tries) {
    const a = attempt(...t, best ? best.score : Infinity);
    tried++;
    if (!best || a.score < best.score) best = a;
    if (!a.score) break;
  }
  return { W, H, KH, key, keyed, rb, rl, wb, wl, haloL, ...best, tried };
}

function buildTiered(model, opts) {
  let L = layoutTiered(model, opts, false);
  let attempts = L.tried;
  if (L.unresolved && L.placed.some((q) => q.hits && q.it.branch) && model.spokes.length <= HS.LIMITS.groups) {
    const K = layoutTiered(model, opts, true, L);
    attempts += K.tried;
    if (K.score < L.score) L = K;
  }
  const { W, H, Rh, rb, rl, wb, wl, geo, haloL } = L;
  const br = model.spokes;
  const mods = model.mods;
  const necks = [];
  const arrows = [];
  const halos = [];
  const marks = [];
  let mark = 0;
  // Every mark is numbered in reading order: branch, then its leaves.
  const markOf = [];
  br.forEach((b, i) => {
    const hue = br.length <= HS.LIMITS.groups ? i + 1 : 0;
    const { x: bx, y: by } = geo[i];
    const bm = mark++;
    markOf.push({ b: bm, leaves: [] });
    const dir = HS.directionOf(b, mods);
    necks.push(`<path class="hub-spoke-neck"${paintAttrs(hue, '', 'presence')} d="${neckPath(0, 0, Rh, bx, by, rb, wb)}"/>`);
    for (const a of arrowsFor(0, 0, Rh, bx, by, rb + (b.alarm && a0(dir) ? HALO_GAP + HALO_W : 0), wb, dir)) {
      arrows.push(`<path class="hub-spoke-arrow"${hue ? ` data-hue="${hue}"` : ''}${b.alarm ? statusAttr(b.status) : ''} data-dir="${dir}" data-to="${a.to}" d="${a.d}"/>`);
    }
    if (b.alarm) halos.push(`<path class="hub-spoke-halo"${statusAttr(b.status)} fill-rule="evenodd" d="${ring(bx, by, rb + HALO_GAP, rb + HALO_GAP + HALO_W)}"/>`);
    marks.push(`<path class="hub-spoke-node hub-spoke-branch" data-mark="${bm}"${paintAttrs(hue, b.status, 'hue')}${b.alarm ? ' data-emph="true"' : ''} data-label="${escAttr(b.label)}"${b.value ? ` data-value="${escAttr(b.value)}"` : ''} data-anima-role="node" d="${circle(bx, by, rb)}"/>`);
    b.leaves.forEach((l, j) => {
      const { x: lx, y: ly } = geo[i].leaves[j];
      const lm = mark++;
      markOf[i].leaves.push(lm);
      const ldir = l.dir;
      necks.push(`<path class="hub-spoke-twig"${paintAttrs(hue, '', 'presence')} d="${neckPath(bx, by, rb, lx, ly, rl, wl)}"/>`);
      for (const a of arrowsFor(bx, by, rb, lx, ly, rl + (l.alarm && a0(ldir) ? haloL : 0), wl, ldir)) {
        arrows.push(`<path class="hub-spoke-arrow"${hue ? ` data-hue="${hue}"` : ''}${l.alarm ? statusAttr(l.status) : ''} data-dir="${ldir}" data-to="${a.to === 'hub' ? 'branch' : 'leaf'}" d="${a.d}"/>`);
      }
      if (l.alarm) halos.push(`<path class="hub-spoke-halo"${statusAttr(l.status)} fill-rule="evenodd" d="${ring(lx, ly, rl + HALO_GAP * 0.75, rl + haloL)}"/>`);
      marks.push(`<path class="hub-spoke-leaf" data-mark="${lm}"${paintAttrs(hue, l.status, 'hue')}${l.alarm ? ' data-emph="true"' : ''} data-label="${escAttr(l.label)}"${l.value ? ` data-value="${escAttr(l.value)}"` : ''} data-anima-role="node" d="${circle(lx, ly, rl)}"/>`);
    });
  });
  const hub = emitHub(0, 0, Rh, L.ht, model);
  const texts = [];
  const leaders = [];
  for (const p of L.placed) {
    const it = p.it;
    const s = it.s;
    const hue = br.length <= HS.LIMITS.groups ? it.bi + 1 : 0;
    const attrs = `${hue ? ` data-hue="${hue}"` : ''} data-tier="${it.tier}"${statusAttr(s.status)}${s.alarm ? ' data-emph="true"' : ''}`;
    const forMark = it.tier === 'branch' ? markOf[it.bi].b : markOf[it.bi].leaves[it.li];
    texts.push(`<g class="hub-spoke-label" data-mark-for="${forMark}">${emitLabel(it.lb, p.ax, p.R.t, p.anchor, attrs)}</g>`);
    const l = leaderGeom(p, L.obstacles);
    if (l) leaders.push(leaderSvg(l));
  }
  let body = `<g class="hub-spoke-necks">${necks.join('')}</g><g class="hub-spoke-arrows">${arrows.join('')}</g>` +
    `<g class="hub-spoke-halos">${halos.join('')}</g><g class="hub-spoke-nodes">${marks.join('')}${hub.mark}</g>` +
    `<g class="hub-spoke-leaders">${leaders.join('')}</g><g class="hub-spoke-labels">${hub.text}${texts.join('')}</g>`;
  if (L.keyed) body = `<g transform="translate(0 ${f2(-L.KH / 2)})">${body}</g>${keyBand(L.key, H)}`;
  const meta = {
    tier: 'tiered', keyed: L.keyed, attempts, n: br.length, channel: 'none', Rh, rMax: rb, rMin: rl, ratio: Rh / rb, unresolved: L.unresolved,
    W, H, hubOverflow: L.ht.overflow, placed: L.placed, obstacles: L.obstacles, stage: L.stage, bad: L.bad,
    nodes: geo.flatMap((g, i) => [{ x: g.x, y: g.y, r: rb, halo: br[i].alarm ? HALO_GAP + HALO_W : 0, tier: 'branch' },
      ...g.leaves.map((q, j) => ({ x: q.x, y: q.y, r: rl, halo: br[i].leaves[j].alarm ? haloL : 0, tier: 'leaf', px: g.x, py: g.y, pr: rb }))]),
    labelSizes: L.placed.flatMap((p) => p.it.lb.rows.flatMap((row) => [row.fs, ...row.tails.map((t) => t.fs)])), keyShift: L.KH / 2,
  };
  return { body, W, H, meta, markOf };
}

// ── Accessible name and description ───────────────────────────────────────────
function spokeWords(s, mods, withDir = true) {
  const dir = withDir ? HS.directionOf(s, mods) : s.dir;
  const flow = dir === 'out' ? 'flowing out' : dir === 'in' ? 'flowing in' : dir === 'both' ? 'flowing both ways' : '';
  return [s.label, s.value, s.status ? HS.spokenStatus(s.status) : '', s.group, flow].filter(Boolean).join(', ');
}

function describe(model) {
  const { hub, spokes, mods } = model;
  const head = `${hub.label}${hub.value ? `, ${hub.value}` : ''}`;
  const C = HS.channelOf(model);
  const frame = C.channel === 'size' ? ' Disc area shows each value.'
    : C.channel === 'flow' ? ` Connector weight shows each value, in ${HS.FLOW_STEPS} steps.` : '';
  const cls = mods.flow ? ` Flow runs ${mods.flow === 'both' ? 'both ways' : mods.flow === 'out' ? 'out from the hub' : 'in to the hub'}.` : '';
  if (mods.tiered) {
    // Lead with the structure's takeaway — how the hub divides, which branch carries the
    // most, what is flagged — and only then walk every branch and its leaves.
    const total = spokes.reduce((a, b) => a + b.leaves.length, 0);
    const most = Math.max(0, ...spokes.map((b) => b.leaves.length));
    const top = spokes.filter((b) => b.leaves.length === most);
    const largest = most && top.length === 1 && spokes.length > 1 ? ` ${top[0].label} is the largest, with ${most} ${most === 1 ? 'leaf' : 'leaves'}.` : '';
    const flagged = [...spokes, ...spokes.flatMap((b) => b.leaves)].filter((x) => x.alarm);
    const flags = flagged.length ? ` Flagged: ${flagged.map((x) => `${x.label} (${HS.spokenStatus(x.status)})`).join(', ')}.` : '';
    const parts = spokes.map((b) => {
      const leaves = b.leaves.map((l) => spokeWords(l, { flow: '' })).join('; ');
      return `${spokeWords(b, mods)}${leaves ? ` — ${leaves}` : ''}`;
    });
    return `${head} divides into ${spokes.length} ${spokes.length === 1 ? 'branch' : 'branches'} with ${total} ${total === 1 ? 'leaf' : 'leaves'} in all.${largest}${flags}${cls} ${parts.join('. ')}.`;
  }
  return `${head}, connected to ${spokes.length} ${spokes.length === 1 ? 'spoke' : 'spokes'}.${cls}${frame} ${spokes.map((s) => spokeWords(s, mods)).join('; ')}.`;
}

// ── Entry points ─────────────────────────────────────────────────────────────
/**
 * Lay out a model. Exported for the unit tests, which assert the invariants on the
 * geometry itself (overlaps, neck floor, hub ceiling) rather than on the SVG string.
 */
function layoutHubSpoke(model, opts = {}) {
  return model.mods.tiered ? buildTiered(model, opts) : buildFlat(model, opts);
}

function buildHubSpoke(model, opts = {}) {
  const out = layoutHubSpoke(model, opts);
  const { W, H } = out;
  const leafCount = model.spokes.reduce((a, b) => a + (b.leaves || []).length, 0);
  const title = model.mods.tiered
    ? `${model.hub.label || 'Hub'}: ${model.spokes.length} ${model.spokes.length === 1 ? 'branch' : 'branches'}, ${leafCount} ${leafCount === 1 ? 'leaf' : 'leaves'}`
    : `${model.hub.label || 'Hub'}: hub and ${model.spokes.length} spokes`;
  const svg = `<svg class="hub-spoke-svg" viewBox="${f2(-W / 2)} ${f2(-H / 2)} ${f2(W)} ${f2(H)}" preserveAspectRatio="xMidYMid meet" role="img">` +
    `<title>${esc(title)}</title><desc>${esc(describe(model))}</desc>${ariaHiddenMarks(out.body)}</svg>`;
  // Per-mark detail: flat satellites carry theirs; tiered leaves carry theirs.
  const detailMarks = [];
  if (model.mods.tiered) {
    model.spokes.forEach((b, i) => {
      detailMarks[out.markOf[i].b] = { label: b.label, valueRaw: b.value, detail: '' };
      b.leaves.forEach((l, j) => { detailMarks[out.markOf[i].leaves[j]] = { label: l.label, valueRaw: l.value, detail: l.detail }; });
    });
  } else {
    model.spokes.forEach((s, i) => { detailMarks[i] = { label: s.label, valueRaw: s.value, detail: s.detail }; });
  }
  const html = `<div class="hub-spoke-figure">${svg}${markDetail.detailPayload(detailMarks)}</div>${markDetail.detailNote(detailMarks)}`;
  return { html, meta: out.meta };
}

/** Parse the section's first list into the shared model. */
function parseHubSpoke(ulInner, classTokens) {
  const tiered = (classTokens || []).includes('tiered');
  return HS.buildModel(htmlTree(ulInner, tiered), classTokens);
}

function transformSection(html, ctx) {
  const hand = ctx.classTokens.includes('sketch');
  return spliceFirstList(html, (ext) => {
    const model = parseHubSpoke(ext.inner, ctx.classTokens);
    if (!model?.spokes.length) return null;
    return buildHubSpoke(model, { orientation: ctx.orientation, hand }).html;
  });
}

module.exports = {
  transformSection, parseHubSpoke, buildHubSpoke, layoutHubSpoke, htmlTree, describe,
  STAGES, MIN_NECK, TIER_NECK, TWIG_NECK, FS, FSS, TALL_SMALL, FLOW_W, stageName,
  __geometry: { rectHitsCircle, rectHitsSeg, rectHitsRect, segDist, leaderGeom },
};
