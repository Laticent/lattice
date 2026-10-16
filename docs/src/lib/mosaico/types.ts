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
 * The box to fill. Slice 1 needs only its shape: the result is in layout units, and the CSS grid
 * adapter emits `fr` tracks, so the browser fits the grid to the real box.
 */
export interface Container {
  aspect: number;
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
  /** Only `tree` in this version. `rows` and `template` follow (design note §8). */
  strategy?: 'tree';
  /** Only `fill` in this version: least empty space and crop, with a penalty on very small tiles. */
  goal?: 'fill';
  /** `free` (default) may reorder items; `ordered` keeps them in written order, read left to right, top to bottom. */
  order?: 'free' | 'ordered';
  /** `tight` (default) never crops; `fill` may stretch the layout by up to `stretch` to close empty space. */
  fit?: 'tight' | 'fill';
  /** The most a `fill` layout may stretch, as a fraction (default 0.08). */
  stretch?: number;
  /** Gutter between items, as a fraction of the container height (default 0). */
  gap?: number;
  /** Index of the item that must hold the largest tile, or -1 (default). */
  hero?: number;
  weights?: TreeWeights;
}

export type PackFailure = 'empty' | 'too-many' | 'no-valid-layout';

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
   * What the search did: distinct arrangements it kept, and how many it laid out and scored
   * (the rest lost on a lower bound). Deterministic, so a benchmark can gate on it.
   */
  work: { arrangements: number; scored: number };
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
