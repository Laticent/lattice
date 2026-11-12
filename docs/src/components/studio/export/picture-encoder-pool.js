// A few workers that write the export's pictures, PNG and JPEG, with the shared writers (picture-encode-worker.js), and the
// main-thread writer as the fallback. The pool machinery itself is docs/src/lib/worker-pool.js, shared with the narration bake.
//
// Each request holds a slot for the length of its encode: a bitmap of a 4K slide is 33 MB, and a phone must not hold a deck's worth. A
// browser without module workers or OffscreenCanvas, and a worker that fails, fall back to `encodeCanvas` on the main
// thread: the export is slower there, never lost, and the same bytes.
import { encodeCanvas } from '../../../../../lib/core/canvas-encode.mjs';
import { createSharedPool, createWorkerPool } from '../../../lib/worker-pool.js';

/** How many encodes may be in flight: one worker each, at most 2 (a third buys little and costs another 33 MB bitmap). */
export function poolSize(cores = globalThis.navigator?.hardwareConcurrency || 2) {
	return Math.max(1, Math.min(2, cores - 1));
}

export function canEncodeOffThread() {
	return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof CompressionStream !== 'undefined';
}

/** A slide's picture takes well under a second to write. A worker silent for this long is gone (a phone kills workers under memory pressure without an error event). */
export const ENCODE_DEADLINE_MS = 45_000;

export function createPictureEncoder({ size = poolSize(), deadlineMs = ENCODE_DEADLINE_MS } = {}) {
	const pool = createWorkerPool({
		spawn: () => new Worker(new URL('./picture-encode-worker.js', import.meta.url), { type: 'module' }),
		size,
		deadlineMs,
		label: 'picture',
		available: canEncodeOffThread,
	});
	return {
		/** Start every worker now, so the first slide finds them loaded instead of paying their start-up. */
		warm: () => pool.warm(),
		/**
		 * A canvas's bytes, written by the shared writers.
		 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
		 * @param {{ type: 'png'|'jpeg', quality?: number }} [format]  quality 1 to 100, for a JPEG
		 * @returns {Promise<Uint8Array>}
		 */
		async encode(canvas, format = { type: 'png' }) {
			// The PIXELS go to the worker, not an ImageBitmap of the canvas: on WebKit the first bitmap a session sent arrived blank,
			// and an iPhone's PowerPoint had a black title slide (decisions/2026-11-03-pictures-at-drawn-size.md). Reading them here
			// also makes WebKit finish the canvas's drawing, and keeps partial alpha exact (a bitmap's round trip premultiplied it).
			// They are read only once a worker is held, so a phone never holds a deck's worth of 33 MB bitmaps.
			const out = await pool.run(() => {
				const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
				return { message: { width: canvas.width, height: canvas.height, buffer: data.buffer, format }, transfer: [data.buffer] };
			});
			return 'value' in out ? out.value.bytes : encodeCanvas(canvas, format);
		},
		dispose: () => pool.dispose(),
	};
}

// ONE POOL FOR EVERY EXPORT. The PDF, PowerPoint, LibreOffice and image-set exports all write pictures, and each used to need its own pool
// created and torn down around it. This one starts when the first export asks (`warm()` at the top of an export, so the workers load while
// the fonts and the first slide are prepared) and ends 10 s after the last picture is written, so a phone does not keep four threads and their
// heaps for the length of a session.
const shared = createSharedPool(() => createPictureEncoder());

/** The shared pool: `warm()` to start its workers early, `encode(canvas, format)` for a picture's bytes. */
export function sharedPictureEncoder() {
	return {
		warm: () => shared.warm(),
		/** @param {HTMLCanvasElement|OffscreenCanvas} canvas @param {{ type: 'png'|'jpeg', quality?: number }} [format] */
		encode: (canvas, format) => shared.use((p) => p.encode(canvas, format)),
	};
}
