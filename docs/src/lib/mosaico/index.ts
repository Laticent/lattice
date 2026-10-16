/**
 * mosaico — pack boxes into a container. Pure and synchronous: numbers in, rectangles out, with
 * no DOM, no I/O and no dependencies, so it runs the same on a server, in a browser and in a
 * worker. Output is deterministic: the same input gives the same result, byte for byte.
 *
 * This version ships the `tree` strategy with the `fill` goal for fixed-shape items (the
 * collage packer). Range items, `template` and `rows` follow
 * (engineering/decisions/2026-10-16-mosaico-layout-library.md §8).
 */

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

/**
 * Pack `items` into `container`.
 *
 * @returns a `PackResult` (`ok: true`), or a `PackRefusal` naming why there is no layout:
 *   `empty` (no items), `too-many` (more than MAX_TREE_ITEMS for `tree`), or `no-valid-layout`
 *   (every arrangement leaves a zero-size grid track).
 */
export function pack(items: ReadonlyArray<Item | number>, container: Container, options: PackOptions = {}): PackResult | PackRefusal {
  const n = Array.isArray(items) ? items.length : 0;
  if (n < 1) return { ok: false, reason: 'empty' };
  if (n > MAX_TREE_ITEMS) return { ok: false, reason: 'too-many' };
  const F = container.aspect;
  if (!(Number.isFinite(F) && F > 0)) throw new RangeError(`mosaico: container.aspect must be a positive number, got ${F}`);
  const ordered = options.order === 'ordered';
  const fit = options.fit === 'fill' ? 'fill' : 'tight';
  const stretch = Number.isFinite(options.stretch) && (options.stretch as number) >= 0 ? (options.stretch as number) : DEFAULT_STRETCH;
  const gap = Number.isFinite(options.gap) && (options.gap as number) >= 0 ? (options.gap as number) : 0;
  const hero = Number.isInteger(options.hero) ? (options.hero as number) : -1;
  const weights = { ...DEFAULT_TREE_WEIGHTS, ...options.weights };
  const aspects = items.map(itemAspect);

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
