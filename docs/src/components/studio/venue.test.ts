// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { deckVenue, defaultVenue, familyForAspect, smallerVenue, VENUE_SCALE_BY_FAMILY, VENUES, venueOptionsFor, withVenue } from './venue';

const require = createRequire(import.meta.url);
const engine = require('../../../../lib/core/resolve-venue.js');
const { BOUNDARIES, familyFor } = require('../../../../lib/adaptive/families.js');

describe('venue — the Studio table matches the engine', () => {
	it('offers the engine venues at the engine steps, for every shape', () => {
		expect(VENUE_SCALE_BY_FAMILY).toEqual(engine.VENUE_SCALE_BY_FAMILY);
		for (const fam of ['wide', 'square', 'tall', 'strip'] as const) {
			expect(defaultVenue(fam)).toBe(engine.defaultVenue(fam));
			const opts = venueOptionsFor(fam);
			expect(opts.map((v) => v.scale)).toEqual([...opts.map((v) => v.scale)].sort((a, b) => a - b));
		}
		expect(Object.fromEntries(VENUES.map((v) => [v.value, v.scale]))).toEqual({ laptop: 1, huddle: 1.15, conference: 1.3, hall: 1.5 });
		expect(new Set(venueOptionsFor('square').map((v) => v.value))).toEqual(new Set(engine.VENUE_NAMES));
	});

	it('classifies a shape as the engine does', () => {
		for (const a of [16 / 9, 1.06, 1.05, 1, 0.91, 0.9, 0.8, 0.5625, 0.51, 0.5, 0.46]) expect(familyForAspect(a)).toBe(familyFor(a));
		expect(BOUNDARIES).toEqual([0.5, 0.9, 1.05]);
	});

	it('reads a known venue, any case, and nothing else', () => {
		expect(deckVenue('---\nvenue: Hall\n---\n\n# x')).toBe('hall');
		expect(deckVenue('---\nvenue: phone\n---\n\n# x')).toBe('phone');
		expect(deckVenue('---\nvenue: stadium\n---\n\n# x')).toBeNull();
		expect(deckVenue('# no front matter')).toBeNull();
		expect(deckVenue('---\nvenue: hall  # the big room\n---\n\n# x')).toBe('hall');
	});

	it('steps down to the next smaller size for the shape, from the shape default when none is named', () => {
		expect(smallerVenue('hall')?.value).toBe('conference');
		expect(smallerVenue('huddle')?.value).toBe('laptop');
		expect(smallerVenue('laptop')).toBeNull();
		expect(smallerVenue(null)).toBeNull();
		// A square deck defaults to phone (x1.5, the hall step): the step down skips hall, also x1.5.
		expect(smallerVenue(null, 'square')?.value).toBe('conference');
		expect(smallerVenue('laptop', 'square')?.value).toBe('tablet');
		// A story at hall (x1.22) steps to conference (x1.17); at its phone default, to tablet.
		expect(smallerVenue('hall', 'tall')?.value).toBe('conference');
		expect(smallerVenue(null, 'tall')?.value).toBe('tablet');
	});

	it('writes and clears the line', () => {
		const src = '---\nmarp: true\n---\n\n# x';
		expect(deckVenue(withVenue(src, 'conference'))).toBe('conference');
		expect(deckVenue(withVenue(src, 'phone'))).toBe('phone');
		expect(withVenue(withVenue(src, 'hall'), null)).toBe(src);
	});
});
