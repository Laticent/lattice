import { describe, expect, it } from 'vitest';
import { activitySentence, thoughtTail } from './chat-activity';

describe('activitySentence', () => {
	it('is empty for no activity', () => {
		expect(activitySentence(undefined)).toBe('');
		expect(activitySentence([])).toBe('');
	});

	it('reads one phrase as a sentence', () => {
		expect(activitySentence(['checked the deck'])).toBe('Checked the deck.');
	});

	it('joins several with commas and a final "and"', () => {
		expect(activitySentence(['read about the big number layout', 'drafted changes to the slides', 'checked the deck'])).toBe(
			'Read about the big number layout, drafted changes to the slides and checked the deck.',
		);
	});

	it('folds an older saved chat’s capitalized labels into the same shape', () => {
		expect(activitySentence(['Read kpi', 'Checked the deck'])).toBe('Read kpi and checked the deck.');
	});
});

describe('activitySentence on a damaged saved reply', () => {
	it('treats a non-array activity as none instead of throwing', () => {
		expect(activitySentence({} as unknown as string[])).toBe('');
		expect(activitySentence('read about x' as unknown as string[])).toBe('');
	});
});

describe('thoughtTail', () => {
	it('never splits an emoji when it cuts', () => {
		const out = thoughtTail('😀'.repeat(300), 20);
		expect(Array.from(out)).toHaveLength(21); // the ellipsis plus 20 whole emoji
		expect(out.isWellFormed()).toBe(true);
	});

	it('keeps a short thought whole', () => {
		expect(thoughtTail('  a short   thought ')).toBe('a short thought');
		expect(thoughtTail('')).toBe('');
	});

	it('shows the latest words, starting at a word boundary, with a leading ellipsis', () => {
		const long = `${'word '.repeat(60)}the newest idea`;
		const out = thoughtTail(long, 40);
		expect(out.startsWith('…')).toBe(true);
		expect(out.endsWith('the newest idea')).toBe(true);
		expect(out.length).toBeLessThanOrEqual(41);
		expect(out.slice(1).startsWith('ord')).toBe(false); // never opens on half a word
	});
});
