// Speech as samples — the two pure steps every producer of a narration clip shares, with no
// encoder anywhere near them: packing a voice's float samples as WAV (`wavBlob`), and finding where
// its speech starts (`speechOnsetMs`).
//
// SEPARATE FROM narration-encode.mjs ON PURPOSE. The live reading path (voice-model.js, read-aloud.ts)
// needs both of these and must never import the encoder: a clip compressed there reaches the cache
// and every replay carries untrimmable encoder silence
// (test/unit/playground/narration-live-path-uncompressed.test.js). The bake, the live reader and the
// CLI's `lattice video deck.md` all read these from here.

/**
 * Float PCM (±1) as a 16-bit mono WAV — what on-device Kokoro's samples become before anything
 * else touches them, in the Studio (`voice-model.js`) and in the CLI alike. A Blob where one exists,
 * else the ArrayBuffer.
 */
export function wavBlob(samples, sampleRate) {
	const f32 = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
	const n = f32.length;
	const buf = new ArrayBuffer(44 + n * 2);
	const dv = new DataView(buf);
	const wstr = (off, str) => {
		for (let i = 0; i < str.length; i++) dv.setUint8(off + i, str.charCodeAt(i));
	};
	wstr(0, 'RIFF');
	dv.setUint32(4, 36 + n * 2, true);
	wstr(8, 'WAVE');
	wstr(12, 'fmt ');
	dv.setUint32(16, 16, true);
	dv.setUint16(20, 1, true);
	dv.setUint16(22, 1, true);
	dv.setUint32(24, sampleRate, true);
	dv.setUint32(28, sampleRate * 2, true);
	dv.setUint16(32, 2, true);
	dv.setUint16(34, 16, true);
	wstr(36, 'data');
	dv.setUint32(40, n * 2, true);
	for (let i = 0; i < n; i++) {
		const v = Math.max(-1, Math.min(1, f32[i]));
		dv.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
	}
	return typeof Blob !== 'undefined' ? new Blob([buf], { type: 'audio/wav' }) : buf;
}

/**
 * A sample counts as SPEECH once its magnitude passes 2% of full scale (655 of 32767) — the
 * rule `tools/spike-video-export.mjs` measured Kokoro's leading silence with. Kokoro puts
 * 290–390 ms (median 324 ms) of near-silence before every sentence; its noise floor sits well
 * under this line and its first phoneme well over it.
 */
const SPEECH_THRESHOLD = 655;

/**
 * How far BEFORE the first loud sample the trim stops. A soft attack — an "s", an "f", a "h" —
 * rises through the threshold over a few milliseconds, and cutting exactly at the crossing
 * clips it. 10 ms keeps the attack and stays well inside one video frame (33 ms at 30 fps).
 */
const SPEECH_PREROLL_MS = 10;

/**
 * The voice's OWN leading silence, in ms: how long the clip runs before its first sample
 * louder than 2% of full scale, less a 10 ms pre-roll. 0 when the clip never gets that loud,
 * so a quiet or empty clip is never trimmed.
 *
 * This is a property of the voice, not the codec, and it is why `leadMs` is encoder delay PLUS
 * this figure: the player starts a clip `leadMs` in and times its caption from there, so a lead
 * that counted only the encoder lit each caption a third of a second before Kokoro spoke it.
 * Interleaved stereo is read by frame, so the onset is in time, not in samples.
 */
export function speechOnsetMs(pcm, sampleRate, channels = 1, fullScale = 32767) {
	if (!pcm || !(sampleRate > 0) || !(channels > 0)) return 0;
	// `fullScale` 1 reads a decoded Web Audio buffer (Float32, ±1) by the same 2% rule, so the
	// bake and Present's live playback measure one voice's silence with one threshold.
	const threshold = (SPEECH_THRESHOLD / 32767) * fullScale;
	for (let i = 0; i < pcm.length; i++) {
		if (Math.abs(pcm[i]) > threshold) {
			const ms = (Math.floor(i / channels) / sampleRate) * 1000 - SPEECH_PREROLL_MS;
			return ms > 0 ? ms : 0;
		}
	}
	return 0;
}
