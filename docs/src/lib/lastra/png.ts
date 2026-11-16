/**
 * png — the PNG writer, and a PNG's own compressed pixels for a PDF.
 *
 * WRITER. A browser's `canvas.toBlob('image/png')` compresses lightly (a 52-slide deck came out 40% larger than Chrome's own
 * screenshot encoder wrote it). `encodePng` writes the same pixels with a per-row adaptive filter and the platform's deflate
 * (`CompressionStream`, which every target browser and Node 18+ have: a platform API, not a dependency): opaque pictures as
 * 8-bit RGB (3 bytes a pixel, which a PDF can carry as it is, see `rgbPngIdat`), pictures with transparency as RGBA. It reads
 * the pixels a band at a time through `readRows`, so it never holds the whole picture.
 *
 * IDAT. An 8-bit RGB, non-interlaced PNG is a zlib stream of scanlines each led by its filter byte, and a PDF reads exactly
 * that under `/FlateDecode` with `/Predictor 15`. So a PDF writer can carry the PNG's compressed bytes as they are instead of
 * decoding and compressing them again (Lattice's PDF export and printed sheet both do: 51 s of a 50-slide print went to that
 * round trip). Any other PNG (alpha, a palette, 16-bit, interlaced) answers null.
 */

import type { Pixels } from './resize.js';

/** Reads rows `y0` to `y0 + rows - 1` of the picture: `rows * width * 4` RGBA bytes. */
export type PngRowReader = (y0: number, rows: number) => Pixels;

