import { describe, expect, it } from 'vitest';
import { familyOf, healTarget, sameFamily } from './model-family.js';
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
		expect(out.filter((m) => m.curated).map((m) => m.id)).toEqual(['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview']);
	});

	it('recommends the newest Gemini TTS that is actually live, whatever its version', () => {
		// An account that lists only 3.1 Flash TTS (a preview) from 3 up still gets a recommendation.
		const today = [{ id: 'gemini-2.5-pro-tts' }, { id: 'gemini-2.5-flash-tts' }, { id: 'gemini-3.1-flash-tts-preview' }, { id: 'gemini-2.5-flash-lite-preview-tts' }];
		expect(curatedDefault(today, CURATED.voice.gemini)).toBe('gemini-3.1-flash-tts-preview');
		expect(curatedDefault([...today, { id: 'gemini-3.1-flash-lite-preview-tts' }], CURATED.voice.gemini)).toBe('gemini-3.1-flash-lite-preview-tts');
		expect(curatedDefault([...today, { id: 'gemini-3.8-flash-tts' }, { id: 'gemini-3.8-flash-lite-tts' }], CURATED.voice.gemini)).toBe('gemini-3.8-flash-lite-tts');
		// Chat: the newest Flash, a GA id before a preview of the same version, never a -lite.
		const chat = ['gemini-2.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview', 'gemini-3.5-flash', 'gemini-3.5-flash-preview'].map((id) => ({ id }));
		expect(curatedDefault(chat, CURATED.chat.gemini)).toBe('gemini-3.5-flash');
	});

	it('perFamily keeps the newest of each family on the short list and the rest in the list', () => {
		const live = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.1-pro-preview', 'gemini-2.5-pro'].map((id) => ({ id }));
		const out = curate(live, CURATED.chat.gemini, { perFamily: 1 });
		expect(out.filter((m) => m.curated).map((m) => m.id)).toEqual(['gemini-3.8-flash', 'gemini-3.1-pro-preview']);
		expect(out).toHaveLength(live.length);
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

// Version healing (2026-11-08-studio-ai-routes-ux.md rule 1): a defined family table, never the curation.
describe('familyOf — an explicit table, never a guess', () => {
	it.each([
		['anthropic/claude-sonnet-5.5', 'anthropic · claude · sonnet', [5, 5]],
		['claude-sonnet-4-5-20250929', 'anthropic · claude · sonnet', [4, 5]],
		['claude-3-5-sonnet-20241022', 'anthropic · claude · sonnet', [3, 5]],
		['~anthropic/claude-sonnet-latest', 'anthropic · claude · sonnet', []],
		['gemini-3.8-flash-lite-tts', 'google · gemini · flash-lite-tts', [3, 8]],
		['gemini-2.5-flash-lite-preview-tts', 'google · gemini · flash-lite-tts', [2, 5]],
		['gemini-3.1-flash-tts-preview', 'google · gemini · flash-tts', [3, 1]],
		['gemini-2.5-flash-preview-05-20', 'google · gemini · flash', [2, 5]],
		['google/gemini-3.8-pro-preview', 'google · gemini · pro', [3, 8]],
		['gpt-6.1-mini', 'openai · gpt · mini', [6, 1]],
		['gpt-5-nano-2025-08-07', 'openai · gpt · nano', [5]],
		['openai/gpt-6.1', 'openai · gpt · base', [6, 1]],
	])('places %s', (id, key, version) => {
		expect(familyOf(id)).toMatchObject({ key, version });
	});
	it('keeps Flash and Flash Lite apart, which the curation patterns may not', () => {
		expect(sameFamily('gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts')).toBe(false);
		expect(sameFamily('anthropic/claude-sonnet-5', 'claude-sonnet-5-5-20261001')).toBe(true);
	});
	it.each(['openai/gpt-4o-mini-tts', 'hexgrad/kokoro-82m', 'gpt-6.1-terra', 'gemini-3.8-flash-ultra', 'mistral/mistral-large'])('cannot place %s, so it is never healed', (id) => {
		expect(familyOf(id)).toBeNull();
		expect(healTarget(id, [{ id: 'gpt-9' }, { id: 'gemini-9-flash' }])).toBeNull();
	});
});

describe('healTarget — newer, same family, same route', () => {
	it('moves Claude Sonnet 5 to the newest live Sonnet, never to Opus', () => {
		const live = [{ id: 'anthropic/claude-sonnet-5.5' }, { id: 'anthropic/claude-opus-6' }, { id: 'anthropic/claude-sonnet-5.2' }];
		expect(healTarget('anthropic/claude-sonnet-5', live)).toBe('anthropic/claude-sonnet-5.5');
	});
	it('prefers a GA build over a preview of the same version', () => {
		const live = [{ id: 'gemini-3.9-flash-lite-tts-preview' }, { id: 'gemini-3.9-flash-lite-tts' }, { id: 'gemini-4-flash-tts' }];
		expect(healTarget('gemini-3.8-flash-lite-tts', live)).toBe('gemini-3.9-flash-lite-tts');
	});
	it('reads an Anthropic date stamp as a build, not a minor version', () => {
		expect(familyOf('claude-sonnet-4-20250514')).toMatchObject({ version: [4] });
		expect(healTarget('claude-sonnet-4-5-20250929', [{ id: 'claude-sonnet-4-20250514' }]), 'never backward').toBeNull();
		expect(healTarget('claude-sonnet-4-20250514', [{ id: 'claude-sonnet-4-5-20250929' }])).toBe('claude-sonnet-4-5-20250929');
		expect(healTarget('claude-3-7-sonnet-20250219', [{ id: 'claude-sonnet-4-20250514' }, { id: 'claude-sonnet-4-5-20250929' }])).toBe('claude-sonnet-4-5-20250929');
	});
	it('never moves backward, and never across families: nothing newer reads as retired', () => {
		expect(healTarget('anthropic/claude-sonnet-5.5', [{ id: 'anthropic/claude-sonnet-5' }, { id: 'anthropic/claude-opus-6' }])).toBeNull();
		expect(healTarget('gemini-3.8-flash-tts', [{ id: 'gemini-3.9-flash-lite-tts' }])).toBeNull();
	});
});
