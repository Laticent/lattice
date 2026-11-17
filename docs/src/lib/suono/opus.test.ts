// @vitest-environment node
// Suono's Opus encoder (opus.ts). The encode itself needs a browser's WebCodecs, which Node and jsdom do not have, so the
// real round trip is the codec probe's (docs/scripts/ios-safari/codec-probe.js, every engine and the iOS Simulator). What
// runs here is what must hold without one: no encoder means null (the caller keeps its WAV), and the WAV reader that feeds it.
import { describe, expect, it } from 'vitest';
import { encodeWav } from './encode';
import { encodeOpus, samplesFromWav } from './opus';

describe('encodeOpus', () => {
	it('resolves null where the page has no WebCodecs, so the caller keeps its WAV', async () => {
		expect(typeof (globalThis as { AudioEncoder?: unknown }).AudioEncoder).toBe('undefined');
		expect(await encodeOpus(new Float32Array(2400), 24000)).toBeNull();
	});
});

describe('samplesFromWav', () => {
	it('reads back the samples and rate of a 16-bit mono WAV', async () => {
		const src = new Float32Array([0, 0.5, -0.5, 0.25]);
		const wav = await encodeWav(src, 24000).arrayBuffer();
		const out = samplesFromWav(wav);
		expect(out?.sampleRate).toBe(24000);
		expect(Array.from(out!.samples).map((x) => Math.round(x * 100) / 100)).toEqual([0, 0.5, -0.5, 0.25]);
	});

	it('averages a stereo WAV to mono', () => {
		const buf = new ArrayBuffer(44 + 8);
		const v = new DataView(buf);
		const w = (o: number, s: string) => {
			for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
		};
		w(0, 'RIFF');
		v.setUint32(4, 44, true);
		w(8, 'WAVE');
		w(12, 'fmt ');
		v.setUint32(16, 16, true);
		v.setUint16(20, 1, true);
		v.setUint16(22, 2, true);
		v.setUint32(24, 48000, true);
		v.setUint32(28, 48000 * 4, true);
		v.setUint16(32, 4, true);
		v.setUint16(34, 16, true);
		w(36, 'data');
		v.setUint32(40, 8, true);
		v.setInt16(44, 16384, true);
		v.setInt16(46, 0, true);
		v.setInt16(48, -16384, true);
		v.setInt16(50, -16384, true);
		const out = samplesFromWav(buf);
		expect(out?.sampleRate).toBe(48000);
		expect(Array.from(out!.samples)).toEqual([0.25, -0.5]);
	});

	it('returns null for bytes that are not a 16-bit PCM WAV', () => {
		expect(samplesFromWav(new ArrayBuffer(10))).toBeNull();
		expect(samplesFromWav(new TextEncoder().encode('ID3 an mp3 header, not a wav............').buffer as ArrayBuffer)).toBeNull();
	});
});