// The slice of the platform's CompressionStream this uses, written out so the library needs neither the DOM's types nor
// Node's: the stream is found on globalThis at run time.
interface DeflateStream {
	writable: { getWriter(): { write(chunk: Uint8Array): Promise<void>; close(): Promise<void>; abort(reason?: unknown): Promise<void> } };
	readable: { getReader(): { read(): Promise<{ done: true; value?: undefined } | { done: false; value: Uint8Array }> } };
}
type DeflateCtor = new (format: 'deflate') => DeflateStream;

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
export function crc32(bytes: ArrayLike<number>, start = 0, end = bytes.length): number {
	let c = 0xffffffff;
	for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** Rows read, filtered and deflated at a time: the encoder holds a band, never the whole picture (a 4K slide is 33 MB of pixels). */
export const PNG_BAND = 64;

/**
 * PNG bytes for a picture `width` x `height`, its RGBA rows read through `readRows`, a band of `PNG_BAND` rows at a time.
 * Opaque pixels write an RGB file; one pixel that is not fully opaque ends that attempt and the rows are read again for RGBA.
 * `fast`: the Sub filter on every row, no search: about 3x quicker and larger, for test suites that write hundreds.
 * Throws a TypeError where the platform has no `CompressionStream` (Safari before 16.4): the host then keeps its own encoder.
 */
export async function encodePng(width: number, height: number, readRows: PngRowReader, { fast = false }: { fast?: boolean } = {}): Promise<Uint8Array> {
	const Deflate = (globalThis as { CompressionStream?: DeflateCtor }).CompressionStream;
	if (typeof Deflate !== 'function') throw new TypeError('png: this platform has no CompressionStream');
	const W = width;
	const H = height;
	// Opaque first (nearly every slide): one pass over the pixels. A pixel with alpha found on the way ends that attempt and the RGBA one starts.
	const attempt = async (opaque: boolean): Promise<Uint8Array | null> => {
		const bpp = opaque ? 3 : 4;
		const stride = W * bpp;
		// Deflate as the bands arrive; the output is read at the same time so a full pipe never stalls the writer.
		const cs = new Deflate('deflate');
		const writer = cs.writable.getWriter();
		const pieces: Uint8Array[] = [];
		const reading = (async () => {
			const r = cs.readable.getReader();
			for (;;) {
				const { done, value } = await r.read();
				if (done) return;
				pieces.push(value);
			}
		})();
		let row = new Uint8Array(stride);
		let up = new Uint8Array(stride);
		for (let y0 = 0; y0 < H; y0 += PNG_BAND) {
			const rows = Math.min(PNG_BAND, H - y0);
			const d = readRows(y0, rows);
			const out = new Uint8Array((stride + 1) * rows);
			for (let r = 0; r < rows; r++) {
				if (opaque) {
						for (let i = r * W * 4, o = 0, end = i + W * 4; i < end; i += 4) {
							if (d[i + 3] !== 255) {
								writer.abort().catch(() => {});
								reading.catch(() => {});
								return null;
							}
							row[o++] = d[i];
							row[o++] = d[i + 1];
							row[o++] = d[i + 2];
						}
					}
				else row.set(d.subarray(r * stride, (r + 1) * stride));
				// Pick the filter with the smallest sum of absolute (signed) residuals, all five in ONE pass over the row.
				// `fast`: Sub for every row, no search: about 3x quicker and larger, for the test suites that render hundreds of decks.
				let best: number;
					if (fast) best = 1;
				else {
					let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
					for (let x = 0; x < stride; x++) {
						const v = row[x];
						const a = x >= bpp ? row[x - bpp] : 0;
						const b = up[x];
						const c = x >= bpp ? up[x - bpp] : 0;
						const p = a + b - c;
						const pa = Math.abs(p - a);
						const pb = Math.abs(p - b);
						const pc = Math.abs(p - c);
						const e0 = v;
						const e1 = (v - a) & 0xff;
						const e2 = (v - b) & 0xff;
						const e3 = (v - ((a + b) >> 1)) & 0xff;
						const e4 = (v - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
						s0 += e0 < 128 ? e0 : 256 - e0;
						s1 += e1 < 128 ? e1 : 256 - e1;
						s2 += e2 < 128 ? e2 : 256 - e2;
						s3 += e3 < 128 ? e3 : 256 - e3;
						s4 += e4 < 128 ? e4 : 256 - e4;
					}
					let bestSum = s0;
					best = 0;
					if (s1 < bestSum) { bestSum = s1; best = 1; }
					if (s2 < bestSum) { bestSum = s2; best = 2; }
					if (s3 < bestSum) { bestSum = s3; best = 3; }
					if (s4 < bestSum) best = 4;
				}
				const at = r * (stride + 1);
				out[at] = best;
				for (let x = 0; x < stride; x++) {
					const v = row[x];
					const a = x >= bpp ? row[x - bpp] : 0;
					const b = up[x];
					let e: number;
					if (best === 0) e = v;
					else if (best === 1) e = v - a;
					else if (best === 2) e = v - b;
					else if (best === 3) e = v - ((a + b) >> 1);
					else {
						const c = x >= bpp ? up[x - bpp] : 0;
						const p = a + b - c;
						const pa = Math.abs(p - a);
						const pb = Math.abs(p - b);
						const pc = Math.abs(p - c);
						e = v - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
					}
					out[at + 1 + x] = e;
				}
				const t = up;
				up = row;
				row = t;
			}
			await writer.write(out);
		}
		await writer.close();
		await reading;
		const idat = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
		let off = 0;
		for (const p of pieces) { idat.set(p, off); off += p.length; }
		const chunk = (type: string, data: Uint8Array) => {
			const b = new Uint8Array(12 + data.length);
			const dv = new DataView(b.buffer);
			dv.setUint32(0, data.length);
			for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
			b.set(data, 8);
			dv.setUint32(8 + data.length, crc32(b, 4, 8 + data.length));
			return b;
		};
		const ihdr = new Uint8Array(13);
		const dv = new DataView(ihdr.buffer);
		dv.setUint32(0, W);
		dv.setUint32(4, H);
		ihdr[8] = 8;
		ihdr[9] = opaque ? 2 : 6;
		const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
		const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
		let at = 0;
		for (const p of parts) { png.set(p, at); at += p.length; }

		return png;
	};
	return (await attempt(true)) ?? ((await attempt(false)) as Uint8Array);
}

/**
 * An 8-bit RGB, non-interlaced PNG's size and its concatenated IDAT bytes (the zlib stream), or null for any other PNG
 * or anything that is not one.
 */
export function rgbPngIdat(bytes: Uint8Array): { width: number; height: number; data: Uint8Array } | null {
	const u32 = (o: number) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
	const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	if (!bytes || bytes.length < 33 || SIG.some((b, i) => bytes[i] !== b)) return null;
	const width = u32(16);
	const height = u32(20);
	// Bit depth 8, color type 2 (RGB), deflate, adaptive filtering, no interlace.
	if (bytes[24] !== 8 || bytes[25] !== 2 || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) return null;
	const parts: Uint8Array[] = [];
	let len = 0;
	for (let at = 8; at + 8 <= bytes.length; ) {
		const n = u32(at);
		const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
		if (type === 'IDAT') {
			parts.push(bytes.subarray(at + 8, at + 8 + n));
			len += n;
		}
		if (type === 'IEND') break;
		at += 12 + n;
	}
	if (!len) return null;
	const data = new Uint8Array(len);
	let o = 0;
	for (const p of parts) {
		data.set(p, o);
		o += p.length;
	}
	return { width, height, data };
}
