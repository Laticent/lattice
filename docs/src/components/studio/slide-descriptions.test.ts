import { describe, expect, it } from 'vitest';
import { getDescription, setDescription } from './slide-descriptions';
import { getNote, setNote } from './slide-notes';

describe('slide-descriptions', () => {
	it('reads a describe: comment, prefix stripped', () => {
		expect(getDescription('# Hi\n\n<!-- describe: A bar chart rising left to right. -->')).toBe(
			'A bar chart rising left to right.',
		);
		expect(getDescription('# Hi\n\n<!-- just a note -->')).toBe('');
	});

	it('sets and replaces the description, never stacking', () => {
		let src = setDescription('# Hi', 'First equivalent.');
		expect(getDescription(src)).toBe('First equivalent.');
		src = setDescription(src, 'Revised equivalent.');
		expect(getDescription(src)).toBe('Revised equivalent.');
		expect((src.match(/describe:/g) ?? []).length).toBe(1); // replaced, not stacked
	});

	it('clears the description with an empty string', () => {
		const src = setDescription('# Hi', 'Something');
		expect(getDescription(setDescription(src, ''))).toBe('');
	});

	it('never lets the body close the comment early', () => {
		const src = setDescription('# Hi', 'a --> b');
		expect(src).not.toContain('--> b -->');
		expect(getDescription(src)).toBe('a -> b');
	});

	// The load-bearing guarantee: the two channels are independent — editing one
	// never clobbers or leaks into the other.
	it('note and description are independent channels', () => {
		let src = '<!-- _class: kpi -->\n\n# Q3';
		src = setNote(src, 'Pause before the number.');
		src = setDescription(src, 'A revenue bar chart, up 40 percent.');
		expect(getNote(src)).toBe('Pause before the number.');
		expect(getDescription(src)).toBe('A revenue bar chart, up 40 percent.');

		// Rewriting the note leaves the description intact, and vice-versa.
		src = setNote(src, 'New note.');
		expect(getDescription(src)).toBe('A revenue bar chart, up 40 percent.');
		src = setDescription(src, 'New description.');
		expect(getNote(src)).toBe('New note.');
		// And the _class directive survives both.
		expect(src).toContain('_class: kpi');
	});
});
