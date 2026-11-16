// lib/core/canvas-encode.mjs — the export's picture WRITERS for a canvas: its bytes as PNG or JPEG through the image
// library's writers (`@laticent/lastra` `encodePng` and `createJpegEncoder`), so no picture's bytes depend on the browser
// that drew it. This file is the canvas half only: it reads the canvas a band at a time and hands lastra the rows. It lives
// apart from the camera (lib/core/slide-camera.mjs, which re-exports it) so the Studio's picture-encode worker, which only
// encodes, does not load the camera and its CSS reader.

import { createJpegEncoder, encodePng as encodePngRows, PNG_BAND } from '@laticent/lastra';

/** PNG bytes for a canvas, smaller than the browser's own encoder writes (lastra's `encodePng`, fed the canvas's rows). */
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
	// Opaque first (nearly every slide): lastra reads the bands again for RGBA only when a pixel has alpha.
	return encodePngRows(W, H, (y0, rows) => band(y0, rows).data, { fast });
}

/**
 * A canvas's bytes in the export's format: the shared PNG writer, or the shared JPEG writer (`encodeJpegCanvas`) with
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

/**
 * JPEG bytes for a canvas (DOM or Offscreen), read a band at a time; transparency lands on white.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {{ quality: number }} opts  quality 1 to 100
 * @param {typeof createJpegEncoder} [make]  the encoder factory (lastra's). A host sending this function into a page as
 *   source text passes the factory it sent alongside, and then this body uses nothing outside itself either.
 */
export function encodeJpegCanvas(canvas, { quality }, make = createJpegEncoder) {
	const { width: W, height: H } = canvas;
	// Read 64 rows at a time (four 16-row bands) through a scratch canvas that tall, not from `canvas` itself: many readbacks
	// of one canvas make the browser move it to the CPU (the same reason encodePng does it).
	const rowsPer = Math.min(64, H);
	const scratch = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(W, rowsPer) : canvas.ownerDocument.createElement('canvas');
	scratch.width = W;
	scratch.height = rowsPer;
	const sg = scratch.getContext('2d', { willReadFrequently: true });
	const enc = make({ width: W, height: H, quality });
	for (let y0 = 0; y0 < H; y0 += rowsPer) {
		const rows = Math.min(rowsPer, H - y0);
		sg.clearRect(0, 0, W, rows);
		sg.drawImage(canvas, 0, y0, W, rows, 0, 0, W, rows);
		enc.addRows(sg.getImageData(0, 0, W, rows).data, rows);
	}
	return enc.finish();
}
