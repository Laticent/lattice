// Speech compression — the ONE place a voice that returns uncompressed audio becomes an mp3.
//
// WHY THIS EXISTS. Two of the nine speech engines hand back raw samples rather than a
// compressed stream: on-device Kokoro (Float32 PCM off the worker) and Gemini (16-bit PCM off
// the OpenRouter speech route). Both were wrapped in a WAV header and shipped as-is. WAV is
// PCM with 44 bytes of preamble — no compression at all — so those two engines cost ~7.7x the
// bytes of the mp3 roster for the same sentence, measured from this repo's own committed voice
// samples: Gemini's 35-character sample is 132,524 B where the mp3 engines land at 11–29 KB.
//
// That is the dominant term in the exported webpage's size. A baked deck inlines every clip as
// a base64 `data:` URI (4/3 inflation on top), so a 300-sentence deck narrated on-device came
// to ~145 MB of audio where the same deck in a cloud voice came to ~19 MB. #1462 item 4.
//
// WHAT IT DOES NOT DO. It never re-encodes audio that is ALREADY compressed. An mp3 from the
// cloud roster passes through untouched — transcoding mp3→mp3 is generation loss paid for
// nothing, since those clips are already at the rate this module would target.
//
// WHY MP3 AND NOT OPUS. Opus is the better codec at these bitrates and it is not close. It is
// also the wrong answer here: the output of this module is inlined into a self-contained
// webpage that someone else opens, once, in whatever browser they happen to have, offline,
// with no way to fix it if it does not play. mp3 is the only audio format with no practical
// decoder gap anywhere — and `data:audio/mpeg` needs no container muxing, no WebCodecs, and no
// feature detection at the far end. The size win over WAV is 6x; the further win Opus would
// buy is not worth a board member hearing silence.
//
// The encoder (`@breezystack/lamejs`, the maintained LAME port) is loaded through a DYNAMIC
// import and every failure degrades to "return null", meaning the caller ships the original
// uncompressed bytes. That is deliberate on two counts: `voice-model.js` must stay loadable by
// plain Node (test/unit/playground/voice-model.test.js loads it with no bundler and no docs/
// node_modules on the resolution path), and a missing encoder must cost bytes, never audio.

/** The bitrates offered in the workspace's narration settings, kbps, mono. */
export const BITRATE_CHOICES = [48, 64, 96, 128];

/**
 * The default an author gets without touching a setting.
 *
 * 64 kbps mono, measured rather than assumed. Against the committed Gemini sample it is 5.9x
 * smaller than the WAV it replaces (132,524 B → 22,464 B) — which lands it INSIDE the range
 * the cloud mp3 engines already ship at for the same sentence (11,373–29,184 B). So the choice
 * is not "how much quality to give up"; it is "match what eight of the nine engines already
 * sound like on this deck", which is also what makes the size quote in the export panel
 * collapse to roughly one rate instead of two classes 7.7x apart.
 *
 * Speech at 24 kHz has almost no content above 8 kHz for a higher rate to carry, and the
 * encode runs at ~29x realtime here, so the default is also the fastest of the choices.
 */
export const DEFAULT_BITRATE_KBPS = 64;

/**
 * Sample rates MPEG Layer III actually defines — MPEG-1, MPEG-2 LSF, and MPEG-2.5. Both of our
 * producers are 24 kHz (MPEG-2), which is in the set.
 *
 * Guarded rather than assumed because LAME does not reject an undefined rate; it encodes
 * against the nearest table and the clip plays back at the WRONG SPEED. A voice that shipped
 * chipmunked is a worse outcome than a voice that ships large, so anything off this list falls
 * back to the uncompressed bytes.
 */
const MPEG_RATES = new Set([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]);

/** LAME's frame size — the sample count `encodeBuffer` consumes per call, per channel. */
const FRAME = 1152;

/**
 * Samples of SILENCE every LAME stream carries at its head, before the first real audio.
 *
 * `ENCDELAY` (576) + `DECDELAY` (528) — both constants of the encoder, visible in the bundled
 * source. It is a fixed count, not a per-clip property, which is the whole reason this is
 * correctable: a decoder normally trims it using the Xing/Info/LAME header, and lamejs writes
 * no such header, so nothing downstream can. At 24 kHz that is 46 ms of leading silence on
 * EVERY clip — audio starting after its own caption, on every sentence.
 *
 * Exported so the consumer that plays these clips can seek past it. Anything that ships an
 * encoded clip must carry this figure alongside it or reproduce the defect.
 */
export const ENCODER_LEAD_SAMPLES = 576 + 528;

