import { describe, expect, it } from 'vitest';
import { deckRatio, sizeFromSource, sizeRatio } from './slide-size';

describe('sizeFromSource — reads the size: front-matter directive', () => {
	it('finds size on the last front-matter line', () => {
		expect(sizeFromSource('---\ntheme: indaco\nsize: square\n---\n\n# Hi')).toBe('square');
	});

	// Regression: `setFrontMatter` pushes the last-edited key to the end, so `size:` is
	// frequently NOT the last line. Without the `/m` flag the `$` anchor only matched
	// end-of-string, so this silently returned '' and the deck fell back to 16:9.
	it('finds size when it is NOT the last front-matter line', () => {
		expect(sizeFromSource('---\ntheme: indaco\nsize: square\npaginate: true\n---\n\n# Hi')).toBe('square');
		expect(sizeFromSource('---\nsize: story\ntheme: cuoio\ncolor: dusk\n---\n\n# Hi')).toBe('story');
	});

	it('strips surrounding quotes and trims', () => {
		expect(sizeFromSource('---\nsize: "4:3"\npaginate: true\n---\n\n# Hi')).toBe('4:3');
	});

	it('returns empty when unset or no front-matter', () => {
		expect(sizeFromSource('# Just a slide')).toBe('');
		expect(sizeFromSource('---\ntheme: indaco\n---\n\n# Hi')).toBe('');
	});

	it('deckRatio maps the resolved size (mid-block) to the right aspect', () => {
		expect(deckRatio('---\ntheme: indaco\nsize: square\npaginate: true\n---\n\n# Hi')).toEqual([1, 1]);
		expect(deckRatio('---\nsize: story\ntheme: x\n---\n\n# Hi')).toEqual([9, 16]);
		expect(deckRatio('# no front-matter')).toEqual([16, 9]); // engine default
	});
});

describe('sizeRatio — canonical size → aspect', () => {
	it('covers the named sizes + aliases, case-insensitively, 4k stays 16:9', () => {
		expect(sizeRatio('square')).toEqual([1, 1]);
		expect(sizeRatio('standard')).toEqual([4, 3]);
		expect(sizeRatio('4K')).toEqual([16, 9]);
		expect(sizeRatio('STORY')).toEqual([9, 16]);
		expect(sizeRatio('nonsense')).toEqual([16, 9]);
	});
});
