/**
 * Measured packing: how many of a split slide's members ride each body page. Pure: measured
 * heights in, page sizes out, with no DOM. The host measures each member at the box and venue it
 * renders at, and the room a body page leaves for members once its chrome is placed; the cover
 * and the closing page are the host's and are never packed here.
 *
 * Three packers, kept side by side for the bake-off the owner asked for
 * (engineering/decisions/2026-10-28-fit-everywhere-model.md §16):
 *
 * - `greedy`: first fit, in order. Fills a page until the next member would not fit. The control.
 * - `balanced`: the greedy page count, then the contiguous split of that many pages that
 *   minimizes the fullest page, so the room left over is shared.
 * - `knuth-plass`: total fit. Every break is scored together, as TeX breaks paragraphs: a page
 *   costs a fixed amount, weighed against how far its fill lands from the target band; its
 *   fill costs cubic badness outside the target band and a small pull to the band's middle
 *   inside it; a lone member on a page costs a widow penalty, doubled before the last page;
 *   and a page may not end on a member the host marks `keepWithNext` (a heading that
 *   introduces the next member). When no packing can honor every `keepWithNext`, the greedy
 *   packing is returned, which ignores it.
 *
 * Every packer keeps reading order, puts every member on exactly one page, and never returns a
 * page whose members overflow `capacity`. When one member alone is taller than `capacity`, no
 * packing exists and the result is `null`: the host rescues that member or the slide rings.
 */

export type Packer = 'greedy' | 'balanced' | 'knuth-plass';

export interface PackInput {
	/** Each member's measured height, in px, in reading order. */
	heights: readonly number[];
	/** The vertical gap between two members on one page, in px. */
	gap: number;
	/** The height a body page leaves for members, in px: what a page's FILL is scored against. */
	capacity: number;
	/**
	 * The most a page may hold, in px, when the host keeps a safety margin below `capacity` (the
	 * measured split packs to 90% of the room). Defaults to `capacity`. Kept apart from `capacity` so
	 * the margin limits a page without also making a page that fits look crowded: scored against the
	 * reduced room, six members filling 88% of a page read as 97%, and two pages at 35% and 50% beat
	 * the one page they fit on (fit-everywhere-model.md §17).
	 */
	limit?: number;
	/** Members that must not end a page (index → true). */
	keepWithNext?: readonly boolean[];
}

/** The fill band a page should land in, as a share of `capacity` (the owner's 60 to 85%). */
export const FILL_BAND = { lo: 0.6, hi: 0.85 } as const;

/**
 * The fixed cost of a page, the price of each extra page against fill. A page is (PAGE_COST +
 * badness)², so a page costs 900 before its fill is scored. With that weight, a slightly crowded
 * page (94% full) beats an extra in-band page, and a page full to the edge does not: thirty
 * equal members at 100% a page pack as four in-band pages, not three full ones. The bake-off
 * decides whether that trade reads better (2026-10-28-fit-everywhere-model.md §16).
 */
const PAGE_COST = 30;
/**
 * A lone member on a page. On the last page it reads as the run's tail; on any earlier page it
 * reads as a stray, so it costs twice as much there: three members that cannot share one page
 * pack as 2 + 1, not 1 + 2, and five as 2 + 2 + 1, not 2 + 1 + 2 (the bake-off's judge, §16).
 */
const WIDOW = 3000;
const ORPHAN = 2 * WIDOW;
const FORBIDDEN = Number.POSITIVE_INFINITY;

/** Running totals, so a page's height is one subtraction. */
function prefix(h: readonly number[]): number[] {
	const p = [0];
	for (let i = 0; i < h.length; i++) p.push(p[i] + h[i]);
	return p;
}

/** The height of members `from` to `to - 1` on one page. */
function loadOf(p: readonly number[], gap: number, from: number, to: number): number {
	return p[to] - p[from] + gap * Math.max(0, to - from - 1);
}


function valid(input: PackInput): boolean {
	const { heights, gap, capacity } = input;
	if (!Array.isArray(heights) || heights.length === 0) return false;
	if (!(capacity > 0) || !(gap >= 0)) return false;
	return heights.every((x) => Number.isFinite(x) && x >= 0);
}

function greedy(input: PackInput): number[] | null {
	const { heights: h, gap } = input;
	const capacity = input.limit ?? input.capacity;
	const p = prefix(h);
	const sizes: number[] = [];
	let i = 0;
	while (i < h.length) {
		if (h[i] > capacity) return null;
		let j = i + 1;
		while (j < h.length && loadOf(p, gap, i, j + 1) <= capacity) j++;
		sizes.push(j - i);
		i = j;
	}
	return sizes;
}

