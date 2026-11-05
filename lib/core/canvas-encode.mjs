// lib/core/canvas-encode.mjs — the export's picture WRITERS: a canvas's bytes as PNG (the shared PNG writer) or JPEG (the
// shared JPEG writer, lib/core/jpeg-encode.mjs). Both hosts encode through here, so no picture's bytes depend on the browser
// that drew it. It lives apart from the camera (lib/core/slide-camera.mjs, which re-exports it) so the Studio's
// picture-encode worker, which only encodes, does not load the camera and its CSS reader.

import { encodeJpegCanvas } from './jpeg-encode.mjs';

// ── PNG ENCODER ──────────────────────────────────────────────────────────────────────────────────────
// `canvas.toBlob('image/png')` compresses lightly (a 52-slide deck came out 40% larger than Chrome's own screenshot
// encoder wrote it), and the Studio's PNGs paid that price for every export. This writes the same pixels with a
// per-row adaptive filter and the platform's deflate: opaque slides as 8-bit RGB (3 bytes a pixel, and the PDF writer's
// direct-embed path reads it as it is), slides with transparency as RGBA. One encoder, so both hosts write one file.
const CRC = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
function crc32(bytes, start, end) {
	let c = 0xffffffff;
	for (let i = start; i < end; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** Rows read from the canvas, filtered and deflated at a time: the encoder holds a band, never the whole picture (a 4K slide is 33 MB of pixels). */
const PNG_BAND = 64;

/** PNG bytes for a canvas, smaller than the browser's own encoder writes. */
export async function encodePng(canvas, { fast = false } = {}) {
	const { width: W, height: H } = canvas;
	// No CompressionStream (Safari before 16.4): the browser's own PNG, larger but never a lost export.
	if (typeof CompressionStream !== 'function') {
		const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/png' }) : await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('canvas.toBlob returned null'))), 'image/png'));
		return new Uint8Array(await blob.arrayBuffer());
	}
	// Bands are read through a small scratch canvas, not from `canvas` itself: a hundred readbacks of one canvas make the browser warn and
	// move that canvas to the CPU, and the scratch is one band tall, never a second copy of the picture.
	const scratch = canvas.ownerDocument ? canvas.ownerDocument.createElement('canvas') : new OffscreenCanvas(W, Math.min(PNG_BAND, H));
	scratch.width = W;
	scratch.height = Math.min(PNG_BAND, H);
	const sg = scratch.getContext('2d', { willReadFrequently: true });
	const band = (y0, rows) => {
		sg.clearRect(0, 0, W, rows);
		sg.drawImage(canvas, 0, y0, W, rows, 0, 0, W, rows);
		return sg.getImageData(0, 0, W, rows);
	};
	// Opaque first (nearly every slide): one pass over the pixels. A pixel with alpha found on the way ends that attempt and the RGBA one starts.
	const attempt = async (opaque) => {
		const bpp = opaque ? 3 : 4;
		const stride = W * bpp;
		// Deflate as the bands arrive; the output is read at the same time so a full pipe never stalls the writer.
		const cs = new CompressionStream('deflate');
		const writer = cs.writable.getWriter();
		const pieces = [];
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
			const d = band(y0, rows).data;
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
				let best;
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
					let e;
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
		const chunk = (type, data) => {
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
	return (await attempt(true)) ?? attempt(false);
}

/**
 * A canvas's bytes in the export's format: the shared PNG writer, or the shared JPEG writer (lib/core/jpeg-encode.mjs) with
 * transparency on white. Every export picture goes through here, so no picture's bytes depend on the browser that drew it.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {{ type?: 'png'|'jpeg', quality?: number, fast?: boolean }} [format]  quality 1 to 100, for a JPEG
 * @returns {Promise<Uint8Array>}
 */
export async function encodeCanvas(canvas, { type = 'png', quality, fast = false } = {}) {
	// WebKit may not have run the canvas's drawing yet (see `drawSlide` above): the encode worker draws the slide's bitmap
	// onto a fresh OffscreenCanvas and this reads it at once, and the first slide of an iPhone's PowerPoint came out blank.
	// One pixel read back makes WebKit run it before the writer reads the rows.
	try {
		canvas.getContext('2d')?.getImageData(0, 0, 1, 1);
	} catch {
		// A canvas without a 2D context (a WebGL one) is read by the writer as it is.
	}
	if (type === 'jpeg') return encodeJpegCanvas(canvas, { quality });
	if (type !== 'png') throw new TypeError(`encodeCanvas: no shared writer for ${type}`);
	return encodePng(canvas, { fast });
}
