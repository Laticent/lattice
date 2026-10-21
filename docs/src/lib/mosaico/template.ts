/**
 * The `template` strategy: the caller gives the arrangement, mosaico computes the sizes. No search.
 *
 * The arrangement is the string a `tree` result already reports: `V(0,H(1,2))` is item 0 beside items 1
 * over 2 (`V` cuts vertically, so its children sit side by side; `H` stacks them). A join may take more
 * than two children: `V(0,1,2)` is three side by side.
 *
 * Sizing is two passes. Bottom-up, every node gets its region of allowed sizes (region.ts). Top-down, a
 * join hands its width (or height) to its children the way CSS flex does: in proportion to their weights,
 * except that a child stops at the edge of the sizes it allows at the shared height (or width), and what
 * it leaves is shared by the rest. The result tiles the container exactly, gutters included.
 *
 * A child that is itself a join counts as ONE child of its parent, as a nested flex container does; a
 * leaf's `weight` is its share inside the join that holds it.
 */

import { contains, joinSideBySide, joinStacked, type LeafRule, largestWithin, leafRegion, type Poly, sliceAtH, sliceAtW } from './region.js';
import type { Rect } from './types.js';

export type Cut = 'V' | 'H';

/** Most items a template takes. Region vertex counts grow with joins, and a bigger layout is not a template. */
export const MAX_TEMPLATE_ITEMS = 64;

/** A parsed arrangement. */
export type TemplateNode = { leaf: true; i: number } | { leaf: false; cut: Cut; kids: TemplateNode[] };

/** Parse an arrangement, or throw a RangeError that names the offending character. */
export function parseTemplate(src: string): TemplateNode {
  if (typeof src !== 'string' || !src.trim()) throw new RangeError('mosaico: the template strategy needs options.template, e.g. "V(0,H(1,2))"');
  let at = 0;
  let depth = 0;
  const fail = (why: string): never => {
    throw new RangeError(`mosaico: bad template ${JSON.stringify(src.length > 80 ? `${src.slice(0, 77)}...` : src)}: ${why} at ${at}`);
  };
  const space = () => {
    while (at < src.length && /\s/.test(src[at])) at++;
  };
  const expr = (): TemplateNode => {
    space();
    const c = src[at];
    if (c >= '0' && c <= '9') {
      let end = at;
      while (end < src.length && src[end] >= '0' && src[end] <= '9') end++;
      const i = Number(src.slice(at, end));
      at = end;
      return { leaf: true, i };
    }
    if (c === 'V' || c === 'H') {
      if (++depth > MAX_TEMPLATE_ITEMS) fail(`nested more than ${MAX_TEMPLATE_ITEMS} deep`);
      at++;
      space();
      if (src[at] !== '(') fail('expected "("');
      at++;
      const kids: TemplateNode[] = [expr()];
      for (;;) {
        space();
        if (src[at] === ',') {
          at++;
          kids.push(expr());
        } else if (src[at] === ')') {
          at++;
          break;
        } else fail('expected "," or ")"');
      }
      if (kids.length < 2) fail('a join needs at least two children');
      depth--;
      return { leaf: false, cut: c, kids };
    }
    return fail('expected an item number, V( or H(');
  };
  const root = expr();
  space();
  if (at < src.length) fail('unexpected text after the arrangement');
  return root;
}

/** The leaf indices, in written order. */
export function leavesOf(node: TemplateNode): number[] {
  return node.leaf ? [node.i] : node.kids.flatMap(leavesOf);
}

/** The arrangement, normalized: no spaces. */
export function printTemplate(node: TemplateNode): string {
  return node.leaf ? String(node.i) : `${node.cut}(${node.kids.map(printTemplate).join(',')})`;
}

export interface TemplateItem extends LeafRule {
  /** Share of the join's free space when nothing limits it (default 1). */
  weight?: number;
  /**
   * `exact` (default): the item fills its cell, so its shape rules size the cell. `contain`: the cell may be
   * any shape and the item is the largest of its shape that fits inside, centered (see `fitInside`).
   */
  fit?: 'exact' | 'contain';
}

interface Built {
  node: TemplateNode;
  region: Poly;
  weight: number;
  kids?: Built[];
}

/**
 * Regions bottom-up. Returns null when some node allows no size at all (an item's own limits conflict, or
 * two children have no height or width in common).
 */
export function buildRegions(node: TemplateNode, items: readonly TemplateItem[], columnGap: number, rowGap: number, big?: number): Built | null {
  if (node.leaf) {
    const it = items[node.i];
    // A contained item's cell has no shape rule: the item fits inside it.
    const region = leafRegion(it.fit === 'contain' ? { ...it, aspect: undefined } : it, big);
    if (!region) return null;
    const w = typeof it.weight === 'number' && Number.isFinite(it.weight) && it.weight > 0 ? Math.min(1e6, Math.max(1e-6, it.weight)) : 1;
    return { node, region, weight: w };
  }
  const kids: Built[] = [];
  for (const k of node.kids) {
    const b = buildRegions(k, items, columnGap, rowGap, big);
    if (!b) return null;
    kids.push(b);
  }
  let region = kids[0].region;
  for (let i = 1; i < kids.length; i++) {
    const next = node.cut === 'V' ? joinSideBySide(region, kids[i].region, columnGap) : joinStacked(region, kids[i].region, rowGap);
    if (!next) return null;
    region = next;
  }
  return { node, region, kids, weight: 1 };
}

