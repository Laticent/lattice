// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

// Present together sends a member the presenter's clip as MP3 (narration-bake.ts `narrationClipForRoom`). The store now keeps
// raw-audio narration (Gemini, Kokoro) as Ogg Opus, which that path used to refuse, so every member got captions only.
// This pins the room path end to end on a stored Ogg clip: it is decoded back to WAV and sent as MP3 with its lead.

const held: { clip: Blob | null } = { clip: null };
vi.mock('./read-aloud', async (orig) => ({ ...(await orig<object>()), narrationClipFor: async () => held.clip }));

/** A stand-in offline audio context: "decodes" any bytes to a second of 440 Hz after 120 ms of silence, at its own rate. */
class FakeOfflineAudioContext {
	constructor(
		readonly channels: number,
		readonly length: number,
		readonly sampleRate: number,
	) {}
	async decodeAudioData() {
		const n = this.sampleRate;
		const lead = Math.round(this.sampleRate * 0.12);
		const data = new Float32Array(n + lead);
		for (let i = 0; i < n; i++) data[lead + i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / this.sampleRate);
		return { getChannelData: () => data, sampleRate: this.sampleRate };
	}
}

afterEach(() => {
	vi.unstubAllGlobals();
	held.clip = null;
});

describe('narrationClipForRoom', () => {
	it('sends a stored Ogg Opus clip as MP3, with the voice\'s leading silence', async () => {
		vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
		held.clip = new Blob([new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 2])], { type: 'audio/ogg; codecs=opus' });
		const { narrationClipForRoom } = await import('./narration-bake');
		const out = await narrationClipForRoom('A sentence the presenter already read.');
		expect(out?.mime).toBe('audio/mpeg');
		expect(out?.bytes.byteLength).toBeGreaterThan(1000);
		// The 120 ms of silence before the tone is measured from the decoded PCM and travels as the clip's lead.
		expect(out?.lead).toBeGreaterThanOrEqual(100);
	});

	it('has nothing to send when no clip is held', async () => {
		const { narrationClipForRoom } = await import('./narration-bake');
		expect(await narrationClipForRoom('Never read.')).toBeNull();
	});
});
