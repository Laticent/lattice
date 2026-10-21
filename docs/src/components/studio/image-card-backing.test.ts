import { describe, expect, it } from 'vitest';
import { BACKING_STEPS, backingPercent, backingWord } from './image-card-backing';

describe('card backing level', () => {
	it('names the four steps and writes every other 5% as a percent word', () => {
		expect(BACKING_STEPS.map((s) => [s.word, s.pct])).toEqual([['solid', 100], ['soft', 80], ['sheer', 55], ['clear', 0]]);
		expect(backingWord(100)).toBe('solid');
		expect(backingWord(80)).toBe('soft');
		expect(backingWord(55)).toBe('sheer');
		expect(backingWord(0)).toBe('clear');
		expect(backingWord(65)).toBe('65%');
		expect(backingWord(5)).toBe('5%');
	});

	it('reads a word back to its percent, and nothing else', () => {
		expect(backingPercent('soft')).toBe(80);
		expect(backingPercent('65%')).toBe(65);
		expect(backingPercent('65')).toBeUndefined();
		expect(backingPercent(undefined)).toBeUndefined();
	});

	it('every slider position round-trips through a word the register accepts', async () => {
		const { IMAGE_CARD_AXES } = await import('./slide-provenance');
		for (let pct = 0; pct <= 100; pct += 5) {
			const w = backingWord(pct);
			expect(Object.keys(IMAGE_CARD_AXES.backing)).toContain(w);
			expect(backingPercent(w)).toBe(pct);
		}
	});
});
