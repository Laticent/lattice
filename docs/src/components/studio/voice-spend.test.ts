import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/playground/voice-model.js', () => ({
	listOpenRouterVoiceModels: async () => [
		{ id: 'hexgrad/kokoro-82m', promptPerM: 0.62, completionPerM: null },
		{ id: 'google/gemini-3.8-flash-lite-tts', promptPerM: 0.5, completionPerM: null },
	],
}));

const { readSpendByUse } = await import('@/components/studio/ai/spend.js');
const { bookVoiceSpend } = await import('./voice-spend');

// Voice spend is booked per route at the catalog's per-character price; an unpriced model books nothing.
describe('bookVoiceSpend', () => {
	beforeEach(() => sessionStorage.clear());
	it('books a clip on its route, a Gemini model by its google/ id, and nothing for an unpriced model', async () => {
		await bookVoiceSpend('openrouter', 'hexgrad/kokoro-82m', 1_000_000);
		await bookVoiceSpend('gemini', 'gemini-3.8-flash-lite-tts', 2_000_000);
		await bookVoiceSpend('openrouter', 'some/unlisted-tts', 1_000_000);
		const rows = readSpendByUse();
		expect(rows.map((r) => [r.kind, r.route])).toEqual([['voice', 'gemini'], ['voice', 'openrouter']]);
		expect(rows[0].usd).toBeCloseTo(1, 6);
		expect(rows[1].usd).toBeCloseTo(0.62, 6);
	});
});
