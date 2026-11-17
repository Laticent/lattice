import { beforeEach, describe, expect, it } from 'vitest';
import { AUDIO_CACHE_MAX_BYTES, createVoiceModel } from './voice-model.js';

// The audio cache is bounded by BYTES as well as by count (2026-11-17). The count alone (200) was sized for MP3; a
// Gemini voice answers uncompressed PCM, about ten times the bytes a second, and 200 of those clips were enough, on top
// of Present, for an iPhone to reload the tab (PROBE=present-narration on the iOS Simulator).

type V = {
	synthOne: (o: { text: string }) => Promise<unknown>;
	peekClip: (text: string) => Promise<unknown>;
	__setKokoroInference: (fn: (a: { text: string }) => Promise<unknown>) => void;
};

/** A clip of `bytes` bytes in the shape the rungs hand back, without allocating them. */
const clip = (bytes: number) => ({ size: bytes, type: 'audio/wav', arrayBuffer: async () => new ArrayBuffer(8) });

function model(bytesPerClip: number) {
	const v = createVoiceModel({ getOpenRouterKey: () => '', getSettings: () => ({ rung: 'kokoro', kokoroVoice: 'af_heart' }), keyPrefix: 'test-budget' }) as unknown as V;
	v.__setKokoroInference(async () => clip(bytesPerClip));
	return v;
}

beforeEach(() => localStorage.clear());

describe('audio cache byte budget', () => {
	it('evicts the oldest clips once the bytes held pass the budget, long before the count does', async () => {
		const per = Math.ceil(AUDIO_CACHE_MAX_BYTES / 4); // four clips fill the budget
		const v = model(per);
		const texts = Array.from({ length: 8 }, (_, i) => `Sentence number ${i} is spoken here.`);
		for (const text of texts) await v.synthOne({ text });
		// Eight clips is far under the 200-clip count, so only the byte budget can have dropped the first ones.
		expect(await v.peekClip(texts[0])).toBeNull();
		expect(await v.peekClip(texts[3])).toBeNull();
		for (const text of texts.slice(5)) expect(await v.peekClip(text)).not.toBeNull();
	});

	it('keeps small clips by the count, as before', async () => {
		const v = model(1024);
		const texts = Array.from({ length: 8 }, (_, i) => `Short clip ${i}.`);
		for (const text of texts) await v.synthOne({ text });
		for (const text of texts) expect(await v.peekClip(text)).not.toBeNull();
	});
});
