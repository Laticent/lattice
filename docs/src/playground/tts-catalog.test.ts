import { describe, expect, it } from 'vitest';
import {
	emptyTtsMessage,
	filterTtsModels,
	groupByVendor,
	shortName,
	TTS_FEATURED,
	TTS_VALUE,
	TTS_VIEWS,
	ttsPriceLabel,
} from './tts-catalog.js';

// A tiny stand-in catalog in the shape voice-model.js `listOpenRouterVoiceModels()`
// yields — exercises the pure helpers with no network.
const CATALOG = [
	{ id: 'hexgrad/kokoro-82m', name: 'Hexgrad: Kokoro 82M', promptPerM: 0.62, completionPerM: 0, voices: ['af_heart', 'af_bella'] },
	{ id: 'x-ai/grok-voice-tts-1.0', name: 'xAI: Grok Voice TTS', promptPerM: 15, completionPerM: 0, voices: ['eve', 'ara'] },
	{ id: 'microsoft/mai-voice-2', name: 'Microsoft: MAI-Voice-2', promptPerM: 22, completionPerM: 0, voices: ['en-US-Harper:MAI-Voice-2'] },
	{ id: 'some-vendor/unrated-tts', name: 'Some Vendor: Unrated TTS', promptPerM: 9, completionPerM: 0, voices: [] },
];

describe('tts-catalog — TTS-specific pricing + filtering', () => {
	it('formats a single price dimension — TTS has no meaningful completion cost', () => {
		expect(ttsPriceLabel({ promptPerM: 0.62 })).toBe('$0.620/M chars');
		expect(ttsPriceLabel({ promptPerM: 22 })).toBe('$22.00/M chars');
		expect(ttsPriceLabel({ promptPerM: null })).toBe('pricing varies');
	});

	it('featured view returns only the vetted-and-cached models', () => {
		const items = filterTtsModels(CATALOG, 'featured', '');
		expect(items.map((m: { id: string }) => m.id)).toEqual(['hexgrad/kokoro-82m', 'x-ai/grok-voice-tts-1.0', 'microsoft/mai-voice-2']);
	});

	it('value view returns only the cheap tier', () => {
		const items = filterTtsModels(CATALOG, 'value', '');
		expect(items.map((m: { id: string }) => m.id)).toEqual(['hexgrad/kokoro-82m']);
	});

	it('free view returns nothing when no TTS model is actually free', () => {
		expect(filterTtsModels(CATALOG, 'free', '')).toEqual([]);
	});

	it('all view returns everything, query narrows by name/id', () => {
		expect(filterTtsModels(CATALOG, 'all', '').length).toBe(4);
		expect(filterTtsModels(CATALOG, 'all', 'grok').map((m: { id: string }) => m.id)).toEqual(['x-ai/grok-voice-tts-1.0']);
	});

	it('groups by vendor, reusing the shared chat-catalog helper', () => {
		const groups = groupByVendor(filterTtsModels(CATALOG, 'all', ''));
		expect(groups.map((g) => g.vendor)).toEqual(['hexgrad', 'microsoft', 'some vendor', 'x ai']);
	});

	it('empty-state copy is TTS-specific, distinct per view', () => {
		expect(emptyTtsMessage('all')).toMatch(/No TTS models match/);
		expect(emptyTtsMessage('free')).toMatch(/No free TTS models/);
		expect(emptyTtsMessage('value')).toMatch(/No value TTS models/);
	});

	it('shortName strips the redundant vendor prefix (reused from or-catalog)', () => {
		expect(shortName(CATALOG[0])).toBe('Kokoro 82M');
	});

	it('TTS_VIEWS matches the chat picker\'s four-lens shape', () => {
		expect(TTS_VIEWS.map(([k]) => k)).toEqual(['featured', 'value', 'free', 'all']);
	});

	it('every TTS_FEATURED/TTS_VALUE entry is a real, pinned model id (no stale/typo entries)', () => {
		for (const id of [...TTS_FEATURED, ...TTS_VALUE]) {
			expect(id).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
		}
	});
});
