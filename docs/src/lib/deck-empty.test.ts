import { describe, expect, it } from 'vitest';
import { isBlankDeck } from './deck-empty';
import { buildDeckIndex } from './deck-outline/deck-outline';

// The empty-deck rule (engineering/decisions/2026-11-17-compose-empty-deck.md §3): blank after the front matter. It must
// agree with the slide index, or Compose would show the empty state while the strip shows a slide, or the reverse.
const CASES: [string, boolean][] = [
	['', true],
	['\n', true],
	['  \n\n\t\n', true],
	['---\ntheme: cuoio\n---\n', true],
	['---\ntheme: cuoio\n---\n\n\n', true],
	['---\n', false],
	['---', false],
	['# A', false],
	['W', false],
	['<!-- _class: title -->', false],
	['---\ntheme: cuoio\n---\n# A', false],
	['\n\n---\n\n', false],
	['# A\n\n---\n\n# B', false],
];

describe('isBlankDeck', () => {
	for (const [src, blank] of CASES) {
		it(`${JSON.stringify(src)} is ${blank ? 'empty' : 'not empty'}, as the slide index counts it`, () => {
			expect(isBlankDeck(src)).toBe(blank);
			expect(buildDeckIndex(src).units.length === 0).toBe(blank);
		});
	}
});
