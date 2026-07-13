import { describe, expect, it } from 'vitest';
import { lensIndices } from './project';
import type { LensRegistry } from './types';
import { rebaseLensTags, unknownLensTokens, validateRegistry } from './validate';

const REG: LensRegistry = {
	default: 'full',
	lenses: [
		{ id: 'full', label: 'Full deck', base: 'all' },
		{ id: 'brief', label: 'Bottom line', base: 'none' },
		{ id: 'evidence', label: 'Show the work', base: 'all' },
	],
};

describe('unknownLensTokens', () => {
	it('flags tokens naming no registered lens (a typo)', () => {
		const src = '<!-- _lens: brief -->\n---\n<!-- _lens: brif -evidense -->';
		expect(unknownLensTokens(src, REG).sort()).toEqual(['brif', 'evidense']);
	});
	it('is empty when every token is registered', () => {
		expect(unknownLensTokens('<!-- _lens: brief -evidence -->', REG)).toEqual([]);
	});
});

describe('validateRegistry', () => {
	it('warns when the default lens is unavailable', () => {
		const r: LensRegistry = { ...REG, default: 'brief' }; // brief is unapproved
		const d = validateRegistry(['<!-- _lens: brief -->\n# X'], r);
		expect(d.some((x) => x.code === 'default-unavailable')).toBe(true);
	});
	it('flags a +x / -x contradiction on one slide', () => {
		const d = validateRegistry(['<!-- _lens: brief -brief -->\n# X'], REG);
		expect(d.find((x) => x.code === 'tag-contradiction')).toMatchObject({ slide: 0, lensId: 'brief' });
	});
	it('flags an orphan tag', () => {
		const d = validateRegistry(['<!-- _lens: ghost -->\n# X'], REG);
		expect(d.find((x) => x.code === 'orphan-tag')).toMatchObject({ slide: 0, lensId: 'ghost' });
	});
});

describe('rebaseLensTags — a base flip preserves membership', () => {
	it('none -> all keeps the same member set', () => {
		const deck = [
			'<!-- _lens: brief -->\n# A', // member
			'# B', // not a member (base:none default = out)
			'<!-- _lens: brief -->\n# C', // member
		];
		const membersBefore = lensIndices(deck, REG, 'brief'); // [0, 2]
		const flipped = rebaseLensTags(deck, REG, 'brief', 'none', 'all');
		const allBase: LensRegistry = { ...REG, lenses: REG.lenses.map((l) => (l.id === 'brief' ? { ...l, base: 'all' } : l)) };
		expect(lensIndices(flipped, allBase, 'brief')).toEqual(membersBefore);
		// slide B is now excluded with a -brief token; A and C carry none
		expect(flipped[1]).toContain('-brief');
		expect(flipped[0]).not.toContain('-brief');
	});
	it('is a no-op when from === to', () => {
		const deck = ['<!-- _lens: brief -->\n# A'];
		expect(rebaseLensTags(deck, REG, 'brief', 'none', 'none')).toEqual(deck);
	});
});
