import { describe, expect, it } from 'vitest';
import { activitySentence } from './chat-activity';

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
