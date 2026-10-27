// A few workers that write PNGs for the slide camera (png-encode-worker.js), with the main-thread writer as the fallback.
//
// Each request holds a slot for the length of its encode: a bitmap of a 4K slide is 33 MB, and a phone must not hold a deck's worth. A
// browser without module workers, OffscreenCanvas or createImageBitmap, and a worker that fails, fall back to `encodePng` on the main
// thread: the export is slower there, never lost.
import { encodePng } from '../../../../../lib/core/slide-camera.mjs';

/** How many encodes may be in flight: one worker each, at most 2 (a third buys little and costs another 33 MB bitmap). */
export function poolSize(cores = globalThis.navigator?.hardwareConcurrency || 2) {
	return Math.max(1, Math.min(2, cores - 1));
}

export function canEncodeOffThread() {
	return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined' && typeof CompressionStream !== 'undefined';
}

/** A slide's PNG takes well under a second to write. A worker silent for this long is gone (a phone kills workers under memory pressure without an error event). */
export const ENCODE_DEADLINE_MS = 45_000;

export function createPngEncoder({ size = poolSize(), deadlineMs = ENCODE_DEADLINE_MS } = {}) {
	const idle = [];
	const waiting = [];
	const all = [];
	let broken = !canEncodeOffThread();
	let nextId = 0;

	const spawn = () => {
		const worker = new Worker(new URL('./png-encode-worker.js', import.meta.url), { type: 'module' });
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
	const run = (worker, bitmap) =>
		new Promise((resolve, reject) => {
			const id = nextId++;
			const timer = setTimeout(() => reject(new Error(`no answer in ${deadlineMs / 1000} s`)), deadlineMs);
			const done = (settle, value) => {
				clearTimeout(timer);
				settle(value);
			};
			worker.onmessage = (e) => (e.data.id === id ? (e.data.error ? done(reject, new Error(e.data.error)) : done(resolve, e.data.bytes)) : undefined);
			worker.onmessageerror = () => done(reject, new Error('PNG worker sent a message that could not be read'));
			worker.onerror = (e) => done(reject, new Error(e.message || 'PNG worker failed'));
			worker.postMessage({ id, bitmap }, [bitmap]);
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
		/** PNG bytes for a canvas. */
		async encode(canvas) {
			if (broken) return encodePng(canvas);
			let worker = null;
			try {
				worker = await acquire();
				// The pool broke while this request waited for a slot: every waiter is handed null so none waits forever.
				if (!worker) return encodePng(canvas);
				const bitmap = await createImageBitmap(canvas);
				const bytes = await run(worker, bitmap);
				release(worker);
				return bytes;
			} catch (e) {
				console.warn(`[lattice-export] PNG worker failed (${e?.message || e}); writing PNGs on the main thread.`);
				broken = true;
				// The failed worker and the idle ones end now; a worker busy with another request ends when that request releases it.
				if (worker) worker.terminate();
				for (const w of idle.splice(0)) w.terminate();
				for (const next of waiting.splice(0)) next(null);
				return encodePng(canvas);
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

// ONE POOL FOR EVERY EXPORT. The PDF, PowerPoint, LibreOffice and PNG-set exports all write PNGs, and each used to need its own pool
// created and torn down around it. This one starts when the first export asks (`warm()` at the top of an export, so the workers load while
// the fonts and the first slide are prepared) and ends 10 s after the last PNG is written, so a phone does not keep four threads and their
// heaps for the length of a session.
const IDLE_MS = 10_000;
let shared = null;
let inFlight = 0;
let idleTimer = null;

function pool() {
	clearTimeout(idleTimer);
	idleTimer = null;
	if (!shared) shared = createPngEncoder();
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

/** The shared pool: `warm()` to start its workers early, `encode(canvas)` for PNG bytes. */
export function sharedPngEncoder() {
	return {
		warm() {
			pool().warm();
			settled();
		},
		async encode(canvas) {
			const p = pool();
			inFlight++;
			try {
				return await p.encode(canvas);
			} finally {
				inFlight--;
				settled();
			}
		},
	};
}
