// The change card's scroll math (proposal-pick.ts).

import { describe, expect, it } from 'vitest';
import { cardMaxHeight, cardScrollTarget } from './proposal-pick';

describe('cardScrollTarget', () => {
	const base = { lineHeight: 20, gap: 6, scrollHeight: 2000, clientHeight: 600 };
	it('parks the card two lines below the top of the view', () => {
		expect(cardScrollTarget({ ...base, cardTop: 900 })).toBe(900 - 40 - 6);
	});
	it('clamps to the end of the thread for a short card', () => {
		expect(cardScrollTarget({ ...base, cardTop: 1900 })).toBe(1400);
	});
	it('never goes above the top', () => {
		expect(cardScrollTarget({ ...base, cardTop: 10 })).toBe(0);
	});
});

describe('cardMaxHeight', () => {
	it('fills the view less two lines, the gap and the padding', () => {
		expect(cardMaxHeight({ clientHeight: 600, lineHeight: 20, gap: 6, padding: 24 })).toBe(530);
	});
	it('keeps a usable floor in a very short panel', () => {
		expect(cardMaxHeight({ clientHeight: 120, lineHeight: 20, gap: 6, padding: 24 })).toBe(160);
	});
});
