/**
 * The `tree` strategy: every guillotine arrangement of up to MAX_TREE_ITEMS fixed-shape items.
 *
 * A guillotine layout is one where every cut runs all the way across the region it divides, so
 * the layout is a binary tree of side-by-side (`V`) and stacked (`H`) joins. Each node stores
 * its width at height `h` as the line `p·h + q` (q carries the gutters), so a tile that spans
 * several grid tracks keeps its exact shape (BRIC: C. Brian Atkins, ACM Multimedia 2008).
 *
 * This is the collage packer that lived in Lattice's lib/core/collage-pack.js, moved here and
 * made faster without changing one byte of what it returns
 * (engineering/decisions/2026-10-16-mosaico-layout-library.md §3, §8 slice 1):
 *
 * - The dedupe key's tile-balance term is computed by a walk that writes areas into a reused
 *   buffer, not by laying out a fresh array of rectangle objects per candidate.
 * - `ordered` visits only contiguous runs of the written order (interval dynamic programming).
 *   Within a run it tries splits in the order the subset loop did, longest prefix first, because
 *   the dedupe keeps the first node it sees and a different order could keep a different one.
 * - Checking the roots skips a root as soon as a lower bound on its score already loses to the
 *   best so far: first `empty` and `crop` (known before any layout), then the full score
 *   (before the two track passes). A skipped root could never have been chosen, so the winner
 *   is the same root the full check picked.
 */

import type { Rect, TreeJoin, TreeLeaf, TreeNode, TreeWeights } from './types.js';

export const MAX_TREE_ITEMS = 6;
const MIN_TRACK = 1e-6; // a grid track at or below this is invalid and its layout is skipped
const TIE = 1e-12; // two scores closer than this are a tie, broken by the arrangement string
// A lower bound skips a root only when it loses by more than this, well clear of the TIE test,
// so rounding in the bound can never skip a root the full comparison would have kept.
const SKIP_MARGIN = 4e-12;

export const DEFAULT_TREE_WEIGHTS: Readonly<Required<TreeWeights>> = Object.freeze({
  empty: 1,
  smallTile: 1.5,
  smallTileFloor: 0.4,
  hero: 0.5,
});

const popcount = (m: number): number => {
  let c = 0;
  while (m) {
    c += m & 1;
    m >>= 1;
  }
  return c;
};

// ── affine nodes ──────────────────────────────────────────────────────────────────────
// A leaf is an item: at height h its width is a·h. Two nodes join in one of two ways (inlined in
// `enumerate`):
//   V, side by side (equal heights): widths add, one gap between.   p = pl + pr, q = ql + qr + g
//   H, stacked (equal widths): heights add with one gap; invert the sum to get width(h).
//                                    p = 1 / (1/pl + 1/pr),   q = p · (ql/pl + qr/pr − g)
function leaf(i: number, a: number): TreeLeaf {
  return { leaf: true, i, m: 1 << i, p: a, q: 0 };
}

/** The arrangement as a string, `V(0,H(1,2))`. Cached on the node: the sort asks for it often. */
export function canon(n: TreeNode): string {
  if (n.c === undefined) n.c = n.leaf ? String(n.i) : `${n.cut}(${canon(n.l)},${canon(n.r)})`;
  return n.c;
}

/** Lay a node out in the box (x, y, w, h), gap g between siblings, writing one rect per tile. */
export function layout(n: TreeNode, x: number, y: number, w: number, h: number, g: number, out: Rect[]): void {
  if (n.leaf) {
    out[n.i] = { x, y, w, h };
    return;
  }
  const l = n.l;
  if (n.cut === 'V') {
    const wl = l.p * h + l.q;
    layout(l, x, y, wl, h, g, out);
    layout(n.r, x + wl + g, y, w - wl - g, h, g, out);
  } else {
    const hl = (w - l.q) / l.p;
    layout(l, x, y, w, hl, g, out);
    layout(n.r, x, y + hl + g, w, h - hl - g, g, out);
  }
}

// The same walk as `layout`, keeping only each tile's area. Same arithmetic, same order.
function areasOf(n: TreeNode, w: number, h: number, g: number, out: Float64Array): void {
  if (n.leaf) out[n.i] = w * h;
  else areasOfJoin(n.cut, n.l, n.r, w, h, g, out);
}

// The join taken apart (cut, left, right), so a candidate is measured before a node is allocated.
function areasOfJoin(cut: 'V' | 'H', l: TreeNode, r: TreeNode, w: number, h: number, g: number, out: Float64Array): void {
  if (cut === 'V') {
    const wl = l.p * h + l.q;
    areasOf(l, wl, h, g, out);
    areasOf(r, w - wl - g, h, g, out);
  } else {
    const hl = (w - l.q) / l.p;
    areasOf(l, w, hl, g, out);
    areasOf(r, w, h - hl - g, g, out);
  }
}

const TWO24 = 2 ** 24;

