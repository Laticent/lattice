// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { deckRatio, sizeFromSource, sizeRatio } from './slide-size';

describe('sizeFromSource — reads the size: front-matter directive', () => {
	it('finds size on the last front-matter line', () => {
		expect(sizeFromSource('---\ntheme: indaco\nsize: square\n---\n\n# Hi')).toBe('square');
	});

	// Regression: `size:` is frequently NOT the last line — it sits wherever the author put
	// it, and the Size control's line splice leaves it there. Without the `/m` flag the `$`
	// anchor only matched end-of-string, so this silently returned '' and the deck fell back
	// to 16:9. (It first bit when the retired whole-block writer pushed the last-edited key to
	// the end; the splice never reorders, and the `/m` is still required either way.)
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
	it('covers the named sizes + aliases, 4k stays 16:9', () => {
		expect(sizeRatio('square')).toEqual([1, 1]);
		expect(sizeRatio('standard')).toEqual([4, 3]);
		expect(sizeRatio('4K')).toEqual([16, 9]);
		expect(sizeRatio('nonsense')).toEqual([16, 9]);
	});

	it('answers exactly what the engine renders, name for name (lib/engine/sizes.js)', () => {
		// The engine matches a size name exactly and renders an unknown one at 16:9, so `STORY`,
		// `Square` and `4:3` are 16:9 slides. A frame drawn at the shape the name suggests left an
		// empty band beside the slide in the preview and in Present.
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { SIZES } = require('../../../../lib/engine/sizes.js') as { SIZES: Record<string, { width: string; height: string }> };
		const reduce = (w: number, h: number) => { const g = (a: number, b: number): number => (b ? g(b, a % b) : a); const d = g(w, h); return [w / d, h / d]; };
		for (const [name, geo] of Object.entries(SIZES)) {
			const [w, h] = sizeRatio(name);
			expect({ name, ratio: reduce(w, h) }).toEqual({ name, ratio: reduce(parseFloat(geo.width), parseFloat(geo.height)) });
		}
		for (const name of ['STORY', 'Square', '4:3']) expect(sizeRatio(name)).toEqual([16, 9]);
	});
});
