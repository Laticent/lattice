/**
 * Trama — the graph-chart library: a layout kernel and route solver, and the browser
 * pipeline that measures, fits, lays out and paints a graph chart through an adapter,
 * and a radial kernel (one center, a ring or two around it, labels placed clear).
 * Design: engineering/decisions/2026-09-27-trama-graph-chart-library.md and
 * engineering/decisions/2026-10-05-trama-radial-layout.md.
 */
export { graphLayoutKernel } from './kernel';
export type { AdapterFactory, GraphAdapter, GraphContext, GraphParts, Measured, PassOptions, RectLike } from './pipeline';
export { installGraphPass } from './pipeline';
export type { CenterRung, LabelBox, LabelItem, LabelStage, PlacedLabel, RadialKernel, RadialObstacle, RadialPoint, RadialRadius, RadialRect, StarResult, StarSpec, TwoRingGeometry, TwoRingNode, TwoRingSpec } from './radial';
export { radialLayoutKernel } from './radial';
export type * from './types';
