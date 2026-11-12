// Turning a voice provider's answer into WAV bytes. Pure, with no imports, so the page, the decode worker
// (voice-decode-worker.js) and Node all load the same code and produce the same bytes.
//
// Why a worker runs it at all (engineering/decisions/2026-11-11-voice-synthesis-spine.md §9.6): Gemini answers
// with the clip as base64 inside a JSON body. Parsing that JSON and decoding the base64 was measured in real
// Chromium at 4x CPU throttling (a mid-range phone) at 19 ms for an 8 s clip, 51 ms for 20 s and 123 ms for 40 s,
// all on the main thread while Present reads aloud.

/**
 * The response's declared PCM geometry, e.g. "audio/pcm;rate=24000;channels=1". ONE parser, because every consumer
 * has to agree about the sample rate: a mismatch does not fail, it plays the clip back at the wrong speed.
 */
export function parsePcmHeaderInfo(contentType) {
	return {
		rate: Number(/rate=(\d+)/.exec(contentType || '')?.[1]) || 24000,
		channels: Number(/channels=(\d+)/.exec(contentType || '')?.[1]) || 1,
	};
}

/** Raw 16-bit PCM wrapped in a standard 44-byte WAV header, as a fresh ArrayBuffer. */
export function pcmToWavBuffer(pcmBytes, contentType) {
	const { rate, channels } = parsePcmHeaderInfo(contentType);
	const bitsPerSample = 16;
	const blockAlign = channels * (bitsPerSample / 8);
	const byteRate = rate * blockAlign;
	const n = pcmBytes.length;
	const buf = new ArrayBuffer(44 + n);
	const dv = new DataView(buf);
	const wstr = (off, str) => {
		for (let i = 0; i < str.length; i++) dv.setUint8(off + i, str.charCodeAt(i));
	};
	wstr(0, 'RIFF');
	dv.setUint32(4, 36 + n, true);
	wstr(8, 'WAVE');
	wstr(12, 'fmt ');
	dv.setUint32(16, 16, true);
	dv.setUint16(20, 1, true);
	dv.setUint16(22, channels, true);
	dv.setUint32(24, rate, true);
	dv.setUint32(28, byteRate, true);
	dv.setUint16(32, blockAlign, true);
	dv.setUint16(34, bitsPerSample, true);
	wstr(36, 'data');
	dv.setUint32(40, n, true);
	new Uint8Array(buf, 44).set(pcmBytes);
	return buf;
}

/** Base64 to bytes: the native decoder where the engine has one (Chromium 140+, Safari 18.2+, Firefox 133+). */
export function base64ToBytes(b64) {
	if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(b64);
	const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

const isRiff = (b) => b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46;

/**
 * One Gemini `generateContent` answer (its raw body bytes) to a WAV clip.
 * The 3.8 TTS models answer WAV with a RIFF header; an older model's headerless 16-bit PCM is wrapped here.
 * A bad answer is a value, never a throw, so a worker can report it without looking like a crashed worker.
 * @param {ArrayBuffer} body
 * @returns {{ wav: ArrayBuffer, wrapped: boolean } | { error: string }}
 */
export function decodeGeminiSpeech(body) {
	let json;
	try {
		json = JSON.parse(new TextDecoder().decode(body));
	} catch (e) {
		return { error: `Gemini returned unreadable JSON: ${e?.message || e}` };
	}
	const part = (json?.candidates?.[0]?.content?.parts || []).find((p) => p?.inlineData?.data);
	if (!part) return { error: 'Gemini returned no audio' };
	let bytes;
	try {
		bytes = base64ToBytes(part.inlineData.data);
	} catch (e) {
		return { error: `Gemini returned unreadable audio: ${e?.message || e}` };
	}
	if (!bytes.length) return { error: 'Gemini returned empty audio' };
	const mime = String(part.inlineData.mimeType || '');
	if (isRiff(bytes) || /wav/i.test(mime)) {
		// The decoded array owns its buffer whole, so it transfers without a copy.
		const wav = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
		return { wav, wrapped: false };
	}
	// Headerless L16 (an older model, or a non-default format): 24 kHz mono unless the type says.
	return { wav: pcmToWavBuffer(bytes, mime || 'audio/L16;rate=24000'), wrapped: true };
}