// What the final score can tell two layouts of the same outer shape apart by: how unequal the
// tile areas are, and how much of the box the hero owns. Two nodes with the same (p, q) and the
// same signature score the same wherever they sit, so keeping one is lossless; keying on (p, q)
// alone dropped the layout a hero needed (a 53% empty result where another leaves 6%).
// Both terms are rounded to 1e-4, so the pair packs into one number; anything not finite keeps
// the string the key was always built from.
function signature(cut: 'V' | 'H', l: TreeNode, r: TreeNode, p: number, q: number, m: number, g: number, hero: number, buf: Float64Array): number | string {
  areasOfJoin(cut, l, r, p + q, 1, g, buf);
  let lo = Infinity;
  let hi = 0;
  let sum = 0;
  let own = 0;
  // Ascending item index, as the sum always ran: a different order rounds differently.
  for (let i = 0; m; m >>>= 1, i++) {
    if (!(m & 1)) continue;
    const a = buf[i];
    lo = Math.min(lo, a);
    hi = Math.max(hi, a);
    sum += a;
    if (i === hero) own = a;
  }
  const balance = Math.round((lo / hi) * 1e4);
  const share = hero >= 0 ? Math.round((own / sum) * 1e4) : 0;
  return Number.isFinite(balance) && Number.isFinite(share) && Math.abs(balance) < TWO24 && Math.abs(share) < TWO24
    ? (balance + TWO24) * 2 ** 25 + (share + TWO24)
    : `:${balance}:${share}`;
}

// The cut and the outer line rounded to 1e-3, as one exact number when it fits in 51 bits.
function lineKey(cut: 'V' | 'H', p: number, q: number): number | string {
  const P = Math.round(p * 1000);
  const Q = Math.round(q * 1000);
  return Math.abs(P) < TWO24 && Math.abs(Q) < TWO24
    ? ((P + TWO24) * 2 ** 25 + (Q + TWO24)) * 2 + (cut === 'V' ? 1 : 0)
    : `${cut}${P}:${Q}`;
}

// Is `m` one contiguous run of bits (a run of the written order)?
const isRun = (m: number): boolean => {
  const low = m & -m;
  return ((m + low) & m) === 0;
};

/** Every arrangement of all items; one kept per distinct outer shape and score signature. */
export function enumerate(aspects: number[], ordered: boolean, g: number, hero: number): TreeNode[] {
  const n = aspects.length;
  const full = (1 << n) - 1;
  const memo: TreeNode[][] = new Array(full + 1);
  const buf = new Float64Array(n);
  const masks: number[] = [];
  // ordered: the left part is always a prefix of the right, so only runs are ever reachable.
  for (let m = 1; m <= full; m++) if (!ordered || isRun(m)) masks.push(m);
  masks.sort((x, y) => popcount(x) - popcount(y) || x - y);
  for (const m of masks) {
    if ((m & (m - 1)) === 0) {
      const i = 31 - Math.clz32(m);
      memo[m] = [leaf(i, aspects[i])];
      continue;
    }
    // The dedupe key is the cut, the outer line (p, q) and the signature. Nodes are grouped by
    // the first two; a signature is computed only when a second node joins a group, since a node
    // alone on its line is new whatever its signature. Same nodes kept, same order, as keying
    // every node on the full string.
    // A group is one node until a second node shares its line, then an array.
    const groups = new Map<number | string, TreeJoin | TreeJoin[]>();
    const out: TreeNode[] = [];
    const sigOf = (node: TreeJoin): number | string => {
      if (node.s === undefined) node.s = signature(node.cut, node.l, node.r, node.p, node.q, node.m, g, hero, buf);
      return node.s;
    };
    const offer = (cut: 'V' | 'H', L: TreeNode, R: TreeNode, p: number, q: number): void => {
      const k = lineKey(cut, p, q);
      const group = groups.get(k);
      let node: TreeJoin;
      if (group === undefined) {
        node = { leaf: false, cut, l: L, r: R, m, p, q, s: undefined };
        groups.set(k, node);
      } else {
        const sig = signature(cut, L, R, p, q, m, g, hero, buf);
        if (Array.isArray(group)) {
          for (const kept of group) if (sigOf(kept) === sig) return;
          node = { leaf: false, cut, l: L, r: R, m, p, q, s: sig };
          group.push(node);
        } else {
          if (sigOf(group) === sig) return;
          node = { leaf: false, cut, l: L, r: R, m, p, q, s: sig };
          groups.set(k, [group, node]);
        }
      }
      out.push(node);
    };
    // free: a split and its mirror (B beside A for A beside B) give nodes with the same outer
    // line and the same tile areas, so the mirror's key always repeats one already seen and
    // the dedupe drops it. The subset loop meets every split holding m's top item first, so
    // stop when the left part loses it: the rest are mirrors.
    const top = ordered ? 0 : 1 << (31 - Math.clz32(m));
    for (let s = (m - 1) & m; s > 0 && (s & top) === top; s = (s - 1) & m) {
      const t = m ^ s;
      // ordered: the left part must be a prefix of the written order within this subset
      if (ordered && 31 - Math.clz32(s) >= 31 - Math.clz32(t & -t)) continue;
      const left = memo[s];
      const right = memo[t];
      for (const L of left) {
        for (const R of right) {
          // joinV and joinH, inlined so a dropped candidate allocates nothing.
          offer('V', L, R, L.p + R.p, L.q + R.q + g);
          const p = 1 / (1 / L.p + 1 / R.p);
          offer('H', L, R, p, p * (L.q / L.p + R.q / R.p - g));
        }
      }
    }
    memo[m] = out;
  }
  return memo[full];
}

