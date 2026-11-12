// One worker that decodes Gemini's speech answers (voice-decode-worker.js), with the main thread as the fallback.
//
// The machinery is docs/src/lib/worker-pool.js, the pool the export's pictures and narration packing use. Node, a
// browser without module workers, and a worker that fails or goes silent all fall back to `decodeGeminiSpeech` on the
// main thread: slower there, never lost, and the same bytes (engineering/decisions/2026-11-11-voice-synthesis-spine.md §9.6).
import { createSharedPool, createWorkerPool } from '../lib/worker-pool.js';
import { decodeGeminiSpeech } from './voice-decode.js';

/** A clip decodes in tens of milliseconds even on a slow phone; a worker silent this long is gone. */
export const DECODE_DEADLINE_MS = 15_000;

/**
 * One worker is enough: a decode is short next to the network request that precedes it, and clips arrive one by one.
 * @param {{ deadlineMs?: number, spawn?: () => Worker }} [opts] `spawn` is for tests: a stand-in worker.
 */
export function createVoiceDecoder({ deadlineMs = DECODE_DEADLINE_MS, spawn } = {}) {
	const pool = createWorkerPool({
		spawn: spawn || (() => new Worker(new URL('./voice-decode-worker.js', import.meta.url), { type: 'module' })),
		size: 1,
		deadlineMs,
		label: 'voice decode',
	});
	return {
		warm: () => pool.warm(),
		/**
		 * Decode one Gemini answer. `body` is transferred to the worker, so the caller must not use it afterwards.
		 * @param {ArrayBuffer} body
		 * @returns {Promise<{ wav: ArrayBuffer, wrapped: boolean } | { error: string }>}
		 */
		async decode(body) {
			// Kept for the fallback: a transferred buffer is detached here. A body is a few hundred KB to a few MB, and
			// copying it is a memcpy, far cheaper than the parse and decode the worker saves.
			const spare = pool.broken ? body : body.slice(0);
			const out = await pool.run(() => ({ message: { body }, transfer: [body] }));
			if ('value' in out) return 'fail' in out.value ? { error: out.value.fail } : { wav: out.value.wav, wrapped: out.value.wrapped };
			return decodeGeminiSpeech(spare);
		},
		dispose: () => pool.dispose(),
	};
}

const shared = createSharedPool(() => createVoiceDecoder(), { idleMs: 60_000 });

/** Decode one Gemini answer on the shared worker, started on first use and ended a minute after the last clip. */
export function decodeGeminiSpeechOffThread(body) {
	// No workers (Node, an old browser): decode here and never start the shared pool, whose idle timer would keep a
	// Node process alive for a minute after its last clip.
	if (typeof Worker === 'undefined') return Promise.resolve(decodeGeminiSpeech(body));
	return shared.use((p) => p.decode(body));
}
