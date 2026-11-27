import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import { describe, expect, it } from 'vitest';
import { compareLines, compareSlides, SAMPLE_CODE, SAMPLE_SLIDES } from './markup-demo';

// Every number and title the /libraries/markup/ demo shows for its samples, held here so the page
// cannot drift into claiming something the library does not do.
hljs.registerLanguage('javascript', javascript);
const highlighted = hljs.highlight(SAMPLE_CODE, { language: 'javascript' }).value;

describe('markup demo — code lines', () => {
	it('splits the sample into its nine source lines both ways', () => {
		const c = compareLines(highlighted);
		expect(c.balanced).toHaveLength(SAMPLE_CODE.split('\n').length);
		expect(c.naive).toHaveLength(9);
	});

	it('counts the five lines the shortcut cuts, three of which start inside a token', () => {
		const c = compareLines(highlighted);
		expect(c.broken).toBe(5);
		expect(c.reopened).toBe(3);
		// The comment's second line keeps its color only in the balanced split.
		expect(c.balanced[1]).toBe('<span class="hljs-comment">   Figures are in millions,</span>');
		expect(c.naive[1]).toBe('   Figures are in millions,');
	});

	it('reports nothing broken when no token crosses a newline', () => {
		const flat = hljs.highlight("const a = 1;\nconst b = 'two';", { language: 'javascript' }).value;
		expect(compareLines(flat)).toMatchObject({ broken: 0, reopened: 0 });
	});
});

describe('markup demo — slide sections', () => {
	it('finds the two real slides and each one\'s own title', () => {
		expect(compareSlides(SAMPLE_SLIDES).slides).toEqual([
			{ cls: 'title', title: 'Revenue held in Q2' },
			{ cls: 'split', title: 'Q3 beat the target' },
		]);
	});

	it('shows the regex falling into all three traps', () => {
		expect(compareSlides(SAMPLE_SLIDES).naive).toEqual([
			{ cls: 'draft', title: 'Old title' }, // a section quoted inside a comment
			{ cls: 'title', title: 'Speaker aside' }, // a nested heading read as the slide's
			{ cls: 'split', title: 'Q3 plan">beat the target' }, // a `>` inside an attribute
		]);
	});
});
