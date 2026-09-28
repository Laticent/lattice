// Voice a deck from the CLI with Kokoro, the Studio's on-device voice (fork 10 of
// engineering/decisions/2026-09-25-video-export.md, the CLI half).
//
// WHAT IS SHARED, AND WHY THAT IS THE POINT (HARD RULE #1). The Studio's bake turns a sentence
// into a shipped clip in three steps: Kokoro's samples → `wavBlob` → `compressClip` (an MP3 at the
// workspace bitrate, with `leadMs` = the encoder's delay plus the voice's own silence). This module
// runs the same three: `wavBlob` from lib/core/speech-pcm.mjs and `compressClip` from
// lib/core/narration-encode.mjs, the modules the Studio imports. What it is handed is the deck's
// narration as the CLI resolves it for `--captions` (the same ladder and the same `buildTrack`),
// and the text each clip speaks is the cue's SPOKEN join, which is the Studio's clip identity.
//
// WHAT IS NOT. The Studio runs kokoro-js in a browser (onnxruntime-web: WebGPU fp32 when it has a
// GPU, otherwise wasm q8); this runs it in Node (onnxruntime-node, cpu, q8). Same model, same
// quantization as the Studio without a GPU, same voice — but two runtimes, so the samples are the
// same voice and not guaranteed to be the same bits.
//
// kokoro-js is OPTIONAL: an ~80 MB model download is not something every `npm install` should pay.
// Without it `lattice video deck.md` stops and says how to install it.

/** The Studio's defaults (docs/src/playground/voice-model.js, tts-voice-catalog.ts). */
export const KOKORO = Object.freeze({ model: 'onnx-community/Kokoro-82M-v1.0-ONNX', voice: 'af_heart', dtype: 'q8', speed: 1 });

/** The version this path was measured with (engineering/decisions/2026-09-25-video-export.md §9). */
export const INSTALL_HINT = 'npm i --no-save kokoro-js@1.2.1 @breezystack/lamejs@1.2.7';

/**
 * Load Kokoro, or throw an error that says how to install it.
 * @param {(msg: string) => void} [log]
 */
export async function loadKokoro(log) {
	// The encoder first: it is cheap to ask, and finding it missing after a minute of model loading
	// and the first sentence's synthesis wastes both.
	const { encoderAvailable } = await import('../core/narration-encode.mjs');
	if (!(await encoderAvailable())) throw new Error(`the MP3 encoder (@breezystack/lamejs) is not installed, so clips cannot be encoded as the Studio encodes them. Install it with:\n  ${INSTALL_HINT}`);
	let mod;
	try {
		mod = await import('kokoro-js');
	} catch (e) {
		// Only a package that is not there is "not installed"; anything else (a broken native
		// binding, say) is reported as itself.
		if (e?.code !== 'ERR_MODULE_NOT_FOUND' && e?.code !== 'MODULE_NOT_FOUND') throw e;
		throw new Error(`voicing a deck needs kokoro-js, the Studio's on-device voice, which is optional. Install it with:\n  ${INSTALL_HINT}\n(the first run downloads the ~80 MB model once)`);
	}
	log?.(`loading Kokoro (${KOKORO.model}, ${KOKORO.dtype})…`);
	return mod.KokoroTTS.from_pretrained(KOKORO.model, { dtype: KOKORO.dtype, device: 'cpu' });
}

/**
 * Speak every cue of a resolved deck and return the `narration.slides` the player assembler takes.
 *
 * @param {{slides: {index: number, track: {cues: {words: {spoken: string}[]}[]}}[]}} readAlong
 *   the deck's narration as `buildReadAlong` resolves it (sparse: narrated slides only)
 * @param {string[]} texts each rendered slide's narration text, index-aligned
 * @param {{ tts: {generate(text: string, o: object): Promise<{audio: Float32Array, sampling_rate: number}>},
 *   emphasis?: Array<object|undefined>, kbps?: number, onClip?: (done: number, total: number) => void }} opts
 *   `emphasis`: each slide's emphasis spans as its track was built with, carried to the LTT.
 * @returns {Promise<Array<null | {text: string, track: object, clips: {audio: string, clip: string, leadMs: number}[]}>>}
 */
export async function voiceDeck(readAlong, texts, { tts, emphasis, kbps, onClip }) {
	const { wavBlob } = await import('../core/speech-pcm.mjs');
	const { compressClip, DEFAULT_BITRATE_KBPS } = await import('../core/narration-encode.mjs');
	const { createHash } = await import('node:crypto');
	const slides = texts.map(() => null);
	const total = readAlong.slides.reduce((n, s) => n + s.track.cues.length, 0);
	// One synthesis per distinct sentence, as the bake does: a repeated line ships the same clip.
	const said = new Map();
	let done = 0;
	for (const { index, track } of readAlong.slides) {
		const clips = [];
		for (const cue of track.cues) {
			const text = cue.words.map((w) => w.spoken).join(' ');
			let clip = said.get(text);
			if (!clip) {
				const a = await tts.generate(text, { voice: KOKORO.voice, ...(KOKORO.speed !== 1 ? { speed: KOKORO.speed } : {}) });
				const mp3 = await compressClip(wavBlob(a.audio, a.sampling_rate), kbps ?? DEFAULT_BITRATE_KBPS);
				// The bake refuses to ship uncompressed audio when the encoder is missing, and so does this.
				if (!mp3) throw new Error(`the MP3 encoder (@breezystack/lamejs) did not load, so the clips cannot be encoded as the Studio encodes them. Install it with:\n  ${INSTALL_HINT}`);
				const raw = Buffer.from(await mp3.arrayBuffer());
				clip = {
					audio: `data:audio/mpeg;base64,${raw.toString('base64')}`,
					// The clip's identity in the LTT: a hash of the bytes that ship (the bake's rule).
					clip: `sha256:${createHash('sha256').update(raw).digest('hex')}`,
					leadMs: mp3.leadMs ?? 0,
				};
				said.set(text, clip);
			}
			clips.push(clip);
			onClip?.(++done, total);
		}
		const em = emphasis?.[index];
		slides[index] = { text: String(texts[index] ?? ''), track, clips, ...(em?.length ? { emphasis: em } : {}) };
	}
	return slides;
}
