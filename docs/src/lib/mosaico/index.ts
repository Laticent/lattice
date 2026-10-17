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
import { chooseTree, DEFAULT_TREE_WEIGHTS, MAX_TREE_ITEMS, tracksFor } from './tree.js';
import type { Container, GridTracks, Item, PackOptions, PackRefusal, PackResult } from './types.js';

export type {
  Container,
  GridTracks,
  Item,
  PackFailure,
  PackOptions,
  PackRefusal,
  PackResult,
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
  if (options.strategy === 'rows') return packRows(aspects, options);
  if (options.goal !== undefined && options.goal !== 'fill') throw new RangeError(`mosaico: the tree strategy takes the fill goal, not ${options.goal}`);
  if (n > MAX_TREE_ITEMS) return { ok: false, reason: 'too-many' };
  const F = container?.aspect;
  if (!(typeof F === 'number' && Number.isFinite(F) && F > 0)) throw new RangeError(`mosaico: container.aspect must be a positive number, got ${F}`);
  const ordered = options.order === 'ordered';
  const fit = options.fit === 'fill' ? 'fill' : 'tight';
  const stretch = num(options.stretch, DEFAULT_STRETCH);
  const gap = num(options.gap, 0);
  const hero = Number.isInteger(options.hero) ? (options.hero as number) : -1;
  const weights = { ...DEFAULT_TREE_WEIGHTS, ...options.weights };
  // The search skips a root on a lower bound that holds only for non-negative weights.
  for (const [k, v] of Object.entries(weights)) {
    if (!(typeof v === 'number' && Number.isFinite(v) && v >= 0)) throw new RangeError(`mosaico: weights.${k} must be a finite number ≥ 0, got ${v}`);
  }

  const best = chooseTree(aspects, F, { ordered, fit, stretch, gap, hero, weights });
  if (!best) return { ok: false, reason: 'no-valid-layout' };
  return {
    ok: true,
    rects: best.rects,
    aspect: best.A,
    empty: best.empty,
    crop: best.crop,
    ratio: best.ratio,
    score: best.score,
    arrangement: best.tree,
    gap,
    work: best.work,
  };
}

export const DEFAULT_HEIGHT_CAP = 0.1;
export const DEFAULT_ASPECT_FLOOR = 0.5;

function packRows(aspects: number[], options: PackOptions): PackResult | PackRefusal {
  if (options.goal !== undefined && options.goal !== 'equal-weight') throw new RangeError(`mosaico: the rows strategy takes the equal-weight goal, not ${options.goal}`);
  const gap = num(options.gap, 0);
  const heightCap = num(options.heightCap, DEFAULT_HEIGHT_CAP, Number.MIN_VALUE);
  const choice = chooseRows(aspects, {
    gap,
    rowGap: num(options.rowGap, gap),
    heightCap,
    minHeightCap: Math.min(heightCap, num(options.minHeightCap, heightCap, Number.MIN_VALUE)),
    areaCap: num(options.areaCap, heightCap, Number.MIN_VALUE),
    maxPerRow: Number.isInteger(options.maxPerRow) && (options.maxPerRow as number) >= 1 ? (options.maxPerRow as number) : Infinity,
    maxRows: Number.isInteger(options.maxRows) && (options.maxRows as number) >= 1 ? (options.maxRows as number) : Infinity,
    maxHeight: num(options.maxHeight, Infinity),
    minCell: num(options.minCell, 0),
    aspectFloor: num(options.aspectFloor, DEFAULT_ASPECT_FLOOR),
  });
  if (!choice) return { ok: false, reason: 'too-wide' };
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
    gap,
    work: { arrangements: 1, scored: choice.steps },
    rows: choice.rows,
    cells: choice.cells,
    area: choice.area,
    heightCap: choice.cap,
  };
}

/**
 * The CSS grid adapter: the result's cut lines as grid tracks (sizes in layout units, so emit
 * them as `minmax(0, Nfr)`) and one grid area per item. A grid built this way fits whatever box
 * the browser gives it, so it works before the container is laid out.
 */
export function toGrid(result: PackResult): GridTracks {
  const X = tracksFor(result.rects, result.gap, 'x');
  const Y = tracksFor(result.rects, result.gap, 'y');
  const areas = result.rects.map((_, i) => [Y.span[i][0] + 1, X.span[i][0] + 1, Y.span[i][1] + 1, X.span[i][1] + 1]);
  return { cols: X.sizes, rows: Y.sizes, areas };
}
