/**
 * mosaico — pack boxes into a container. Pure and synchronous: numbers in, rectangles out, with
 * no DOM, no I/O and no dependencies, so it runs the same on a server, in a browser and in a
 * worker. Output is deterministic: the same input gives the same result, byte for byte.
 *
 * This version ships two strategies for fixed-shape items: `tree` with the `fill` goal (the
 * collage packer) and `rows` with the `equal-weight` goal (the logo wall). Range items and
 * `template` follow
 * (engineering/decisions/2026-10-16-mosaico-layout-library.md §8).
 */

import { chooseRows } from './rows.js';
import { chooseTree, DEFAULT_TREE_WEIGHTS, layout, MAX_TREE_ITEMS, tracksFor } from './tree.js';
import type { Align, Container, GridTracks, Item, PackOptions, PackRefusal, PackResult, Padding, Rect } from './types.js';

export type {
  Align,
  Container,
  GridTracks,
  Item,
  PackFailure,
  PackOptions,
  PackRefusal,
  PackResult,
  Padding,
  Rect,
  TreeWeights,
} from './types.js';
export { DEFAULT_TREE_WEIGHTS, MAX_TREE_ITEMS };

export const DEFAULT_STRETCH = 0.08;

const MIN_ASPECT = 0.05;
const MAX_ASPECT = 20;

/** The shape mosaico uses for an item: its aspect, or 1:1 when the aspect is not usable. */
export function itemAspect(item: Item | number | null | undefined): number {
  const v = typeof item === 'number' ? item : item?.aspect;
  return typeof v === 'number' && Number.isFinite(v) && v > MIN_ASPECT && v < MAX_ASPECT ? v : 1;
}

const num = (v: unknown, fallback: number, min = 0): number => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : fallback);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function sidesOf(p: Padding | undefined): Sides {
  if (typeof p === 'number') {
    const v = num(p, 0);
    return { top: v, right: v, bottom: v, left: v };
  }
  return { top: num(p?.top, 0), right: num(p?.right, 0), bottom: num(p?.bottom, 0), left: num(p?.left, 0) };
}

const ALIGNS: readonly Align[] = ['start', 'center', 'end', 'justify'];

function alignOf(v: unknown, fallback: Align, name: string, strategy: 'tree' | 'rows'): Align {
  if (v === undefined) return fallback;
  if (!ALIGNS.includes(v as Align) || (strategy === 'tree' && v === 'justify')) {
    throw new RangeError(`mosaico: ${name} for the ${strategy} strategy takes ${strategy === 'tree' ? 'start, center or end' : 'start, center, end or justify'}, not ${String(v)}`);
  }
  return v as Align;
}

// Where `align` puts a box in the space it leaves: none of it before (start), half, or all.
const SHARE: Record<Align, number> = { start: 0, center: 0.5, end: 1, justify: 0 };

// Grow the tracks along one axis by one factor, at most `most` and never below 1, until the layout
// reaches `room` along it; gutters keep their size.
function stretchTracks(rects: Rect[], axis: 'x' | 'y', room: number, most: number, g: number): Rect[] {
  const { sizes, span } = tracksFor(rects, g, axis);
  const gutters = (sizes.length - 1) * g;
  const sum = sizes.reduce((t, v) => t + v, 0);
  const k = Math.min(most, Math.max(1, (room - gutters) / sum));
  const start: number[] = [];
  let at = 0;
  for (const v of sizes) {
    start.push(at);
    at += v * k + g;
  }
  const pos = axis === 'x' ? 'x' : 'y';
  const len = axis === 'x' ? 'w' : 'h';
  return rects.map((r, i) => {
    const [a, b] = span[i];
    return { ...r, [pos]: start[a], [len]: start[b - 1] + sizes[b - 1] * k - start[a] };
  });
}

/**
 * Pack `items` into `container`.
 *
 * @returns a `PackResult` (`ok: true`), or a `PackRefusal` naming why there is no layout:
 *   `empty` (no items), `too-many` (more than MAX_TREE_ITEMS for `tree`), `no-valid-layout`
 *   (every `tree` arrangement leaves a zero-size grid track), or `too-wide` (`rows`: the limits
 *   hold the items only at no size at all, e.g. a cell wider than the container or no height left).
 */