/** The sizes a region allows at `at` along one axis, with `at` clamped into the region's span so floating-point drift cannot miss it. */
function sliceClamped(poly: Poly, axis: 'h' | 'w', at: number): [number, number] {
  const i = axis === 'h' ? 1 : 0;
  const lo = Math.min(...poly.map((p) => p[i]));
  const hi = Math.max(...poly.map((p) => p[i]));
  const t = Math.min(hi, Math.max(lo, at));
  return (axis === 'h' ? sliceAtH(poly, t) : sliceAtW(poly, t)) ?? [0, 0];
}

interface Share {
  lo: number;
  hi: number;
  weight: number;
}

/**
 * Split `total` among children, each in [lo, hi], in proportion to weight, the way CSS flex resolves
 * flexible lengths: a child that would leave its bounds is frozen at the bound, and the rest share what
 * remains. `total` must lie in [Σlo, Σhi]; any floating-point residue goes to the last unfrozen child so
 * the parts add up exactly.
 */
export function shareOut(total: number, kids: readonly Share[]): number[] {
  const out: number[] = new Array(kids.length).fill(0);
  const frozen: boolean[] = new Array(kids.length).fill(false);
  let free = total;
  for (let round = 0; round <= kids.length; round++) {
    const open = kids.map((_, i) => i).filter((i) => !frozen[i]);
    if (!open.length) break;
    const sum = open.reduce((s, i) => s + kids[i].weight, 0);
    let violation = 0;
    const target = new Map<number, number>();
    const wanted = new Map<number, number>();
    for (const i of open) {
      const t = (free * kids[i].weight) / sum;
      const c = Math.min(kids[i].hi, Math.max(kids[i].lo, t));
      wanted.set(i, t);
      target.set(i, c);
      violation += c - t;
    }
    if (Math.abs(violation) < 1e-12 * Math.max(1, Math.abs(total))) {
      for (const i of open) out[i] = target.get(i) as number;
      break;
    }
    // Net growth needed: freeze the children held at their floors; net shrink: those held at their caps.
    let froze = false;
    for (const i of open) {
      const t = wanted.get(i) as number;
      const c = target.get(i) as number;
      if ((violation > 0 && c > t) || (violation < 0 && c < t)) {
        out[i] = c;
        frozen[i] = true;
        free -= c;
        froze = true;
      }
    }
    if (!froze) {
      for (const i of open) out[i] = target.get(i) as number;
      break;
    }
  }
  const all = out.reduce((s, v) => s + v, 0);
  const resid = total - all;
  if (Math.abs(resid) > 0) {
    // Hand the residue to the child with the most room in its direction.
    let k = -1;
    let room = -1;
    kids.forEach((c, i) => {
      const r = resid > 0 ? c.hi - out[i] : out[i] - c.lo;
      if (r > room) [k, room] = [i, r];
    });
    if (k >= 0) out[k] += resid;
  }
  return out;
}

/** Place every leaf of a built tree in the box (x, y, w, h); the box is inside the node's region. */
export function place(b: Built, x: number, y: number, w: number, h: number, columnGap: number, rowGap: number, out: Rect[]): void {
  if (b.node.leaf) {
    out[b.node.i] = { x, y, w, h };
    return;
  }
  const kids = b.kids as Built[];
  const n = kids.length;
  const cut = b.node.cut;
  if (cut === 'V') {
    const spans = kids.map((k) => sliceClamped(k.region, 'h', h));
    const widths = shareOut(
      w - (n - 1) * columnGap,
      kids.map((k, i) => ({ lo: spans[i][0], hi: spans[i][1], weight: k.weight })),
    );
    let at = x;
    kids.forEach((k, i) => {
      place(k, at, y, widths[i], h, columnGap, rowGap, out);
      at += widths[i] + columnGap;
    });
  } else {
    const spans = kids.map((k) => sliceClamped(k.region, 'w', w));
    const heightsOf = shareOut(
      h - (n - 1) * rowGap,
      kids.map((k, i) => ({ lo: spans[i][0], hi: spans[i][1], weight: k.weight })),
    );
    let at = y;
    kids.forEach((k, i) => {
      place(k, x, at, w, heightsOf[i], columnGap, rowGap, out);
      at += heightsOf[i] + rowGap;
    });
  }
}

/**
 * The largest rectangle of the item's shape that fits inside `cell`, centered. A range `[min, max]` takes
 * the cell's own shape, clamped into the range.
 */
export function fitInside(cell: Rect, aspect: number | readonly [number, number]): Rect {
  const a = typeof aspect === 'number' ? aspect : Math.min(aspect[1], Math.max(aspect[0], cell.w / cell.h));
  const w = Math.min(cell.w, cell.h * a);
  const h = w / a;
  return { x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - h) / 2, w, h };
}

export { contains, largestWithin, sliceAtW };
