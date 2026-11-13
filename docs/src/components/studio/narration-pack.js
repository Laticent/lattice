// Pack one narration clip for an exported file: compress it, base64 it, and hash the bytes that ship.
//
// ONE function for both places it runs (HARD RULE #1): the narration pack worker (narration-pack-worker.js) and the
// main-thread fallback the pool uses when workers cannot run. It moved out of narration-bake.ts's `attach`, where it ran on
// the main thread at ~107 ms a clip and froze the export's progress bar and Cancel for ~32 s on a 300-sentence deck
// (#1511; engineering/decisions/2026-11-11-voice-synthesis-spine.md §3.2, S2).
//
// It never writes anything back. The caller hands it a COPY of the clip's bytes, so the clip the store holds, which is what
// playback reads, is never replaced by the compressed one (§9 of 2026-08-04-shared-deck-narration-audio.md: lamejs writes no
// gapless header, so a compressed clip played live gains 56-70 ms of leading silence).
import { compressClip, encoderAvailable, isCompressedAudio } from '@/playground/narration-encode.js';

/** Bytes → base64, chunked so a multi-hundred-KB clip can't blow the argument limit on `String.fromCharCode`. */
export function toBase64(bytes) {
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
	return btoa(bin);
}

/**
 * @param {{ bytes: ArrayBuffer, type: string, kbps: number }} clip  `bytes` is the caller's copy; it may be transferred.
 * @returns {Promise<{ encoderMissing: true } | { mime: string, base64: string, sha256: string, leadMs: number, compressed: boolean, size: number }>}
 */
export async function packClip({ bytes, type, kbps }) {
	const compressed = await compressClip(new Blob([bytes], { type }), kbps);
	// A clip that SHOULD have compressed and did not is either one awkward clip or a dead encoder; `compressClip` returns null
	// for both. Only the encoder itself can tell them apart, and a dead one means every clip ships ~6x its quoted size, so the
	// caller refuses the export on this answer (narration-bake.ts `attach`).
	if (!compressed && !isCompressedAudio(type) && !(await encoderAvailable())) return { encoderMissing: true };
	const shipped = compressed ? new Uint8Array(await compressed.arrayBuffer()) : new Uint8Array(bytes);
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', shipped));
	return {
		mime: compressed ? compressed.type : type,
		base64: toBase64(shipped),
		// The clip's identity in the LTT: a hash of the bytes that ship, so a re-voiced clip reads as a different clip even
		// when its text did not change (2026-09-24-lattice-timing-track.md §4.5).
		sha256: Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join(''),
		// The clip's leading silence (encoder delay plus the voice's own) travels with the clip, so the player can seek past it.
		leadMs: compressed ? (compressed.leadMs ?? 0) : 0,
		compressed: Boolean(compressed),
		size: shipped.byteLength,
	};
}
