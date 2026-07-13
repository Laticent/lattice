import { describe, expect, it } from 'vitest';
import { approvalHash, lensEligibility, lensIndices, lensPairs, lensSlides, readerLenses } from './project';
import type { LensRegistry } from './types';

function reg(over: Partial<LensRegistry['lenses'][number]>[] = []): LensRegistry {
	return {
		default: 'full',
		lenses: [
			{ id: 'full', label: 'Full deck', base: 'all' },
			{ id: 'brief', label: 'Bottom line', base: 'none' },
			{ id: 'ask', label: 'The ask', base: 'none', single: true },
			{ id: 'evidence', label: 'Show the work', base: 'all' },
			...over,
		],
	} as LensRegistry;
}

const DECK = [
	'<!-- _class: title -->\n<!-- _lens: brief -->\n# Title', // 0 — brief
	'<!-- _class: content -->\n# Context', // 1 — nothing
	'<!-- _class: kpi -->\n<!-- _lens: brief ask -->\n# Metric', // 2 — brief + ask
	'<!-- _class: diagram -->\n<!-- _lens: -evidence -->\n# Topology', // 3 — excluded from evidence
	'<!-- _class: closing -->\n<!-- _lens: brief -->\n# Close', // 4 — brief
];

describe('lensPairs — the predicate-filter invariant', () => {
	it('full is the identity', () => {
		expect(lensPairs(DECK, reg(), 'full')).toHaveLength(DECK.length);
		expect(lensIndices(DECK, reg(), 'full')).toEqual([0, 1, 2, 3, 4]);
	});
	it('a base:none lens keeps only opted-in slides, in author order', () => {
		expect(lensIndices(DECK, reg(), 'brief')).toEqual([0, 2, 4]);
		expect(lensSlides(DECK, reg(), 'brief')).toEqual([DECK[0], DECK[2], DECK[4]]);
	});
	it('a base:all lens keeps everything except opted-out slides', () => {
		expect(lensIndices(DECK, reg(), 'evidence')).toEqual([0, 1, 2, 4]); // slide 3 excluded
	});
	it('single keeps only the first member', () => {
		expect(lensIndices(DECK, reg(), 'ask')).toEqual([2]);
	});
	it('indices are always a unique, strictly-increasing subset (captions stay resolvable)', () => {
		for (const lens of ['full', 'brief', 'ask', 'evidence']) {
			const idx = lensIndices(DECK, reg(), lens);
			expect(new Set(idx).size).toBe(idx.length); // no duplicates
			for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]); // monotonic
			expect(idx.every((i) => i >= 0 && i < DECK.length)).toBe(true);
		}
	});
	it('an unknown lens id falls back to the whole deck', () => {
		expect(lensIndices(DECK, reg(), 'ghost')).toEqual([0, 1, 2, 3, 4]);
	});
});

describe('lensEligibility — the human gate, fail CLOSED', () => {
	it('full is always ok', () => {
		expect(lensEligibility(DECK, reg(), 'full').status).toBe('ok');
	});
	it('a non-full lens without an approval hash is unavailable, not silently full', () => {
		const r = lensEligibility(DECK, reg(), 'brief');
		expect(r).toEqual({ status: 'unavailable', reason: 'unapproved' });
	});
	it('a matching content hash makes it ok; a later edit de-approves it', () => {
		const approved = approvalHash(DECK, reg(), 'brief');
		const r = reg([]);
		r.lenses.find((l) => l.id === 'brief')!.approved = approved;
		expect(lensEligibility(DECK, r, 'brief').status).toBe('ok');

		const edited = [...DECK];
		edited[0] = edited[0].replace('# Title', '# Retitled');
		expect(lensEligibility(edited, r, 'brief')).toEqual({ status: 'unavailable', reason: 'drifted' });
	});
	it('an empty lens is unavailable', () => {
		const r = reg([]);
		r.lenses.find((l) => l.id === 'brief')!.approved = approvalHash([], r, 'brief');
		expect(lensEligibility([], r, 'brief')).toEqual({ status: 'unavailable', reason: 'empty' });
	});
	it('a hidden lens is not reader-eligible', () => {
		const r = reg([]);
		const brief = r.lenses.find((l) => l.id === 'brief')!;
		brief.hidden = true;
		brief.approved = approvalHash(DECK, r, 'brief');
		expect(lensEligibility(DECK, r, 'brief')).toEqual({ status: 'unavailable', reason: 'hidden' });
	});
});

describe('readerLenses', () => {
	it('offers full plus only the approved, visible, non-empty lenses', () => {
		const r = reg([]);
		r.lenses.find((l) => l.id === 'brief')!.approved = approvalHash(DECK, r, 'brief');
		expect(readerLenses(DECK, r).map((l) => l.id)).toEqual(['full', 'brief']);
	});
});
