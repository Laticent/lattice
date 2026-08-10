// The speech compressor — the one place a WAV-producing voice becomes an mp3.
//
// What these pin is the CONTRACT that lets the rest of the narration path trust this module
// blindly: it never returns something bigger than it was given, it never touches audio that is
// already compressed, and every failure mode returns null (meaning "keep your original bytes")
// rather than throwing or, worse, returning mangled audio. A codec that fails loudly costs a
// re-render; one that fails quietly ships a deck that plays back at the wrong speed.

import { describe, expect, it } from 'vitest';
import { BITRATE_CHOICES, compressClip, DEFAULT_BITRATE_KBPS, encodeMp3, isCompressedAudio, mp3Clip, readPcmWav } from './narration-encode.js';

/** A canonical 44-byte mono 16-bit PCM WAV, the exact layout both producers write. */
function wav(pcm: Int16Array, rate = 24000, channels = 1): ArrayBuffer {
	const buf = new ArrayBuffer(44 + pcm.length * 2);
	const dv = new DataView(buf);
	const ascii = (off: number, s: string) => {
		for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
	};
	ascii(0, 'RIFF');
	dv.setUint32(4, 36 + pcm.length * 2, true);
	ascii(8, 'WAVE');
	ascii(12, 'fmt ');
	dv.setUint32(16, 16, true);
	dv.setUint16(20, 1, true);
	dv.setUint16(22, channels, true);
	dv.setUint32(24, rate, true);
	dv.setUint32(28, rate * channels * 2, true);
	dv.setUint16(32, channels * 2, true);
	dv.setUint16(34, 16, true);
	ascii(36, 'data');
	dv.setUint32(40, pcm.length * 2, true);
	new Int16Array(buf, 44).set(pcm);
	return buf;
}

/** ~`seconds` of a 220 Hz tone — real periodic signal, so the encoder has something to model.
 *  Silence compresses to almost nothing and would make a size assertion meaningless. */
function tone(seconds: number, rate = 24000): Int16Array {
	const out = new Int16Array(Math.floor(rate * seconds));
	for (let i = 0; i < out.length; i++) out[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 12000);
	return out;
}

const clipOf = (buf: ArrayBuffer, type: string) => ({ size: buf.byteLength, type, arrayBuffer: async () => buf.slice(0) });

describe('encodeMp3', () => {
	it('compresses 24 kHz mono speech-length audio several times over', async () => {
		const pcm = tone(2);
		const mp3 = await encodeMp3(pcm, 24000, 1, 64);
		expect(mp3).toBeTruthy();
		// 2 s of 24 kHz 16-bit mono is 96 000 B; at 64 kbps it should land near 16 000 B.
		expect(mp3!.byteLength).toBeLessThan(pcm.byteLength / 3);
		expect(mp3!.byteLength).toBeGreaterThan(1000);
	});

	it('emits a real MPEG frame sync, not an arbitrary blob', async () => {
		const mp3 = await encodeMp3(tone(0.5), 24000, 1, 64);
		// Every MPEG audio frame opens with 11 set sync bits: 0xFF then the top 3 bits of byte 2.
		expect(mp3![0]).toBe(0xff);
		expect(mp3![1] & 0xe0).toBe(0xe0);
	});

	it('honors the bitrate — a higher rate is a bigger file for identical input', async () => {
		const pcm = tone(1.5);
		const [low, high] = await Promise.all([encodeMp3(pcm, 24000, 1, 48), encodeMp3(pcm, 24000, 1, 128)]);
		expect(high!.byteLength).toBeGreaterThan(low!.byteLength * 1.8);
	});

	it('encodes every bitrate the workspace setting can produce', async () => {
		for (const kbps of BITRATE_CHOICES) {
			expect(await encodeMp3(tone(0.3), 24000, 1, kbps), `${kbps} kbps`).toBeTruthy();
		}
	});

	it('refuses a sample rate MPEG has no table for, rather than encoding it at the wrong speed', async () => {
		// The failure this prevents is not a crash: LAME encodes against the nearest table and the
		// clip plays back CHIPMUNKED. Shipping large beats shipping wrong.
		expect(await encodeMp3(tone(0.3, 23000), 23000, 1, 64)).toBeNull();
		expect(await encodeMp3(tone(0.3, 44100), 44100, 1, 64)).toBeTruthy(); // a rate it does have
	});

	it('returns null for empty input rather than an empty file', async () => {
		expect(await encodeMp3(new Int16Array(0), 24000, 1, 64)).toBeNull();
		expect(await encodeMp3(null as never, 24000, 1, 64)).toBeNull();
	});

	it('handles stereo by de-interleaving, not by encoding interleaved samples as mono', async () => {
		// A stereo response is a thing the wire can declare (`channels=2`). Encoding it as mono
		// would not fail — it would produce audio at double speed with the channels alternating.
		const frames = 24000;
		const inter = new Int16Array(frames * 2);
		for (let i = 0; i < frames; i++) {
			inter[i * 2] = Math.round(Math.sin((2 * Math.PI * 220 * i) / 24000) * 12000);
			inter[i * 2 + 1] = Math.round(Math.sin((2 * Math.PI * 440 * i) / 24000) * 12000);
		}
		const mp3 = await encodeMp3(inter, 24000, 2, 64);
		expect(mp3).toBeTruthy();
		// 1 s of stereo at 64 kbps ≈ 8 000 B. Encoded as mono it would have consumed the same
		// sample count in half the time and come out near half the size.
		expect(mp3!.byteLength).toBeGreaterThan(6000);
	});
});

