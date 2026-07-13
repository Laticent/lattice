// Suono — audio encoding. PURE, node-safe (no window / no AudioContext): turns raw samples or a raw
// PCM response into a standard WAV `BlobLike` any decodeAudioData can play. Unit-tested for header
// correctness. Lifted from voice-model.js's `wavBlob` / `pcmBlobFromResponse` — the two byte
// layouts a caller feeds Suono (Kokoro returns Float32 PCM; some cloud TTS returns raw PCM).

import type { BlobLike } from './types';

/**
 * Wrap an ArrayBuffer as a `BlobLike`. `arrayBuffer()` returns a FRESH COPY (`.slice(0)`) every
 * call — `decodeAudioData` DETACHES its input (a real, spec'd side effect), and Suono caches +
 * replays clips, so handing back the same buffer twice throws "Cannot decode detached ArrayBuffer"
 * on the second play. A real Blob re-reads fresh per call for the same reason; this matches it.
 */
export function toBlobLike(buf: ArrayBuffer, type: string): BlobLike {
	return { size: buf.byteLength, type, arrayBuffer: async () => buf.slice(0) };
}

/** Clamp to [-1, 1] and scale to signed 16-bit (asymmetric — the int16 range isn't symmetric). */
function writePcm16(dv: DataView, offset: number, samples: Float32Array): void {
	for (let i = 0; i < samples.length; i++) {
		const v = Math.max(-1, Math.min(1, samples[i]));
		dv.setInt16(offset + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
	}
}

function writeAscii(dv: DataView, offset: number, str: string): void {
	for (let i = 0; i < str.length; i++) dv.setUint8(offset + i, str.charCodeAt(i));
}

/** Write a canonical 44-byte PCM WAV header for `dataBytes` of 16-bit audio. */
function writeWavHeader(dv: DataView, dataBytes: number, rate: number, channels: number): void {
	const bitsPerSample = 16;
	const blockAlign = channels * (bitsPerSample / 8);
	writeAscii(dv, 0, 'RIFF');
	dv.setUint32(4, 36 + dataBytes, true);
	writeAscii(dv, 8, 'WAVE');
	writeAscii(dv, 12, 'fmt ');
	dv.setUint32(16, 16, true);
	dv.setUint16(20, 1, true); // PCM
	dv.setUint16(22, channels, true);
	dv.setUint32(24, rate, true);
	dv.setUint32(28, rate * blockAlign, true);
	dv.setUint16(32, blockAlign, true);
	dv.setUint16(34, bitsPerSample, true);
	writeAscii(dv, 36, 'data');
	dv.setUint32(40, dataBytes, true);
}

/**
 * Float32 PCM samples (e.g. Kokoro's raw output) → a mono 16-bit WAV `BlobLike`. Non-Float32 input
 * is coerced. A caller with interleaved/multi-channel float data should downmix before calling.
 */
export function encodeWav(samples: ArrayLike<number> | Float32Array, sampleRate: number): BlobLike {
	const f32 = samples instanceof Float32Array ? samples : Float32Array.from(samples ?? []);
	const dataBytes = f32.length * 2;
	const buf = new ArrayBuffer(44 + dataBytes);
	const dv = new DataView(buf);
	writeWavHeader(dv, dataBytes, sampleRate, 1);
	writePcm16(dv, 44, f32);
	return toBlobLike(buf, 'audio/wav');
}

/** Parse a raw-PCM response's Content-Type (e.g. "audio/pcm;rate=24000;channels=1"). */
export function parsePcmContentType(contentType?: string): { rate: number; channels: number } {
	const rate = Number(/rate=(\d+)/.exec(contentType || '')?.[1]) || 24000;
	const channels = Number(/channels=(\d+)/.exec(contentType || '')?.[1]) || 1;
	return { rate, channels };
}

/**
 * Wrap raw 16-bit PCM bytes (already little-endian int16) from a cloud TTS response into a WAV
 * `BlobLike`, reading the real sample rate/channels off the response's own Content-Type rather than
 * assuming — a per-model quirk, not a universal constant.
 */
export function wrapPcm(pcmBytes: Uint8Array, contentType?: string): BlobLike {
	const { rate, channels } = parsePcmContentType(contentType);
	const n = pcmBytes.length;
	const buf = new ArrayBuffer(44 + n);
	const dv = new DataView(buf);
	writeWavHeader(dv, n, rate, channels);
	new Uint8Array(buf, 44).set(pcmBytes);
	return toBlobLike(buf, 'audio/wav');
}
