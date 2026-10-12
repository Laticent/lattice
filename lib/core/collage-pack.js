/**
 * Collage packer — the pure layout brain for the `collage` component.
 *
 * Given 4 to 6 photo aspect ratios (width / height), it finds the tightest way to cut a box
 * into rows and columns with straight cuts (a "guillotine" layout) so that every photo gets
 * a rectangle of its own shape, and returns it as CSS grid tracks. No DOM, no fs: the CLI
 * build and the browser preview call the same function, so both pick the same layout
 * (HARD RULE #1).
 *
 * Two orders (spec section 4):
 *   - `free`    (default) the search may reorder photos; only where a tile sits changes.
 *               Written order stays the DOM, tab and `_focus: item N` order — the caller
 *               places each photo by the `areas[i]` returned for photo i.
 *   - `ordered` the same search restricted to splits whose left part is a prefix of the
 *               written order, so photos read left to right, top to bottom as written.
 *
 * Two fits:
 *   - `tight` (default) never crops. A leftover shape becomes a matte border.
 *   - `fill`  may stretch the layout up to `fillMax` (8%) so it closes the empty space; the
 *             CSS cover crop absorbs the stretch.
 *
 * Gaps are solved inside the tree. Every node is the affine pair (p, q): at box height h its
 * width is `p·h + q` (q carries the gap total). A tile that spans several grid tracks
 * therefore keeps its exact aspect, with no per-span drift.
 *
 * The search is exponential, so more than MAX_PHOTOS photos is refused and returns the even
 * grid (a Playground preview that re-renders while someone pastes a seventh photo must not
 * hang the tab). Output is deterministic: same input, same layout, byte for byte.
 *
 * See engineering/decisions/2026-10-11-collage-component.md.
 */

const MAX_PHOTOS = 6;
const MIN_PHOTOS = 1;
const FILL_MAX = 0.08;       // a `fill` collage may stretch the layout by at most 8%. MUST equal --collage-snap
                             // under `section.collage.fill` in collage.styles.css (pinned by the same test).
const DEFAULT_GAP = 0.012;   // gutter as a fraction of the stage height. MUST equal --collage-gap-ratio in
                             // collage.styles.css; test/unit/components/collage.test.js pins the two.
const MIN_TRACK = 1e-6;      // a grid track at or below this is invalid and its layout is skipped
const SMALL_TILE_FLOOR = 0.4; // smallest/largest tile area below this is penalized
const SMALL_TILE_WEIGHT = 1.5;
const HERO_PENALTY = 0.5;    // the hero photo must hold the largest tile

// Stage (the box the collage may fill) aspect ratios, width / height. The collage only uses
// this to STEER which layout wins; the CSS fits the grid to the real container, so a wrong
// estimate costs a little matte and can never overflow. First values, to be tuned against a
// real render in visual review. `beside` = text column left, photos right. `bleed` is the whole
// slide (the photos run edge to edge, with no header, footer or page number), so it is the slide's
// own shape: 16:9, 1:1 and 9:16. The bleed grid is then stretched to the slide, so a deck sized
// otherwise crops a few percent rather than leaving bands.
const STAGE_ASPECT = Object.freeze({
  landscape: Object.freeze({ beside: 1.41, above: 3.4, bleed: 16 / 9 }),
  square: Object.freeze({ beside: 1.0, above: 1.7, bleed: 1.0 }),
  portrait: Object.freeze({ beside: 0.62, above: 1.0, bleed: 9 / 16 }),
});

function stageAspectEstimate({ orientation = 'landscape', composition = 'beside' } = {}) {
  const row = STAGE_ASPECT[orientation] || STAGE_ASPECT.landscape;
  return row[composition] || row.beside;
}

const popcount = (m) => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
const key2 = (p, q) => `${Math.round(p * 1000)}:${Math.round(q * 1000)}`;

// ── affine nodes ──────────────────────────────────────────────────────────────────────
function leaf(i, a) { return { leaf: true, i, p: a, q: 0 }; }
// Side by side (equal heights): widths add, one gap between.
function joinV(l, r, g) { return { cut: 'V', l, r, p: l.p + r.p, q: l.q + r.q + g }; }
// Stacked (equal widths): heights add with one gap; invert the sum to get width(h).
function joinH(l, r, g) {
  const p = 1 / (1 / l.p + 1 / r.p);
  return { cut: 'H', l, r, p, q: p * (l.q / l.p + r.q / r.p - g) };
}

// Canonical string, used only to break ties so results are deterministic.
function canon(n) { return n.leaf ? String(n.i) : `${n.cut}(${canon(n.l)},${canon(n.r)})`; }

