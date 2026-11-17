import { beforeEach, describe, expect, it, vi } from 'vitest';

// Narration is KEPT compressed (engineering/decisions/2026-11-17-narration-codec-bakeoff.md): a raw-audio voice answers
// WAV, the reader plays that WAV at once, and `packForStore` (Ogg Opus in workers, opus-encode-pool.js) replaces it in
// memory and is what the device stores. These pin the voice model's half: what it hands the store, and when the in-memory
// copy is swapped. The encode itself is the browser's; the codec probe and Suono's tests cover it.

const stored: { key: string; type: string }[] = [];
vi.mock('./narration-store.js', () => ({
	getClip: async () => null,
	putClip: async (key: string, blob: { type?: string }) => {
		stored.push({ key, type: String(blob?.type ?? '') });
	},
	clearClips: async () => {},
}));

const { createVoiceModel } = await import('./voice-model.js');

type Clip = { size: number; type: string; arrayBuffer: () => Promise<ArrayBuffer> };
type V = {
	synthOne: (o: { text: string }) => Promise<unknown>;
	peekClip: (text: string) => Promise<Clip | null>;
	__setKokoroInference: (fn: (a: { text: string }) => Promise<unknown>) => void;
};

const clip = (type: string, size = 4800): Clip => ({ size, type, arrayBuffer: async () => new ArrayBuffer(size) });

function model(answer: Clip, packForStore?: (b: Clip) => Promise<Clip | null>) {
	const v = createVoiceModel({ getOpenRouterKey: () => '', getSettings: () => ({ rung: 'kokoro', kokoroVoice: 'af_heart' }), keyPrefix: 'test-pack', packForStore }) as unknown as V;
	v.__setKokoroInference(async () => answer);
	return v;
}

beforeEach(() => {
	localStorage.clear();
	stored.length = 0;
});

describe('packForStore', () => {
	it('swaps a WAV clip for its Opus copy in memory, and stores the Opus copy, not the WAV', async () => {
		const ogg = clip('audio/ogg; codecs=opus', 600);
		const pack = vi.fn(async () => ogg);
		const v = model(clip('audio/wav'), pack);
		const first = await v.synthOne({ text: 'A sentence read once.' });
		expect((first as Clip | { bytes?: Clip })).toBeTruthy();
		// The pack and the store write are unawaited by design (the WAV plays now): wait for the store write itself.
		await vi.waitFor(() => expect(stored.map((s) => s.type)).toEqual(['audio/ogg; codecs=opus']));
		expect(pack).toHaveBeenCalledTimes(1);
		expect((await v.peekClip('A sentence read once.'))?.type).toBe('audio/ogg; codecs=opus');
	});

	it('keeps and stores the WAV when the encoder has nothing to give', async () => {
		const v = model(clip('audio/wav'), async () => null);
		await v.synthOne({ text: 'No encoder on this device.' });
		await vi.waitFor(() => expect(stored.map((s) => s.type)).toEqual(['audio/wav']));
		expect((await v.peekClip('No encoder on this device.'))?.type).toBe('audio/wav');
	});

	it('keeps and stores the WAV when the encoder throws', async () => {
		const v = model(clip('audio/wav'), async () => {
			throw new Error('worker died');
		});
		await v.synthOne({ text: 'The worker failed.' });
		await vi.waitFor(() => expect(stored.map((s) => s.type)).toEqual(['audio/wav']));
		expect((await v.peekClip('The worker failed.'))?.type).toBe('audio/wav');
	});

	it('stores the clip as before when no packer is given', async () => {
		const v = model(clip('audio/wav'));
		await v.synthOne({ text: 'No packer configured.' });
		await vi.waitFor(() => expect(stored.map((s) => s.type)).toEqual(['audio/wav']));
	});
});