export function pack(items: ReadonlyArray<Item | number>, container: Container, options: PackOptions = {}): PackResult | PackRefusal {
  const n = Array.isArray(items) ? items.length : 0;
  if (n < 1) return { ok: false, reason: 'empty' };
  const aspects = items.map(itemAspect);
  if (options.strategy === 'rows') return packRows(aspects, container, options);
  if (options.goal !== undefined && options.goal !== 'fill') throw new RangeError(`mosaico: the tree strategy takes the fill goal, not ${options.goal}`);
  if (n > MAX_TREE_ITEMS) return { ok: false, reason: 'too-many' };
  // The container in its own units: `aspect` wide and 1 tall unless it has a size.
  const { aspect, width, height } = container ?? {};
  let W: number;
  let H: number;
  if (positive(width) && positive(height)) [W, H] = [width, height];
  else if (positive(aspect)) [W, H] = positive(width) ? [width, width / aspect] : positive(height) ? [height * aspect, height] : [aspect, 1];
  else throw new RangeError(`mosaico: the tree strategy needs container.aspect, or container.width and container.height, as positive numbers; got ${JSON.stringify(container)}`);
  const pad = sidesOf(options.padding);
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;
  if (!(iw > 0 && ih > 0)) throw new RangeError('mosaico: the padding leaves no room in the container');
  // Layout units: the layout is 1 tall where it fills the height inside the padding.
  const F = iw / ih;
  const align = alignOf(options.align, 'center', 'align', 'tree');
  const ordered = options.order === 'ordered';
  const fit = options.fit === 'fill' ? 'fill' : 'tight';
  const stretch = num(options.stretch, DEFAULT_STRETCH);
  const gap = num(options.gap, 0);
  const columnGap = num(options.columnGap, gap) / ih;
  const rowGap = num(options.rowGap, gap) / ih;
  const hero = Number.isInteger(options.hero) ? (options.hero as number) : -1;
  const weights = { ...DEFAULT_TREE_WEIGHTS, ...options.weights };
  // The search skips a root on a lower bound that holds only for non-negative weights.
  for (const [k, v] of Object.entries(weights)) {
    if (!(typeof v === 'number' && Number.isFinite(v) && v >= 0)) throw new RangeError(`mosaico: weights.${k} must be a finite number ≥ 0, got ${v}`);
  }

  const best = chooseTree(aspects, F, { ordered, fit, stretch, columnGap, rowGap, hero, weights });
  if (!best) return { ok: false, reason: 'no-valid-layout' };

  // Draw it: at full height when the layout is narrower than the box, else at full width. The
  // node's width is a line in its height, gutters included, so the second case solves that line
  // for the height and every gutter stays exactly its size (the search kept only roots that have
  // room at that height).
  const { node, A } = best;
  const wide = A > F;
  const hL = wide ? (F - node.q) / node.p : 1;
  let natural: Rect[] = [];
  let [gx, gy] = [columnGap, rowGap];
  layout(node, 0, 0, wide ? F : A, hL, gx, gy, natural);
  // Gutters close to the box's width can leave a box no room at that height. Then scale the
  // layout down whole instead, gutters with it: every box keeps its shape and a positive size.
  if (natural.some((r) => !(r.w > 0 && r.h > 0))) {
    const k = F / A;
    natural = best.rects.map((r) => ({ x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k }));
    [gx, gy] = [gx * k, gy * k];
  }
  // `fill` closes the margin the way a CSS grid of `fr` tracks does: the tracks along the short
  // axis grow by one factor k, up to 1 + `stretch`, and the gutters keep their size. A box spans
  // whole tracks and gutters, so no box stretches by more than k; a drawn box is then the visible
  // part of its item.
  const drawn = fit === 'fill' ? stretchTracks(natural, wide ? 'y' : 'x', wide ? 1 : F, 1 + stretch, wide ? gy : gx) : natural;
  const fw = Math.max(...drawn.map((r) => r.x + r.w)) * ih;
  const fh = Math.max(...drawn.map((r) => r.y + r.h)) * ih;
  const frame = { x: pad.left + (iw - fw) * SHARE[align], y: pad.top + (ih - fh) * SHARE[align], w: fw, h: fh };
  const placed = drawn.map((r) => ({ x: frame.x + r.x * ih, y: frame.y + r.y * ih, w: r.w * ih, h: r.h * ih }));
  return {
    ok: true,
    rects: best.rects,
    aspect: best.A,
    empty: best.empty,
    crop: best.crop,
    ratio: best.ratio,
    score: best.score,
    arrangement: best.tree,
    gap: columnGap,
    columnGap,
    rowGap,
    frame,
    placed,
    work: best.work,
  };
}

