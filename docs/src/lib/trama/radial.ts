/**
 * Trama radial kernel: one node in the center, the rest on a ring around it, joined by
 * straight bands, with every label placed where it touches nothing. The third way Trama
 * arranges boxes, beside dagre's ranked rows and the reading-order grid
 * (engineering/decisions/2026-10-05-trama-radial-layout.md).
 *
 * IT DOES NOT KNOW WHAT IT LAYS OUT. It sees circles, bands, label boxes and numbers. A
 * chart passes in what its marks mean as plain values: a ring of extra radius round a
 * flagged node (`halo`), the band length a node needs to read as a line (`floor`), how
 * large the center may grow (`centerAt`, `centerCeil`). Hub-spoke is the first adapter;
 * its words (hub, spoke, branch, leaf, flow, status) never appear here.
 *
 * TWO KINDS OF EXPORT. The PRIMITIVES are general: the paint paths, the collision tests,
 * `placeLabels` and `leader`, and `ring`. The two SOLVERS, `solveStar` and `twoRings`, are
 * hub-spoke's solver lifted whole: their cone table, the three-node Y, the 0.5 shrink step
 * and the spacing constants are calibrated to the envelope hub-spoke's linter certifies
 * (`crowding()` in lib/core/hub-spoke-model.js), and any change to them changes hub-spoke's
 * bytes. A second radial chart that does not fit them (a cycle with no center, labels
 * inside nodes, a third ring) gets a solver designed from both charts, not a flag here.
 *
 * ONE SELF-CONTAINED FUNCTION, ON PURPOSE, like `graphLayoutKernel`: every helper is
 * defined inside `radialLayoutKernel` and it closes over nothing, so a browser pass can
 * ship it as `fn.toString()` source. The serialization test rebuilds it from `dist/`.
 *
 * DETERMINISM. The same input draws the same bytes in Node and in every browser engine.
 * Two places compare at a fixed precision for that reason (the arc-length pick in
 * `ellipseWing` and the priority sort in `placeLabels`): the last bits of sin, cos and
 * hypot differ between V8 builds, and a mirrored layout ties on exactly those bits.
 *
 * Coordinates are user units with the center at the origin, y down.
 */

// Local shapes. Types are erased, so none of these reaches the serialized kernel.

/** A point as `[x, y]`. */
export type RadialPoint = [number, number];
/** A box by its four edges. */
export interface RadialRect { l: number; r: number; t: number; b: number }
/** What a label box needs to be placed: its size, and how to narrow it if a column is short. */
export interface LabelBox { w: number; h: number }
/** A circle, a band or a box a label must stay clear of. `self`/`node`/`self2` name the item the obstacle belongs to. */
export type RadialObstacle =
  | { kind: 'circle'; x: number; y: number; r: number; self?: string; node?: string }
  | { kind: 'seg'; x0: number; y0: number; x1: number; y1: number; w: number; self2?: string }
  | { kind: 'rect'; R: RadialRect };
/**
 * One label to place, beside the circle it names. `side` is the wing (+1 right, -1 left).
 * A `crowded` node sits among its own children, so it also tries sixteen compass lanes and
 * lanes along its band (`neck`, the band's far end). `ox`/`oy` is where the node's band
 * starts, for a leader that must bend. A host may carry its own fields on an item; the
 * kernel passes them through.
 */
export interface LabelItem<B extends LabelBox = LabelBox> {
  id: string;
  cx: number;
  cy: number;
  r: number;
  side: number;
  prio: number;
  lb: B;
  crowded?: boolean;
  neck?: { x0: number; y0: number };
  ox?: number;
  oy?: number;
  rewrap?: (w: number) => B;
}
/** The stage a label must stay inside, and the optional label columns outboard of every node. */
export interface LabelStage extends RadialRect {
  colR?: number | null;
  colL?: number;
  prePlaced?: { R: RadialRect }[];
}
/** Where a label landed. `anchor` and `ax` are the text anchor and its x; `hits` counts what it still touches. */
export interface PlacedLabel<I extends LabelItem = LabelItem> {
  it: I;
  R: RadialRect;
  anchor: 'start' | 'middle' | 'end';
  ax: number;
  dy: number;
  vert?: boolean;
  col?: boolean;
  pen?: number;
  cost: number;
  hits: number;
}
/** A node's radius from the star solver, and whether its size was clamped. */
export interface RadialRadius { r: number; clamped: boolean }
/**
 * The star: n nodes on one ring around the center.
 * - `labelW[i]` is node i's label width; the ring narrows until each fits beside its node.
 * - `halo[i]` is extra radius round node i (0 for none).
 * - `floor(i)` is the band length node i needs between its circle and the center, halo included.
 * - `radiiAt(rsMax)` sizes every node for the current largest radius; `centerAt(rsMax)` the center.
 * - `centerCeil(r)` is the largest the center may grow into spare room once the ring is set.
 * - `rs0` is the first largest radius tried; the solver steps it down by 0.5 to `rsMin`.
 */