describe('readPcmWav', () => {
	it('reads back the geometry the producers write', () => {
		const got = readPcmWav(wav(tone(0.1), 24000, 1));
		expect(got).toMatchObject({ channels: 1, sampleRate: 24000 });
		expect(got!.pcm.length).toBe(2400);
	});

	it('trusts the shorter of the declared data length and the bytes actually present', () => {
		// A truncated response that still parses would otherwise read past the buffer.
		const full = wav(tone(0.1));
		const cut = full.slice(0, full.byteLength - 1000);
		const got = readPcmWav(cut);
		expect(got!.pcm.length * 2).toBeLessThanOrEqual(cut.byteLength - 44);
	});

	it('returns null for anything it should not touch', () => {
		expect(readPcmWav(new ArrayBuffer(10))).toBeNull(); // too short for a header
		expect(readPcmWav(new Uint8Array(64).buffer)).toBeNull(); // no RIFF/WAVE tags
		const notPcm = wav(tone(0.1));
		new DataView(notPcm).setUint16(20, 3, true); // IEEE float, not PCM
		expect(readPcmWav(notPcm)).toBeNull();
		const not16 = wav(tone(0.1));
		new DataView(not16).setUint16(34, 24, true); // 24-bit
		expect(readPcmWav(not16)).toBeNull();
	});
});

describe('isCompressedAudio', () => {
	it('recognizes the compressed types, ignoring parameters and case', () => {
		for (const t of ['audio/mpeg', 'AUDIO/MPEG', 'audio/mpeg; charset=binary', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/mp4']) {
			expect(isCompressedAudio(t), t).toBe(true);
		}
	});

	it('does not claim raw audio is compressed', () => {
		for (const t of ['audio/wav', 'audio/x-wav', 'audio/pcm;rate=24000', '', null, undefined]) {
			expect(isCompressedAudio(t as string), String(t)).toBe(false);
		}
	});
});

describe('compressClip — the bake-time safety net', () => {
	it('compresses a WAV clip and reports the mp3 type it now is', async () => {
		const src = wav(tone(2));
		const out = await compressClip(clipOf(src, 'audio/wav'));
		expect(out).toBeTruthy();
		expect(out!.type).toBe('audio/mpeg');
		expect(out!.size).toBeLessThan(src.byteLength / 3);
	});

	it('passes already-compressed audio through untouched — mp3→mp3 is loss paid for nothing', async () => {
		expect(await compressClip(clipOf(new ArrayBuffer(5000), 'audio/mpeg'))).toBeNull();
		expect(await compressClip(clipOf(new ArrayBuffer(5000), 'audio/ogg; codecs=opus'))).toBeNull();
	});

	it('never returns something LARGER than it was given', async () => {
		// A very short clip at a high bitrate can encode bigger than its own source. A function
		// named "compress" handing back a bigger file is the one outcome worse than doing nothing.
		const src = wav(tone(0.05));
		const out = await compressClip(clipOf(src, 'audio/wav'), 128);
		if (out) expect(out.size).toBeLessThan(src.byteLength);
	});

	it('returns null — never throws — when the bytes are unreadable or not a WAV', async () => {
		expect(await compressClip({ size: 10, type: 'audio/wav', arrayBuffer: async () => { throw new Error('read failed'); } } as never)).toBeNull();
		expect(await compressClip(clipOf(new Uint8Array(64).buffer, 'audio/wav'))).toBeNull();
		expect(await compressClip(null as never)).toBeNull();
	});

	it('honors the bitrate it is handed', async () => {
		const src = wav(tone(1.5));
		const [low, high] = await Promise.all([compressClip(clipOf(src, 'audio/wav'), 48), compressClip(clipOf(src, 'audio/wav'), 128)]);
		expect(high!.size).toBeGreaterThan(low!.size * 1.8);
	});
});

describe('mp3Clip', () => {
	it('hands back a FRESH buffer per call, because decodeAudioData detaches the one it is given', async () => {
		// Not hypothetical: returning the same reference twice made the first play work and every
		// replay throw "Cannot decode detached ArrayBuffer" — and these clips are cached and replayed.
		const clip = mp3Clip(new Uint8Array([1, 2, 3, 4]));
		const a = await clip.arrayBuffer();
		const b = await clip.arrayBuffer();
		expect(a).not.toBe(b);
		expect(new Uint8Array(b)).toEqual(new Uint8Array([1, 2, 3, 4]));
	});

	it('reports the byte length as its size, so a size quote reads the real figure', () => {
		expect(mp3Clip(new Uint8Array(1234)).size).toBe(1234);
	});
});

describe('the default bitrate', () => {
	it('is one of the offered choices', () => {
		expect(BITRATE_CHOICES).toContain(DEFAULT_BITRATE_KBPS);
	});
});