/**
 * The contiguous split into exactly `k` pages that minimizes the fullest page (ties go to the
 * first such split found). Exact dynamic programming: a split slide holds tens of members, so
 * O(n² k) is well under a millisecond.
 */
function balanced(input: PackInput): number[] | null {
	const g = greedy(input);
	if (!g) return null;
	const { heights: h, gap } = input;
	const capacity = input.limit ?? input.capacity;
	const n = h.length;
	const k = g.length;
	if (k === 1) return g;
	const pre = prefix(h);
	// best[p][i]: the fullest page of the best split of the first i members into p pages.
	const best: number[][] = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(FORBIDDEN));
	const from: number[][] = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(-1));
	best[0][0] = 0;
	for (let p = 1; p <= k; p++) {
		for (let i = p; i <= n; i++) {
			for (let j = i - 1; j >= p - 1; j--) {
				const l = loadOf(pre, gap, j, i);
				if (l > capacity) break;
				if (best[p - 1][j] === FORBIDDEN) continue;
				const worst = Math.max(best[p - 1][j], l);
				if (worst < best[p][i]) {
					best[p][i] = worst;
					from[p][i] = j;
				}
			}
		}
	}
	if (best[k][n] === FORBIDDEN) return g;
	const sizes: number[] = [];
	for (let p = k, i = n; p > 0; p--) {
		const j = from[p][i];
		sizes.unshift(i - j);
		i = j;
	}
	return sizes;
}

/**
 * Badness of one page's fill. Outside the band it is cubic: an under-full page costs up to 100,
 * because it reads as empty, and an over-full page that still fits costs at most 30, because it
 * is crowded but whole. Inside the band a small quadratic pull toward the band's middle (at most
 * 2) makes the packer prefer even pages over one full and one sparse.
 */
export function badness(fill: number): number {
	const { lo, hi } = FILL_BAND;
	if (fill < lo) return 100 * ((lo - fill) / lo) ** 3;
	if (fill > hi) return 30 * Math.min(1, (fill - hi) / (1 - hi)) ** 3;
	const mid = (lo + hi) / 2;
	return 2 * ((fill - mid) / ((hi - lo) / 2)) ** 2;
}

function knuthPlass(input: PackInput): number[] | null {
	const { heights: h, gap, capacity, keepWithNext } = input;
	const limit = input.limit ?? capacity;
	const n = h.length;
	if (h.some((x) => x > limit)) return null;
	const pre = prefix(h);
	const cost = new Array(n + 1).fill(FORBIDDEN);
	const prev = new Array(n + 1).fill(-1);
	cost[0] = 0;
	for (let i = 1; i <= n; i++) {
		for (let j = i - 1; j >= 0; j--) {
			const l = loadOf(pre, gap, j, i);
			if (l > limit) break;
			if (cost[j] === FORBIDDEN) continue;
			// A page may not end on a member that introduces the next one (the last page may).
			if (i < n && keepWithNext?.[i - 1]) continue;
			let d = (PAGE_COST + badness(l / capacity)) ** 2;
			if (i - j === 1 && n > 1) d += i === n ? WIDOW : ORPHAN;
			if (cost[j] + d < cost[i]) {
				cost[i] = cost[j] + d;
				prev[i] = j;
			}
		}
	}
	if (cost[n] === FORBIDDEN) return greedy(input);
	const sizes: number[] = [];
	for (let i = n; i > 0; i = prev[i]) sizes.unshift(i - prev[i]);
	return sizes;
}

/**
 * Pack a split slide's members onto body pages. Returns the number of members on each page, in
 * reading order, or `null` when no packing exists (bad input, or a member taller than a page).
 */
export function pack(input: PackInput, packer: Packer = 'knuth-plass'): number[] | null {
	if (!valid(input)) return null;
	if (packer === 'greedy') return greedy(input);
	if (packer === 'balanced') return balanced(input);
	return knuthPlass(input);
}

/** Each page's fill, as a share of `capacity`, for a packing `pack` returned. */
export function fills(input: PackInput, sizes: readonly number[]): number[] {
	const pre = prefix(input.heights);
	const out: number[] = [];
	let i = 0;
	for (const s of sizes) {
		out.push(loadOf(pre, input.gap, i, i + s) / input.capacity);
		i += s;
	}
	return out;
}
