// A few workers that pack the export's narration clips (narration-pack-worker.js), with the main thread as the fallback.
//
// The machinery is docs/src/lib/worker-pool.js, the same pool the export's pictures use. A browser without module workers,
// and a worker that fails or goes silent, fall back to `packClip` on the main thread: the export is slower there, never
// lost, and the bytes are the same.
import { createSharedPool, createWorkerPool } from '../../lib/worker-pool.js';
import { packClip } from './narration-pack.js';

/** One worker per spare core, at most 4. A clip packs in ~0.1 s, and #1511 measured that 2-4 workers bring a
 *  300-sentence deck from ~32 s of blocked main thread to well under 10 s of background work. */
export function packPoolSize(cores = globalThis.navigator?.hardwareConcurrency || 2) {
	return Math.max(1, Math.min(4, cores - 1));
}

/** A clip packs in well under a second; a worker silent this long is gone. */
export const PACK_DEADLINE_MS = 30_000;

export function createNarrationPacker({ size = packPoolSize(), deadlineMs = PACK_DEADLINE_MS } = {}) {
	const pool = createWorkerPool({
		spawn: () => new Worker(new URL('./narration-pack-worker.js', import.meta.url), { type: 'module' }),
		size,
		deadlineMs,
		label: 'narration',
	});
	return {
		warm: () => pool.warm(),
		/**
		 * Pack one clip. `bytes` must be the caller's own copy: it is transferred to the worker.
		 * @param {{ bytes: ArrayBuffer, type: string, kbps: number }} clip
		 */
		async pack(clip) {
			// Kept for the fallback: a transferred buffer is detached on this side, so the main-thread path needs its own copy.
			// Cheap next to the encode, and it only exists while the job is in flight.
			const spare = clip.bytes.slice(0);
			const out = await pool.run(() => ({ message: clip, transfer: [clip.bytes] }));
			return 'value' in out ? out.value : packClip({ ...clip, bytes: spare });
		},
		dispose: () => pool.dispose(),
	};
}

const shared = createSharedPool(() => createNarrationPacker());

/** The shared packer: `warm()` at the top of a bake, `pack(clip)` per clip. */
export function sharedNarrationPacker() {
	return {
		warm: () => shared.warm(),
		/** @param {{ bytes: ArrayBuffer, type: string, kbps: number }} clip */
		pack: (clip) => shared.use((p) => p.pack(clip)),
	};
}