// Lay a node out in the box (x, y, w, h); gap g between siblings; writes tile rects.
function layout(n, x, y, w, h, g, out) {
  if (n.leaf) { out[n.i] = { x, y, w, h }; return; }
  if (n.cut === 'V') {
    const wl = n.l.p * h + n.l.q;
    layout(n.l, x, y, wl, h, g, out);
    layout(n.r, x + wl + g, y, w - wl - g, h, g, out);
  } else {
    const hl = (w - n.l.q) / n.l.p;
    layout(n.l, x, y, w, hl, g, out);
    layout(n.r, x, y + hl + g, w, h - hl - g, g, out);
  }
}

// What the final score can tell two layouts of the same outer shape apart by: how unequal the tile
// areas are, and how much of the box the hero photo owns. Two nodes with the same (p, q) and the same
// signature score the same wherever they sit, so keeping one is lossless; keying on (p, q) alone
// dropped the layout a `hero` needed (a 53% empty result where another layout leaves 6%).
function signature(node, g, hero) {
  const out = [];
  layout(node, 0, 0, node.p + node.q, 1, g, out);
  let lo = Infinity, hi = 0, sum = 0, own = 0;
  out.forEach((r, i) => {
    if (!r) return;
    const a = r.w * r.h;
    lo = Math.min(lo, a); hi = Math.max(hi, a); sum += a;
    if (i === hero) own = a;
  });
  return `:${Math.round((lo / hi) * 1e4)}:${hero >= 0 ? Math.round((own / sum) * 1e4) : 0}`;
}

// Every layout over the photo subset `mask`; one entry kept per distinct shape and score signature.
function enumerate(aspects, ordered, g, hero) {
  const n = aspects.length;
  const full = (1 << n) - 1;
  const memo = new Array(full + 1);
  const masks = [];
  for (let m = 1; m <= full; m++) masks.push(m);
  masks.sort((x, y) => popcount(x) - popcount(y) || x - y);
  for (const m of masks) {
    if (popcount(m) === 1) { const i = 31 - Math.clz32(m); memo[m] = [leaf(i, aspects[i])]; continue; }
    const seen = new Set();
    const out = [];
    for (let s = (m - 1) & m; s > 0; s = (s - 1) & m) {
      const t = m ^ s;
      // ordered: the left part must be a prefix of the written order within this subset
      if (ordered && 31 - Math.clz32(s) >= 31 - Math.clz32(t & -t)) continue;
      for (const L of memo[s]) {
        for (const R of memo[t]) {
          for (const node of [joinV(L, R, g), joinH(L, R, g)]) {
            const k = node.cut + key2(node.p, node.q) + signature(node, g, hero);
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(node);
          }
        }
      }
    }
    memo[m] = out;
  }
  return memo[full];
}

// How the layout (natural aspect A) meets a stage of aspect F.
function fitStats(A, F, fit, fillMax) {
  let ae = A;
  if (fit === 'fill') ae = Math.min(Math.max(F, A / (1 + fillMax)), A * (1 + fillMax));
  return { empty: 1 - Math.min(ae / F, F / ae), crop: 1 - Math.min(ae / A, A / ae) };
}

// Distinct cut lines of one axis → track sizes and each tile's [start, end) line indices.
// A tile edge that starts after a gap marks a cut; a track runs from one cut to the next.
function tracksFor(rects, g, axis) {
  const pos = axis === 'x' ? 'x' : 'y';
  const len = axis === 'x' ? 'w' : 'h';
  const total = Math.max(...rects.map((r) => r[pos] + r[len]));
  const byKey = new Map();   // dedupe cut lines by value rounded to 1e-6, but keep the exact value
  for (const r of rects) if (r[pos] > 1e-6 && !byKey.has(Math.round(r[pos] * 1e6))) byKey.set(Math.round(r[pos] * 1e6), r[pos]);
  const cuts = [...byKey.values()].sort((a, b) => a - b);
  const starts = [0, ...cuts];
  const ends = [...cuts.map((c) => c - g), total];
  const sizes = starts.map((s, i) => ends[i] - s);
  const lineOf = (v, list) => {
    let best = 0;
    for (let i = 0; i < list.length; i++) if (Math.abs(list[i] - v) < Math.abs(list[best] - v)) best = i;
    return best;
  };
  const span = rects.map((r) => [lineOf(r[pos], starts), lineOf(r[pos] + r[len], ends) + 1]);
  return { sizes, span };
}

function evenGrid(n, F, why) {
  const cols = n <= 4 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(n / cols));
  const areas = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols) + 1, c = (i % cols) + 1;
    areas.push([r, c, r + 1, c + 1]);
  }
  return {
    fallback: why, n, ar: F, cols: new Array(cols).fill(1), rows: new Array(rows).fill(1), areas,
    empty: 0, crop: 0, ratio: 1,
  };
}