export const DEFAULT_HEIGHT_CAP = 0.1;
export const DEFAULT_ASPECT_FLOOR = 0.5;

function packRows(aspects: number[], container: Container, options: PackOptions): PackResult | PackRefusal {
  if (options.goal !== undefined && options.goal !== 'equal-weight') throw new RangeError(`mosaico: the rows strategy takes the equal-weight goal, not ${options.goal}`);
  // The container in its own units: 1 wide unless it has a width. Layout units: the width inside the padding is 1.
  const W = positive(container?.width) ? container.width : 1;
  const pad = sidesOf(options.padding);
  const iw = W - pad.left - pad.right;
  if (!(iw > 0)) throw new RangeError('mosaico: the padding leaves no room in the container');
  const room = positive(container?.height) ? container.height - pad.top - pad.bottom : Infinity;
  if (!(room > 0)) throw new RangeError('mosaico: the padding leaves no room in the container');
  const align = alignOf(options.align, 'center', 'align', 'rows');
  const lastRow = alignOf(options.lastRow, align === 'justify' ? 'start' : align, 'lastRow', 'rows');
  const length = (v: unknown, fallback: number, min = 0): number => {
    const x = num(v, NaN, min);
    return Number.isNaN(x) ? fallback : x / iw;
  };
  const gap = length(options.gap, 0);
  const columnGap = length(options.columnGap, gap);
  const heightCap = length(options.heightCap, DEFAULT_HEIGHT_CAP, Number.MIN_VALUE);
  const area = num(options.area, NaN, Number.MIN_VALUE);
  const choice = chooseRows(aspects, {
    gap: columnGap,
    rowGap: length(options.rowGap, gap),
    heightCap,
    minHeightCap: Math.min(heightCap, length(options.minHeightCap, heightCap, Number.MIN_VALUE)),
    area: area / (iw * iw),
    maxPerRow: Number.isInteger(options.maxPerRow) && (options.maxPerRow as number) >= 1 ? (options.maxPerRow as number) : Infinity,
    maxRows: Number.isInteger(options.maxRows) && (options.maxRows as number) >= 1 ? (options.maxRows as number) : Infinity,
    maxHeight: Math.min(length(options.maxHeight, Infinity), room / iw),
    minCell: length(options.minCell, 0),
    aspectFloor: num(options.aspectFloor, DEFAULT_ASPECT_FLOOR),
    align,
    lastRow,
  });
  if (!choice) return { ok: false, reason: 'too-wide' };
  const frame = { x: pad.left, y: pad.top, w: iw, h: choice.height * iw };
  const placed = choice.rects.map((r) => ({ x: pad.left + r.x * iw, y: pad.top + r.y * iw, w: r.w * iw, h: r.h * iw }));
  const areas = choice.rects.map((r) => r.w * r.h);
  const inked = areas.reduce((s, a) => s + a, 0);
  return {
    ok: true,
    rects: choice.rects,
    aspect: 1 / choice.height,
    empty: 1 - inked / choice.height,
    crop: 0,
    ratio: Math.min(...areas) / Math.max(...areas),
    score: 0,
    arrangement: choice.rows.map((r) => r.join(' ')).join(' | '),
    gap: columnGap,
    columnGap,
    rowGap: length(options.rowGap, gap),
    frame,
    placed,
    work: { arrangements: 1, scored: choice.steps },
    rows: choice.rows,
    cells: choice.cells,
    area: choice.area * iw * iw,
    heightCap: choice.cap * iw,
  };
}

/**
 * The CSS grid adapter: the result's cut lines as grid tracks (sizes in layout units, so emit
 * them as `minmax(0, Nfr)` with N scaled up, e.g. by 1000: the tracks sum to 1 minus the gutters,
 * and `fr` factors that sum below 1 leave part of the grid empty) and one grid area per item. A
 * grid built this way fits whatever box the browser gives it, so it works before the container is
 * laid out. Set the grid's `column-gap` and `row-gap` to the result's `columnGap` and `rowGap` times
 * the grid's height for `tree`, or its width for `rows` (the layout units each strategy uses).
 */
export function toGrid(result: PackResult): GridTracks {
  const X = tracksFor(result.rects, result.columnGap ?? result.gap, 'x');
  const Y = tracksFor(result.rects, result.rowGap ?? result.gap, 'y');
  const areas = result.rects.map((_, i) => [Y.span[i][0] + 1, X.span[i][0] + 1, Y.span[i][1] + 1, X.span[i][1] + 1]);
  return { cols: X.sizes, rows: Y.sizes, areas };
}
