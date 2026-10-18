/**
 * The `rows` strategy with the `equal-weight` goal: break an ordered list of fixed-shape items into
 * centered rows, every item at the same area unless that would make it taller than a cap
 * (engineering/decisions/2026-10-16-mosaico-layout-library.md §4.3, §4.4, §9 decision 6).
 *
 * Units: the container is 1 wide and grows downward, so every length is a fraction of its width.
 *
 * Each item sits in a cell. A cell is at least `minCell` wide (a host that wants a column rhythm
 * passes its column width) and at least as wide as its item; the item is centered in it. A row
 * holds at most `maxPerRow` cells, and its cells and gaps fit the width.
 *
 * Each row sits by `align` (centered by default); `justify` spreads its leftover width into its
 * gaps. The placement never changes the breaks.
 *
 * The area. Equal area makes a tall item tall, so the area is capped first: the largest area at
 * which an item of aspect max(narrowest aspect, aspectFloor) is exactly `heightCap` tall, and never
 * more than a square at the cap, unless the host passes its own `area`. An item narrower than `aspectFloor`
 * is held at the cap and gets less area; that is what the cap is for, so one 1:5 crest does not
 * shrink a whole wall.
 *
 * Then the layout must fit: at most `maxRows` rows, standing at most `maxHeight` tall. When it
 * does not, the tall items give way first: the cap falls toward `minHeightCap` with the area
 * held. Only if that is not enough does every item's area shrink, with the cap at its floor.
 * Both are bisections. Every answer they return fits, because a value is kept only after it
 * passed. It is the largest fitting value whenever fitting is monotone, which holds for the row
 * count (no cell widens as the cap or the area falls) but not strictly for the height: the most
 * even breaks can regroup the rows as the cells shrink, and the regrouped rows can stand taller.
 *
 * The breaks. Dynamic programming over break points picks the fewest rows, then the most even
 * ones (least sum of squared leftover width), so ten items at four a row break 4/3/3 rather than
 * leaving an orphan pair. Deterministic: ties keep the earliest break.
 */

import type { Align, Rect } from './types.js';

export interface RowsOptions {
  /** Gap between cells in a row, as a fraction of the width. */
  gap: number;
  /** Gap between rows, as a fraction of the width (placement only; it never changes the breaks). */
  rowGap: number;
  /** The tallest an item may be, as a fraction of the width. */
  heightCap: number;
  /** The lowest the cap may fall to make the layout fit before areas shrink (≤ heightCap). */
  minHeightCap: number;
  /** The area to start from, or NaN to derive it from the cap (see PackOptions.area). */
  area: number;
  maxPerRow: number;
  maxRows: number;
  /** The tallest the whole layout may be, rows and row gaps, as a fraction of the width. */
  maxHeight: number;
  /** The narrowest cell, as a fraction of the width. */
  minCell: number;
  /** Items narrower than this aspect are held at the height cap rather than shrinking the wall. */
  aspectFloor: number;
  /** How each row but the last sits across the width (placement only). */
  align: Align;
  /** How the last row sits. */
  lastRow: Align;
}

export interface RowsChoice {
  /** The area every item gets unless the cap holds it. */
  area: number;
  /** Item boxes, centered in their cells, each row placed by `align`. */
  rects: Rect[];
  /** Cell boxes: the item's box widened to the cell, as tall as its row. */
  cells: Rect[];
  /** Item indices per row, in order. */
  rows: number[][];
  /** Total height of the layout. */
  height: number;
  /** The height cap the layout settled on. */
  cap: number;
  /** Bisection steps taken to fit (0 when the first try fit). */
  steps: number;
}

const FIT = 1e-12; // a row may overshoot the width by rounding only
const BISECT_STEPS = 48;

function sizes(aspects: number[], area: number, cap: number, minCell: number): { w: number[]; h: number[]; cell: number[] } {
  const w: number[] = [];
  const h: number[] = [];
  const cell: number[] = [];
  for (const a of aspects) {
    const hi = Math.min(cap, Math.sqrt(area / a));
    const wi = a * hi;
    w.push(wi);
    h.push(hi);
    cell.push(Math.max(minCell, wi));
  }
  return { w, h, cell };
}

