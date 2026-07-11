import { describe, expect, it } from 'vitest';
import { getCaption, setCaption } from './slide-caption';
import { getDescription, setDescription } from './slide-descriptions';
import { getNote, setNote } from './slide-notes';

describe('slide-caption', () => {
	it('reads a caption: comment, prefix stripped', () => {
		expect(getCaption('# Hi\n\n<!-- caption: FY26 revenue grew forty percent. -->')).toBe(
			'FY26 revenue grew forty percent.',
		);
		expect(getCaption('# Hi\n\n<!-- just a note -->')).toBe('');
	});

	it('reads the LAST caption when several exist (an override supersedes)', () => {
		expect(getCaption('# Hi\n\n<!-- caption: first -->\n\n<!-- caption: final -->')).toBe('final');
	});

	it('sets and replaces the caption, never stacking', () => {
		let src = setCaption('# Hi', 'First read-as line.');
		expect(getCaption(src)).toBe('First read-as line.');
		src = setCaption(src, 'Revised read-as line.');
		expect(getCaption(src)).toBe('Revised read-as line.');
		expect((src.match(/caption:/g) ?? []).length).toBe(1); // replaced, not stacked
	});

	it('clears the caption with an empty string', () => {
		const src = setCaption('# Hi', 'Something');
		expect(getCaption(setCaption(src, ''))).toBe('');
	});

	it('never lets the body close the comment early', () => {
		const src = setCaption('# Hi', 'a --> b');
		expect(src).not.toContain('--> b -->');
		expect(getCaption(src)).toBe('a -> b');
	});

	// The load-bearing guarantee: note, description, and caption are THREE independent
	// channels — editing one never clobbers or leaks into the others.
	it('note, description, and caption are independent channels', () => {
		let src = '<!-- _class: kpi -->\n\n# Q3';
		src = setNote(src, 'Pause before the number.');
		src = setDescription(src, 'A revenue bar chart, up 40 percent.');
		src = setCaption(src, 'Q3 revenue reached forty million.');
		expect(getNote(src)).toBe('Pause before the number.');
		expect(getDescription(src)).toBe('A revenue bar chart, up 40 percent.');
		expect(getCaption(src)).toBe('Q3 revenue reached forty million.');

		// Rewriting any one leaves the other two intact.
		src = setNote(src, 'New note.');
		expect(getDescription(src)).toBe('A revenue bar chart, up 40 percent.');
		expect(getCaption(src)).toBe('Q3 revenue reached forty million.');
		src = setCaption(src, 'New caption.');
		expect(getNote(src)).toBe('New note.');
		expect(getDescription(src)).toBe('A revenue bar chart, up 40 percent.');
		// And the _class directive survives all three.
		expect(src).toContain('_class: kpi');
	});
});
