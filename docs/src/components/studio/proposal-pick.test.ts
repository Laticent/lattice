// The change card's wording and scroll math (proposal-pick.ts).

import { describe, expect, it } from 'vitest';
import { appliedBadge, appliedToast, applyLabel, cardMaxHeight, cardScrollTarget } from './proposal-pick';

describe('applyLabel', () => {
	it('reads plain "Apply" when every edit is picked, so the one-press flow is unchanged', () => {
		expect(applyLabel(3, 3)).toBe('Apply');
		expect(applyLabel(1, 1)).toBe('Apply');
	});
	it('names the subset when the author left edits out', () => {
		expect(applyLabel(2, 3)).toBe('Apply 2 of 3');
	});
	it('reads "Apply" at zero (the button is disabled there)', () => {
		expect(applyLabel(0, 3)).toBe('Apply');
	});
});

describe('appliedBadge and appliedToast', () => {
	it('say a full run plainly', () => {
		expect(appliedBadge({ applied: 3 })).toBe('Applied');
		expect(appliedToast({ applied: 1 })).toBe('Edit applied — restore from History to undo.');
		expect(appliedToast({ applied: 3 })).toBe('Applied 3 edits — restore from History to undo.');
	});
	it('report what the author left out', () => {
		expect(appliedBadge({ applied: 2, skipped: 1 })).toBe('Applied · skipped 1');
		expect(appliedToast({ applied: 1, skipped: 2 })).toBe('Applied 1 edit, left 2 out — restore from History to undo.');
	});
	it('keep refusals separate from skips', () => {
		expect(appliedBadge({ applied: 1, refused: 1, skipped: 1 })).toBe('Applied 1 of 2 · skipped 1');
		expect(appliedToast({ applied: 1, refused: 1 })).toBe('Applied 1 of 2 edits — restore from History to undo.');
	});
});

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