/** How a layout of natural shape `A` meets a container of shape `F`. */
export function fitStats(A: number, F: number, fit: 'tight' | 'fill', stretch: number): { empty: number; crop: number } {
  let ae = A;
  if (fit === 'fill') ae = Math.min(Math.max(F, A / (1 + stretch)), A * (1 + stretch));
  return { empty: 1 - Math.min(ae / F, F / ae), crop: 1 - Math.min(ae / A, A / ae) };
}

/**
 * Distinct cut lines of one axis → track sizes and each tile's [start, end) line indices.
 * A tile edge that starts after a gap marks a cut; a track runs from one cut to the next.
 */
export function tracksFor(rects: Rect[], g: number, axis: 'x' | 'y'): { sizes: number[]; span: number[][] } {
  const pos = axis === 'x' ? 'x' : 'y';
  const len = axis === 'x' ? 'w' : 'h';
  const total = Math.max(...rects.map((r) => r[pos] + r[len]));
  const byKey = new Map<number, number>(); // dedupe cut lines by value rounded to 1e-6, keep the exact value
  for (const r of rects) if (r[pos] > 1e-6 && !byKey.has(Math.round(r[pos] * 1e6))) byKey.set(Math.round(r[pos] * 1e6), r[pos]);
  const cuts = [...byKey.values()].sort((a, b) => a - b);
  const starts = [0, ...cuts];
  const ends = [...cuts.map((c) => c - g), total];
  const sizes = starts.map((s, i) => ends[i] - s);
  const lineOf = (v: number, list: number[]): number => {
    let best = 0;
    for (let i = 0; i < list.length; i++) if (Math.abs(list[i] - v) < Math.abs(list[best] - v)) best = i;
    return best;
  };
  const span = rects.map((r) => [lineOf(r[pos], starts), lineOf(r[pos] + r[len], ends) + 1]);
  return { sizes, span };
}

// Does every track of this layout have a positive size? Two cuts in different branches can land
// closer together than one gutter, which leaves a track of zero or negative size: invalid CSS
// that voids the whole grid. Same test as `tracksFor(...).sizes.every(v > MIN_TRACK)`, without
// building the spans.
function tracksValid(rects: Rect[], g: number, axis: 'x' | 'y'): boolean {
  const { sizes } = tracksFor(rects, g, axis);
  for (const v of sizes) if (v <= MIN_TRACK) return false;
  return true;
}

export interface TreeChoice {
  node: TreeNode;
  A: number;
  rects: Rect[];
  ratio: number;
  empty: number;
  crop: number;
  score: number;
  tree: string;
  /** Distinct arrangements the search kept, and how many of them were laid out and scored. */
  work: { arrangements: number; scored: number };
}

/** Pick the best-scoring valid root, or null when every root leaves a zero-size track. */
export function chooseTree(
  aspects: number[],
  F: number,
  opts: { ordered: boolean; fit: 'tight' | 'fill'; stretch: number; gap: number; hero: number; weights: Required<TreeWeights> },
): TreeChoice | null {
  const { ordered, fit, stretch, gap: g, hero, weights: W } = opts;
  const n = aspects.length;
  const roots = enumerate(aspects, ordered, g, hero);
  const first = roots.map((node) => {
    const { empty, crop } = fitStats(node.p + node.q, F, fit, stretch);
    return { node, empty, crop };
  });
  first.sort((x, y) => x.empty - y.empty || (canon(x.node) < canon(y.node) ? -1 : 1));

  let best: TreeChoice | null = null;
  let scored = 0;
  const areas = new Array<number>(n);
  for (const c of first) {
    // Every term after these two is ≥ 0, so they bound the score from below.
    if (best && W.empty * c.empty + c.crop - best.score > SKIP_MARGIN) continue;
    scored++;
    const A = c.node.p + c.node.q;
    const rects: Rect[] = [];
    layout(c.node, 0, 0, A, 1, g, rects);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const a = rects[i].w * rects[i].h;
      areas[i] = a;
      if (a < lo) lo = a;
      if (a > hi) hi = a;
    }
    const ratio = lo / hi;
    let score = W.empty * c.empty + c.crop + W.smallTile * Math.max(0, W.smallTileFloor - ratio);
    if (hero >= 0 && hero < n && areas[hero] < hi - 1e-9) score += W.hero;
    if (best && score - best.score > SKIP_MARGIN) continue;
    if (!tracksValid(rects, g, 'x') || !tracksValid(rects, g, 'y')) continue;
    const tree = canon(c.node);
    if (!best || score < best.score - TIE || (Math.abs(score - best.score) <= TIE && tree < best.tree)) {
      best = { node: c.node, A, rects, ratio, empty: c.empty, crop: c.crop, score, tree, work: { arrangements: 0, scored: 0 } };
    }
  }
  if (best) best.work = { arrangements: roots.length, scored };
  return best;
}