/**
 * @param {number[]} aspects  one width/height ratio per photo, in written order
 * @param {object}   [opts]
 * @param {number}   [opts.stageAspect]  aspect of the box the collage may fill (default landscape/beside)
 * @param {'free'|'ordered'} [opts.order='free']
 * @param {'tight'|'fill'}   [opts.fit='tight']
 * @param {number}   [opts.gap]    gutter as a fraction of stage height
 * @param {number}   [opts.hero]   index of the photo that must hold the largest tile, or -1
 * @returns {{fallback:(string|false), n:number, ar:number, cols:number[], rows:number[],
 *            areas:number[][], empty:number, crop:number, ratio:number, tree?:string}}
 *   `areas[i]` is [rowStart, colStart, rowEnd, colEnd] (1-based grid lines, end exclusive)
 *   for photo i in written order. `cols`/`rows` are track sizes in stage-height units; the
 *   caller emits them as `minmax(0, Nfr)`. `ar` is the layout's natural width/height.
 */
function packCollage(aspects, opts = {}) {
  const F = Number.isFinite(opts.stageAspect) && opts.stageAspect > 0 ? opts.stageAspect : stageAspectEstimate();
  const order = opts.order === 'ordered' ? 'ordered' : 'free';
  const fit = opts.fit === 'fill' ? 'fill' : 'tight';
  const g = Number.isFinite(opts.gap) && opts.gap >= 0 ? opts.gap : DEFAULT_GAP;
  const hero = Number.isInteger(opts.hero) ? opts.hero : -1;
  const n = Array.isArray(aspects) ? aspects.length : 0;

  if (n < MIN_PHOTOS) return evenGrid(0, F, 'empty');
  if (n > MAX_PHOTOS) return evenGrid(n, F, 'too-many');
  // A photo with no usable shape is a 1:1 tile (a data URL, an unreadable header).
  const a = aspects.map((v) => (Number.isFinite(v) && v > 0.05 && v < 20 ? v : 1));
  if (n === 1) {
    return { fallback: false, n, ar: a[0], cols: [a[0]], rows: [1], areas: [[1, 1, 2, 2]], empty: fitStats(a[0], F, fit, FILL_MAX).empty, crop: 0, ratio: 1, tree: '0' };
  }

  const roots = enumerate(a, order === 'ordered', g, hero);
  const first = roots.map((node) => ({ node, ...fitStats(node.p + node.q, F, fit, FILL_MAX) }));
  first.sort((x, y) => x.empty - y.empty || (canon(x.node) < canon(y.node) ? -1 : 1));

  let best = null;
  for (const c of first) {
    const A = c.node.p + c.node.q;
    const rects = [];
    layout(c.node, 0, 0, A, 1, g, rects);
    // Two cuts in different branches can land closer together than one gutter, which leaves a
    // track of zero or negative size: invalid CSS that voids the whole grid. Skip such layouts.
    const tx = tracksFor(rects, g, 'x');
    const ty = tracksFor(rects, g, 'y');
    if (tx.sizes.some((v) => v <= MIN_TRACK) || ty.sizes.some((v) => v <= MIN_TRACK)) continue;
    const areas = rects.map((r) => r.w * r.h);
    const ratio = Math.min(...areas) / Math.max(...areas);
    let score = c.empty + c.crop + SMALL_TILE_WEIGHT * Math.max(0, SMALL_TILE_FLOOR - ratio);
    if (hero >= 0 && hero < n && areas[hero] < Math.max(...areas) - 1e-9) score += HERO_PENALTY;
    const tree = canon(c.node);
    if (!best || score < best.score - 1e-12 || (Math.abs(score - best.score) <= 1e-12 && tree < best.tree)) {
      best = { score, node: c.node, A, rects, ratio, empty: c.empty, crop: c.crop, tree };
    }
  }

  if (!best) return evenGrid(n, F, 'no-valid-layout');
  const X = tracksFor(best.rects, g, 'x');
  const Y = tracksFor(best.rects, g, 'y');
  const areas = best.rects.map((_, i) => [Y.span[i][0] + 1, X.span[i][0] + 1, Y.span[i][1] + 1, X.span[i][1] + 1]);
  return {
    fallback: false, n, ar: best.A, cols: X.sizes, rows: Y.sizes, areas,
    empty: best.empty, crop: best.crop, ratio: best.ratio, tree: best.tree,
  };
}

module.exports = {
  MAX_PHOTOS, FILL_MAX, DEFAULT_GAP, STAGE_ASPECT, stageAspectEstimate, packCollage,
  fallbackGrid: evenGrid,
};
