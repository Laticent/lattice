// A few workers that write the export's pictures, PNG and JPEG, with the shared writers (picture-encode-worker.js), and the
// main-thread writer as the fallback.
//
// Each request holds a slot for the length of its encode: a bitmap of a 4K slide is 33 MB, and a phone must not hold a deck's worth. A
// browser without module workers, OffscreenCanvas or createImageBitmap, and a worker that fails, fall back to `encodeCanvas` on the main
// thread: the export is slower there, never lost, and the same bytes.
import { encodeCanvas } from '../../../../../lib/core/slide-camera.mjs';

/** How many encodes may be in flight: one worker each, at most 2 (a third buys little and costs another 33 MB bitmap). */
export function poolSize(cores = globalThis.navigator?.hardwareConcurrency || 2) {
	return Math.max(1, Math.min(2, cores - 1));
}

export function canEncodeOffThread() {
	return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined' && typeof CompressionStream !== 'undefined';
}

/** A slide's picture takes well under a second to write. A worker silent for this long is gone (a phone kills workers under memory pressure without an error event). */
export const ENCODE_DEADLINE_MS = 45_000;

export function createPictureEncoder({ size = poolSize(), deadlineMs = ENCODE_DEADLINE_MS } = {}) {
	const idle = [];
	const waiting = [];
	const all = [];
	let broken = !canEncodeOffThread();
	let nextId = 0;

	const spawn = () => {
		const worker = new Worker(new URL('./picture-encode-worker.js', import.meta.url), { type: 'module' });
		all.push(worker);
		return worker;
	};
	const acquire = () => {
		if (broken) return Promise.resolve(null);
		if (idle.length) return Promise.resolve(idle.pop());
		if (all.length < size) return Promise.resolve(spawn());
		return new Promise((resolve) => waiting.push(resolve));
	};
	const release = (worker) => {
		// A pool that broke while this worker was busy lets it finish its job, then ends it.
		if (broken) {
			worker.terminate();
			return;
		}
		const next = waiting.shift();
		if (next) next(worker);
		else idle.push(worker);
	};
	const run = (worker, bitmap, format) =>
		new Promise((resolve, reject) => {
			const id = nextId++;
			const timer = setTimeout(() => reject(new Error(`no answer in ${deadlineMs / 1000} s`)), deadlineMs);
			const done = (settle, value) => {
				clearTimeout(timer);
				settle(value);
			};
			worker.onmessage = (e) => (e.data.id === id ? (e.data.error ? done(reject, new Error(e.data.error)) : done(resolve, e.data.bytes)) : undefined);
			worker.onmessageerror = () => done(reject, new Error('picture worker sent a message that could not be read'));
			worker.onerror = (e) => done(reject, new Error(e.message || 'picture worker failed'));
			worker.postMessage({ id, bitmap, format }, [bitmap]);
		});

	return {
		/** Start every worker now, so the first slide finds them loaded instead of paying their start-up. */
		warm() {
			if (broken) return;
			try {
				while (all.length < size) idle.push(spawn());
			} catch {
				broken = true;
			}
		},
		/**
		 * A canvas's bytes, written by the shared writers.
		 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
		 * @param {{ type: 'png'|'jpeg', quality?: number }} [format]  quality 1 to 100, for a JPEG
		 * @returns {Promise<Uint8Array>}
		 */
		async encode(canvas, format = { type: 'png' }) {
			if (broken) return encodeCanvas(canvas, format);
			let worker = null;
			try {
				worker = await acquire();
				// The pool broke while this request waited for a slot: every waiter is handed null so none waits forever.
				if (!worker) return encodeCanvas(canvas, format);
				const bitmap = await createImageBitmap(canvas);
				const bytes = await run(worker, bitmap, format);
				release(worker);
				return bytes;
			} catch (e) {
				console.warn(`[lattice-export] picture worker failed (${e?.message || e}); writing pictures on the main thread.`);
				broken = true;
				// The failed worker and the idle ones end now; a worker busy with another request ends when that request releases it.
				if (worker) worker.terminate();
				for (const w of idle.splice(0)) w.terminate();
				for (const next of waiting.splice(0)) next(null);
				return encodeCanvas(canvas, format);
			}
		},
		dispose() {
			for (const w of all) w.terminate();
			all.length = 0;
			idle.length = 0;
			for (const next of waiting.splice(0)) next(null);
		},
	};
}

// ONE POOL FOR EVERY EXPORT. The PDF, PowerPoint, LibreOffice and image-set exports all write pictures, and each used to need its own pool
// created and torn down around it. This one starts when the first export asks (`warm()` at the top of an export, so the workers load while
// the fonts and the first slide are prepared) and ends 10 s after the last picture is written, so a phone does not keep four threads and their
// heaps for the length of a session.
const IDLE_MS = 10_000;
let shared = null;
let inFlight = 0;
let idleTimer = null;

function pool() {
	clearTimeout(idleTimer);
	idleTimer = null;
	if (!shared) shared = createPictureEncoder();
	return shared;
}

function settled() {
	if (inFlight > 0 || idleTimer) return;
	idleTimer = setTimeout(() => {
		idleTimer = null;
		if (inFlight === 0 && shared) {
			shared.dispose();
			shared = null;
		}
	}, IDLE_MS);
}

/** The shared pool: `warm()` to start its workers early, `encode(canvas, format)` for a picture's bytes. */
export function sharedPictureEncoder() {
	return {
		warm() {
			pool().warm();
			settled();
		},
		/** @param {HTMLCanvasElement|OffscreenCanvas} canvas @param {{ type: 'png'|'jpeg', quality?: number }} [format] */
		async encode(canvas, format) {
			const p = pool();
			inFlight++;
			try {
				return await p.encode(canvas, format);
			} finally {
				inFlight--;
				settled();
			}
		},
	};
}
