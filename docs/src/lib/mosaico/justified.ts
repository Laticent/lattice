/**
 * The `rows` strategy with the `justified` goal: break an ordered list of fixed-shape items into rows
 * that each fill the width exactly, every item in a row at the same height, as `justified-layout`
 * does (engineering/decisions/2026-10-16-mosaico-layout-library.md §4.4).
 *
 * Units: the container is 1 wide and grows downward, so every length is a fraction of its width. The
 * height is an output.
 *
 * A row of items i..j at gap `g` has the one height `(1 - (m - 1)·g) / Σ aspect`, which makes its items
 * and gaps add to exactly the width. Dynamic programming over break points picks the breaks that keep
 * every row closest to `targetHeight` (least sum of squared differences), so a row that comes out too
 * tall (too few items) and one too short (too many) both cost. The last row is not stretched: it keeps
 * `targetHeight`, or less when its items would not fill the width at that height anyway, and sits by
 * `lastRow`. Deterministic: ties keep the earliest break.
 */

import type { Align, Rect } from './types.js';

export interface JustifiedOptions {
  /** Gap between items in a row, as a fraction of the width. */
  gap: number;
  /** Gap between rows, as a fraction of the width. */
  rowGap: number;
  /** The row height to aim for, as a fraction of the width. */
  targetHeight: number;
  /** Most items in one row. */
  maxPerRow: number;
  /** How the last row sits across the width when it is shorter than the width. */
  lastRow: Align;
}

export interface JustifiedChoice {
  rects: Rect[];
  rows: number[][];
  /** Total height of the layout. */
  height: number;
  /** DP cells evaluated. */
  steps: number;
}

const FIT = 1e-12;
// A row shorter than this share of the target is never worth its cost: stop widening it. It also keeps the DP
// linear in the item count for long lists.
const SHORTEST_ROW = 0.2;

export function chooseJustified(aspects: number[], o: JustifiedOptions): JustifiedChoice | null {
  const n = aspects.length;
  if (!n) return null;
  const cost = new Array<number>(n + 1).fill(Infinity);
  const from = new Array<number>(n + 1).fill(-1);
  cost[0] = 0;
  let steps = 0;
  for (let j = 1; j <= n; j++) {
    let sum = 0;
    for (let i = j - 1; i >= 0 && j - i <= o.maxPerRow; i--) {
      sum += aspects[i];
      const m = j - i;
      const room = 1 - (m - 1) * o.gap;
      if (!(room > FIT)) break;
      const h = room / sum;
      if (h < o.targetHeight * SHORTEST_ROW && m > 1) break;
      steps++;
      if (cost[i] === Infinity) continue;
      // The last row is not stretched: only a row that would be SHORTER than the target costs anything.
      const d = j === n ? Math.min(0, h - o.targetHeight) : h - o.targetHeight;
      const c = cost[i] + d * d;
      if (c < cost[j] - FIT) {
        cost[j] = c;
        from[j] = i;
      }
    }
  }
  if (cost[n] === Infinity) return null;
  const rows: number[][] = [];
  for (let j = n; j > 0; j = from[j]) {
    const i = from[j];
    rows.unshift(Array.from({ length: j - i }, (_, k) => i + k));
  }
  const rects: Rect[] = new Array(n);
  let y = 0;
  rows.forEach((row, r) => {
    if (r > 0) y += o.rowGap;
    const sum = row.reduce((s, i) => s + aspects[i], 0);
    const full = (1 - (row.length - 1) * o.gap) / sum;
    const last = r === rows.length - 1;
    const h = last ? Math.min(full, o.targetHeight) : full;
    const used = sum * h + (row.length - 1) * o.gap;
    const slack = 1 - used;
    const align: Align = last ? o.lastRow : 'start';
    let x = align === 'center' ? slack / 2 : align === 'end' ? slack : 0;
    for (const i of row) {
      rects[i] = { x, y, w: aspects[i] * h, h };
      x += aspects[i] * h + o.gap;
    }
    y += h;
  });
  return { rects, rows, height: y, steps };
}
