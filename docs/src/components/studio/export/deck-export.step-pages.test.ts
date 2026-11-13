// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { deckSteps } from '../export-options';
import { stretchByStepPages } from './deck-export.js';

// "One page per step" (the CLI's `--steps`): the capture frame copies each stepping slide once per step, so what an
// export keys per slide (comments, alt text, notes) has to stretch across a slide's pages, or slide 3's notes land on
// slide 2's second step. engineering/decisions/2026-11-09-steps-as-a-behavior.md.
describe('stretchByStepPages', () => {
	it('repeats each entry once per page of its slide', () => {
		expect(stretchByStepPages(['a', 'b', 'c'], [1, 3, 1])).toEqual(['a', 'b', 'b', 'b', 'c']);
	});
	it('puts a firstOnly entry (a comment) on the slide’s first page, and blank on the rest', () => {
		expect(stretchByStepPages([['x'], ['y'], []], [1, 2, 1], { firstOnly: true, blank: [] })).toEqual([['x'], ['y'], [], []]);
	});
	it('leaves a list alone when nothing stepped, or when it does not line up with the slides', () => {
		const list = ['a', 'b'];
		expect(stretchByStepPages(list, [1, 1])).toBe(list);
		expect(stretchByStepPages(list, [1, 2, 1])).toBe(list);
		expect(stretchByStepPages(null, [2])).toBe(null);
	});
});

describe('deckSteps (whether the export sheet offers the switch)', () => {
	it('is on for a slide build, a deck-wide build, or a focus walk', () => {
		expect(deckSteps('# A\n\n---\n\n<!-- _build -->\n\n- x')).toBe(true);
		expect(deckSteps('<!-- _focusSteps: row 1 | row 2 -->')).toBe(true);
		expect(deckSteps('---\nbuild: items\n---\n\n# A')).toBe(true);
	});
	it('is off for a deck that never steps', () => {
		expect(deckSteps('# A\n\n---\n\n<!-- _class: table -->\n\n# B')).toBe(false);
		expect(deckSteps(undefined)).toBe(false);
		// A `build:` line in a slide's code is not the front-matter key.
		expect(deckSteps('# A\n\n```yaml\nbuild: npm run build\n```')).toBe(false);
		expect(deckSteps('---\nbuild: none\n---\n\n# A')).toBe(false);
	});
});
