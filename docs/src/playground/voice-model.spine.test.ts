import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readVoiceSelection, selectChat, selectVoice } from '../lib/model-selection.js';
import { createVoiceModel } from './voice-model.js';

// The model spine, voice half: the Studio's voice is the stored VOICE selection, resolved and
// never laddered, and independent of the chat selection
// (engineering/decisions/2026-11-07-studio-model-spine.md).

type V = {
	rung: () => string;
	availability: () => { rung: string; readiness: { state: string; provider: string; voice: string; model: string } | null };
	prepareSelectedVoice: () => Promise<boolean>;
	setOrModel: (m: string) => void;
	setKokoroVoice: (v: string) => void;
	orVoice: () => string;
	kokoroVoice: () => string;
	__setKokoroInference: (fn: () => Promise<unknown>) => void;
};

function studioVoice({ key = 'sk-or-v1-test', keyState = 'ready', openKey }: { key?: string; keyState?: string; openKey?: (p: string) => Promise<unknown> } = {}) {
	let k = key;
	let ks = keyState;
	const v = createVoiceModel({
		getOpenRouterKey: () => k,
		keyPrefix: 'studio',
		selection: { read: readVoiceSelection, select: selectVoice, keyState: () => ks, openKey: openKey ?? (async () => {}) },
	}) as unknown as V;
	return {
		v,
		setKey: (next: string, state: string) => {
			k = next;
			ks = state;
		},
	};
}

/** Make the real Kokoro rung "loaded" without the 80 MB model. */
const loadKokoro = (v: V) => v.__setKokoroInference(async () => new Blob([new Uint8Array([1])], { type: 'audio/wav' }));

beforeEach(() => localStorage.clear());

describe('model spine — voice', () => {
	it('speaks the selected cloud voice even when on-device Kokoro is loaded (no implicit desktop default)', () => {
		selectVoice({ provider: 'openrouter', model: '', voice: 'af_heart' });
		const { v } = studioVoice();
		loadKokoro(v);
		expect(v.rung()).toBe('openrouter-tts');
	});

	it('speaks Kokoro when Kokoro is selected, even with a cloud key', () => {
		selectVoice({ provider: 'kokoro', voice: 'bf_emma' });
		const { v } = studioVoice();
		loadKokoro(v);
		expect(v.rung()).toBe('kokoro');
		expect(v.kokoroVoice()).toBe('bf_emma');
	});

	it('a selected Kokoro that is not loaded reads unavailable and stays silent — never the cloud voice', () => {
		selectVoice({ provider: 'kokoro' });
		const { v } = studioVoice();
		expect(v.rung()).toBe('silent');
		expect(v.availability().readiness).toMatchObject({ state: 'unavailable', provider: 'kokoro' });
	});

	it('the unseal race: a cloud voice whose key is still opening reads warming, then speaks once prepared', async () => {
		selectVoice({ provider: 'openrouter' });
		let ctl: { setKey: (k: string, s: string) => void } | null = null;
		const openKey = vi.fn(async () => ctl?.setKey('sk-or-v1-test', 'ready'));
		const made = studioVoice({ key: '', keyState: 'opening', openKey });
		ctl = made;
		loadKokoro(made.v); // a loaded Kokoro must NOT stand in while the key opens
		expect(made.v.rung()).toBe('silent');
		expect(made.v.availability().readiness?.state).toBe('warming');
		// A read prepares the selection before pinning it (read-aloud.ts).
		expect(await made.v.prepareSelectedVoice()).toBe(true);
		expect(openKey).toHaveBeenCalledWith('openrouter');
		expect(made.v.rung()).toBe('openrouter-tts');
	});

	it('a cloud voice with no key reads needs-key', () => {
		selectVoice({ provider: 'openrouter' });
		const { v } = studioVoice({ key: '', keyState: 'none' });
		expect(v.rung()).toBe('silent');
		expect(v.availability().readiness?.state).toBe('needs-key');
	});

	it('is independent of the chat selection', () => {
		selectVoice({ provider: 'kokoro', voice: 'af_heart' });
		const { v } = studioVoice();
		loadKokoro(v);
		selectChat({ provider: 'anthropic' });
		selectChat({ provider: 'prompt-api' });
		expect(v.rung()).toBe('kokoro');
		expect(readVoiceSelection().provider).toBe('kokoro');
	});

	it('picking a voice or model is selecting it: active at once', () => {
		selectVoice({ provider: 'openrouter' });
		const { v } = studioVoice();
		loadKokoro(v);
		v.setKokoroVoice('am_adam');
		expect(v.rung()).toBe('kokoro');
		v.setOrModel('x-ai/grok-tts');
		expect(v.rung()).toBe('openrouter-tts');
		expect(readVoiceSelection()).toMatchObject({ provider: 'openrouter', model: 'x-ai/grok-tts' });
	});

	it('survives a reload: a fresh model over the same storage speaks the same voice', () => {
		selectVoice({ provider: 'kokoro', voice: 'if_sara' });
		const a = studioVoice().v;
		loadKokoro(a);
		const b = studioVoice().v;
		loadKokoro(b);
		expect(b.rung()).toBe('kokoro');
		expect(b.kokoroVoice()).toBe('if_sara');
	});
});
