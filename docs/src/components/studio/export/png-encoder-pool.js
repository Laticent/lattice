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

export function createPngEncoder({ size = poolSize() } = {}) {
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
		const next = waiting.shift();
		if (next) next(worker);
		else idle.push(worker);
	};
	const run = (worker, bitmap) =>
		new Promise((resolve, reject) => {
			const id = nextId++;
			worker.onmessage = (e) => (e.data.id === id ? (e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.bytes)) : undefined);
			worker.onerror = (e) => reject(new Error(e.message || 'PNG worker failed'));
			worker.postMessage({ id, bitmap }, [bitmap]);
		});

	return {
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
				if (worker) worker.terminate();
				for (const w of idle) w.terminate();
				all.length = 0;
				idle.length = 0;
				for (const next of waiting.splice(0)) next(null);
				return encodePng(canvas);
			}
		},
		dispose() {
			for (const w of all) w.terminate();
			all.length = 0;
			idle.length = 0;
		},
	};
}
