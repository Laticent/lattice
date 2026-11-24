import { beforeEach, describe, expect, it, vi } from 'vitest';

// Narration is KEPT compressed (engineering/decisions/2026-11-17-narration-codec-bakeoff.md): a raw-audio voice answers
// WAV, the reader plays that WAV at once and the device stores it at once, and `packForStore` (Ogg Opus in workers,
// opus-encode-pool.js) then replaces it in memory and on the device. These pin the voice model's half: what the device holds
// before and after the encode, and that a clear during the encode stays cleared. The encode itself is the browser's; the
// codec probe and Suono's tests cover it.

/** The device store: key -> stored type. `replaceClip` writes only over a key that is still there, as the real one does. */
const device = new Map<string, string>();
vi.mock('./narration-store.js', () => ({
	getClip: async () => null,
	putClip: async (key: string, blob: { type?: string }) => {
		device.set(key, String(blob?.type ?? ''));
		return true;
	},
	replaceClip: async (key: string, blob: { type?: string }) => {
		if (!device.has(key)) return false;
		device.set(key, String(blob?.type ?? ''));
		return true;
	},
	clearClips: async () => device.clear(),
}));

const { createVoiceModel } = await import('./voice-model.js');

type Clip = { size: number; type: string; arrayBuffer: () => Promise<ArrayBuffer> };
type V = {
	synthOne: (o: { text: string }) => Promise<unknown>;
	peekClip: (text: string) => Promise<Clip | null>;
	__setKokoroInference: (fn: (a: { text: string }) => Promise<unknown>) => void;
};

const clip = (type: string, size = 4800): Clip => ({ size, type, arrayBuffer: async () => new ArrayBuffer(size) });
const OGG = 'audio/ogg; codecs=opus';
const storedTypes = () => [...device.values()];

function model(answer: Clip, packForStore?: (b: Clip) => Promise<Clip | null>) {
	const v = createVoiceModel({ getOpenRouterKey: () => '', getSettings: () => ({ rung: 'kokoro', kokoroVoice: 'af_heart' }), keyPrefix: 'test-pack', packForStore }) as unknown as V;
	v.__setKokoroInference(async () => answer);
	return v;
}

/** An encode the test finishes by hand, so it can look at the device while the encode is still running. */
function heldEncode() {
	let finish: (c: Clip | null) => void = () => {};
	const pack = vi.fn(() => new Promise<Clip | null>((res) => (finish = res)));
	return { pack, finish: (c: Clip | null) => finish(c) };
}

beforeEach(() => {
	localStorage.clear();
	device.clear();
});

describe('packForStore', () => {
	it('stores the WAV at once, then replaces it with the Opus copy on the device and in memory', async () => {
		const enc = heldEncode();
		const v = model(clip('audio/wav'), enc.pack);
		await v.synthOne({ text: 'A sentence read once.' });
		// While the encode is still queued, the device already holds the clip: a reload now loses nothing.
		await vi.waitFor(() => expect(storedTypes()).toEqual(['audio/wav']));
		enc.finish(clip(OGG, 600));
		await vi.waitFor(() => expect(storedTypes()).toEqual([OGG]));
		expect(enc.pack).toHaveBeenCalledTimes(1);
		expect((await v.peekClip('A sentence read once.'))?.type).toBe(OGG);
	});

	it('leaves the device empty when narration audio is cleared during the encode', async () => {
		const enc = heldEncode();
		const v = model(clip('audio/wav'), enc.pack);
		await v.synthOne({ text: 'Cleared while encoding.' });
		await vi.waitFor(() => expect(storedTypes()).toEqual(['audio/wav']));
		device.clear(); // what clearNarrationAudio does (governance.ts)
		enc.finish(clip(OGG, 600));
		await vi.waitFor(() => expect(enc.pack).toHaveBeenCalledTimes(1));
		// Let the encode's continuation run, then check nothing was written back.
		await vi.waitFor(async () => expect((await v.peekClip('Cleared while encoding.'))?.type).toBe(OGG));
		expect(storedTypes()).toEqual([]);
	});

	it('keeps the WAV on the device and in memory when the encoder has nothing to give', async () => {
		const v = model(clip('audio/wav'), async () => null);
		await v.synthOne({ text: 'No encoder on this device.' });
		await vi.waitFor(() => expect(storedTypes()).toEqual(['audio/wav']));
		expect((await v.peekClip('No encoder on this device.'))?.type).toBe('audio/wav');
	});

	it('keeps the WAV on the device and in memory when the encoder throws', async () => {
		const v = model(clip('audio/wav'), async () => {
			throw new Error('worker died');
		});
		await v.synthOne({ text: 'The worker failed.' });
		await vi.waitFor(() => expect(storedTypes()).toEqual(['audio/wav']));
		expect((await v.peekClip('The worker failed.'))?.type).toBe('audio/wav');
	});

	it('stores the clip as before when no packer is given', async () => {
		const v = model(clip('audio/wav'));
		await v.synthOne({ text: 'No packer configured.' });
		await vi.waitFor(() => expect(storedTypes()).toEqual(['audio/wav']));
	});
});