/** The encoder's leading silence in MILLISECONDS at a given sample rate. */
export function encoderLeadMs(sampleRate) {
	return sampleRate > 0 ? (ENCODER_LEAD_SAMPLES / sampleRate) * 1000 : 0;
}

/** In-flight/loaded module promise, or null when nothing has been attempted since the last
 *  failure. Never holds a rejected outcome — see `lame`. */
let encoderModule = null;
/** Consecutive load failures. Bounds the retry so a genuinely absent encoder is cheap. */
let encoderFailures = 0;
/** How many times a failed load is retried before the module gives up for this session. */
const MAX_LOAD_ATTEMPTS = 3;

/**
 * Load the encoder, memoizing SUCCESS but only briefly memoizing failure.
 *
 * The first version cached the failure forever, on the reasoning that a build with no encoder
 * should not pay a rejected dynamic import per sentence — 300 of them on a bake. That reasoning
 * is right about cost and wrong about consequence: in the browser this is a lazily-fetched
 * chunk, so ONE flaky fetch (a rotated build hash on a long-open Studio tab is the realistic
 * case) disabled compression for the entire session. Silently — every subsequent clip shipped
 * uncompressed while the size quote still priced them as mp3, roughly 6x under, with no warning
 * because both payload thresholds gate on the estimate rather than the bytes.
 *
 * So: retry a bounded number of times, then stop. A transient failure recovers; a real absence
 * still costs three attempts rather than three hundred.
 */
async function lame() {
	if (!encoderModule) {
		if (encoderFailures >= MAX_LOAD_ATTEMPTS) return null;
		encoderModule = import('@breezystack/lamejs')
			.then((m) => m?.default ?? m)
			.catch(() => null);
	}
	const mod = await encoderModule;
	if (!mod) {
		encoderFailures++;
		encoderModule = null; // let the next call try again, up to the cap
	}
	return mod;
}

/**
 * Can this session compress at all? Distinguishes "the encoder is missing" from "this
 * particular clip could not be encoded" — `compressClip` returns null for both, and the two
 * deserve very different responses: one clip at an exotic sample rate shipping large is a
 * rounding error, while a dead encoder means EVERY clip ships ~6x its quoted size.
 */
export async function encoderAvailable() {
	return !!(await lame())?.Mp3Encoder;
}

/**
 * Encode interleaved 16-bit PCM to mp3 bytes. Returns null when the encoder is unavailable,
 * the sample rate is not one MPEG defines, or the encode throws — every one of which means
 * "the caller keeps its uncompressed bytes", never "the sentence has no audio".
 *
 * `channels` is honored rather than assumed: both of today's producers are mono, but Gemini's
 * channel count is read off a response header (`audio/pcm;rate=24000;channels=1`), so a stereo
 * response is a thing the wire can say. De-interleaving two channels is cheaper than the
 * silent quality cliff of encoding interleaved samples as if they were mono.
 */
export async function encodeMp3(int16, sampleRate, channels = 1, kbps = DEFAULT_BITRATE_KBPS) {
	if (!(int16?.length > 0) || !MPEG_RATES.has(sampleRate)) return null;
	// REFUSE an implausible channel count instead of mono-mixing it. `channels` is read off a
	// response header, so 6 (or 0) is a thing the wire can say — and encoding 6-channel
	// interleaved PCM as mono is exactly the silent quality cliff this function claims to avoid,
	// playing back at a sixth speed. Returning null keeps the original bytes.
	if (channels !== 1 && channels !== 2) return null;
	const ch = channels;
	const mod = await lame();
	const Encoder = mod?.Mp3Encoder;
	if (!Encoder) return null;
	try {
		const enc = new Encoder(ch, sampleRate, kbps);
		const parts = [];
		let total = 0;
		const push = (buf) => {
			if (buf?.length) {
				parts.push(buf);
				total += buf.length;
			}
		};
		if (ch === 1) {
			for (let i = 0; i < int16.length; i += FRAME) push(enc.encodeBuffer(int16.subarray(i, i + FRAME)));
		} else {
			const frames = Math.ceil(int16.length / 2 / FRAME);
			const left = new Int16Array(FRAME);
			const right = new Int16Array(FRAME);
			for (let f = 0; f < frames; f++) {
				const base = f * FRAME * 2;
				const n = Math.min(FRAME, Math.max(0, (int16.length - base) >> 1));
				for (let i = 0; i < n; i++) {
					left[i] = int16[base + i * 2];
					right[i] = int16[base + i * 2 + 1];
				}
				push(enc.encodeBuffer(left.subarray(0, n), right.subarray(0, n)));
			}
		}
		push(enc.flush());
		if (!total) return null;
		const out = new Uint8Array(total);
		let at = 0;
		for (const p of parts) {
			out.set(p, at);
			at += p.length;
		}
		return out;
	} catch {
		// A codec that throws must cost bytes, not the sentence. The caller ships the original.
		return null;
	}
}

