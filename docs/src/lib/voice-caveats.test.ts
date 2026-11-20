// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { voiceCaveat } from './voice-caveats';

describe('voiceCaveat', () => {
	it('names the measured Flash-Lite voice, in both its id spellings', () => {
		expect(voiceCaveat('gemini-3.8-flash-lite-tts')?.note).toMatch(/differently from one line, or one play, to the next/);
		expect(voiceCaveat('gemini-3.9-flash-lite-preview-tts')).not.toBeNull();
	});
	it('says nothing about a voice that measured clean, or about none', () => {
		expect(voiceCaveat('gemini-3.8-flash-tts')).toBeNull();
		expect(voiceCaveat('google/gemini-3.1-flash-tts-preview')).toBeNull();
		expect(voiceCaveat('hexgrad/kokoro-82m')).toBeNull();
		expect(voiceCaveat('')).toBeNull();
		expect(voiceCaveat(undefined)).toBeNull();
	});
});
