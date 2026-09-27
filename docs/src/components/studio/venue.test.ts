// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { deckVenue, smallerVenue, VENUES, withVenue } from './venue';

const require = createRequire(import.meta.url);
const { VENUE_SCALE } = require('../../../../lib/core/resolve-venue.js');

describe('venue — the Studio table matches the engine', () => {
	it('offers exactly the engine venues, at the engine scales, smallest first', () => {
		expect(Object.fromEntries(VENUES.map((v) => [v.value, v.scale]))).toEqual(VENUE_SCALE);
		expect(VENUES.map((v) => v.scale)).toEqual([...VENUES.map((v) => v.scale)].sort((a, b) => a - b));
	});

	it('reads a known venue, any case, and nothing else', () => {
		expect(deckVenue('---\nvenue: Hall\n---\n\n# x')).toBe('hall');
		expect(deckVenue('---\nvenue: stadium\n---\n\n# x')).toBeNull();
		expect(deckVenue('# no front matter')).toBeNull();
		expect(deckVenue('---\nvenue: hall  # the big room\n---\n\n# x')).toBe('hall');
	});

	it('steps one room down, and stops at laptop', () => {
		expect(smallerVenue('hall')?.value).toBe('conference');
		expect(smallerVenue('huddle')?.value).toBe('laptop');
		expect(smallerVenue('laptop')).toBeNull();
		expect(smallerVenue(null)).toBeNull();
	});

	it('writes and clears the line', () => {
		const src = '---\nmarp: true\n---\n\n# x';
		expect(deckVenue(withVenue(src, 'conference'))).toBe('conference');
		expect(withVenue(withVenue(src, 'hall'), null)).toBe(src);
	});
});
