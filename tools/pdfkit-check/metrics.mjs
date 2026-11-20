/**
 * tools/pdfkit-check/metrics.mjs — the two measures the `pdf-pdfkit` suite (check.mjs) fails on, kept pure so a unit test
 * can show each one failing on a synthetic picture (test/unit/tools/pdfkit-check.test.js).
 *
 * Images are `{ width, height, data }` with RGBA bytes, as pngjs reads them.
 */

/** Tile size for `worstTile`: large enough to average away text anti-aliasing, small enough to see a missing box. */
export const TILE = 32;

/**
 * Where `worstTile` is, for the log: the tile's corner, both images' mean color in it, its difference, and the mean SIGNED
 * difference (a minus b) per channel over the whole image. A color-management shift moves every tile one way; a dropped
 * mask moves one region.
 * @returns {{ worst: number, x: number, y: number, a: number[], b: number[], meanDiff: number[] }}
 */
export function worstTileAt(a, b, tile = TILE) {
	const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
	const best = { worst: -1, x: 0, y: 0, a: [0, 0, 0], b: [0, 0, 0] };
	const total = [0, 0, 0];
	let tiles = 0;
	for (let ty = 0; ty + tile <= h; ty += tile) {
		for (let tx = 0; tx + tile <= w; tx += tile) {
			const sa = [0, 0, 0], sb = [0, 0, 0];
			for (let y = ty; y < ty + tile; y++) {
				for (let x = tx; x < tx + tile; x++) {
					const i = (y * a.width + x) * 4, j = (y * b.width + x) * 4;
					for (let k = 0; k < 3; k++) { sa[k] += a.data[i + k]; sb[k] += b.data[j + k]; }
				}
			}
			const n = tile * tile;
			const ma = sa.map((v) => v / n), mb = sb.map((v) => v / n);
			for (let k = 0; k < 3; k++) total[k] += ma[k] - mb[k];
			tiles++;
			const d = Math.max(...ma.map((v, k) => Math.abs(v - mb[k])));
			if (d > best.worst) Object.assign(best, { worst: d, x: tx, y: ty, a: ma, b: mb });
		}
	}
	return { ...best, worst: Math.max(0, best.worst), meanDiff: total.map((v) => (tiles ? v / tiles : 0)) };
}

/**
 * The worst 32 px tile: the largest difference, over tiles, between the two images' mean color in that tile (the largest
 * channel). A viewer that drops a soft mask paints a box of solid color, or leaves a fade out: one region far off while
 * the slide's mean barely moves. Text drawn with different anti-aliasing averages out inside a tile.
 */
export function worstTile(a, b, tile = TILE) {
	const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
	let worst = 0;
	for (let ty = 0; ty + tile <= h; ty += tile) {
		for (let tx = 0; tx + tile <= w; tx += tile) {
			const sa = [0, 0, 0], sb = [0, 0, 0];
			for (let y = ty; y < ty + tile; y++) {
				for (let x = tx; x < tx + tile; x++) {
					const i = (y * a.width + x) * 4, j = (y * b.width + x) * 4;
					for (let k = 0; k < 3; k++) { sa[k] += a.data[i + k]; sb[k] += b.data[j + k]; }
				}
			}
			const n = tile * tile;
			worst = Math.max(worst, ...sa.map((v, k) => Math.abs(v - sb[k]) / n));
		}
	}
	return worst;
}

/**
 * Blockiness of a patch: the mean absolute step between horizontal neighbors along each row (the darkest channel), over
 * rows whose own range is small (no text or rule crosses them). A glow scaled smoothly steps by under a level; one drawn
 * nearest-neighbor from a quarter-resolution picture holds flat and then jumps at every block edge. Measured on the
 * step SIZES, not their sum: `stepsAbove(1)` is the share of neighbor steps larger than one level.
 */
export function blockiness(img, x0, y0, w, h) {
	let big = 0, n = 0;
	for (let y = y0; y < y0 + h; y++) {
		const row = [];
		for (let x = x0; x < x0 + w; x++) {
			const i = (y * img.width + x) * 4;
			row.push(Math.min(img.data[i], img.data[i + 1], img.data[i + 2]));
		}
		if (Math.max(...row) - Math.min(...row) > 24) continue; // something sharp crosses this row
		for (let k = 1; k < row.length; k++) {
			if (Math.abs(row[k] - row[k - 1]) > 1) big++;
			n++;
		}
	}
	return n ? big / n : 0;
}
