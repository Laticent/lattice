import { describe, expect, it } from 'vitest';
import { encodeWav, parsePcmContentType, toBlobLike, wrapPcm } from './encode';

async function bytesOf(b: { arrayBuffer(): Promise<ArrayBuffer> }): Promise<DataView> {
	return new DataView(await b.arrayBuffer());
}
const ascii = (dv: DataView, off: number, len: number) =>
	Array.from({ length: len }, (_, i) => String.fromCharCode(dv.getUint8(off + i))).join('');

describe('encodeWav', () => {
	it('writes a canonical 44-byte mono 16-bit WAV header', async () => {
		const blob = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 24000);
		expect(blob.type).toBe('audio/wav');
		expect(blob.size).toBe(44 + 4 * 2);
		const dv = await bytesOf(blob);
		expect(ascii(dv, 0, 4)).toBe('RIFF');
		expect(ascii(dv, 8, 4)).toBe('WAVE');
		expect(ascii(dv, 12, 4)).toBe('fmt ');
		expect(ascii(dv, 36, 4)).toBe('data');
		expect(dv.getUint16(20, true)).toBe(1); // PCM
		expect(dv.getUint16(22, true)).toBe(1); // mono
		expect(dv.getUint32(24, true)).toBe(24000); // sample rate
		expect(dv.getUint16(34, true)).toBe(16); // bits
		expect(dv.getUint32(40, true)).toBe(4 * 2); // data bytes
	});

	it('clamps out-of-range samples and scales int16 asymmetrically', async () => {
		const dv = await bytesOf(encodeWav(new Float32Array([2, -2, 0]), 8000));
		expect(dv.getInt16(44, true)).toBe(0x7fff); // +2 clamps to +full scale
		expect(dv.getInt16(46, true)).toBe(-0x8000); // -2 clamps to -full scale
		expect(dv.getInt16(48, true)).toBe(0);
	});

	it('coerces non-Float32 sample input', () => {
		expect(encodeWav([0, 0] as unknown as number[], 8000).size).toBe(44 + 4);
		expect(encodeWav(null as unknown as Float32Array, 8000).size).toBe(44);
	});
});

describe('wrapPcm / parsePcmContentType', () => {
	it('reads rate + channels off the content-type', () => {
		expect(parsePcmContentType('audio/pcm;rate=24000;channels=1')).toEqual({ rate: 24000, channels: 1 });
		expect(parsePcmContentType('audio/L16;rate=16000;channels=2')).toEqual({ rate: 16000, channels: 2 });
		expect(parsePcmContentType(undefined)).toEqual({ rate: 24000, channels: 1 }); // defaults
	});

	it('wraps raw PCM bytes into a WAV with the response-declared rate', async () => {
		const pcm = new Uint8Array([1, 2, 3, 4]);
		const blob = wrapPcm(pcm, 'audio/pcm;rate=16000;channels=1');
		expect(blob.size).toBe(44 + 4);
		const dv = await bytesOf(blob);
		expect(dv.getUint32(24, true)).toBe(16000);
		expect(dv.getUint8(44)).toBe(1); // payload copied in after the header
		expect(dv.getUint8(47)).toBe(4);
	});
});

describe('toBlobLike', () => {
	it('returns a FRESH copy each arrayBuffer() call (decodeAudioData detaches its input)', async () => {
		const src = new Uint8Array([9, 8, 7]).buffer;
		const b = toBlobLike(src, 'audio/wav');
		const a1 = await b.arrayBuffer();
		const a2 = await b.arrayBuffer();
		expect(a1).not.toBe(a2); // distinct buffers — a detach of one can't poison the replay
		expect(new Uint8Array(a2)).toEqual(new Uint8Array([9, 8, 7]));
	});
});
