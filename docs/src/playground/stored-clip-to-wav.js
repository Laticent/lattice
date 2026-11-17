// A narration clip the Studio KEEPS as Ogg Opus (opus-encode-pool.js `packForStore`), read back as WAV for the two places
// that still ship MP3: the exported file (narration-bake.ts `attach`, then narration-pack.js) and Present together
// (narration-bake.ts `narrationClipForRoom`). Both compress WAV to MP3 and measure the voice's leading silence from its
// PCM; an Ogg clip would pass through both untouched, so a member would get no audio and the export would ship Ogg with no
// lead offset. Decoding back to WAV here keeps both exactly as they were before the store held Opus. Making them carry
// Opus themselves is a separate change (engineering/decisions/2026-11-17-narration-codec-bakeoff.md).
//
// Main thread only: decodeAudioData lives on an audio context, which a worker does not have. The browser decodes off its
// own thread, so the page does not stall on it.
import { wavBlob } from '../../../lib/core/speech-pcm.mjs';

/** The rate the WAV comes back at. 24 kHz is what the raw-audio voices answer (Gemini, Kokoro), so nothing is resampled up. */
export const STORED_CLIP_WAV_RATE = 24000;

/** Whether a clip is the Ogg the store keeps (`audio/ogg; codecs=opus`). */
export function isStoredOgg(type) {
	return /^audio\/ogg\b/i.test(String(type || ''));
}

/** Decode with an offline audio context at 24 kHz, mono. Null where there is none (a worker, Node). */
function defaultDecode() {
	const Ctx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
	if (!Ctx) return null;
	return (bytes) => new Ctx(1, 1, STORED_CLIP_WAV_RATE).decodeAudioData(bytes);
}

/**
 * The clip as WAV when it is the store's Ogg Opus, else the clip unchanged. A failed decode also returns the clip
 * unchanged, so a caller is never worse off than it was without this.
 * @param {Blob | null | undefined} clip
 * @param {{ decode?: (bytes: ArrayBuffer) => Promise<{ getChannelData(c: number): Float32Array, sampleRate: number }> }} [opts]
 *   `decode` is for tests; the browser's offline audio context by default.
 */
export async function storedClipAsWav(clip, opts = {}) {
	if (!clip || !isStoredOgg(clip.type) || typeof clip.arrayBuffer !== 'function') return clip;
	const decode = opts.decode ?? defaultDecode();
	if (!decode) return clip;
	try {
		const audio = await decode(await clip.arrayBuffer());
		return wavBlob(audio.getChannelData(0), audio.sampleRate);
	} catch {
		return clip;
	}
}
