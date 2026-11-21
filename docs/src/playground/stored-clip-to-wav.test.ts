// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isStoredOgg, storedClipAsWav } from './stored-clip-to-wav.js';

// The store keeps raw-audio narration as Ogg Opus; the export and Present together still ship MP3 made from WAV. These pin
// the bridge: Ogg comes back as WAV, everything else passes through, and a failed decode leaves the clip as it was.

const ogg = () => new Blob([new Uint8Array([0x4f, 0x67, 0x67, 0x53])], { type: 'audio/ogg; codecs=opus' });
const decoded = (n: number, sampleRate = 24000) => async () => ({ getChannelData: () => new Float32Array(n).fill(0.25), sampleRate });

describe('storedClipAsWav', () => {
	it('decodes the store\'s Ogg Opus back to 16-bit WAV at the decoded rate', async () => {
		const out = await storedClipAsWav(ogg(), { decode: decoded(2400) });
		expect((out as Blob).type).toBe('audio/wav');
		const bytes = new DataView(await (out as Blob).arrayBuffer());
		expect(bytes.getUint32(24, true)).toBe(24000);
		expect(bytes.getUint32(40, true)).toBe(2400 * 2);
	});

	it('passes a clip that is not Ogg through untouched (WAV, MP3)', async () => {
		for (const type of ['audio/wav', 'audio/mpeg']) {
			const clip = new Blob([new Uint8Array(8)], { type });
			expect(await storedClipAsWav(clip, { decode: decoded(10) })).toBe(clip);
		}
	});

	it('keeps the Ogg clip when the decode fails or no decoder exists', async () => {
		const clip = ogg();
		expect(
			await storedClipAsWav(clip, {
				decode: async () => {
					throw new Error('bad stream');
				},
			}),
		).toBe(clip);
		expect(await storedClipAsWav(clip)).toBe(clip); // Node has no OfflineAudioContext
		expect(await storedClipAsWav(null)).toBeNull();
	});

	it('recognizes the store\'s type', () => {
		expect(isStoredOgg('audio/ogg; codecs=opus')).toBe(true);
		expect(isStoredOgg('audio/ogg')).toBe(true);
		expect(isStoredOgg('audio/mpeg')).toBe(false);
		expect(isStoredOgg('')).toBe(false);
	});
});
