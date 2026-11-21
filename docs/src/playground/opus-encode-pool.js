// The workers that turn stored narration into Ogg Opus (opus-encode-worker.js), shared by every read in the session.
//
// The machinery is docs/src/lib/worker-pool.js, the pool the export's pictures and narration packing use. There is
// deliberately NO main-thread fallback: a clip the workers cannot encode stays WAV. A missing encoder costs bytes, never
// audio, and never a stall on the thread Present draws with.
import { isLiteDevice, LITE } from '../lib/device-lite.js';
import { createSharedPool, createWorkerPool } from '../lib/worker-pool.js';

/** WebKit's encoder does not run clips in parallel: in the bake-off's pool benchmark (2026-11-17) Linux WebKit read 48x,
 *  53x and 56x realtime with 1, 2 and 4 workers while each clip took longer, so a second worker only adds a heap.
 *  Every browser on an iPhone or iPad is WebKit, whatever its name (Chrome is CriOS, Firefox FxiOS, Edge EdgiOS), and an
 *  iPad asking for the desktop site reports a Mac with touch; elsewhere Chromium and Firefox are not. */
export function isWebKitOnly(ua = globalThis.navigator?.userAgent || '', touchPoints = globalThis.navigator?.maxTouchPoints || 0) {
	if (/iPhone|iPad|iPod/.test(ua)) return true;
	if (/Macintosh/.test(ua) && touchPoints > 1) return true;
	return /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua);
}

/** One worker on a Lite device or on Safari/WebKit; elsewhere one per spare core, at most 4 (Chromium 66x, 140x, 193x and
 *  Firefox 58x, 119x, 247x realtime with 1, 2 and 4 workers in the same benchmark). */
export function opusPoolSize(cores = globalThis.navigator?.hardwareConcurrency || 2, lite = isLiteDevice(), webkitOnly = isWebKitOnly()) {
	if (lite) return LITE.workers;
	if (webkitOnly) return 1;
	return Math.max(1, Math.min(4, cores - 1));
}

/** A sentence encodes in well under a second; a worker silent this long is gone. */
export const ENCODE_DEADLINE_MS = 30_000;

export function createOpusEncoder({ size = opusPoolSize(), deadlineMs = ENCODE_DEADLINE_MS, spawn } = {}) {
	const pool = createWorkerPool({
		spawn: spawn || (() => new Worker(new URL('./opus-encode-worker.js', import.meta.url), { type: 'module' })),
		size,
		deadlineMs,
		label: 'opus encode',
		afterBreak: 'narration keeps its WAV (this pool has no main-thread fallback)',
	});
	return {
		/**
		 * One WAV clip to Ogg Opus bytes, or null to keep the WAV. `wav` is transferred to the worker.
		 * @param {ArrayBuffer} wav
		 * @param {number} kbps
		 * @returns {Promise<ArrayBuffer | null>}
		 */
		async encode(wav, kbps) {
			const out = await pool.run(() => ({ message: { wav, kbps }, transfer: [wav] }));
			return 'value' in out && out.value.ogg ? out.value.ogg : null;
		},
		dispose: () => pool.dispose(),
	};
}

const shared = createSharedPool(() => createOpusEncoder(), { idleMs: 60_000 });

const WAV_TYPE = /^audio\/(wav|x-wav|wave)\b/i;

/**
 * A synthesized clip as it should be STORED: Ogg Opus where the workers can encode it, otherwise null (keep what you have).
 * Only WAV is converted; a clip already compressed (a cloud voice's MP3) is left as it is.
 * @param {{ type?: string, arrayBuffer(): Promise<ArrayBuffer> }} blob
 * @param {number} kbps
 * @returns {Promise<Blob | null>}
 */
export async function packForStore(blob, kbps) {
	if (!blob || !WAV_TYPE.test(String(blob.type || '')) || typeof Worker === 'undefined') return null;
	let wav;
	try {
		wav = await blob.arrayBuffer();
	} catch {
		return null;
	}
	const ogg = await shared.use((p) => p.encode(wav, kbps));
	return ogg ? new Blob([ogg], { type: 'audio/ogg; codecs=opus' }) : null;
}
