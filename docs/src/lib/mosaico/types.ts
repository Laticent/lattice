/** A rectangle in layout units: the layout is 1 tall and `aspect` wide. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * One box to place. Slice 1 takes fixed shapes only: `aspect` is width / height. An aspect that
 * is missing, not finite or outside (0.05, 20) is read as 1:1, the stand-in for an item whose
 * shape is not known (a data URL, an unreadable header).
 */
export interface Item {
  aspect: number;
}

/**
 * The box to fill. `tree` needs only its shape: the result is in layout units, and the CSS grid
 * adapter emits `fr` tracks, so the browser fits the grid to the real box. `rows` fills the width
 * and grows downward, so it needs nothing: pass `{}`.
 */
export interface Container {
  aspect?: number;
}

/** Score weights for the `tree` strategy's `fill` goal. Each must be finite and ≥ 0 (`pack` throws otherwise). */
export interface TreeWeights {
  /** Weight of the container area the layout leaves empty (default 1). */
  empty?: number;
  /** Penalty per unit the smallest/largest tile area ratio falls below `smallTileFloor` (default 1.5). */
  smallTile?: number;
  /** Smallest/largest tile area ratio below which the small-tile penalty starts (default 0.4). */
  smallTileFloor?: number;
  /** Added when the hero item does not hold the largest tile (default 0.5). */
  hero?: number;
}

export interface PackOptions {
  /**
   * `tree` (default): every guillotine arrangement, for up to six items. `rows`: an ordered list
   * broken into centered rows, any number of items.
   */
  strategy?: 'tree' | 'rows';
  /**
   * `fill` (default for `tree`, the only goal it takes): least empty space and crop, with a penalty
   * on very small tiles. `equal-weight` (default for `rows`, the only goal it takes): every item at
   * the same area unless that would make it taller than `heightCap`.
   */
  goal?: 'fill' | 'equal-weight';
  /** `tree`: `free` (default) may reorder items; `ordered` keeps them in written order, read left to right, top to bottom. */
  order?: 'free' | 'ordered';
  /** `tree`: `tight` (default) never crops; `fill` may stretch the layout by up to `stretch` to close empty space. */
  fit?: 'tight' | 'fill';
  /** `tree`: the most a `fill` layout may stretch, as a fraction (default 0.08). */
  stretch?: number;
  /** Gutter between items (default 0): for `tree` a fraction of the container height, for `rows` of its width. */
  gap?: number;
  /** `tree`: index of the item that must hold the largest tile, or -1 (default). */
  hero?: number;
  /** `tree`: score weights. */
  weights?: TreeWeights;
  /** `rows`: gap between rows, as a fraction of the width (default: `gap`). */
  rowGap?: number;
  /** `rows`: the tallest an item may be, as a fraction of the width (default 0.1). */
  heightCap?: number;
  /** `rows`: the lowest the cap may fall, before every area shrinks, to fit `maxRows` and `maxHeight` (default: `heightCap`). */
  minHeightCap?: number;
  /**
   * `rows`: the height the shared area is computed from (default: `heightCap`). Set it above
   * `heightCap` to keep items as large as they would be under the higher cap while holding every
   * item to the lower one: the items the lower cap stops lose area, the rest keep it.
   */
  areaCap?: number;
  /** `rows`: most items in one row (default: no limit). */
  maxPerRow?: number;
  /** `rows`: most rows; the area shrinks until the items fit (default: no limit). */
  maxRows?: number;
  /** `rows`: the tallest the layout may be, as a fraction of the width; the area shrinks until it fits (default: no limit). */
  maxHeight?: number;
  /** `rows`: the narrowest cell, as a fraction of the width (default 0). */
  minCell?: number;
  /** `rows`: items narrower than this aspect are held at `heightCap` instead of shrinking every item (default 0.5). */
  aspectFloor?: number;
}

export type PackFailure = 'empty' | 'too-many' | 'no-valid-layout' | 'too-wide';

export interface PackResult {
  ok: true;
  /** One rectangle per item, in written order, in layout units (the layout is 1 tall). */
  rects: Rect[];
  /** The layout's natural width / height. */
  aspect: number;
  /** Share of the container the layout leaves empty, 0..1. */
  empty: number;
  /** Share of the layout cut off to fit the container (non-zero only under `fit: 'fill'`), 0..1. */
  crop: number;
  /** Smallest tile area / largest tile area. */
  ratio: number;
  /** The goal's score; lower is better. */
  score: number;
  /** The arrangement as data: `V(0,H(1,2))` puts item 0 beside items 1 over 2. */
  arrangement: string;
  /** The gutter the rects were laid out with. */
  gap: number;
  /**
   * What the search did. `tree`: distinct arrangements it kept, and how many it laid out and
   * scored (the rest lost on a lower bound). `rows`: one arrangement, and the bisection steps it
   * took to fit `maxRows` as `scored`. Deterministic, so a benchmark can gate on it.
   */
  work: { arrangements: number; scored: number };
  /** `rows`: item indices per row. */
  rows?: number[][];
  /** `rows`: each item's cell (its box widened to the cell width, as tall as its row). */
  cells?: Rect[];
  /** `rows`: the area every item gets unless the height cap holds it. */
  area?: number;
  /** `rows`: the height cap the layout settled on. */
  heightCap?: number;
}

export interface PackRefusal {
  ok: false;
  reason: PackFailure;
}

/** A node of a guillotine tree; at height h its width is `p·h + q`. Internal, exported for tests. */
export type TreeNode = TreeLeaf | TreeJoin;

interface TreeNodeBase {
  /** Bit mask of the items under this node. */
  m: number;
  p: number;
  q: number;
  /** Cached arrangement string. */
  c?: string;
}

/** One item. */
export interface TreeLeaf extends TreeNodeBase {
  leaf: true;
  i: number;
}

/** Two nodes side by side (`V`) or stacked (`H`). */
export interface TreeJoin extends TreeNodeBase {
  leaf: false;
  cut: 'V' | 'H';
  l: TreeNode;
  r: TreeNode;
  /** Cached dedupe signature. */
  s?: number | string;
}

/** CSS grid output: track sizes in layout units and one 1-based [rowStart, colStart, rowEnd, colEnd] per item. */
export interface GridTracks {
  cols: number[];
  rows: number[];
  areas: number[][];
}
