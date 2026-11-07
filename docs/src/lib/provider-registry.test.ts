import { describe, expect, it } from 'vitest';
import { CURATED, curate, curatedDefault, PROVIDERS, providerLabel } from './provider-registry.js';

// Curation is a preference over the LIVE list: it orders and recommends, never pins.

describe('provider registry', () => {
	it('says which providers chat, which speak, and which take a key', () => {
		expect(PROVIDERS.gemini).toMatchObject({ chat: true, voice: true, keyed: true });
		expect(PROVIDERS.anthropic.voice).toBe(false);
		expect(PROVIDERS.openai.voice).toBe(false); // owner decision 2: OpenAI voice is a follow-up
		expect(PROVIDERS.kokoro).toMatchObject({ source: 'device', voice: true, chat: false });
		expect(providerLabel('prompt-api')).toBe('Browser built-in');
	});

	it('orders curated families first and keeps every live model', () => {
		const live = [{ id: 'gemini-3.1-flash-tts-preview' }, { id: 'gemini-3.8-flash-tts' }, { id: 'gemini-2.5-flash-preview-tts' }, { id: 'gemini-3.8-flash-lite-tts' }];
		const out = curate(live, CURATED.voice.gemini);
		expect(out.map((m) => m.id)).toEqual(['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts']);
		expect(out.filter((m) => m.curated).map((m) => m.id)).toEqual(['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts']);
	});

	it('never curates a Gemini 2.5 id and never invents one the live list lacks', () => {
		const live = [{ id: 'gemini-2.5-flash-preview-tts' }, { id: 'gemini-2.5-pro-preview-tts' }];
		expect(curate(live, CURATED.voice.gemini).some((m) => m.curated)).toBe(false);
		expect(curatedDefault(live, CURATED.voice.gemini)).toBeNull();
		expect(curatedDefault([], CURATED.voice.gemini)).toBeNull();
	});

	it('the chat default is the newest live model of the first curated family, skipping side variants', () => {
		const live = [
			{ id: 'gemini-3.8-flash-lite', created: 9 },
			{ id: 'gemini-3.8-pro', created: 8 },
			{ id: 'gemini-3.8-flash', created: 5 },
		];
		expect(curatedDefault(live, CURATED.chat.gemini)).toBe('gemini-3.8-flash');
		expect(curatedDefault([{ id: 'claude-opus-5', created: 3 }, { id: 'claude-sonnet-5-5-20260928', created: 2 }], CURATED.chat.anthropic)).toBe('claude-sonnet-5-5-20260928');
	});
});