export interface StarSpec {
  n: number;
  W: number;
  half: number;
  pad: number;
  tall: boolean;
  cone: number;
  minNeck: number;
  rs0: number;
  rsMin: number;
  labelW: number[];
  halo: number[];
  floor: (i: number) => number;
  radiiAt: (rsMax: number) => RadialRadius[];
  centerAt: (rsMax: number) => number;
  centerCeil: (r: number[]) => number;
}
/**
 * What the star solver settled: node centers and radii, the center's radius, and the floors
 * it broke: `crowd` (two nodes too close), `neck` (a band under its floor), `tall` (a node
 * past the stage's height), `width` (a label past the stage's width).
 */
export interface StarResult {
  T: { pts: RadialPoint[]; r: number[]; rr: RadialRadius[]; RY: number };
  Rh: number;
  rsMax: number;
  bad: string[];
}
/**
 * Two rings: `counts[i]` children for each inner node. Inner nodes have radius `rIn`, outer
 * ones `rOut`; `haloIn`/`haloOut` and `floorIn`/`floorOut` are the extra radius and the band
 * floor per node; `gapIn`/`gapOut` the clearance a node keeps from any other; `gaps` the room,
 * in child slots, between one inner node's children and the next's.
 */
export interface TwoRingSpec {
  counts: number[];
  gaps: number;
  rIn: number;
  rOut: number;
  haloIn: number[];
  haloOut: number[][];
  floorIn: number[];
  floorOut: number[][];
  gapIn: number;
  gapOut: number;
}
/** One inner node and its children, placed. */
export interface TwoRingNode { x: number; y: number; children: { x: number; y: number }[] }
/** `bad` as for the star, plus `outer-neck`: a band from an inner node to a child under its floor. */
export interface TwoRingGeometry { geo: TwoRingNode[]; bad: string[] }
/** A center size to try. A host may carry its own fields on a rung; they are spread into the result. */
export interface CenterRung { R: number }
export interface RadialKernel {
  circlePath(cx: number, cy: number, r: number): string;
  annulusPath(cx: number, cy: number, r0: number, r1: number): string;
  bandPath(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, w: number): string;
  bandHeads(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, w: number, toEnd: boolean, toStart: boolean, setBack: number): { d: string; to: 'end' | 'start' }[];
  headLen(w: number): number;
  rectHitsCircle(R: RadialRect, c: { x: number; y: number; r: number }, m?: number): boolean;
  rectHitsSeg(R: RadialRect, s: { x0: number; y0: number; x1: number; y1: number; w: number }, m?: number): boolean;
  rectHitsRect(A: RadialRect, B: RadialRect, m?: number): boolean;
  segDist(px: number, py: number, s: { x0: number; y0: number; x1: number; y1: number }): number;
  placeLabels<I extends LabelItem>(items: I[], obstacles: RadialObstacle[], stage: LabelStage): { placed: PlacedLabel<I>[]; unresolved: number };
  scorePlaced<I extends LabelItem>(p: PlacedLabel<I>, placed: PlacedLabel<I>[], obstacles: RadialObstacle[], stage: LabelStage): number;
  leader(p: { it: LabelItem; R: RadialRect }, obstacles?: RadialObstacle[]): RadialPoint[] | null;
  ring(n: number, RX: number, RY: number, ex?: number | null, reach3?: number | 'upright'): RadialPoint[];
  conesFor(n: number, tall: boolean): number[];
  solveStar(spec: StarSpec): StarResult;
  twoRings(spec: TwoRingSpec): {
    cut: number;
    geometry(EXT: number, RXo: number, RYo: number, R: number, ringK: [number, number], spacing: string): TwoRingGeometry;
    search<H extends CenterRung>(EXT: number, RXo: number, RYo: number, ladder: H[], rings: [number, number][], spacings: string[]): { G: (TwoRingGeometry & H) | null; lean: (TwoRingGeometry & H) | null };
  };
}