// Fewest rows, then least sum of squared slack. Returns the breaks as item index lists, or null
// when some cell is wider than the container.
function breakRows(cell: number[], gap: number, maxPerRow: number): number[][] | null {
  const n = cell.length;
  const rows = new Array<number>(n + 1).fill(Infinity);
  const cost = new Array<number>(n + 1).fill(Infinity);
  const from = new Array<number>(n + 1).fill(-1);
  rows[0] = 0;
  cost[0] = 0;
  for (let j = 1; j <= n; j++) {
    let used = -gap;
    for (let i = j - 1; i >= 0 && j - i <= maxPerRow; i--) {
      used += cell[i] + gap;
      if (used > 1 + FIT) break;
      if (rows[i] === Infinity) continue;
      const slack = Math.max(0, 1 - used);
      const r = rows[i] + 1;
      const c = cost[i] + slack * slack;
      // Strictly better only, scanning the longest last row first: ties keep the earliest break.
      if (r < rows[j] || (r === rows[j] && c < cost[j] - FIT)) {
        rows[j] = r;
        cost[j] = c;
        from[j] = i;
      }
    }
  }
  if (rows[n] === Infinity) return null;
  const out: number[][] = [];
  for (let j = n; j > 0; j = from[j]) {
    const i = from[j];
    out.unshift(Array.from({ length: j - i }, (_, k) => i + k));
  }
  return out;
}

export function chooseRows(aspects: number[], o: RowsOptions): RowsChoice | null {
  const n = aspects.length;
  if (!n) return null;
  const narrowest = Math.min(...aspects);
  const floorCap = Math.min(o.minHeightCap, o.heightCap);
  const fits = (area: number, cap: number): number[][] | null => {
    const { h, cell } = sizes(aspects, area, cap, o.minCell);
    const rows = breakRows(cell, o.gap, o.maxPerRow);
    if (!rows || rows.length > o.maxRows) return null;
    const height = rows.reduce((t, row) => t + Math.max(...row.map((i) => h[i])), 0) + (rows.length - 1) * o.rowGap;
    return height <= o.maxHeight + FIT ? rows : null;
  };
  // Largest x in [lo, hi] with ok(x), given ok(lo) and monotone ok.
  const bisect = (lo: number, hi: number, ok: (x: number) => boolean): number => {
    for (let k = 0; k < BISECT_STEPS; k++) {
      const mid = (lo + hi) / 2;
      if (ok(mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  // Above 1 / narrowest every item is either wider than the container or held by the cap, so a
  // larger area changes nothing; clamping there keeps the bisection's 48 halvings in range.
  let area = Math.min(Number.isNaN(o.area) ? o.heightCap * o.heightCap * Math.min(1, Math.max(narrowest, o.aspectFloor)) : o.area, 1 / narrowest);
  let cap = o.heightCap;
  let rows = fits(area, cap);
  let steps = 0;
  if (!rows && floorCap < cap && fits(area, floorCap)) {
    cap = bisect(floorCap, cap, (c) => fits(area, c) !== null);
    steps += BISECT_STEPS;
    rows = fits(area, cap);
  }
  if (!rows) {
    cap = floorCap;
    // The smallest area makes every cell `minCell` wide and every item a point; if even that
    // does not fit, nothing will.
    if (!fits(0, cap)) return null;
    area = bisect(0, area, (a) => fits(a, cap) !== null);
    steps += BISECT_STEPS;
    rows = fits(area, cap) as number[][];
  }
  // A layout that fits only by shrinking every item to nothing is no layout.
  if (!(area > 0 && cap > 0)) return null;
  const { w, h, cell } = sizes(aspects, area, cap, o.minCell);
  const rects: Rect[] = new Array(n);
  const cells: Rect[] = new Array(n);
  let y = 0;
  rows.forEach((row, r) => {
    if (r > 0) y += o.rowGap;
    const used = row.reduce((s, i) => s + cell[i], 0) + (row.length - 1) * o.gap;
    const rowH = Math.max(...row.map((i) => h[i]));
    let align = r === rows.length - 1 ? o.lastRow : o.align;
    // One cell has no gap to widen: a justified row of one starts at the left edge, as text does.
    if (align === 'justify' && row.length < 2) align = 'start';
    const slack = 1 - used;
    let x = align === 'center' ? slack / 2 : align === 'end' ? slack : 0;
    const step = align === 'justify' ? o.gap + slack / (row.length - 1) : o.gap;
    for (const i of row) {
      cells[i] = { x, y, w: cell[i], h: rowH };
      rects[i] = { x: x + (cell[i] - w[i]) / 2, y: y + (rowH - h[i]) / 2, w: w[i], h: h[i] };
      x += cell[i] + step;
    }
    y += rowH;
  });
  return { area, rects, cells, rows, height: y, cap, steps };
}
