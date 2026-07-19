import { describe, expect, it } from 'vitest';
import { figureChange } from './ArchitectChat';

// Numeric provenance (Munger's content-truth point): a chat rewrite that changes a
// figure is the highest-risk edit in a numbers deck, so `figureChange` surfaces exactly
// which numbers a proposed edit removes/adds — shown for review regardless of the
// "facts locked" mode.
describe('figureChange — numeric provenance for a proposed edit', () => {
	it('is null when no number changes (pure wording edit)', () => {
		expect(figureChange('Revenue grew to $4.2M this quarter.', 'This quarter, revenue reached $4.2M.')).toBeNull();
	});
	it('flags a changed figure with the before → after values', () => {
		const c = figureChange('Revenue was $4.2M, up 18%.', 'Revenue was $5.1M, up 22%.');
		expect(c).not.toBeNull();
		expect(c?.removed).toEqual(expect.arrayContaining(['$4.2M', '18%']));
		expect(c?.added).toEqual(expect.arrayContaining(['$5.1M', '22%']));
	});
	it('flags an added figure (a number appears where there was none)', () => {
		const c = figureChange('We grew a lot.', 'We grew 40%.');
		expect(c?.added).toEqual(['40%']);
		expect(c?.removed).toEqual([]);
	});
	it('flags a removed figure', () => {
		const c = figureChange('Margin held at 30%.', 'Margin held steady.');
		expect(c?.removed).toEqual(['30%']);
		expect(c?.added).toEqual([]);
	});
	it('ignores pure reordering of the same numbers', () => {
		expect(figureChange('10, 20, 30', '30 and 10 and 20')).toBeNull();
	});
});
