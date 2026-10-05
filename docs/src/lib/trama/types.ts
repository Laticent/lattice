/**
 * Trama's public types. Types are erased at build time, so nothing here reaches the
 * serialized kernel or pipeline: they close over no runtime value.
 */

/** A point in layout units (the HD baseline: a 1280-unit-wide section). */
export interface Point {
  x: number;
  y: number;
}

/** A placed box: top-left corner, size and centre. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

/** A plain rectangle, as a label seat or a title is. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

/** One node (a shape) in the model the kernel lays out. */
export interface GraphShape {
  id: string;
  name?: string;
  /** The group holding this shape, if any. */
  parent?: string | null;
  /** The outline kind; `diamond` is met at its tips, `circle` stays round when it grows. */
  shape?: string;
  [extra: string]: unknown;
}

/** A group: a box drawn behind its members. Groups nest through `parent`. */
export interface GraphGroup {
  id: string;
  name: string;
  parent?: string | null;
  [extra: string]: unknown;
}

export interface GraphEdgeStyle {
  /** A loose line stays out of the layout: routed after, never moving a box. */
  loose?: boolean;
  [extra: string]: unknown;
}

/** One line. `from` / `to` name a shape or a group. */
export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  /** The heavy main path: dagre weights it 4 to keep it straight. */
  heavy?: boolean;
  /** Authored as a back edge: handed to dagre reversed, so its cycle breaker never decides. */
  back?: boolean;
  style?: GraphEdgeStyle;
  [extra: string]: unknown;
}

export interface GraphModel {
  shapes: GraphShape[];
  groups?: GraphGroup[];
  edges?: GraphEdge[];
}

/** Measured sizes by shape id, in layout units. */
export type SizeMap = Record<string, Size & Record<string, unknown>>;

export interface Spacing {
  node?: number;
  rank?: number;
  edge?: number;
  groupPad?: number;
  groupPadTop?: number;
  lane?: number;
  titleInset?: number;
}

export interface LayoutOptions {
  /** Pin the direction; otherwise both are laid out and the larger type wins. */
  dir?: 'lr' | 'tb';
  /** Label sizes by edge index. */
  labelSizes?: Record<number, Size>;
  /** Group title sizes by group id. */
  groupTitleSizes?: Record<string, Size>;
  /** The box the drawing is fitted into, in layout units. */
  stage?: Size;
  maxScale?: number;
  spacing?: Spacing;
  margin?: number;
  /** Internal: lay out only the boxes and return their bounds (the direction skip). */
  boundsOnly?: boolean;
  /** Internal: whether crowded shapes may grow along the flow. */
  grow?: boolean;
  /**
   * Also try the reading-order grid: the shapes in authored order on 1 or more lines,
   * every line running the same way (the state chart's wrapping chain). Needs no dagre.
   */
  wrap?: boolean;
  /** Internal: lay out on the grid with this many lines. */
  grid?: number;
  /** Internal: place each shape's centre here instead of asking dagre (see `route`). */
  positions?: Record<string, Point>;
}

/** A routed line. */
export interface Route {
  index: number;
  from: string;
  to: string;
  points: Point[];
  labelAt?: Point | null;
  labelSize?: Size | null;
  back?: boolean;
  loose?: boolean;
  heavy?: boolean;
}

/** What the kernel counts after routing. The unit gallery holds every count to zero. */
export interface Quality {
  linesThroughShapes: number;
  linesThroughEnds: number;
  labelCollisions: number;
  shapeOverlaps: number;
  labelsOffLine: number;
  linesThroughTitles: number;
  labelsAcrossBorders: number;
  sharedRuns: number;
  endsOffBox: number;
  titlesUnderShapes: number;
}

/** A laid-out, routed drawing. */
export interface Geometry {
  dir: 'lr' | 'tb';
  width: number;
  height: number;
  nodes: Record<string, Box>;
  groups: Record<string, Box>;
  titles: Record<string, Rect>;
  routes: Route[];
  quality: Quality;
  crossings: number;
  grew: boolean;
  tidy: { crowded: number; grazes: number };
  /** The letterbox scale this drawing gets on the stage, when `stage` was given. */
  scale?: number;
  /** Set when the drawing is a reading-order grid: how many lines it runs on. */
  lines?: number;
}

/** The dagre build Trama is handed: it never imports one. */
export interface DagreLike {
  layout(g: unknown): void;
  Graph: new (opts?: Record<string, unknown>) => unknown;
}

export interface KernelStats {
  calls: number;
  hits: number;
  routed: number;
  bounded: number;
  /** Candidate evaluations the router ran, summed over every routing. */
  evals: number;
  /** Routings that ran past the router's work budget, and so skipped its refinements. */
  capped: number;
}

export interface GraphKernel {
  layout(model: GraphModel, sizes: SizeMap, opts: LayoutOptions, dagre: DagreLike | null | undefined): Geometry | null;
  layoutOnce(model: GraphModel, sizes: SizeMap, opts: LayoutOptions, dagre: DagreLike | null | undefined): Geometry | { width: number; height: number; grew: boolean } | null;
  /**
   * Route lines between boxes the caller placed (each shape's centre); no dagre. The
   * drawing comes back moved so its top-left sits at the margin: the positions are
   * relative. Positions must be finite.
   */
  route(model: GraphModel, sizes: SizeMap, positions: Record<string, Point>, opts?: LayoutOptions): Geometry | null;
  /**
   * True when the graph lays out on the reading-order grid with no dagre: no groups, two or
   * more shapes, and no two shapes on one rank (forward lines only, in authored order).
   */
  isChain(model: GraphModel): boolean;
  simplify(pts: Point[]): Point[];
  stats: KernelStats;
}

export type KernelFactory = () => GraphKernel;
