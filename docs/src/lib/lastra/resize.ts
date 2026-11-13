// resize — Lanczos-3, the one downscale Lattice's slide camera trusts for a photograph.
//
// A browser's canvas scales with a bilinear filter, or mipmaps and a cubic at `imageSmoothingQuality = 'high'`, and the
// camera's first shrink (halving steps, each a 2x2 average, then one bilinear step) kept 35 to 47% of the fine detail a
// Lanczos resize keeps (Laplacian variance against the original resized with Lanczos, three photos;
// engineering/decisions/2026-11-03-pictures-at-drawn-size.md). A photo came out visibly softer than the original. This is
// the reference filter, written out: separable, two passes, the kernel widened by the scale so every source pixel counts.
//
// STREAMED, for a phone. The source is read in strips through `readRows` (the camera reads 64 rows at a time off a scratch
// canvas, never a 48 MB copy of a 12-megapixel photo), each source row is resized across once, and only the rows the vertical
// filter still needs are kept: a few dozen rows of the OUTPUT's width, not a source-tall buffer.
//
// Pure: RGBA bytes in, RGBA bytes out, no DOM. Colors are weighted by alpha, so a transparent pixel lends no color to its
// neighbors (no dark halo at a transparent edge).

/** RGBA bytes, 4 a pixel, row after row. */
export type Pixels = Uint8ClampedArray | Uint8Array;
/** Returns source rows `y` to `y + n - 1`: `n * width * 4` RGBA bytes. */
export type RowReader = (y: number, n: number) => Pixels;
/** One output index: the first source index it reads and the normalized weights of the source pixels from there. */
export interface LanczosTap {
	first: number;
	w: Float32Array;
}

const LANCZOS_LOBES = 3;

function lanczosSinc(x: number): number {
	if (x === 0) return 1;
	const p = Math.PI * x;
	return Math.sin(p) / p;
}

/** For each output index, the first source index and the normalized weights of the source pixels it reads. */
export function lanczosWeights(srcLen: number, dstLen: number): LanczosTap[] {
	const scale = srcLen / dstLen;
	const stretch = Math.max(1, scale);
	const support = LANCZOS_LOBES * stretch;
	const out: LanczosTap[] = new Array(dstLen);
	for (let i = 0; i < dstLen; i++) {
		const center = (i + 0.5) * scale;
		const first = Math.max(0, Math.floor(center - support));
		const last = Math.min(srcLen - 1, Math.ceil(center + support) - 1);
		const w = new Float32Array(last - first + 1);
		let sum = 0;
		for (let j = first; j <= last; j++) {
			const x = (j + 0.5 - center) / stretch;
			const v = Math.abs(x) < LANCZOS_LOBES ? lanczosSinc(x) * lanczosSinc(x / LANCZOS_LOBES) : 0;
			w[j - first] = v;
			sum += v;
		}
		if (sum !== 0) for (let k = 0; k < w.length; k++) w[k] /= sum;
		out[i] = { first, w };
	}
	return out;
}

/**
 * Resize RGBA pixels to `dw` x `dh` with a Lanczos-3 filter.
 * @param {Uint8ClampedArray|Uint8Array|((y: number, n: number) => Uint8ClampedArray|Uint8Array)} src  RGBA bytes, `sw * sh * 4`
 *   of them, or a reader that returns rows `y` to `y + n - 1` (`n * sw * 4` bytes)
 * @param {number} sw @param {number} sh
 * @param {number} dw @param {number} dh
 * @param {number} [strip]  rows per read, for a reader
 * @returns {Uint8ClampedArray}  RGBA, `dw * dh * 4` bytes
 */
export function lanczosResize(src: Pixels | RowReader, sw: number, sh: number, dw: number, dh: number, strip = 64): Uint8ClampedArray {
	const readRows: RowReader = typeof src === 'function' ? src : (y, n) => src.subarray(y * sw * 4, (y + n) * sw * 4);
	const hx = lanczosWeights(sw, dw);
	const vy = lanczosWeights(sh, dh);
	// Resized-across source rows, premultiplied, by source row index; dropped once no later output row reads them.
	const rows = new Map<number, Float32Array>();
	let block: Pixels | null = null;
	let blockY = 0;
	let blockN = 0;
	const across = (y: number): Float32Array => {
		let row = rows.get(y);
		if (row) return row;
		if (!block || y < blockY || y >= blockY + blockN) {
			blockY = y;
			blockN = Math.min(strip, sh - y);
			block = readRows(blockY, blockN);
		}
		const base = (y - blockY) * sw * 4;
		row = new Float32Array(dw * 4);
		for (let x = 0; x < dw; x++) {
			const { first, w } = hx[x];
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			for (let k = 0; k < w.length; k++) {
				const p = base + (first + k) * 4;
				const al = block[p + 3] * w[k];
				r += block[p] * al;
				g += block[p + 1] * al;
				b += block[p + 2] * al;
				a += al;
			}
			const o = x * 4;
			row[o] = r;
			row[o + 1] = g;
			row[o + 2] = b;
			row[o + 3] = a;
		}
		rows.set(y, row);
		return row;
	};
	const out = new Uint8ClampedArray(dw * dh * 4);
	for (let y = 0; y < dh; y++) {
		const { first, w } = vy[y];
		for (const k of rows.keys()) if (k < first) rows.delete(k);
		const src0 = Array.from(w, (_v, k) => across(first + k));
		const o0 = y * dw * 4;
		for (let x = 0; x < dw * 4; x += 4) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			for (let k = 0; k < w.length; k++) {
				const row = src0[k];
				const wk = w[k];
				r += row[x] * wk;
				g += row[x + 1] * wk;
				b += row[x + 2] * wk;
				a += row[x + 3] * wk;
			}
			const o = o0 + x;
			// Under half a level of alpha the pixel rounds to transparent, and its color is filter ringing: leave it 0.
			if (a >= 0.5) {
				out[o] = r / a;
				out[o + 1] = g / a;
				out[o + 2] = b / a;
			}
			out[o + 3] = a;
		}
	}
	return out;
}