/**
 * The blob-LIKE shape the rest of the narration path passes around — `{size, type,
 * arrayBuffer()}`, deliberately not a real `Blob`.
 *
 * Same reasoning as `pcmBlobFromResponse` in voice-model.js, and it has already cost a live
 * bug there: `arrayBuffer()` hands back a FRESH COPY every call because Suono's
 * `decodeAudioData` DETACHES the buffer it is given, and these clips are cached and replayed.
 * Returning the same reference twice makes the first play work and every replay throw
 * "Cannot decode detached ArrayBuffer".
 */
export function mp3Clip(bytes) {
	const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
	return { size: buf.byteLength, type: 'audio/mpeg', arrayBuffer: async () => buf.slice(0) };
}

/** Does this MIME name audio that is already compressed, i.e. that must pass through untouched? */
export function isCompressedAudio(type) {
	const t = String(type ?? '')
		.split(';')[0]
		.trim()
		.toLowerCase();
	return t === 'audio/mpeg' || t === 'audio/mp3' || t === 'audio/ogg' || t === 'audio/opus' || t === 'audio/webm' || t === 'audio/aac' || t === 'audio/mp4';
}

/**
 * Read a canonical PCM WAV's header. Returns null for anything this module should not touch —
 * a truncated header, a non-PCM codec, a bit depth other than 16 — so the caller ships the
 * bytes it already has rather than mangling them.
 *
 * Deliberately strict about `fmt ` being the first chunk at offset 12 and `data` following it.
 * That is the layout BOTH of our producers write (`wavBlob`, `pcmBlobFromResponse`) and this
 * function's only job is to undo those two. A general RIFF chunk walker would be more code
 * standing behind a `null` that costs nothing.
 */
export function readPcmWav(buf) {
	if (!buf || buf.byteLength < 44) return null;
	const dv = new DataView(buf);
	const tag = (off) => String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
	if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || tag(12) !== 'fmt ') return null;
	if (dv.getUint16(20, true) !== 1 || dv.getUint16(34, true) !== 16) return null; // PCM, 16-bit
	const channels = dv.getUint16(22, true);
	const sampleRate = dv.getUint32(24, true);
	const fmtLen = dv.getUint32(16, true);
	const dataOff = 12 + 8 + fmtLen;
	if (buf.byteLength < dataOff + 8 || tag(dataOff) !== 'data') return null;
	const declared = dv.getUint32(dataOff + 4, true);
	// Trust the SHORTER of the declared length and what is actually present. A truncated
	// response that still parses would otherwise read past the buffer.
	const len = Math.min(declared, buf.byteLength - dataOff - 8);
	if (!(len > 1)) return null;
	// `& ~1` — an odd byte count would misalign the Int16Array and throw on construction.
	return { channels, sampleRate, pcm: new Int16Array(buf.slice(dataOff + 8, dataOff + 8 + (len & ~1))) };
}

/**
 * The safety net, and the general form of this module: given any clip's bytes, hand back a
 * COMPRESSED equivalent — or null when there is nothing to gain or nothing safe to do.
 *
 * Compressed input passes through (null). Uncompressed input is decoded, re-encoded, and
 * returned only if it actually came out smaller — a two-second clip at a bitrate above its own
 * source rate can grow, and shipping a bigger file from a function named "compress" is the one
 * outcome that would make this worse than doing nothing.
 */
export async function compressClip(bytes, kbps = DEFAULT_BITRATE_KBPS) {
	if (!bytes || isCompressedAudio(bytes.type)) return null;
	let buf;
	try {
		buf = await bytes.arrayBuffer();
	} catch {
		return null;
	}
	const wav = readPcmWav(buf);
	if (!wav) return null;
	const mp3 = await encodeMp3(wav.pcm, wav.sampleRate, wav.channels, kbps);
	if (!mp3 || mp3.byteLength >= buf.byteLength) return null;
	// `leadMs` rides WITH the bytes. A consumer that plays this clip without seeking past it
	// puts 46 ms of silence in front of every sentence — see ENCODER_LEAD_SAMPLES.
	return Object.assign(mp3Clip(mp3), { leadMs: encoderLeadMs(wav.sampleRate) });
}
