import { beforeEach, describe, expect, it } from 'vitest';
import { readVoiceSelection, selectVoice } from '@/lib/model-selection.js';
import { normalizeVoiceSelection } from './read-aloud';

// The stored voice id is corrected against the LIVE roster (a normalization write), so the id
// synthesis sends is one the provider publishes: never a known-invalid id (a latent 400).

const CATALOG = [
	{ id: 'hexgrad/kokoro-82m', name: 'Kokoro', promptPerM: 0.6, completionPerM: 0, voices: ['af_heart', 'bf_emma'] },
	{ id: 'x-ai/grok-voice-tts-1.0', name: 'Grok', promptPerM: 15, completionPerM: 0, voices: ['eve', 'ara'] },
];

beforeEach(() => localStorage.clear());

describe('normalizeVoiceSelection', () => {
	it('corrects a renamed voice id in storage and keeps the selection', async () => {
		selectVoice({ provider: 'openrouter', model: 'x-ai/grok-voice-tts-1.0', voice: 'Eve' });
		expect(await normalizeVoiceSelection(CATALOG)).toBe(true);
		expect(readVoiceSelection()).toMatchObject({ provider: 'openrouter', model: 'x-ai/grok-voice-tts-1.0', voice: 'eve' });
	});

	it('gives a chosen model with no voice the roster default instead of a foreign fallback id', async () => {
		selectVoice({ provider: 'openrouter', model: 'x-ai/grok-voice-tts-1.0' });
		await normalizeVoiceSelection(CATALOG);
		expect(readVoiceSelection().voice).toBe('eve');
	});

	it('leaves a valid voice and an unreachable catalog alone', async () => {
		selectVoice({ provider: 'kokoro', voice: 'bf_emma' });
		expect(await normalizeVoiceSelection(CATALOG)).toBe(false);
		expect(await normalizeVoiceSelection([])).toBe(false);
		expect(readVoiceSelection().voice).toBe('bf_emma');
	});
});
