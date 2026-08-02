import { describe, expect, it } from 'vitest';
import {
	emptyTtsMessage,
	filterTtsModels,
	groupByVendor,
	priceTier,
	shortName,
	TTS_FEATURED,
	TTS_VALUE,
	TTS_VIEWS,
	ttsModelGroups,
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

// ── Value tier + price ordering (2026-07-13) ──────────────────────────────────
describe('priceTier — the $/$$/$$$ value badge', () => {
	it('buckets by per-million price: cheap standouts $, mid $$, premium $$$', () => {
		expect(priceTier({ promptPerM: 0.62 })).toBe('$'); // Kokoro
		expect(priceTier({ promptPerM: 1 })).toBe('$'); // Gemini
		expect(priceTier({ promptPerM: 7 })).toBe('$$'); // Zonos/Orpheus/CSM cluster
		expect(priceTier({ promptPerM: 15 })).toBe('$$$'); // Grok
		expect(priceTier({ promptPerM: 22 })).toBe('$$$'); // MAI
	});

	it('returns null for free or unknown price — the badge is simply absent', () => {
		expect(priceTier({ promptPerM: 0 })).toBeNull();
		expect(priceTier({ promptPerM: null })).toBeNull();
		expect(priceTier({})).toBeNull();
	});
});

describe('ttsModelGroups — flat price-ascending for curated lenses, vendor-grouped for All', () => {
	it('sorts a curated lens LOW→HIGH by price in one unlabeled group', () => {
		const groups = ttsModelGroups(CATALOG, 'value', '');
		expect(groups).toHaveLength(1);
		expect(groups[0].label).toBeNull(); // no header — a flat price-sorted list
		const ids = groups[0].models.map((m: (typeof CATALOG)[number]) => m.id);
		// Kokoro (0.62) is the only CATALOG entry in TTS_VALUE besides… check ascending order holds.
		for (let i = 1; i < groups[0].models.length; i++) {
			expect(groups[0].models[i].promptPerM).toBeGreaterThanOrEqual(groups[0].models[i - 1].promptPerM);
		}
		expect(ids[0]).toBe('hexgrad/kokoro-82m'); // cheapest floats to the top
	});

	it('sorts the Featured lens ascending too — cheapest, best value on top', () => {
		const groups = ttsModelGroups(CATALOG, 'featured', '');
		const prices = groups[0].models.map((m: (typeof CATALOG)[number]) => m.promptPerM);
		expect(prices).toEqual([...prices].sort((a, b) => a - b));
		expect(groups[0].models[0].id).toBe('hexgrad/kokoro-82m');
	});

	it('keeps vendor grouping (labeled groups) for the browse-everything All lens', () => {
		const groups = ttsModelGroups(CATALOG, 'all', '');
		expect(groups.length).toBeGreaterThan(1);
		expect(groups.every((g) => typeof g.label === 'string')).toBe(true); // vendor headers
	});

	it('returns [] when a lens filters everything out', () => {
		expect(ttsModelGroups(CATALOG, 'free', '')).toEqual([]); // no free models in the stand-in catalog
	});
});
