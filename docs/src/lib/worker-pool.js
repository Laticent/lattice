// A few module workers that take one job each, with the main thread as the fallback.
//
// Extracted from the export's picture pool (studio/export/picture-encoder-pool.js) so the narration bake's clip packing
// (studio/narration-pack-pool.js) runs on the same machinery instead of a second copy of it
// (engineering/decisions/2026-11-11-voice-synthesis-spine.md §3.2, S2).
//
// The contract both callers rely on:
// - A job holds a worker for its whole length, so `size` bounds memory as well as threads.
// - A job is built only once it holds a worker (`build` runs after acquire), so a caller that has to read something large
//   can read it only when a worker is ready to take it. The picture pool does (a 4K slide's pixels are 33 MB); the
//   narration packer reads its clip earlier, because it keeps a fallback copy, and a clip is a few hundred KB.
// - The first failure of any kind (an error event, an unreadable message, a worker-reported error, no answer by the deadline)
//   BREAKS the pool: every waiter and every later job gets `{ fallback: true }` and the caller runs its main-thread path. The
//   work is slower there, never lost, and produces the same bytes. A phone kills workers under memory pressure without an
//   error event, which is why silence past the deadline counts as failure.

/**
 * @template T
 * @param {{
 *   spawn: () => Worker,
 *   size: number,
 *   deadlineMs: number,
 *   label: string,
 *   available?: () => boolean,
 * }} opts
 */
export function createWorkerPool({ spawn, size, deadlineMs, label, available = () => typeof Worker !== 'undefined' }) {
	const idle = [];
	const waiting = [];
	const all = [];
	let broken = !available();
	let nextId = 0;

	const make = () => {
		const worker = spawn();
		all.push(worker);
		return worker;
	};
	const acquire = () => {
		if (broken) return Promise.resolve(null);
		if (idle.length) return Promise.resolve(idle.pop());
		if (all.length < size) return Promise.resolve(make());
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
	const send = (worker, message, transfer) =>
		new Promise((resolve, reject) => {
			const id = nextId++;
			const timer = setTimeout(() => reject(new Error(`no answer in ${deadlineMs / 1000} s`)), deadlineMs);
			const done = (settle, value) => {
				clearTimeout(timer);
				settle(value);
			};
			worker.onmessage = (e) => (e.data?.id === id ? (e.data.error ? done(reject, new Error(e.data.error)) : done(resolve, e.data)) : undefined);
			worker.onmessageerror = () => done(reject, new Error(`${label} worker sent a message that could not be read`));
			worker.onerror = (e) => done(reject, new Error(e?.message || `${label} worker failed`));
			worker.postMessage({ ...message, id }, transfer || []);
		});
	const breakPool = (worker, e) => {
		console.warn(`[lattice] ${label} worker failed (${e?.message || e}); continuing on the main thread.`);
		broken = true;
		// The failed worker and the idle ones end now; a worker busy with another job ends when that job releases it.
		if (worker) worker.terminate();
		for (const w of idle.splice(0)) w.terminate();
		for (const next of waiting.splice(0)) next(null);
	};

	return {
		get broken() {
			return broken;
		},
		/** Start every worker now, so the first job finds them loaded instead of paying their start-up. */
		warm() {
			if (broken) return;
			try {
				while (all.length < size) idle.push(make());
			} catch {
				broken = true;
			}
		},
		/**
		 * Run one job. `build` is called once a worker is held and returns the message and its transfer list.
		 * Resolves `{ value }` with the worker's reply, or `{ fallback: true }` when the caller must do the work itself.
		 * @param {() => Promise<{ message: object, transfer?: Transferable[] }> | { message: object, transfer?: Transferable[] }} build
		 * @returns {Promise<{ value: any } | { fallback: true }>}
		 */
		async run(build) {
			if (broken) return { fallback: true };
			let worker = null;
			try {
				worker = await acquire();
				// The pool broke while this job waited for a slot: every waiter is handed null so none waits forever.
				if (!worker) return { fallback: true };
				const { message, transfer } = await build();
				const value = await send(worker, message, transfer);
				release(worker);
				return { value };
			} catch (e) {
				breakPool(worker, e);
				return { fallback: true };
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

/**
 * One pool shared by every caller, started on first use and ended `idleMs` after the last job settles, so a phone does not
 * keep the threads and their heaps for the length of a session.
 * @param {() => { warm(): void, dispose(): void }} create
 * @param {{ idleMs?: number }} [opts]
 */
export function createSharedPool(create, { idleMs = 10_000 } = {}) {
	let shared = null;
	let inFlight = 0;
	let idleTimer = null;
	const pool = () => {
		clearTimeout(idleTimer);
		idleTimer = null;
		if (!shared) shared = create();
		return shared;
	};
	const settled = () => {
		if (inFlight > 0 || idleTimer) return;
		idleTimer = setTimeout(() => {
			idleTimer = null;
			if (inFlight === 0 && shared) {
				shared.dispose();
				shared = null;
			}
		}, idleMs);
	};
	return {
		warm() {
			pool().warm();
			settled();
		},
		/** Run `fn(pool)` counted as in flight, so the idle timer never ends a pool mid-job. */
		async use(fn) {
			const p = pool();
			inFlight++;
			try {
				return await fn(p);
			} finally {
				inFlight--;
				settled();
			}
		},
	};
}
