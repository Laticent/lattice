/**
 * The `grid` strategy: uniform cells, and a choice of how many columns
 * (engineering/decisions/2026-10-16-mosaico-layout-library.md §4.4).
 *
 * Every cell is the same size. Each item sits inside its cell, contained: the largest rectangle of its
 * shape that fits, centered. With the container's size known, the column count is the one that makes
 * the items biggest (the largest sum of their areas), ties to fewer columns. A last row that is not full
 * sits by `lastRow`.
 */

import type { Align, Rect } from './types.js';

export interface GridOptions {
  /** Container size inside the padding, in the container's units. */
  width: number;
  /** Container height, or NaN when it is an output (then `columns` is required and `cellAspect` sizes the cells). */
  height: number;
  /** Gap between cells side by side, and between rows, in the container's units. */
  columnGap: number;
  rowGap: number;
  /** A fixed column count, or NaN to choose. */
  columns: number;
  /** Most columns to try when choosing. */
  maxColumns: number;
  /** Cell width / height when the height is an output (default 1). */
  cellAspect: number;
  lastRow: Align;
}

export interface GridChoice {
  columns: number;
  rowsCount: number;
  /** Cells, in item order, in the container's units, from the layout's own origin. */
  cells: Rect[];
  /** Items contained in their cells. */
  items: Rect[];
  /** The layout's size. */
  width: number;
  height: number;
  /** Candidate column counts evaluated. */
  tried: number;
}

function fitIn(cell: Rect, aspect: number): Rect {
  const w = Math.min(cell.w, cell.h * aspect);
  const h = w / aspect;
  return { x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - h) / 2, w, h };
}

export function chooseGrid(aspects: number[], o: GridOptions): GridChoice | null {
  const n = aspects.length;
  if (!n) return null;
  const heightKnown = Number.isFinite(o.height);
  const candidates = Number.isFinite(o.columns) ? [Math.min(n, o.columns)] : Array.from({ length: Math.min(n, o.maxColumns) }, (_, i) => i + 1);
  let best: { c: number; score: number; cw: number; ch: number } | null = null;
  for (const c of candidates) {
    const r = Math.ceil(n / c);
    const cw = (o.width - (c - 1) * o.columnGap) / c;
    const ch = heightKnown ? (o.height - (r - 1) * o.rowGap) / r : cw / o.cellAspect;
    if (!(cw > 0 && ch > 0)) continue;
    let score = 0;
    for (const a of aspects) {
      const w = Math.min(cw, ch * a);
      score += w * (w / a);
    }
    if (!best || score > best.score * (1 + 1e-12)) best = { c, score, cw, ch };
  }
  if (!best) return null;
  const { c, cw, ch } = best;
  const rowsCount = Math.ceil(n / c);
  const cells: Rect[] = [];
  const items: Rect[] = [];
  for (let k = 0; k < n; k++) {
    const row = Math.floor(k / c);
    const col = k % c;
    const inRow = row === rowsCount - 1 ? n - row * c : c;
    const used = inRow * cw + (inRow - 1) * o.columnGap;
    const slack = o.width - used;
    const lead = row === rowsCount - 1 ? (o.lastRow === 'center' ? slack / 2 : o.lastRow === 'end' ? slack : 0) : 0;
    const cell = { x: lead + col * (cw + o.columnGap), y: row * (ch + o.rowGap), w: cw, h: ch };
    cells.push(cell);
    items.push(fitIn(cell, aspects[k]));
  }
  return { columns: c, rowsCount, cells, items, width: o.width, height: rowsCount * ch + (rowsCount - 1) * o.rowGap, tried: candidates.length };
}
