import type { BlobLike } from './types';
/**
 * Wrap an ArrayBuffer as a `BlobLike`. `arrayBuffer()` returns a FRESH COPY (`.slice(0)`) every
 * call — `decodeAudioData` DETACHES its input (a real, spec'd side effect), and Suono caches +
 * replays clips, so handing back the same buffer twice throws "Cannot decode detached ArrayBuffer"
 * on the second play. A real Blob re-reads fresh per call for the same reason; this matches it.
 */
export declare function toBlobLike(buf: ArrayBuffer, type: string): BlobLike;
/**
 * Float32 PCM samples (e.g. Kokoro's raw output) → a mono 16-bit WAV `BlobLike`. Non-Float32 input
 * is coerced. A caller with interleaved/multi-channel float data should downmix before calling.
 */
export declare function encodeWav(samples: ArrayLike<number> | Float32Array, sampleRate: number): BlobLike;
/** Parse a raw-PCM response's Content-Type (e.g. "audio/pcm;rate=24000;channels=1"). */
export declare function parsePcmContentType(contentType?: string): {
    rate: number;
    channels: number;
};
/**
 * Wrap raw 16-bit PCM bytes (already little-endian int16) from a cloud TTS response into a WAV
 * `BlobLike`, reading the real sample rate/channels off the response's own Content-Type rather than
 * assuming — a per-model quirk, not a universal constant.
 */
export declare function wrapPcm(pcmBytes: Uint8Array, contentType?: string): BlobLike;
