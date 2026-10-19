/**
 * Size rules as convex regions of the (width, height) plane, and the two joins that keep them convex
 * (design note §4.1). A region is a convex polygon of `[w, h]` points, counter-clockwise or not, with
 * one or two points when it is a ray segment or a single size. "Unbounded" is `BIG`, so every region is
 * a closed polygon and nothing here needs infinities.
 *
 * Pure and exact in the sense that matters: a join slices both polygons at every breakpoint of either,
 * and between breakpoints both slices are linear, so the joined polygon is the true region, not a sample.
 */

export type Pt = readonly [number, number];
export type Poly = Pt[];

/** The stand-in for "no upper bound", in the container's units. */
export const BIG = 1e7;
const EPS = 1e-9;

/** The 4 corners of [w0, w1] × [h0, h1], or null when it is empty. */
function box(w0: number, w1: number, h0: number, h1: number): Poly | null {
  if (w0 > w1 + EPS || h0 > h1 + EPS) return null;
  return [
    [w0, h0],
    [w1, h0],
    [w1, h1],
    [w0, h1],
  ];
}

/** Keep the part of a convex polygon where `a·w + b·h + c ≥ 0` (Sutherland–Hodgman against one half-plane). */
function clip(poly: Poly, a: number, b: number, c: number): Poly {
  const out: Pt[] = [];
  const f = (p: Pt) => a * p[0] + b * p[1] + c;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const fp = f(p);
    const fq = f(q);
    if (fp >= -EPS) out.push(p);
    if ((fp > EPS && fq < -EPS) || (fp < -EPS && fq > EPS)) {
      const t = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

export interface LeafRule {
  /** A fixed shape (`w = a·h`), or a wedge `[a1, a2]` (`a1·h ≤ w ≤ a2·h`); absent means any shape. */
  aspect?: number | readonly [number, number];
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

const bound = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

/**
 * One item's region, or null when its rules allow no size at all: a floor above a cap, an aspect the
 * width and height limits cannot meet, or an aspect that is not a positive number (or a `[min, max]`
 * with 0 < min ≤ max). `big` stands in for "no upper bound" (default `BIG`); pass a larger one when
 * the container's units are larger than that.
 */
export function leafRegion(rule: LeafRule | null | undefined, big: number = BIG): Poly | null {
  const r = rule ?? {};
  const w0 = bound(r.minWidth, 0);
  const w1 = Math.min(bound(r.maxWidth, big), big);
  const h0 = bound(r.minHeight, 0);
  const h1 = Math.min(bound(r.maxHeight, big), big);
  const a = r.aspect;
  const okNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (a !== undefined && !(okNum(a) || (Array.isArray(a) && okNum(a[0]) && okNum(a[1]) && a[0] <= a[1]))) return null;
  if (typeof a === 'number') {
    // A ray: w = a·h, for the heights the four limits leave.
    const lo = Math.max(h0, w0 / a);
    const hi = Math.min(h1, w1 / a);
    if (lo > hi + EPS) return null;
    return lo >= hi - EPS ? [[a * lo, lo]] : [[a * lo, lo], [a * hi, hi]];
  }
  let poly = box(w0, w1, h0, h1);
  if (!poly) return null;
  if (a) {
    poly = clip(poly, 1, -a[0], 0); // w ≥ a1·h
    if (poly.length) poly = clip(poly, -1, a[1], 0); // w ≤ a2·h
  }
  return poly.length ? poly : null;
}

const transpose = (p: Poly): Poly => p.map(([w, h]) => [h, w] as Pt);

/** The widths a region allows at height `h`, as [lo, hi], or null when it allows none. */
export function sliceAtH(poly: Poly, h: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  const n = poly.length;
  const tol = EPS * Math.max(1, Math.abs(h));
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    if (Math.abs(p[1] - h) <= tol) {
      lo = Math.min(lo, p[0]);
      hi = Math.max(hi, p[0]);
    }
    if ((p[1] - h) * (q[1] - h) < 0) {
      const t = (h - p[1]) / (q[1] - p[1]);
      const x = p[0] + (q[0] - p[0]) * t;
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

/** The heights a region allows at width `w`, as [lo, hi], or null when it allows none. */
export const sliceAtW = (poly: Poly, w: number): [number, number] | null => sliceAtH(transpose(poly), w);

/** Whether a region allows the size (w, h), with a relative tolerance for floating point. */
export function contains(poly: Poly, w: number, h: number): boolean {
  const s = sliceAtH(poly, h);
  const tol = 1e-7 * Math.max(1, Math.abs(w));
  return !!s && s[0] - tol <= w && w <= s[1] + tol;
}

/** The heights a region spans: [min, max]. */
const heights = (poly: Poly): [number, number] => [Math.min(...poly.map((p) => p[1])), Math.max(...poly.map((p) => p[1]))];

/**
 * Two regions side by side with a gutter `gap` between them: the sizes `(w₁ + w₂ + gap, h)` with
 * `(w₁, h)` in A and `(w₂, h)` in B. Convex, because it is an affine image of an intersection of two
 * convex sets.
 */
export function joinSideBySide(a: Poly, b: Poly, gap: number): Poly | null {
  const [a0, a1] = heights(a);
  const [b0, b1] = heights(b);
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  if (lo > hi + EPS) return null;
  const ys = [...new Set([lo, hi, ...a.map((p) => p[1]), ...b.map((p) => p[1])].filter((y) => y >= lo - EPS && y <= hi + EPS).map((y) => Math.min(hi, Math.max(lo, y))))].sort((x, y) => x - y);
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (const y of ys) {
    const sa = sliceAtH(a, y);
    const sb = sliceAtH(b, y);
    if (!sa || !sb) continue;
    left.push([sa[0] + sb[0] + gap, y]);
    right.push([sa[1] + sb[1] + gap, y]);
  }
  if (!left.length) return null;
  // Lower edge left to right, then back down the right side: a closed convex chain, repeated points dropped.
  return simplify([...left, ...right.reverse()]);
}

/**
 * Drop repeated points and the middle point of any three that lie on one line. A join adds a vertex at
 * every breakpoint of either input, most of which turn out to be straight; without this the vertex count
 * roughly doubles per alternating join.
 */
export function simplify(points: Pt[]): Poly {
  const dedup = points.filter((p, i) => i === 0 || Math.abs(p[0] - points[i - 1][0]) > EPS || Math.abs(p[1] - points[i - 1][1]) > EPS);
  if (dedup.length > 1 && Math.abs(dedup[0][0] - dedup[dedup.length - 1][0]) <= EPS && Math.abs(dedup[0][1] - dedup[dedup.length - 1][1]) <= EPS) dedup.pop();
  if (dedup.length < 4) return dedup;
  const out: Pt[] = [];
  const n = dedup.length;
  for (let i = 0; i < n; i++) {
    const p = dedup[(i + n - 1) % n];
    const q = dedup[i];
    const r = dedup[(i + 1) % n];
    const z = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
    const scale = (Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1])) * (Math.abs(r[0] - q[0]) + Math.abs(r[1] - q[1]));
    if (Math.abs(z) > 1e-12 * Math.max(1, scale)) out.push(q);
  }
  return out.length >= 3 ? out : dedup;
}

/** Two regions stacked with a gutter `gap` between them: the same join with the axes swapped. */
export function joinStacked(a: Poly, b: Poly, gap: number): Poly | null {
  const t = joinSideBySide(transpose(a), transpose(b), gap);
  return t ? transpose(t) : null;
}

/** Whether a polygon is convex, with a tolerance: every turn the same way. */
export function isConvex(poly: Poly): boolean {
  const n = poly.length;
  if (n < 4) return true;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const r = poly[(i + 2) % n];
    const z = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
    const scale = Math.max(1, Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1])) * Math.max(1, Math.abs(r[0] - q[0]) + Math.abs(r[1] - q[1]));
    if (Math.abs(z) <= 1e-9 * scale) continue;
    const s = Math.sign(z);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/**
 * The size in `poly` ∩ [0, W] × [0, H] with the largest area, or null when that is empty. The area along
 * an edge is a parabola, so each edge is checked at its ends and at the parabola's peak.
 */
export function largestWithin(poly: Poly, W: number, H: number): [number, number] | null {
  let p: Poly = poly;
  if (p.length >= 3) {
    p = clip(p, -1, 0, W); // w ≤ W
    if (p.length) p = clip(p, 0, -1, H); // h ≤ H
  } else {
    p = p.filter((q) => q[0] <= W + EPS && q[1] <= H + EPS);
    if (poly.length === 2) {
      // A segment: walk the part of it inside the box.
      const [q0, q1] = poly;
      let t0 = 0;
      let t1 = 1;
      for (const [d0, d1, lim] of [[q0[0], q1[0], W], [q0[1], q1[1], H]] as const) {
        const dd = d1 - d0;
        if (Math.abs(dd) < EPS) {
          if (d0 > lim + EPS) return null;
        } else {
          const t = (lim - d0) / dd;
          if (dd > 0) t1 = Math.min(t1, t);
          else t0 = Math.max(t0, t);
        }
      }
      if (t0 > t1 + EPS) return null;
      p = [
        [q0[0] + (q1[0] - q0[0]) * t0, q0[1] + (q1[1] - q0[1]) * t0],
        [q0[0] + (q1[0] - q0[0]) * t1, q0[1] + (q1[1] - q0[1]) * t1],
      ];
    }
  }
  if (!p.length) return null;
  let best: [number, number] = [p[0][0], p[0][1]];
  const area = (w: number, h: number) => w * h;
  const consider = (w: number, h: number) => {
    if (area(w, h) > area(best[0], best[1]) + EPS) best = [w, h];
  };
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const [w0, h0] = p[i];
    consider(w0, h0);
    if (n < 2) continue;
    const [w1, h1] = p[(i + 1) % n];
    const dw = w1 - w0;
    const dh = h1 - h0;
    // area(t) = (w0 + t·dw)(h0 + t·dh): peak at t = -(w0·dh + h0·dw) / (2·dw·dh) when concave.
    if (dw * dh < -EPS) {
      const t = -(w0 * dh + h0 * dw) / (2 * dw * dh);
      if (t > 0 && t < 1) consider(w0 + t * dw, h0 + t * dh);
    }
  }
  return best;
}
