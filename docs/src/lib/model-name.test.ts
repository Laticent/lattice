import { describe, expect, it } from 'vitest';
import { modelDisplayName, nameFromId, voiceDisplayName } from './model-name';

// One formatter for every surface that names a model (model spine).
describe('model-name', () => {
	it('reads ids, aliases and on-device providers the same way everywhere', () => {
		expect(nameFromId('~anthropic/claude-sonnet-latest')).toBe('Claude Sonnet (latest)');
		expect(nameFromId('models/gemini-3.8-flash-lite-tts')).toBe('Gemini 3.8 Flash Lite TTS');
		expect(nameFromId('hexgrad/kokoro-82m')).toBe('Kokoro 82M');
		expect(modelDisplayName({ id: 'x', name: 'Anthropic: Claude Sonnet 5.5' })).toBe('Claude Sonnet 5.5');
		expect(modelDisplayName({ provider: 'kokoro' })).toBe('Kokoro');
		expect(modelDisplayName({ provider: 'gemini' })).toBe('Gemini default');
		expect(modelDisplayName({})).toBe('Choose a model');
	});
	it('reads voice ids', () => {
		expect(voiceDisplayName('af_heart')).toBe('Heart');
		expect(voiceDisplayName('eve')).toBe('Eve');
		expect(voiceDisplayName('Kore')).toBe('Kore');
		expect(voiceDisplayName('')).toBe('Default voice');
	});
});
