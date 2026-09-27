/**
 * Trama — the graph-chart library: a layout kernel and route solver, and the browser
 * pipeline that measures, fits, lays out and paints a graph chart through an adapter.
 * Design: engineering/decisions/2026-09-27-trama-graph-chart-library.md.
 */
export { graphLayoutKernel } from './kernel';
export type { AdapterFactory, GraphAdapter, GraphContext, GraphParts, Measured, PassOptions, RectLike } from './pipeline';
export { installGraphPass } from './pipeline';
export type * from './types';
