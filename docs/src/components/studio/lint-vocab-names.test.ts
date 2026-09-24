// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildVocab } from '../../../../lib/authoring/lint.js';
import { loadAll } from '../../../../lib/components/index.js';
import { packVocabNames, unpackVocabNames, withUnpackedNames } from './lint-vocab-names';

describe('lint-vocab-names', () => {
	// The page packs the LIVE vocab, so the round trip is asserted on the live vocab: a
	// register value with a space, `;` or `:` in it would split wrong and fail here.
	it('round-trips every *Names list in the live lint vocab', () => {
		const v = buildVocab(loadAll()) as Record<string, unknown>;
		const lists = Object.fromEntries(Object.entries(v).filter(([k, x]) => k.endsWith('Names') && Array.isArray(x)).map(([k, x]) => [k, [...(x as string[])]]));
		expect(Object.keys(lists).length).toBeGreaterThan(15);
		expect(unpackVocabNames(packVocabNames(v))).toEqual(lists);
	});

	it('keeps an empty list empty and ignores non-list fields', () => {
		expect(unpackVocabNames(packVocabNames({ aNames: [], bNames: ['x'], names: ['y'], other: 3 }))).toEqual({ aNames: [], bNames: ['x'] });
	});

	it('withUnpackedNames restores the arrays and drops the packed field; a plain vocab passes through', () => {
		expect(withUnpackedNames({ names: ['k'], packedNames: 'guardsNames:loose strict' })).toEqual({ names: ['k'], guardsNames: ['loose', 'strict'] });
		const plain = { names: ['k'], guardsNames: ['loose'] };
		expect(withUnpackedNames(plain)).toBe(plain);
		expect(withUnpackedNames(null)).toBe(null);
	});
});