export function radialLayoutKernel(): RadialKernel {
  const f2 = (v: number) => Number(Number(v).toFixed(2));
  const P = (x: number, y: number) => `${f2(x)},${f2(y)}`;

  // ── Paint geometry: path data only. The host owns every class, color and attribute. ──
  const circlePath = (cx: number, cy: number, r: number) => `M${P(cx - r, cy)}A${f2(r)},${f2(r)} 0 1 1 ${P(cx + r, cy)}A${f2(r)},${f2(r)} 0 1 1 ${P(cx - r, cy)}Z`;
  /** A ring between radii r0 and r1, for `fill-rule="evenodd"`. */
  const annulusPath = (cx: number, cy: number, r0: number, r1: number) => `${circlePath(cx, cy, r1)}M${P(cx - r0, cy)}A${f2(r0)},${f2(r0)} 0 1 0 ${P(cx + r0, cy)}A${f2(r0)},${f2(r0)} 0 1 0 ${P(cx - r0, cy)}Z`;
  /** A constant-width band from circle to circle, running 0.6 of each radius inside both, so each circle's own edge crops the joint. */
  function bandPath(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, w: number): string {
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (!(L > 0)) throw new TypeError('trama radial: a band needs two distinct, finite ends');
    const ux = (x1 - x0) / L;
    const uy = (y1 - y0) / L;
    const vx = -uy * w / 2;
    const vy = ux * w / 2;
    const a0 = r0 * 0.6;
    const a1 = L - r1 * 0.6;
    const p = (s: number, o: number) => P(x0 + ux * s + vx * o, y0 + uy * s + vy * o);
    return `M${p(a0, 1)}L${p(a1, 1)}L${p(a1, -1)}L${p(a0, -1)}Z`;
  }
  /** A filled isosceles triangle, tip first, whose base sits on the line it ends. Drawn, never typed (HARD RULE #29). */
  function arrowheadPath(tipX: number, tipY: number, ux: number, uy: number, length: number, base: number): string {
    const bx = tipX - ux * length;
    const by = tipY - uy * length;
    const hx = -uy * (base / 2);
    const hy = ux * (base / 2);
    return `M${P(tipX, tipY)}L${P(bx + hx, by + hy)}L${P(bx - hx, by - hy)}Z`;
  }
  /** How long a head is on a band of width w. */
  const headLen = (w: number) => Math.max(w * 1.25, 8);
  /**
   * Heads for one band: toward its end circle, its start circle, or both. Each tip sits
   * `setBack` off the circle it points at, and the base is 0.9 of the band, so a head never
   * widens the band.
   */
  function bandHeads(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, w: number, toEnd: boolean, toStart: boolean, setBack: number) {
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (!(L > 0)) throw new TypeError('trama radial: a band needs two distinct, finite ends');
    const ux = (x1 - x0) / L;
    const uy = (y1 - y0) / L;
    const length = headLen(w);
    const base = w * 0.9;
    const out: { d: string; to: 'end' | 'start' }[] = [];
    if (toEnd) {
      const s = L - r1 - setBack;
      out.push({ d: arrowheadPath(x0 + ux * s, y0 + uy * s, ux, uy, length, base), to: 'end' });
    }
    if (toStart) {
      const s = r0 + setBack;
      out.push({ d: arrowheadPath(x0 + ux * s, y0 + uy * s, -ux, -uy, length, base), to: 'start' });
    }
    return out;
  }

  // ── Collision geometry ──
  const rectOf = (x: number, y: number, w: number, h: number): RadialRect => ({ l: x, r: x + w, t: y, b: y + h });
  function rectHitsCircle(R: RadialRect, c: { x: number; y: number; r: number }, m = 1.5): boolean {
    const nx = Math.max(R.l, Math.min(c.x, R.r));
    const ny = Math.max(R.t, Math.min(c.y, R.b));
    return Math.hypot(nx - c.x, ny - c.y) < c.r + m;
  }
  function segDist(px: number, py: number, s: { x0: number; y0: number; x1: number; y1: number }): number {
    const dx = s.x1 - s.x0;
    const dy = s.y1 - s.y0;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - s.x0) * dx + (py - s.y0) * dy) / L2));
    return Math.hypot(px - (s.x0 + t * dx), py - (s.y0 + t * dy));
  }
  /**
   * A band against a box, by sampling the band's centerline every 1.5 units as circles of
   * its half-width. Only the samples inside the box grown by that half-width and the margin
   * can hit it, so the sample range is clipped to that first (one sample of slack each side,
   * so float rounding at the boundary can never drop a sample that would hit). It tests
   * exactly the samples the full scan would; it just skips the rest.
   */
  function rectHitsSeg(R: RadialRect, s: { x0: number; y0: number; x1: number; y1: number; w: number }, m = 1.5): boolean {
    const L = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
    const k = Math.max(2, Math.ceil(L / 1.5));
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
  const rectHitsRect = (A: RadialRect, B: RadialRect, m = 2) => A.l < B.r + m && B.l < A.r + m && A.t < B.b + m && B.t < A.b + m;
  const outside = (R: RadialRect, st: RadialRect) => R.l < st.l || R.r > st.r || R.t < st.t || R.b > st.b;
  /**
   * Each obstacle's reach: the box outside which it cannot touch a label, at the margins the
   * hit tests use (circle 1.5, band 1.5, box 1). A label clear of the box is clear of the
   * obstacle, so the exact test runs only for the few that overlap it.
   */
  function obstacleBox(o: RadialObstacle): RadialRect {
    if (o.kind === 'circle') { const g = o.r + 1.5; return { l: o.x - g, r: o.x + g, t: o.y - g, b: o.y + g }; }
    if (o.kind === 'seg') {
      const g = o.w / 2 + 1.5;
      return { l: Math.min(o.x0, o.x1) - g, r: Math.max(o.x0, o.x1) + g, t: Math.min(o.y0, o.y1) - g, b: Math.max(o.y0, o.y1) + g };
    }
    return { l: o.R.l - 1, r: o.R.r + 1, t: o.R.t - 1, b: o.R.b + 1 };
  }
  const boxClear = (R: RadialRect, B: RadialRect) => R.r < B.l || R.l > B.r || R.b < B.t || R.t > B.b;
  /** One obstacle's hit on a label, the exact test behind the box reject. */
  function obstacleHits(R: RadialRect, o: RadialObstacle, box: RadialRect, id: string): boolean {
    if ((o as { self?: string }).self === id || boxClear(R, box)) return false;
    if (o.kind === 'circle') return rectHitsCircle(R, o);
    if (o.kind === 'seg') return o.self2 !== id && rectHitsSeg(R, o);
    return o.kind === 'rect' && rectHitsRect(R, o.R, 1);
  }

  // ── Label placement ──
  type Cand = { R: RadialRect; anchor: 'start' | 'middle' | 'end'; ax: number; dy: number; vert?: boolean; col?: boolean; pen?: number };
  /**
   * Greedy placement, highest priority first. Candidates, cheapest first: beside the node,
   * outboard; beside, nudged up or down; over or under; centered over or under; the column
   * outboard of every node on that side. The first candidate that touches nothing wins. A
   * side left with a hit becomes a whole column: labels in node order, stacked, each reached
   * by a leader. Whatever still touches something is counted in `unresolved`.
   *
   * It writes into what it is given: the items are carried on the result as `it` (the same
   * objects), and a column too narrow for a label replaces that item's `lb` with
   * `it.rewrap(room)`. A host that reuses items across calls copies them first.
   */
  function placeLabels<I extends LabelItem>(items: I[], obstacles: RadialObstacle[], stage: LabelStage): { placed: PlacedLabel<I>[]; unresolved: number } {
    // Bad input fails loudly. Every comparison with NaN is false, so a NaN size or a column
    // with only one edge would otherwise come back placed with no hits.
    if (stage.colR != null && !Number.isFinite(stage.colL)) throw new TypeError('trama radial: a stage with colR needs a finite colL');
    for (const it of items) {
      if (![it.cx, it.cy, it.r, it.lb.w, it.lb.h, it.prio].every(Number.isFinite)) throw new TypeError(`trama radial: label '${it.id}' has a size or position that is not a finite number`);
    }
    const boxes = obstacles.map(obstacleBox);
    const placed: PlacedLabel<I>[] = [];
    const pre = stage.prePlaced || [];
    // A priority may carry a `|y|`, so the two halves of a mirrored layout tie up to the
    // last bits of sin/cos. Compare at a fixed precision so a tie keeps the given order in
    // every engine. The sort is stable.
    const key = (it: I) => Math.round(it.prio * 1e6);
    const order = [...items].sort((a, b) => key(b) - key(a));
    for (const it of order) {
      const { lb } = it;
      const gap = 4;
      const cands: Cand[] = [];
      const beside = (dy: number): Cand => {
        const x = it.side > 0 ? it.cx + it.r + gap : it.cx - it.r - gap - lb.w;
        return { R: rectOf(x, it.cy - lb.h / 2 + dy, lb.w, lb.h), anchor: it.side > 0 ? 'start' : 'end', ax: it.side > 0 ? x : x + lb.w, dy };
      };
      cands.push(beside(0));
      for (let k = 1; k <= 16; k++) for (const s of [-1, 1]) cands.push(beside(s * k * 3));
      const vert = (up: boolean): Cand => {
        const y = up ? it.cy - it.r - gap - lb.h : it.cy + it.r + gap;
        const x = it.side > 0 ? it.cx - it.r * 0.3 : it.cx + it.r * 0.3 - lb.w;
        return { R: rectOf(x, y, lb.w, lb.h), anchor: it.side > 0 ? 'start' : 'end', ax: it.side > 0 ? x : x + lb.w, dy: 0, vert: true };
      };
      cands.push(vert(it.cy < 0), vert(it.cy >= 0));
      if (it.crowded) {
        // A node among its own children gets many more lanes: sixteen compass points at two
        // distances, and either side of its own band.
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
          cands.push({ R: rectOf(it.cx - lb.w / 2 + dx, y, lb.w, lb.h), anchor: 'middle', ax: it.cx + dx, dy: 0, vert: true, pen: it.crowded ? -15 : 25 + Math.abs(dx) });
        }
      }
      if (stage.colR != null) {
        const colR = stage.colR;
        const colL = stage.colL as number;
        const col = (dy: number): Cand => {
          const x = it.side > 0 ? colR : colL - lb.w;
          return { R: rectOf(x, it.cy - lb.h / 2 + dy, lb.w, lb.h), anchor: it.side > 0 ? 'start' : 'end', ax: it.side > 0 ? x : x + lb.w, dy, col: true };
        };
        for (let k = 0; k <= 24; k++) for (const s of k ? [-1, 1] : [1]) cands.push(col(s * k * 2.5));
      }
      // A candidate's cost is 1000 per hit plus its BASE (offset, lane and penalty, always
      // under 1000), so walking the candidates in base order (stably, so equal bases keep
      // their order) the first one with no hit is the one the full scan would pick, and the
      // walk stops there. A candidate that cannot beat the best so far stops counting early.
      const bases = cands.map((c) => Math.abs(c.dy) + (c.vert ? 20 : 0) + (c.col ? 12 : 0) + (c.pen || 0));
      const walk = cands.map((_c, k) => k).sort((a, b) => bases[a] - bases[b] || a - b);
      let best: { c: Cand; cost: number; hits: number } | null = null;
      for (const k of walk) {
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
          const lead = leader({ it, R: c.R }, obstacles);
          if (lead && leaderBlocked(lead, it, obstacles)) hits++;
        }
        const cost = hits * 1000 + b;
        if (!best || cost < best.cost) best = { c, cost, hits };
        if (hits === 0) break;
      }
      const won = best as { c: Cand; cost: number; hits: number };
      placed.push({ it, ...won.c, cost: won.cost, hits: won.hits });
    }
    let unresolved = placed.filter((p) => p.hits).length;
    if (unresolved && stage.colR != null) {
      const colR = stage.colR;
      const colL = stage.colL as number;
      for (const side of [1, -1]) {
        const mine = placed.filter((p) => p.it.side === side);
        if (!mine.some((p) => p.hits)) continue;
        // The column sits outboard of every node on its side, so a label wider than the
        // room left between the column and the stage edge would run off the stage. Such a
        // label is re-wrapped to that room first, and only then is the column stacked.
        const room = side > 0 ? stage.r - colR : colL - stage.l;
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
          const x = side > 0 ? colR : colL - w;
          Object.assign(p, { R: rectOf(x, ys[i], w, p.it.lb.h), anchor: side > 0 ? 'start' : 'end', ax: side > 0 ? x : x + w, dy: 0, col: true, vert: false, hits: 0 });
        });
      }
      // Re-score everything after the column pass; a column can still meet the stage edge.
      for (const p of placed) p.hits = scorePlaced(p, placed, obstacles, stage);
      unresolved = placed.filter((p) => p.hits).length;
    }
    return { placed, unresolved };
  }
  /** What a placed label touches: the stage edge, obstacles, other labels, a blocked leader. */
  function scorePlaced<I extends LabelItem>(p: PlacedLabel<I>, placed: PlacedLabel<I>[], obstacles: RadialObstacle[], stage: LabelStage): number {
    let hits = outside(p.R, stage) ? 1 : 0;
    for (const o of obstacles) {
      if ((o as { self?: string }).self === p.it.id) continue;
      if (o.kind === 'circle' && rectHitsCircle(p.R, o)) hits++;
      else if (o.kind === 'seg' && o.self2 !== p.it.id && rectHitsSeg(p.R, o)) hits++;
      else if (o.kind === 'rect' && rectHitsRect(p.R, o.R, 1)) hits++;
    }
    for (const q of placed) if (q !== p && rectHitsRect(p.R, q.R)) hits++;
    const lead = leader(p, obstacles);
    if (lead && leaderBlocked(lead, p.it, obstacles)) hits++;
    return hits;
  }
  /**
   * A leader from the node to a label that sits away from it, as points; null when the
   * label is close enough to need none. Straight when the straight line clears every other
   * circle; otherwise an ELBOW that first runs out along the node's own band direction
   * (from `ox`/`oy`, the center by default) and then turns to the label.
   */
  function leader(p: { it: LabelItem; R: RadialRect }, obstacles?: RadialObstacle[]): RadialPoint[] | null {
    const { it, R } = p;
    const nx = Math.max(R.l, Math.min(it.cx, R.r));
    const ny = Math.max(R.t, Math.min(it.cy, R.b));
    if (Math.hypot(nx - it.cx, ny - it.cy) - it.r <= 6) return null;
    const inside = it.cx > R.l && it.cx < R.r;
    const ty = inside ? (it.cy < R.t ? R.t - 1.2 : R.b + 1.2) : Math.max(R.t + 3, Math.min(it.cy, R.b - 3));
    const tx = inside ? it.cx : (it.cx < R.l ? R.l - 1.2 : R.r + 1.2);
    const ang = Math.atan2(ty - it.cy, tx - it.cx);
    const straight: RadialPoint[] = [[it.cx + Math.cos(ang) * (it.r + 0.9), it.cy + Math.sin(ang) * (it.r + 0.9)], [tx, ty]];
    if (!obstacles || !leaderBlocked(straight, it, obstacles)) return straight;
    const ox = it.ox || 0;
    const oy = it.oy || 0;
    const L = Math.hypot(it.cx - ox, it.cy - oy) || 1;
    const ux = (it.cx - ox) / L;
    const uy = (it.cy - oy) / L;
    const e: RadialPoint = [it.cx + ux * (it.r + 7), it.cy + uy * (it.r + 7)];
    const ey = inside ? ty : Math.max(R.t + 3, Math.min(e[1], R.b - 3));
    return [[it.cx + ux * (it.r + 0.9), it.cy + uy * (it.r + 0.9)], e, [tx, ey]];
  }
  /** A leader may not graze another circle (its own circle is where it starts). */
  function leaderBlocked(pts: RadialPoint[], it: LabelItem, obstacles: RadialObstacle[]): boolean {
    for (let i = 1; i < pts.length; i++) {
      const seg = { x0: pts[i - 1][0], y0: pts[i - 1][1], x1: pts[i][0], y1: pts[i][1] };
      for (const o of obstacles) {
        if (o.kind !== 'circle' || o.self === it.id || o.node === it.id) continue;
        if (segDist(o.x, o.y, seg) < o.r + 1) return true;
      }
    }
    return false;
  }

  // ── Ring placement ──
  /** m points spaced by ARC LENGTH along one half of an ellipse, clockwise from 12 o'clock, clear of a cone of `ex` radians at each pole. */
  function ellipseWing(m: number, ex: number, RX: number, RY: number, base: number): RadialPoint[] {
    const N = 240;
    const t0 = base + ex;
    const t1 = base + Math.PI - ex;
    const pts: RadialPoint[] = [];
    const cum = [0];
    for (let i = 0; i <= N; i++) {
      const t = t0 + (t1 - t0) * i / N;
      pts.push([RX * Math.sin(t), -RY * Math.cos(t)]);
      if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const T = cum[N];
    // The pick allows for rounding. With an odd `m` the middle point wants exactly T/2, and
    // by symmetry cum[N/2] equals that too, apart from the last bits of sin/cos/hypot, which
    // differ between V8 builds. Without the slack the middle point landed one sample off
    // center in one engine and on center in the other.
    const slack = T * 1e-9;
    return Array.from({ length: m }, (_, j) => {
      const want = T * (j + 0.5) / m;
      let i = cum.findIndex((c) => c >= want - slack);
      if (i < 0) i = N;
      return pts[i];
    });
  }
  /** Arc-length parameterization of an ellipse arc: maps a slot position in [0, T] to the angle that far along the arc. */
  function arcParam(RX: number, RY: number, t0: number, t1: number, T: number): (x: number) => number {
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
    return (x: number) => {
      const want = L * Math.min(1, Math.max(0, x / T));
      let lo = 0;
      let hi = N;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < want) lo = mid; else hi = mid; }
      const f = cum[hi] > cum[lo] ? (want - cum[lo]) / (cum[hi] - cum[lo]) : 0;
      return t0 + (t1 - t0) * (lo + f) / N;
    };
  }
  /** The clear cone at 12 and 6 o'clock, by count: wide for few nodes, narrow for many. */
  const baseCone = (n: number) => (n <= 4 ? 0.55 : n <= 6 ? 0.42 : n <= 8 ? 0.3 : n <= 10 ? 0.18 : 0.28);
  /**
   * The cones a layout tries, first choice first. Past ten nodes on a wide stage the first
   * try opens the cone to 0.46, so the nodes nearest 12 and 6 o'clock take a label beside
   * them rather than a long leader to a column; 0.28 is the fallback. A tall stage keeps 0.18.
   */
  const conesFor = (n: number, tall: boolean) => (n <= 10 ? [baseCone(n)] : tall ? [0.18] : [0.46, 0.28]);
  /**
   * n points on an ellipse of half-axes RX and RY, split into a right and a left wing.
   * One point sits at 3 o'clock; two face each other; three make a sideways Y, its lone
   * point at `reach3` of the spread, or stand upright (`'upright'`: a pair at 2 and 10
   * o'clock, the lone point at 6) when a tall stage has the height.
   */
  function ring(n: number, RX: number, RY: number, ex: number | null = baseCone(n), reach3: number | 'upright' = 0.8): RadialPoint[] {
    if (ex == null) ex = baseCone(n);
    if (n === 1) return [[RX, 0]];
    if (n === 2) return [[RX, 0], [-RX, 0]];
    if (n === 3 && reach3 === 'upright') {
      const A = [Math.PI / 3 + 0.12, Math.PI, Math.PI * 5 / 3 - 0.12];
      return A.map((t): RadialPoint => [RX * Math.sin(t) * 0.9, -RY * Math.cos(t) * (Math.abs(t - Math.PI) < 1e-9 ? 0.9 : 1)]);
    }
    if (n === 3) {
      const A = [Math.PI / 2, Math.PI * 7 / 6 + 0.12, Math.PI * 11 / 6 - 0.12];
      return A.map((t, i): RadialPoint => [RX * Math.sin(t) * (i === 0 ? (reach3 as number) : 0.9), -RY * Math.cos(t)]);
    }
    const nr = Math.ceil(n / 2);
    const nl = n - nr;
    return [...ellipseWing(nr, ex, RX, RY, 0), ...ellipseWing(nl, ex, RX, RY, Math.PI)];
  }

  // ── The star: one center, one ring ──
  /**
   * Settle a star for one cone. From the largest node radius down in steps of 0.5: size the
   * center and the nodes, find the widest ring whose labels still fit beside their nodes
   * (bisection; past eight nodes, also leaving room for a label column), then repair a
   * broken band floor by moving a three-node figure's lone point out or by opening or
   * narrowing the cone. Stop at the first clean figure, or at `rsMin` with the floors it
   * breaks in `bad`. Then grow the center into any spare room, never past `centerCeil`.
   */
  function solveStar(spec: StarSpec): StarResult {
    const { n, W, half, pad, tall, cone, minNeck, rs0, rsMin, labelW, halo, floor, radiiAt, centerAt, centerCeil } = spec;
    const check = (pts: RadialPoint[], r: number[], Rh: number, overOk = false) => {
      const bad: string[] = [];
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < r[i] + r[j] + halo[i] + halo[j] + 10) bad.push('crowd');
        }
      }
      for (let i = 0; i < n; i++) {
        if (Math.hypot(pts[i][0], pts[i][1]) - Rh - r[i] < floor(i)) bad.push('neck');
        if (Math.abs(pts[i][1]) + r[i] + halo[i] > half + 0.01) bad.push('tall');
      }
      for (let i = 0; i < n; i++) {
        const beside = Math.abs(pts[i][0]) + r[i] + halo[i] + 4 + labelW[i];
        // `overOk`: the label may sit over or under its node instead (the placer's vertical
        // lanes), which needs the label's width from 0.3 r inside the node.
        const over = Math.abs(pts[i][0]) - r[i] * 0.3 + labelW[i];
        if ((overOk ? Math.min(beside, over) : beside) > W / 2 - pad) bad.push('width');
      }
      return bad;
    };
    const maxHalo = Math.max(0, ...halo);
    let rsMax = rs0;
    let T: StarResult['T'] | null = null;
    let bad: string[] = [];
    let Rh = 0;
    for (let k = 0; k < 120; k++) {
      Rh = centerAt(rsMax);
      const rr = radiiAt(rsMax);
      const r = rr.map((x) => x.r);
      const RY = half - rsMax - maxHalo;
      // The widest spread whose labels still fit the stage: the width test is monotonic in
      // RX, so a bisection finds the edge.
      const RXmax = W / 2 - pad - rsMax;
      const RXmin = Math.max(Rh + rsMax + minNeck, RY * 0.35);
      const colFits = (pts: RadialPoint[]) => {
        for (const side of [1, -1]) {
          const idx: number[] = [];
          for (let i = 0; i < n; i++) if (Math.sign(pts[i][0] || (i < Math.ceil(n / 2) ? 1 : -1)) === side) idx.push(i);
          if (!idx.length) continue;
          const edge = Math.max(...idx.map((i) => Math.abs(pts[i][0]) + r[i] + halo[i])) + 6;
          if (edge + Math.max(...idx.map((i) => labelW[i])) > W / 2 - pad) return false;
        }
        return true;
      };
      const besideFits = (RX: number) => !check(ring(n, RX, RY, cone), r, Rh).includes('width');
      const bisect = (ok: (x: number) => boolean): number | null => {
        if (ok(RXmax)) return RXmax;
        if (!ok(RXmin)) return null;
        let lo = RXmin;
        let hi = RXmax;
        for (let it = 0; it < 12; it++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
        return lo;
      };
      let RX = n > 8 ? bisect((x) => besideFits(x) && colFits(ring(n, x, RY, cone))) : null;
      if (RX == null) RX = bisect(besideFits) ?? RXmin;
      let pts = ring(n, RX, RY, cone);
      bad = check(pts, r, Rh);
      if (n === 3 && bad.includes('neck') && !bad.includes('crowd')) {
        // The Y's lone point is the short one: move it out toward the full spread, and on a
        // tall stage try the Y stood upright.
        const reaches: (number | 'upright')[] = tall ? [0.85, 0.9, 0.95, 1, 'upright'] : [0.85, 0.9, 0.95, 1];
        for (const reach of reaches) {
          const up = reach === 'upright';
          const upAt = (x: number) => ring(n, x, RY, undefined, 'upright');
          const RXu = up ? bisect((x) => !check(upAt(x), r, Rh, true).includes('width')) : null;
          if (up && RXu == null) continue;
          const alt = up ? upAt(RXu as number) : ring(n, RX, RY, undefined, reach);
          const altBad = check(alt, r, Rh, up);
          if (!altBad.length) { pts = alt; bad = altBad; break; }
        }
      }
      if (n > 3 && bad.includes('neck') && !bad.includes('crowd')) {
        // On a wide stage the tight nodes are the ones nearest 12 and 6 o'clock, so the cone
        // widens first; on a tall stage they are the ones at 3 and 9, so it narrows first.
        const tries: number[] = [];
        for (let q = 1; q <= 26; q++) for (const sgn of tall ? [-1, 1] : [1, -1]) tries.push(cone + sgn * 0.04 * q);
        for (const ex of tries) {
          if (ex < 0.04 || ex > 1.1) continue;
          const alt = ring(n, RX, RY, ex);
          const altBad = check(alt, r, Rh);
          if (!altBad.length) { pts = alt; bad = altBad; break; }
        }
      }
      T = { pts, r, rr, RY };
      if (!bad.length || rsMax <= rsMin) break;
      rsMax = Math.max(rsMin, rsMax - 0.5);
    }
    const settled = T as StarResult['T'];
    const ceilRh = centerCeil(settled.r);
    for (let g = 0; g < 30; g++) {
      if (Rh + 1 > ceilRh) break;
      if (check(settled.pts, settled.r, Rh + 1).length) break;
      Rh += 1;
    }
    return { T: settled, Rh, rsMax, bad };
  }

  // ── Two rings: inner nodes around the center, each one's children fanned on the outer ring ──
  /** Where to split weighted groups into a right wing and a left wing, as close to half as it can. */
  function wingCut(weights: number[]): number {
    const tot = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    let cut = 0;
    for (let i = 0; i < weights.length; i++) {
      if (Math.abs(acc + weights[i] - tot / 2) <= Math.abs(acc - tot / 2)) { acc += weights[i]; cut = i + 1; } else break;
    }
    if (cut === 0 && weights.length) cut = 1;
    return cut;
  }
  /**
   * A two-ring solver for one spec. Children take slots on the outer ring in two wings, in
   * order, with `gaps` slots between groups and a cone clear at 12 and 6 o'clock; each inner
   * node sits on the inner ring at its group's middle slot, pushed out along its ray when the
   * inner ellipse would bring it inside its band floor. `geometry` places one candidate;
   * `search` walks spacings × ring proportions × center sizes for the first clean one.
   */
  function twoRings(spec: TwoRingSpec) {
    const { counts, gaps, rIn, rOut, haloIn, haloOut, floorIn, floorOut, gapIn, gapOut } = spec;
    const nb = counts.length;
    const w8 = counts.map((c) => Math.max(1, c) + gaps);
    const cut = wingCut(w8);
    // The arc-length table for a wing depends on the ring and the cone only, and every center
    // size and inner ring probes the same ones, so each is built once.
    const arcs = new Map<string, (x: number) => number>();
    const arcFor = (RX: number, RY: number, t0: number, t1: number, T: number) => {
      const k = `${RX}|${RY}|${t0}|${T}`;
      let f = arcs.get(k);
      if (!f) { f = arcParam(RX, RY, t0, t1, T); arcs.set(k, f); }
      return f;
    };
    /**
     * Every circle for one cone (`EXT`), outer ring, center radius and inner-ring
     * proportion `[kx, ky]`, and which floors break. Slots are spaced by ARC LENGTH along
     * the outer ring (`'arc'`), or by equal steps of the angle (anything else): equal angles
     * bunch where a wide ellipse runs steep, but keep a tall stage's children off its sides.
     */
    const geometry = (EXT: number, RXo: number, RYo: number, Rh: number, [kx, ky]: [number, number], spacing: string): TwoRingGeometry => {
      const ang = counts.map((c) => ({ t: 0, children: Array.from({ length: c }, () => 0) }));
      const wing = (list: number[], base0: number) => {
        const T = list.reduce((a, i) => a + w8[i], 0);
        const at = spacing === 'arc'
          ? arcFor(RXo, RYo, base0 + EXT, base0 + Math.PI - EXT, T)
          : (x: number) => base0 + EXT + (Math.PI - 2 * EXT) * x / T;
        let u = 0;
        list.forEach((i) => {
          for (let j = 0; j < counts[i]; j++) ang[i].children[j] = at(u + gaps / 2 + j + 0.5);
          ang[i].t = at(u + w8[i] / 2);
          u += w8[i];
        });
      };
      wing([...Array(cut).keys()], 0);
      wing([...Array(nb - cut).keys()].map((j) => cut + j), Math.PI);
      const RYi = RYo * ky;
      const RXi = RXo * kx;
      const geo = counts.map((c, i): TwoRingNode => {
        let bx = RXi * Math.sin(ang[i].t);
        let by = -RYi * Math.cos(ang[i].t);
        // The inner ring is an ellipse, so a node near 12 or 6 o'clock sits closest to the
        // center. Push any node that would crowd it out along its own ray to its floor.
        const d = Math.hypot(bx, by);
        const dmin = Rh + rIn + floorIn[i];
        if (d < dmin) { bx *= dmin / d; by *= dmin / d; }
        const children = Array.from({ length: c }, (_, j) => ({ x: RXo * Math.sin(ang[i].children[j]), y: -RYo * Math.cos(ang[i].children[j]) }));
        return { x: bx, y: by, children };
      });
      const bad: string[] = [];
      const discs: { x: number; y: number; r: number; gap: number }[] = [];
      geo.forEach((g, i) => {
        if (Math.hypot(g.x, g.y) - Rh - rIn < floorIn[i] - 0.01) bad.push('neck');
        discs.push({ x: g.x, y: g.y, r: rIn + haloIn[i], gap: gapIn });
        g.children.forEach((q, j) => {
          if (Math.hypot(q.x - g.x, q.y - g.y) - rIn - rOut < floorOut[i][j] - 0.01) bad.push('outer-neck');
          discs.push({ x: q.x, y: q.y, r: rOut + haloOut[i][j], gap: gapOut });
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
    /**
     * The first clean arrangement over spacings × inner-ring proportions × center ladder
     * (largest center first), and, for that ring, its smallest clean center (`lean`: the one
     * retry a crowded label search gets, since a smaller center frees the lanes beside the
     * inner nodes). Failing all, `G` is the one that breaks the fewest floors.
     */
    const search = <H extends CenterRung>(EXT: number, RXo: number, RYo: number, ladder: H[], rings: [number, number][], spacings: string[]) => {
      let G: (TwoRingGeometry & H) | null = null;
      let lean: (TwoRingGeometry & H) | null = null;
      outer: for (const spacing of spacings) {
        for (const rg of rings) {
          for (const h of ladder) {
            const g = geometry(EXT, RXo, RYo, h.R, rg, spacing);
            if (!G || g.bad.length < G.bad.length) G = { ...g, ...h };
            if (!g.bad.length) {
              for (const q of ladder.slice(ladder.indexOf(h) + 1).reverse()) {
                const g2 = geometry(EXT, RXo, RYo, q.R, rg, spacing);
                if (!g2.bad.length) { lean = { ...g2, ...q }; break; }
              }
              break outer;
            }
          }
        }
      }
      return { G, lean };
    };
    return { geometry, search, cut };
  }

  return {
    circlePath, annulusPath, bandPath, bandHeads, headLen,
    rectHitsCircle, rectHitsSeg, rectHitsRect, segDist,
    placeLabels, scorePlaced, leader,
    ring, conesFor, solveStar, twoRings,
  };
}
